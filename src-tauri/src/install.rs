//! Download (from official GitHub Releases only), verify, extract, record, launch, upgrade.
//!
//! User data on upgrade: every file in the install folder that was **not** written by the
//! previous release archive (as recorded in `files.txt`) is treated as user data (saves,
//! configs, generated `.o2r`/`.otr`, `mods/`) and copied into the new install. If the new
//! release ships a file with the same path, the release file wins and the user's copy is
//! kept next to it as `<name>.porthub-old`.

use crate::extract::{self, Limits};
use crate::github::{self, Release, ReleaseAsset, Verification};
use crate::manifest::{self, AssetRule, Manifest, Pinned};
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::fs::{self, File};
use std::io::{BufReader, Write};
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const USER_AGENT: &str = concat!("PortHub/", env!("CARGO_PKG_VERSION"));
pub const MAX_DOWNLOAD_BYTES: u64 = 4 * 1024 * 1024 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct InstallRecord {
    pub tag: String,
    pub asset_name: String,
    pub sha256: String,
    pub pinned_ok: bool,
    pub executable: Option<String>,
    pub installed_at: u64,
    /// Number of user files carried over from the previous install.
    #[serde(default)]
    pub preserved_files: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase", tag = "phase")]
pub enum Progress {
    Resolving,
    Downloading { downloaded: u64, total: u64 },
    Verifying,
    Extracting,
    Done { tag: String },
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub installed: Option<String>,
    pub latest: String,
    pub update_available: bool,
    pub release_url: Option<String>,
    pub notes: Option<String>,
}

pub fn port_dir(data: &Path, id: &str) -> PathBuf {
    data.join("ports").join(id)
}

pub fn app_dir(data: &Path, id: &str) -> PathBuf {
    port_dir(data, id).join("app")
}

fn record_path(data: &Path, id: &str) -> PathBuf {
    port_dir(data, id).join("install.json")
}

fn files_path(data: &Path, id: &str) -> PathBuf {
    port_dir(data, id).join("files.txt")
}

/// Installed version, if any.
pub fn read_record(data: &Path, id: &str) -> Option<InstallRecord> {
    let text = fs::read_to_string(record_path(data, id)).ok()?;
    serde_json::from_str(&text).ok()
}

pub fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or_default()
}

/// HTTPS-only client; redirects only to GitHub hosts.
///
/// # Errors
/// Fails if the TLS backend cannot be initialised.
pub fn client() -> Result<reqwest::Client, String> {
    let policy = reqwest::redirect::Policy::custom(|attempt| {
        let ok = attempt.url().scheme() == "https"
            && attempt
                .url()
                .host_str()
                .is_some_and(github::is_allowed_redirect_host)
            && attempt.previous().len() < 10;
        if ok {
            attempt.follow()
        } else {
            attempt.error("redirect to a non-GitHub host or too many redirects")
        }
    });
    reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .redirect(policy)
        .https_only(true)
        .connect_timeout(Duration::from_secs(20))
        .build()
        .map_err(|e| e.to_string())
}

