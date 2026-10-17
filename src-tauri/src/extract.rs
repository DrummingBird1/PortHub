//! Safe ZIP extraction: no absolute paths, no `..`, no symlinks, bounded size and entry count.

use std::fs::{self, File};
use std::io::{self, Read, Seek};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Copy)]
pub struct Limits {
    pub max_entries: usize,
    pub max_total_bytes: u64,
}

impl Default for Limits {
    fn default() -> Self {
        Self {
            max_entries: 100_000,
            max_total_bytes: 8 * 1024 * 1024 * 1024,
        }
    }
}

#[derive(Debug, thiserror::Error)]
pub enum ExtractError {
    #[error("invalid archive: {0}")]
    Zip(#[from] zip::result::ZipError),
    #[error("I/O error: {0}")]
    Io(#[from] io::Error),
    #[error("unsafe path in archive: {0}")]
    UnsafePath(String),
    #[error("symlinks are not allowed in archives: {0}")]
    Symlink(String),
    #[error("archive exceeds limits ({0})")]
    TooLarge(String),
}

/// Relative, normal-components-only path, or `None` if unsafe.
pub fn safe_relative(name: &str) -> Option<PathBuf> {
    // Treat backslashes as separators on every OS (Windows-made archives).
    let norm = name.replace('\\', "/");
    if norm.contains('\0') || norm.contains(':') || norm.starts_with('/') {
        return None; // NUL, drive letters / ADS, absolute or UNC paths
    }
    let mut out = PathBuf::new();
    for part in norm.split('/') {
        match part {
            "" | "." => {}
            ".." => return None,
            p => out.push(p),
        }
    }
    (!out.as_os_str().is_empty()).then_some(out)
}

const S_IFMT: u32 = 0o170_000;
const S_IFLNK: u32 = 0o120_000;

/// Extract `reader` into `dest` (must not exist yet or be empty). Returns the relative paths written ('/'-separated).
///
/// # Errors
/// Fails on any unsafe entry or when limits are exceeded; partial output must be discarded by the caller.
pub fn extract_zip<R: Read + Seek>(
    reader: R,
    dest: &Path,
    limits: Limits,
) -> Result<Vec<String>, ExtractError> {
    let mut zip = zip::ZipArchive::new(reader)?;
    if zip.len() > limits.max_entries {
        return Err(ExtractError::TooLarge(format!("{} entries", zip.len())));
    }
    // Pre-scan: validate every name and the declared total size before writing anything.
    let mut declared: u64 = 0;
    for i in 0..zip.len() {
        let f = zip.by_index_raw(i)?;
        let name = f.name().to_owned();
        if f.unix_mode().is_some_and(|m| m & S_IFMT == S_IFLNK) {
            return Err(ExtractError::Symlink(name));
        }
        if safe_relative(&name).is_none() {
            return Err(ExtractError::UnsafePath(name));
        }
        declared = declared.saturating_add(f.size());
    }
    if declared > limits.max_total_bytes {
        return Err(ExtractError::TooLarge(format!("{declared} bytes")));
    }

    fs::create_dir_all(dest)?;
    let mut written: u64 = 0;
    let mut files = Vec::new();
    for i in 0..zip.len() {
        let mut f = zip.by_index(i)?;
        let rel =
            safe_relative(f.name()).ok_or_else(|| ExtractError::UnsafePath(f.name().into()))?;
        let out = dest.join(&rel);
        if f.is_dir() {
            fs::create_dir_all(&out)?;
            continue;
        }
        if let Some(parent) = out.parent() {
            fs::create_dir_all(parent)?;
        }
        // Enforce the limit on actual bytes too (declared sizes can lie).
        let remaining = limits.max_total_bytes - written;
        let mut w = File::create(&out)?;
        let n = io::copy(&mut (&mut f).take(remaining + 1), &mut w)?;
        written += n;
        if written > limits.max_total_bytes {
            return Err(ExtractError::TooLarge("actual size".into()));
        }
        #[cfg(unix)]
        if let Some(mode) = f.unix_mode() {
            use std::os::unix::fs::PermissionsExt;
            if mode & 0o111 != 0 {
                fs::set_permissions(&out, fs::Permissions::from_mode(0o755))?;
            }
        }
        files.push(rel_string(&rel));
    }
    Ok(files)
}

/// Path as '/'-separated string (stable across OSes, used in records).
pub fn rel_string(p: &Path) -> String {
    p.components()
        .map(|c| c.as_os_str().to_string_lossy())
        .collect::<Vec<_>>()
        .join("/")
}

/// Extract a `.tar.gz`. Only regular files and directories are allowed (no links/devices).
///
/// # Errors
/// Fails on unsafe entries or when limits are exceeded.
pub fn extract_tar_gz(
    path: &Path,
    dest: &Path,
    limits: Limits,
) -> Result<Vec<String>, ExtractError> {
    use tar::EntryType;
    let open = || -> Result<tar::Archive<flate2::read::GzDecoder<File>>, ExtractError> {
        Ok(tar::Archive::new(flate2::read::GzDecoder::new(File::open(
            path,
        )?)))
    };
    // Pass 1: validate.
    let (mut count, mut declared) = (0usize, 0u64);
    for e in open()?.entries()? {
        let e = e?;
        let name = String::from_utf8_lossy(&e.path_bytes()).into_owned();
        match e.header().entry_type() {
            EntryType::Regular | EntryType::Directory => {}
            EntryType::Symlink | EntryType::Link => return Err(ExtractError::Symlink(name)),
            _ => return Err(ExtractError::UnsafePath(name)),
        }
        if safe_relative(&name).is_none() {
            return Err(ExtractError::UnsafePath(name));
        }
        count += 1;
        declared = declared.saturating_add(e.size());
        if count > limits.max_entries || declared > limits.max_total_bytes {
            return Err(ExtractError::TooLarge(format!(
                "{count} entries / {declared} bytes"
            )));
        }
    }
    // Pass 2: write.
    fs::create_dir_all(dest)?;
    let mut files = Vec::new();
    let mut written = 0u64;
    for e in open()?.entries()? {
        let mut e = e?;
        let name = String::from_utf8_lossy(&e.path_bytes()).into_owned();
        let rel = safe_relative(&name).ok_or_else(|| ExtractError::UnsafePath(name.clone()))?;
        let out = dest.join(&rel);
        if e.header().entry_type() == EntryType::Directory {
            fs::create_dir_all(&out)?;
            continue;
        }
        if e.header().entry_type() != EntryType::Regular {
            return Err(ExtractError::UnsafePath(name));
        }
        if let Some(parent) = out.parent() {
            fs::create_dir_all(parent)?;
        }
        let remaining = limits.max_total_bytes - written;
        let mut w = File::create(&out)?;
        written += io::copy(&mut (&mut e).take(remaining + 1), &mut w)?;
        if written > limits.max_total_bytes {
            return Err(ExtractError::TooLarge("actual size".into()));
        }
        #[cfg(unix)]
        if e.header().mode().is_ok_and(|m| m & 0o111 != 0) {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&out, fs::Permissions::from_mode(0o755))?;
        }
        files.push(rel_string(&rel));
    }
    Ok(files)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Cursor, Write};
    use zip::write::SimpleFileOptions;

