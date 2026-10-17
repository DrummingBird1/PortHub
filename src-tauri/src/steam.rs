//! "Add to Steam": append a non-Steam shortcut to every Steam user's `shortcuts.vdf`.
//! Binary VDF: 0x00 = map, 0x01 = string, 0x02 = int32 (LE), 0x08 = end of map.
//! Writes only when Steam is not running, always after a timestamped backup.

use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Node {
    Map(Vec<(String, Node)>),
    Str(String),
    Int(u32),
}

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum VdfError {
    #[error("unexpected end of shortcuts.vdf")]
    Eof,
    #[error("unknown VDF type byte 0x{0:02x}")]
    BadType(u8),
    #[error("invalid UTF-8 in shortcuts.vdf")]
    Utf8,
    #[error("unexpected root layout")]
    Layout,
}

struct Reader<'a> {
    b: &'a [u8],
    i: usize,
}

impl Reader<'_> {
    fn byte(&mut self) -> Result<u8, VdfError> {
        let v = *self.b.get(self.i).ok_or(VdfError::Eof)?;
        self.i += 1;
        Ok(v)
    }
    fn cstr(&mut self) -> Result<String, VdfError> {
        let rest = self.b.get(self.i..).ok_or(VdfError::Eof)?;
        let end = rest.iter().position(|&c| c == 0).ok_or(VdfError::Eof)?;
        let s = std::str::from_utf8(&rest[..end])
            .map_err(|_| VdfError::Utf8)?
            .to_owned();
        self.i += end + 1;
        Ok(s)
    }
    fn map(&mut self) -> Result<Vec<(String, Node)>, VdfError> {
        let mut out = Vec::new();
        loop {
            let t = self.byte()?;
            if t == 0x08 {
                return Ok(out);
            }
            let key = self.cstr()?;
            let val = match t {
                0x00 => Node::Map(self.map()?),
                0x01 => Node::Str(self.cstr()?),
                0x02 => {
                    let s = self.b.get(self.i..self.i + 4).ok_or(VdfError::Eof)?;
                    self.i += 4;
                    Node::Int(u32::from_le_bytes([s[0], s[1], s[2], s[3]]))
                }
                other => return Err(VdfError::BadType(other)),
            };
            out.push((key, val));
        }
    }
}

/// Parse a whole `shortcuts.vdf` into its top-level map (normally `{"shortcuts": {...}}`).
///
/// # Errors
/// Malformed input.
pub fn parse(bytes: &[u8]) -> Result<Vec<(String, Node)>, VdfError> {
    let mut r = Reader { b: bytes, i: 0 };
    r.map()
}

fn write_map(out: &mut Vec<u8>, m: &[(String, Node)]) {
    for (k, v) in m {
        match v {
            Node::Map(inner) => {
                out.push(0x00);
                out.extend_from_slice(k.as_bytes());
                out.push(0);
                write_map(out, inner);
            }
            Node::Str(s) => {
                out.push(0x01);
                out.extend_from_slice(k.as_bytes());
                out.push(0);
                out.extend_from_slice(s.as_bytes());
                out.push(0);
            }
            Node::Int(n) => {
                out.push(0x02);
                out.extend_from_slice(k.as_bytes());
                out.push(0);
                out.extend_from_slice(&n.to_le_bytes());
            }
        }
    }
    out.push(0x08);
}

pub fn serialize(root: &[(String, Node)]) -> Vec<u8> {
    let mut out = Vec::new();
    write_map(&mut out, root);
    out
}

/// Steam's id for non-Steam shortcuts: crc32(exe + name) with the high bit set.
pub fn shortcut_appid(exe_field: &str, name: &str) -> u32 {
    let mut h = crc32fast::Hasher::new();
    h.update(exe_field.as_bytes());
    h.update(name.as_bytes());
    h.finalize() | 0x8000_0000
}

fn s(k: &str, v: &str) -> (String, Node) {
    (k.into(), Node::Str(v.into()))
}
fn i(k: &str, v: u32) -> (String, Node) {
    (k.into(), Node::Int(v))
}