pub async fn fetch_release_url(client: &reqwest::Client, url: &str) -> Result<Release, String> {
    let resp = client
        .get(url)
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28")
        .send()
        .await
        .map_err(|e| format!("GitHub API request failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("GitHub API returned {}", resp.status()));
    }
    resp.json::<Release>()
        .await
        .map_err(|e| format!("bad GitHub API response: {e}"))
}

pub async fn fetch_release(client: &reqwest::Client, m: &Manifest) -> Result<Release, String> {
    fetch_release_url(client, &github::release_api_url(m)).await
}

pub async fn check_update(
    client: &reqwest::Client,
    data: &Path,
    m: &Manifest,
) -> Result<UpdateInfo, String> {
    let rel = fetch_release(client, m).await?;
    let installed = read_record(data, &m.id).map(|r| r.tag);
    let update_available = installed
        .as_deref()
        .is_some_and(|i| github::is_newer(i, &rel.tag_name));
    Ok(UpdateInfo {
        installed,
        latest: rel.tag_name,
        update_available,
        release_url: rel.html_url,
        notes: rel.body.map(|b| b.chars().take(6000).collect()),
    })
}

/// Stream `url` to `dest`, hashing on the fly. Returns lowercase SHA-256 hex.
///
/// # Errors
/// HTTP errors, size mismatch, or I/O errors.
pub async fn download_to(
    client: &reqwest::Client,
    url: &str,
    expected_size: u64,
    dest: &Path,
    on_progress: &impl Fn(Progress),
) -> Result<String, String> {
    if expected_size > MAX_DOWNLOAD_BYTES {
        return Err("asset too large".into());
    }
    let resp = client
        .get(url)
        .header("Accept", "application/octet-stream")
        .send()
        .await
        .map_err(|e| format!("download failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("download returned {}", resp.status()));
    }
    let total = resp.content_length().unwrap_or(expected_size);
    let mut file = File::create(dest).map_err(|e| e.to_string())?;
    let mut hasher = Sha256::new();
    let mut downloaded: u64 = 0;
    let mut last_report = 0u64;
    let mut stream = resp.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("download interrupted: {e}"))?;
        downloaded += chunk.len() as u64;
        if downloaded > expected_size {
            return Err("download larger than declared asset size".into());
        }
        hasher.update(&chunk);
        file.write_all(&chunk).map_err(|e| e.to_string())?;
        if downloaded - last_report >= 512 * 1024 || downloaded == total {
            last_report = downloaded;
            on_progress(Progress::Downloading { downloaded, total });
        }
    }
    file.sync_all().map_err(|e| e.to_string())?;
    if downloaded != expected_size {
        return Err(format!(
            "size mismatch: expected {expected_size}, got {downloaded}"
        ));
    }
    Ok(hex::encode(hasher.finalize()))
}

/// Download one official release asset and verify it (fail closed). Deletes the file on failure.
///
/// # Errors
/// Non-official URL, download failure, or checksum mismatch.
pub async fn download_verified(
    client: &reqwest::Client,
    repo: &str,
    asset: &ReleaseAsset,
    pinned: Option<&Pinned>,
    tag: &str,
    dest: &Path,
    on_progress: &impl Fn(Progress),
) -> Result<Verification, String> {
    if !github::is_official_download_url(repo, &asset.browser_download_url) {
        return Err(format!(
            "refusing non-official download URL: {}",
            asset.browser_download_url
        ));
    }
    let res = async {
        let sha = download_to(
            client,
            &asset.browser_download_url,
            asset.size,
            dest,
            on_progress,
        )
        .await?;
        on_progress(Progress::Verifying);
        github::verify(&sha, asset, pinned, tag).map_err(|e| e.to_string())
    }
    .await;
    if res.is_err() {
        let _ = fs::remove_file(dest);
    }
    res
}

/// Place a verified download into `staging` by asset kind. Returns (executable, files written).
pub fn unpack(
    kind: &str,
    executable: Option<&str>,
    asset_name: &str,
    file: &Path,
    staging: &Path,
) -> Result<(Option<String>, Vec<String>), String> {
    match kind {
        "zip" | "app-zip" => {
            let f = BufReader::new(File::open(file).map_err(|e| e.to_string())?);
            let files =
                extract::extract_zip(f, staging, Limits::default()).map_err(|e| e.to_string())?;
            Ok((executable.map(str::to_owned), files))
        }
        "tar.gz" => {
            let files = extract::extract_tar_gz(file, staging, Limits::default())
                .map_err(|e| e.to_string())?;
            Ok((executable.map(str::to_owned), files))
        }
        "appimage" | "exe" | "file" => {
            let name = extract::safe_relative(asset_name)
                .filter(|p| p.components().count() == 1)
                .ok_or("unsafe asset name")?;
            fs::create_dir_all(staging).map_err(|e| e.to_string())?;
            let target = staging.join(&name);
            fs::copy(file, &target).map_err(|e| e.to_string())?;
            #[cfg(unix)]
            if kind != "file" {
                use std::os::unix::fs::PermissionsExt;
                fs::set_permissions(&target, fs::Permissions::from_mode(0o755))
                    .map_err(|e| e.to_string())?;
            }
            let n = extract::rel_string(&name);
            Ok((
                Some(executable.map_or_else(|| n.clone(), str::to_owned)),
                vec![n],
            ))
        }
        other => Err(format!("asset kind '{other}' is not supported yet")),
    }
}