    fn make_zip(entries: &[(&str, &[u8])]) -> Cursor<Vec<u8>> {
        let mut w = zip::ZipWriter::new(Cursor::new(Vec::new()));
        for (name, data) in entries {
            w.start_file(*name, SimpleFileOptions::default()).unwrap();
            w.write_all(data).unwrap();
        }
        let mut c = w.finish().unwrap();
        c.set_position(0);
        c
    }

    #[test]
    fn safe_paths() {
        assert_eq!(safe_relative("a/b.txt"), Some(PathBuf::from("a/b.txt")));
        assert_eq!(safe_relative("./a"), Some(PathBuf::from("a")));
        for bad in [
            "../x",
            "a/../../x",
            "/etc/passwd",
            "C:\\x",
            "C:/x",
            "a\\..\\..\\x",
            "",
            "\\\\srv\\share",
        ] {
            assert_eq!(safe_relative(bad), None, "{bad}");
        }
    }

    #[test]
    fn extracts_normal_archive() {
        let dir = tempfile::tempdir().unwrap();
        let z = make_zip(&[("game.exe", b"MZ fake"), ("data/readme.txt", b"hi")]);
        let files = extract_zip(z, dir.path(), Limits::default()).unwrap();
        assert_eq!(files, ["game.exe", "data/readme.txt"]);
        assert_eq!(fs::read(dir.path().join("data/readme.txt")).unwrap(), b"hi");
    }