/// Add a shortcut (no-op if one with the same appid exists). Returns (new file bytes, appid, added).
///
/// # Errors
/// Existing file is malformed (it is then left untouched).
pub fn add_shortcut(
    existing: Option<&[u8]>,
    name: &str,
    exe: &Path,
    start_dir: &Path,
) -> Result<(Vec<u8>, u32, bool), VdfError> {
    let mut root = match existing {
        Some(b) if !b.is_empty() => parse(b)?,
        _ => vec![("shortcuts".into(), Node::Map(Vec::new()))],
    };
    let exe_field = format!("\"{}\"", exe.display());
    let dir_field = format!("\"{}\"", start_dir.display());
    let appid = shortcut_appid(&exe_field, name);
    let Some((_, Node::Map(list))) = root
        .iter_mut()
        .find(|(k, _)| k.eq_ignore_ascii_case("shortcuts"))
    else {
        return Err(VdfError::Layout);
    };
    let exists = list.iter().any(|(_, n)| match n {
        Node::Map(f) => f
            .iter()
            .any(|(k, v)| k.eq_ignore_ascii_case("appid") && *v == Node::Int(appid)),
        _ => false,
    });
    if !exists {
        let next = list
            .iter()
            .filter_map(|(k, _)| k.parse::<u32>().ok())
            .max()
            .map_or(0, |m| m + 1);
        list.push((
            next.to_string(),
            Node::Map(vec![
                i("appid", appid),
                s("AppName", name),
                s("Exe", &exe_field),
                s("StartDir", &dir_field),
                s("icon", ""),
                s("ShortcutPath", ""),
                s("LaunchOptions", ""),
                i("IsHidden", 0),
                i("AllowDesktopConfig", 1),
                i("AllowOverlay", 1),
                i("OpenVR", 0),
                i("Devkit", 0),
                s("DevkitGameID", ""),
                i("DevkitOverrideAppID", 0),
                i("LastPlayTime", 0),
                s("FlatpakAppID", ""),
                ("tags".into(), Node::Map(vec![s("0", "PortHub")])),
            ]),
        ));
    }
    // The root map's own 0x08 terminates the file (Steam writes `... 08 08`).
    Ok((serialize(&root), appid, !exists))
}

/// Candidate Steam install roots for this OS.
pub fn steam_roots() -> Vec<PathBuf> {
    let mut v = Vec::new();
    if cfg!(windows) {
        for var in ["ProgramFiles(x86)", "ProgramFiles"] {
            if let Ok(p) = std::env::var(var) {
                v.push(PathBuf::from(p).join("Steam"));
            }
        }
    } else if let Ok(home) = std::env::var("HOME") {
        let h = PathBuf::from(home);
        v.push(h.join(".steam/steam"));
        v.push(h.join(".local/share/Steam"));
        v.push(h.join(".var/app/com.valvesoftware.Steam/.local/share/Steam"));
    }
    v
}

/// `<root>/userdata/<numeric id>/config` directories.
pub fn user_config_dirs(root: &Path) -> Vec<PathBuf> {
    let Ok(rd) = fs::read_dir(root.join("userdata")) else {
        return Vec::new();
    };
    let mut v: Vec<PathBuf> = rd
        .flatten()
        .filter(|e| {
            e.file_name()
                .to_string_lossy()
                .chars()
                .all(|c| c.is_ascii_digit())
        })
        .map(|e| e.path().join("config"))
        .filter(|p| p.is_dir())
        .collect();
    v.sort();
    v
}