fn walk(base: &Path, dir: &Path, out: &mut Vec<String>) -> std::io::Result<()> {
    for e in fs::read_dir(dir)? {
        let e = e?;
        let ft = e.file_type()?;
        let p = e.path();
        if ft.is_dir() {
            walk(base, &p, out)?;
        } else if ft.is_file() {
            if let Ok(rel) = p.strip_prefix(base) {
                out.push(extract::rel_string(rel));
            }
        }
        // Symlinks are never followed or carried over.
    }
    Ok(())
}

/// Copy user files (present in `old_app` but not in `release_files`) into `new_app`.
/// Returns the number of files carried over.
///
/// # Errors
/// I/O errors.
pub fn preserve_user_files(
    old_app: &Path,
    release_files: &HashSet<String>,
    new_app: &Path,
) -> std::io::Result<usize> {
    if !old_app.is_dir() {
        return Ok(0);
    }
    let mut all = Vec::new();
    walk(old_app, old_app, &mut all)?;
    let mut n = 0;
    for rel in all.into_iter().filter(|r| !release_files.contains(r)) {
        let Some(safe) = extract::safe_relative(&rel) else {
            continue;
        };
        let src = old_app.join(&safe);
        let mut dst = new_app.join(&safe);
        if dst.exists() {
            let mut name = dst.file_name().unwrap_or_default().to_os_string();
            name.push(".porthub-old");
            dst.set_file_name(name);
        }
        if let Some(parent) = dst.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::copy(&src, &dst)?;
        n += 1;
    }
    Ok(n)
}

fn read_files_list(data: &Path, id: &str) -> Option<HashSet<String>> {
    let text = fs::read_to_string(files_path(data, id)).ok()?;
    Some(
        text.lines()
            .filter(|l| !l.is_empty())
            .map(str::to_owned)
            .collect(),
    )
}

fn select(m: &Manifest, rel: &Release) -> Result<(AssetRule, ReleaseAsset), String> {
    let rule = github::select_rule(m, manifest::current_os(), manifest::current_arch())
        .map_err(|e| e.to_string())?;
    let asset = github::select_asset(rule, rel).map_err(|e| e.to_string())?;
    Ok((rule.clone(), asset.clone()))
}