    #[test]
    fn rejects_traversal_before_writing() {
        let dir = tempfile::tempdir().unwrap();
        let dest = dir.path().join("out");
        let z = make_zip(&[("ok.txt", b"1"), ("../evil.txt", b"2")]);
        assert!(matches!(
            extract_zip(z, &dest, Limits::default()),
            Err(ExtractError::UnsafePath(_))
        ));
        assert!(!dest.exists(), "nothing may be written");
        assert!(!dir.path().join("evil.txt").exists());
    }

    #[test]
    fn rejects_symlink() {
        let mut w = zip::ZipWriter::new(Cursor::new(Vec::new()));
        w.add_symlink("link", "../../etc/passwd", SimpleFileOptions::default())
            .unwrap();
        let mut c = w.finish().unwrap();
        c.set_position(0);
        let dir = tempfile::tempdir().unwrap();
        assert!(matches!(
            extract_zip(c, dir.path(), Limits::default()),
            Err(ExtractError::Symlink(_))
        ));
    }

    fn make_tar_gz(
        path: &Path,
        build: impl FnOnce(&mut tar::Builder<flate2::write::GzEncoder<File>>),
    ) {
        let enc =
            flate2::write::GzEncoder::new(File::create(path).unwrap(), flate2::Compression::fast());
        let mut b = tar::Builder::new(enc);
        build(&mut b);
        b.into_inner().unwrap().finish().unwrap();
    }

    fn file_header(size: u64) -> tar::Header {
        let mut h = tar::Header::new_gnu();
        h.set_size(size);
        h.set_mode(0o755);
        h.set_entry_type(tar::EntryType::Regular);
        h
    }

    #[test]
    fn tar_gz_extracts_and_rejects_links() {
        let dir = tempfile::tempdir().unwrap();
        let good = dir.path().join("good.tar.gz");
        make_tar_gz(&good, |b| {
            let mut h = file_header(2);
            b.append_data(&mut h, "bin/game", &b"hi"[..]).unwrap();
        });
        let out = dir.path().join("out");
        assert_eq!(
            extract_tar_gz(&good, &out, Limits::default()).unwrap(),
            ["bin/game"]
        );
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = fs::metadata(out.join("bin/game"))
                .unwrap()
                .permissions()
                .mode();
            assert_ne!(mode & 0o111, 0, "exec bit kept");
        }

        let link = dir.path().join("link.tar.gz");
        make_tar_gz(&link, |b| {
            let mut h = tar::Header::new_gnu();
            h.set_entry_type(tar::EntryType::Symlink);
            h.set_size(0);
            b.append_link(&mut h, "evil", "/etc/passwd").unwrap();
        });
        assert!(matches!(
            extract_tar_gz(&link, &dir.path().join("o2"), Limits::default()),
            Err(ExtractError::Symlink(_))
        ));
    }

    #[test]
    fn tar_gz_rejects_traversal() {
        let dir = tempfile::tempdir().unwrap();
        let bad = dir.path().join("bad.tar.gz");
        // tar::Builder refuses "..", so write the raw name into the header.
        make_tar_gz(&bad, |b| {
            let mut h = file_header(1);
            h.as_old_mut().name[..9].copy_from_slice(b"../evil.t");
            h.set_cksum();
            b.append(&h, &b"x"[..]).unwrap();
        });
        let out = dir.path().join("out");
        assert!(matches!(
            extract_tar_gz(&bad, &out, Limits::default()),
            Err(ExtractError::UnsafePath(_))
        ));
        assert!(!out.exists());
    }

    #[test]
    fn enforces_limits() {
        let dir = tempfile::tempdir().unwrap();
        let big = vec![0u8; 4096];
        let z = make_zip(&[("a", &big)]);
        let l = Limits {
            max_entries: 10,
            max_total_bytes: 1000,
        };
        assert!(matches!(
            extract_zip(z, dir.path(), l),
            Err(ExtractError::TooLarge(_))
        ));
        let z = make_zip(&[("a", b"1"), ("b", b"2")]);
        let l = Limits {
            max_entries: 1,
            max_total_bytes: 1000,
        };
        assert!(matches!(
            extract_zip(z, dir.path(), l),
            Err(ExtractError::TooLarge(_))
        ));
    }
}