/// Best-effort check whether the Steam client is running.
pub fn steam_running() -> bool {
    #[cfg(target_os = "linux")]
    {
        fs::read_dir("/proc")
            .into_iter()
            .flatten()
            .flatten()
            .any(|e| {
                fs::read_to_string(e.path().join("comm")).is_ok_and(|c| {
                    let c = c.trim();
                    c == "steam" || c == "steamwebhelper"
                })
            })
    }
    #[cfg(windows)]
    {
        std::process::Command::new("tasklist")
            .args(["/FI", "IMAGENAME eq steam.exe", "/NH"])
            .output()
            .is_ok_and(|o| {
                String::from_utf8_lossy(&o.stdout)
                    .to_ascii_lowercase()
                    .contains("steam.exe")
            })
    }
    #[cfg(not(any(target_os = "linux", windows)))]
    {
        false
    }
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SteamResult {
    pub users_updated: usize,
    pub already_present: usize,
    pub appid: u32,
    pub backups: Vec<String>,
}

/// Write the shortcut into every user's shortcuts.vdf under the given roots.
///
/// # Errors
/// Steam running, no Steam users found, malformed file, or I/O errors.
pub fn add_to_steam(
    roots: &[PathBuf],
    name: &str,
    exe: &Path,
    start_dir: &Path,
    ts: u64,
) -> Result<SteamResult, String> {
    if steam_running() {
        return Err("Steam is running. Close Steam completely, then try again.".into());
    }
    let dirs: Vec<PathBuf> = roots.iter().flat_map(|r| user_config_dirs(r)).collect();
    if dirs.is_empty() {
        return Err("No Steam user profile found (userdata/<id>/config).".into());
    }
    let mut res = SteamResult {
        users_updated: 0,
        already_present: 0,
        appid: 0,
        backups: Vec::new(),
    };
    for d in dirs {
        let file = d.join("shortcuts.vdf");
        let existing = fs::read(&file).ok();
        let (bytes, appid, added) = add_shortcut(existing.as_deref(), name, exe, start_dir)
            .map_err(|e| format!("{}: {e}", file.display()))?;
        res.appid = appid;
        if !added {
            res.already_present += 1;
            continue;
        }
        if existing.is_some() {
            let bak = d.join(format!("shortcuts.vdf.porthub-bak-{ts}"));
            fs::copy(&file, &bak).map_err(|e| e.to_string())?;
            res.backups.push(bak.display().to_string());
        }
        let tmp = d.join("shortcuts.vdf.porthub-tmp");
        fs::write(&tmp, &bytes).map_err(|e| e.to_string())?;
        fs::rename(&tmp, &file).map_err(|e| e.to_string())?;
        res.users_updated += 1;
    }
    Ok(res)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Synthetic fixture equivalent to a Steam-written file with one existing shortcut.
    fn fixture() -> Vec<u8> {
        let mut b = Vec::new();
        b.extend_from_slice(b"\x00shortcuts\x00");
        b.extend_from_slice(b"\x000\x00");
        b.extend_from_slice(b"\x02appid\x00");
        b.extend_from_slice(&0x8123_4567u32.to_le_bytes());
        b.extend_from_slice(b"\x01AppName\x00Other Game\x00");
        b.extend_from_slice(b"\x01Exe\x00\"/opt/other/game\"\x00");
        b.extend_from_slice(b"\x00tags\x00\x010\x00favorite\x00\x08");
        b.extend_from_slice(b"\x08"); // end shortcut 0
        b.extend_from_slice(b"\x08"); // end shortcuts
        b.extend_from_slice(b"\x08"); // end root (= end of file)
        b
    }

    #[test]
    fn parses_fixture_and_roundtrips() {
        let f = fixture();
        let root = parse(&f).unwrap();
        let Node::Map(list) = &root[0].1 else {
            panic!()
        };
        assert_eq!(list.len(), 1);
        assert_eq!(serialize(&root), f);
    }

    #[test]
    fn appends_shortcut_and_keeps_existing() {
        let exe =
            Path::new("/home/deck/.local/share/dev.porthub.desktop/ports/soh/app/soh.appimage");
        let dir = exe.parent().unwrap();
        let (bytes, appid, added) =
            add_shortcut(Some(&fixture()), "Ship of Harkinian", exe, dir).unwrap();
        assert!(added);
        assert_eq!(appid & 0x8000_0000, 0x8000_0000);
        let root = parse(&bytes).unwrap();
        let Node::Map(list) = &root[0].1 else {
            panic!()
        };
        assert_eq!(list.len(), 2);
        assert_eq!(list[0].0, "0");
        assert_eq!(list[1].0, "1");
        let Node::Map(fields) = &list[1].1 else {
            panic!()
        };
        assert!(fields.contains(&("AppName".into(), Node::Str("Ship of Harkinian".into()))));
        assert!(fields.contains(&("Exe".into(), Node::Str(format!("\"{}\"", exe.display())))));
        // idempotent
        let (_, appid2, added2) =
            add_shortcut(Some(&bytes), "Ship of Harkinian", exe, dir).unwrap();
        assert!(!added2);
        assert_eq!(appid, appid2);
    }

    #[test]
    fn creates_new_file_and_rejects_garbage() {
        let (bytes, _, added) = add_shortcut(None, "X", Path::new("/x"), Path::new("/")).unwrap();
        assert!(added);
        assert_eq!(&bytes[..11], b"\x00shortcuts\x00");
        assert_eq!(&bytes[bytes.len() - 2..], b"\x08\x08");
        assert!(add_shortcut(Some(b"\x00short"), "X", Path::new("/x"), Path::new("/")).is_err());
        assert_eq!(parse(b"\x05k\x00"), Err(VdfError::BadType(5)));
    }

    #[test]
    fn writes_with_backup_for_each_user() {
        let root = tempfile::tempdir().unwrap();
        let u1 = root.path().join("userdata/111/config");
        let u2 = root.path().join("userdata/222/config");
        fs::create_dir_all(&u1).unwrap();
        fs::create_dir_all(&u2).unwrap();
        fs::create_dir_all(root.path().join("userdata/anonymous/config")).unwrap();
        fs::write(u1.join("shortcuts.vdf"), fixture()).unwrap();
        if steam_running() {
            return; // never touch a developer machine with Steam open
        }
        let r = add_to_steam(
            &[root.path().to_path_buf()],
            "PortHub Test",
            Path::new("/x/y"),
            Path::new("/x"),
            42,
        )
        .unwrap();
        assert_eq!(r.users_updated, 2);
        assert_eq!(r.backups.len(), 1);
        assert_eq!(
            fs::read(u1.join("shortcuts.vdf.porthub-bak-42")).unwrap(),
            fixture()
        );
        assert!(u2.join("shortcuts.vdf").exists());
        let again = add_to_steam(
            &[root.path().to_path_buf()],
            "PortHub Test",
            Path::new("/x/y"),
            Path::new("/x"),
            43,
        )
        .unwrap();
        assert_eq!(again.already_present, 2);
        assert_eq!(again.users_updated, 0);
        assert!(add_to_steam(
            &[root.path().join("nope")],
            "X",
            Path::new("/x"),
            Path::new("/"),
            1
        )
        .is_err());
    }
}