/// Full install / upgrade. Nothing replaces an existing install unless every check passed.
///
/// # Errors
/// Any network, verification, extraction or I/O failure (the previous install stays intact).
pub async fn install(
    client: &reqwest::Client,
    data: &Path,
    m: &Manifest,
    on_progress: impl Fn(Progress),
) -> Result<InstallRecord, String> {
    on_progress(Progress::Resolving);
    let rel = fetch_release(client, m).await?;
    let (rule, asset) = select(m, &rel)?;

    let dir = port_dir(data, &m.id);
    let work = data.join("ports").join(".work");
    fs::create_dir_all(&work).map_err(|e| e.to_string())?;
    let part = work.join(format!("{}.download", m.id));
    let staging = work.join(format!("{}.staging", m.id));
    let cleanup = || {
        let _ = fs::remove_file(&part);
        let _ = fs::remove_dir_all(&staging);
    };
    cleanup();

    let result: Result<InstallRecord, String> = async {
        let v = download_verified(
            client,
            &m.repo,
            &asset,
            rule.pinned.as_ref(),
            &rel.tag_name,
            &part,
            &on_progress,
        )
        .await?;
        on_progress(Progress::Extracting);
        let (part2, staging2, rule2, asset2) =
            (part.clone(), staging.clone(), rule.clone(), asset.clone());
        let (executable, files) = tauri::async_runtime::spawn_blocking(move || {
            unpack(
                &rule2.kind,
                rule2.executable.as_deref(),
                &asset2.name,
                &part2,
                &staging2,
            )
        })
        .await
        .map_err(|e| e.to_string())??;

        let old_app = app_dir(data, &m.id);
        let preserved =
            match read_files_list(data, &m.id) {
                Some(old_files) => preserve_user_files(&old_app, &old_files, &staging)
                    .map_err(|e| e.to_string())?,
                None if old_app.exists() => return Err(
                    "existing install has no file list; refusing to overwrite (reinstall manually)"
                        .into(),
                ),
                None => 0,
            };

        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        if old_app.exists() {
            fs::remove_dir_all(&old_app).map_err(|e| e.to_string())?;
        }
        fs::rename(&staging, &old_app).map_err(|e| e.to_string())?;
        fs::write(files_path(data, &m.id), files.join("\n")).map_err(|e| e.to_string())?;
        let rec = InstallRecord {
            tag: rel.tag_name.clone(),
            asset_name: asset.name.clone(),
            sha256: v.sha256,
            pinned_ok: v.pinned_ok,
            executable,
            installed_at: now(),
            preserved_files: preserved,
        };
        let json = serde_json::to_string_pretty(&rec).map_err(|e| e.to_string())?;
        fs::write(record_path(data, &m.id), json).map_err(|e| e.to_string())?;
        Ok(rec)
    }
    .await;
    cleanup();
    let rec = result?;
    on_progress(Progress::Done {
        tag: rec.tag.clone(),
    });
    Ok(rec)
}

/// Resolve a relative path strictly inside `base` (canonicalized).
///
/// # Errors
/// Unsafe path, missing file, or escape from `base`.
pub fn resolve_executable(base_dir: &Path, exe: &str) -> Result<PathBuf, String> {
    let rel = extract::safe_relative(exe).ok_or("unsafe executable path in manifest")?;
    let base = base_dir
        .canonicalize()
        .map_err(|_| "port is not installed".to_string())?;
    let full = base
        .join(rel)
        .canonicalize()
        .map_err(|_| format!("executable not found: {exe}"))?;
    if !full.starts_with(&base) || !full.is_file() {
        return Err("executable is outside the install folder".into());
    }
    Ok(full)
}

/// Absolute path of the installed executable.
///
/// # Errors
/// Not installed or no executable.
pub fn installed_executable(data: &Path, id: &str) -> Result<PathBuf, String> {
    let rec = read_record(data, id).ok_or("port is not installed")?;
    let exe = rec
        .executable
        .ok_or("manifest declares no executable for this platform")?;
    resolve_executable(&app_dir(data, id), &exe)
}

/// `AppImages` need FUSE; without it (containers, some distros) use extract-and-run.
fn needs_appimage_fallback(path: &Path) -> bool {
    cfg!(target_os = "linux")
        && path
            .extension()
            .is_some_and(|e| e.eq_ignore_ascii_case("appimage"))
        && !Path::new("/dev/fuse").exists()
}

/// Spawn the installed port. Returns the process id.
///
/// # Errors
/// Not installed, or the process fails to start.
pub fn launch(data: &Path, id: &str) -> Result<u32, String> {
    let path = installed_executable(data, id)?;
    let mut cmd = std::process::Command::new(&path);
    cmd.current_dir(path.parent().unwrap_or(&app_dir(data, id)));
    if needs_appimage_fallback(&path) {
        cmd.env("APPIMAGE_EXTRACT_AND_RUN", "1");
    }
    let child = cmd.spawn().map_err(|e| format!("failed to start: {e}"))?;
    Ok(child.id())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Read as _;
    use std::net::TcpListener;

    #[test]
    fn executable_must_stay_inside_install_dir() {
        let root = tempfile::tempdir().unwrap();
        let app = root.path().join("app");
        fs::create_dir_all(app.join("bin")).unwrap();
        fs::write(app.join("bin/game.exe"), b"x").unwrap();
        fs::write(root.path().join("outside.exe"), b"x").unwrap();
        assert!(resolve_executable(&app, "bin/game.exe").is_ok());
        assert!(resolve_executable(&app, "../outside.exe").is_err());
        assert!(resolve_executable(&app, "missing.exe").is_err());
        assert!(resolve_executable(&app, "bin").is_err());
        assert!(resolve_executable(&root.path().join("nope"), "game.exe").is_err());
    }

    #[test]
    fn record_roundtrip_and_legacy_default() {
        let root = tempfile::tempdir().unwrap();
        assert!(read_record(root.path(), "p").is_none());
        fs::create_dir_all(port_dir(root.path(), "p")).unwrap();
        // v0.2 records have no preservedFiles field.
        fs::write(
            record_path(root.path(), "p"),
            r#"{"tag":"1.0","assetName":"a.zip","sha256":"00","pinnedOk":true,"executable":"a.exe","installedAt":1}"#,
        )
        .unwrap();
        let rec = read_record(root.path(), "p").unwrap();
        assert_eq!(rec.preserved_files, 0);
        assert_eq!(rec.tag, "1.0");
    }

    #[test]
    fn unpack_kinds() {
        let root = tempfile::tempdir().unwrap();
        let f = root.path().join("f");
        fs::write(&f, b"ELF").unwrap();
        assert!(unpack(
            "flatpak-bundle",
            None,
            "a.flatpak",
            &f,
            &root.path().join("s1")
        )
        .is_err());
        let (exe, files) = unpack(
            "appimage",
            None,
            "soh.appimage",
            &f,
            &root.path().join("s2"),
        )
        .unwrap();
        assert_eq!(exe.as_deref(), Some("soh.appimage"));
        assert_eq!(files, ["soh.appimage"]);
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let m = fs::metadata(root.path().join("s2/soh.appimage"))
                .unwrap()
                .permissions()
                .mode();
            assert_eq!(m & 0o111, 0o111, "chmod +x");
        }
        assert!(unpack(
            "appimage",
            None,
            "../x.appimage",
            &f,
            &root.path().join("s3")
        )
        .is_err());
    }

    #[test]
    fn preserves_user_files_on_upgrade() {
        let root = tempfile::tempdir().unwrap();
        let old = root.path().join("old");
        let new = root.path().join("new");
        for (p, d) in [
            ("soh.exe", "v1"),
            ("readme.txt", "v1"),
            ("Save/file1.sav", "user"),
            ("shipofharkinian.json", "cfg"),
            ("mods/pack.o2r", "mod"),
            ("readme2.txt", "user-made"),
        ] {
            fs::create_dir_all(old.join(p).parent().unwrap()).unwrap();
            fs::write(old.join(p), d).unwrap();
        }
        fs::create_dir_all(&new).unwrap();
        fs::write(new.join("soh.exe"), "v2").unwrap();
        fs::write(new.join("readme2.txt"), "v2 ships this").unwrap();
        let release: HashSet<String> = ["soh.exe", "readme.txt"]
            .iter()
            .map(|s| (*s).to_string())
            .collect();
        let n = preserve_user_files(&old, &release, &new).unwrap();
        assert_eq!(n, 4);
        assert_eq!(fs::read_to_string(new.join("soh.exe")).unwrap(), "v2");
        assert_eq!(
            fs::read_to_string(new.join("Save/file1.sav")).unwrap(),
            "user"
        );
        assert_eq!(
            fs::read_to_string(new.join("mods/pack.o2r")).unwrap(),
            "mod"
        );
        assert_eq!(
            fs::read_to_string(new.join("shipofharkinian.json")).unwrap(),
            "cfg"
        );
        assert_eq!(
            fs::read_to_string(new.join("readme2.txt")).unwrap(),
            "v2 ships this"
        );
        assert_eq!(
            fs::read_to_string(new.join("readme2.txt.porthub-old")).unwrap(),
            "user-made"
        );
        assert!(
            !new.join("readme.txt").exists(),
            "old release files are not carried over"
        );
    }

    /// Minimal one-shot HTTP/1.1 server returning `body` (optionally lying about length).
    fn serve_once(body: Vec<u8>, content_length: usize) -> String {
        let l = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = l.local_addr().unwrap();
        std::thread::spawn(move || {
            if let Ok((mut s, _)) = l.accept() {
                let mut buf = [0u8; 2048];
                let _ = s.read(&mut buf);
                let head = format!(
                    "HTTP/1.1 200 OK\r\nContent-Length: {content_length}\r\nContent-Type: application/octet-stream\r\nConnection: close\r\n\r\n"
                );
                let _ = s.write_all(head.as_bytes());
                let _ = s.write_all(&body);
            }
        });
        format!("http://{addr}/asset.zip")
    }

    fn test_client() -> reqwest::Client {
        reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .unwrap()
    }

    #[test]
    fn mock_http_download_hashes_and_verifies() {
        let body: Vec<u8> = (0..200_000u32)
            .map(|i| u8::try_from(i % 251).unwrap())
            .collect();
        let sha = hex::encode(Sha256::digest(&body));
        let url = serve_once(body.clone(), body.len());
        let dir = tempfile::tempdir().unwrap();
        let dest = dir.path().join("dl");
        let seen = std::sync::Mutex::new(Vec::new());
        let got = tauri::async_runtime::block_on(download_to(
            &test_client(),
            &url,
            body.len() as u64,
            &dest,
            &|p| seen.lock().unwrap().push(format!("{p:?}")),
        ))
        .unwrap();
        assert_eq!(got, sha);
        assert_eq!(fs::read(&dest).unwrap(), body);
        assert!(seen
            .lock()
            .unwrap()
            .iter()
            .any(|s| s.contains("Downloading")));

        // The verified hash must then pass verify(), and a tampered digest must fail closed.
        let asset = ReleaseAsset {
            name: "asset.zip".into(),
            browser_download_url: url,
            size: body.len() as u64,
            digest: Some(format!("sha256:{sha}")),
        };
        assert!(github::verify(&got, &asset, None, "t").is_ok());
        let tampered = ReleaseAsset {
            digest: Some(format!("sha256:{}", "1".repeat(64))),
            ..asset
        };
        assert!(github::verify(&got, &tampered, None, "t").is_err());
    }

    #[test]
    fn mock_http_rejects_size_mismatch() {
        let url = serve_once(vec![7u8; 1000], 1000);
        let dir = tempfile::tempdir().unwrap();
        let r = tauri::async_runtime::block_on(download_to(
            &test_client(),
            &url,
            999,
            &dir.path().join("d"),
            &|_| {},
        ));
        assert!(r.unwrap_err().contains("larger"));
        let url = serve_once(vec![7u8; 10], 10);
        let r = tauri::async_runtime::block_on(download_to(
            &test_client(),
            &url,
            20,
            &dir.path().join("e"),
            &|_| {},
        ));
        assert!(r.unwrap_err().contains("size mismatch"));
    }

    #[test]
    fn download_verified_refuses_unofficial_urls() {
        let asset = ReleaseAsset {
            name: "a.zip".into(),
            browser_download_url: "https://evil.example/a.zip".into(),
            size: 1,
            digest: Some(format!("sha256:{}", "0".repeat(64))),
        };
        let dir = tempfile::tempdir().unwrap();
        let r = tauri::async_runtime::block_on(download_verified(
            &test_client(),
            "Owner/Repo",
            &asset,
            None,
            "t",
            &dir.path().join("x"),
            &|_| {},
        ));
        assert!(r.unwrap_err().contains("non-official"));
    }
}
