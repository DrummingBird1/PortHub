//! Mods & texture packs: catalog mods (official GitHub releases, pinned + digest-verified) and
//! local user-supplied files. Enabled files live in the port's mod folder inside `app/`;
//! disabled files are moved to `ports/<id>/mods-disabled/<mod id>/`.

use crate::extract;
use crate::github;
use crate::install::{self, Progress};
use crate::manifest::{CatalogMod, Manifest};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs::{self, File};
use std::io::{self, BufReader, Read};
use std::path::{Path, PathBuf};

const MAX_LOCAL_MOD_BYTES: u64 = 2 * 1024 * 1024 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ModEntry {
    pub id: String,
    pub name: String,
    /// "catalog" or "local"
    pub source: String,
    pub version: Option<String>,
    pub sha256: String,
    /// Mod folder relative to the install dir (e.g. "mods").
    pub target: String,
    /// Files relative to `target`.
    pub files: Vec<String>,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogModView {
    pub id: String,
    pub name: String,
    pub author: String,
    pub repo: String,
    pub license: String,
    pub version: String,
    pub compatible: bool,
    pub installed: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModsView {
    pub supported: bool,
    pub folder: Option<String>,
    pub file_types: Vec<String>,
    pub catalog: Vec<CatalogModView>,
    pub installed: Vec<ModEntry>,
}

fn state_path(data: &Path, port: &str) -> PathBuf {
    install::port_dir(data, port).join("mods.json")
}

fn disabled_dir(data: &Path, port: &str, mod_id: &str) -> PathBuf {
    install::port_dir(data, port)
        .join("mods-disabled")
        .join(mod_id)
}

pub fn read_state(data: &Path, port: &str) -> Vec<ModEntry> {
    fs::read_to_string(state_path(data, port))
        .ok()
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_default()
}

fn write_state(data: &Path, port: &str, mods: &[ModEntry]) -> Result<(), String> {
    let json = serde_json::to_string_pretty(mods).map_err(|e| e.to_string())?;
    fs::write(state_path(data, port), json).map_err(|e| e.to_string())
}

fn safe_id(id: &str) -> Result<&str, String> {
    let ok = !id.is_empty()
        && id.len() <= 64
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
    if ok {
        Ok(id)
    } else {
        Err(format!("invalid mod id: {id}"))
    }
}

fn target_of(m: &Manifest, cm: Option<&CatalogMod>) -> Result<String, String> {
    let t = cm
        .and_then(|c| c.target.clone())
        .or_else(|| m.mods.folder.clone())
        .ok_or("this port declares no mod folder")?;
    let rel = extract::safe_relative(&t).ok_or("unsafe mod folder in manifest")?;
    Ok(extract::rel_string(&rel))
}

fn compatible(cm: &CatalogMod, installed_tag: Option<&str>) -> bool {
    installed_tag.is_some_and(|t| cm.port_versions.iter().any(|v| v == "*" || v == t))
}

/// Combined view for the UI.
pub fn view(data: &Path, m: &Manifest) -> ModsView {
    let installed = read_state(data, &m.id);
    let tag = install::read_record(data, &m.id).map(|r| r.tag);
    ModsView {
        supported: m.mods.supported && m.mods.folder.is_some(),
        folder: m.mods.folder.clone(),
        file_types: m.mods.file_types.clone(),
        catalog: m
            .mods
            .catalog
            .iter()
            .map(|c| CatalogModView {
                id: c.id.clone(),
                name: c.name.clone(),
                author: c.author.clone(),
                repo: c.repo.clone(),
                license: c.license.clone(),
                version: c.pinned.tag.clone(),
                compatible: compatible(c, tag.as_deref()),
                installed: installed.iter().any(|e| e.id == c.id),
            })
            .collect(),
        installed,
    }
}

/// Move `files` (relative to `target` inside the app dir) into place, refusing to overwrite.
fn place(src_root: &Path, dst_root: &Path, files: &[String]) -> Result<(), String> {
    for f in files {
        let rel = extract::safe_relative(f).ok_or("unsafe file path")?;
        if dst_root.join(&rel).exists() {
            return Err(format!(
                "{f} already exists in the mod folder; refusing to overwrite"
            ));
        }
    }
    for f in files {
        let rel = extract::safe_relative(f).ok_or("unsafe file path")?;
        let dst = dst_root.join(&rel);
        if let Some(p) = dst.parent() {
            fs::create_dir_all(p).map_err(|e| e.to_string())?;
        }
        let src = src_root.join(&rel);
        if fs::rename(&src, &dst).is_err() {
            fs::copy(&src, &dst).map_err(|e| e.to_string())?;
            fs::remove_file(&src).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

fn require_installed(data: &Path, port: &str) -> Result<install::InstallRecord, String> {
    install::read_record(data, port).ok_or_else(|| "install the port first".to_string())
}

/// Download, verify (GitHub digest + mandatory pin) and install a catalog mod.
///
/// # Errors
/// Port not installed, incompatible version, verification failure, collisions.
pub async fn install_catalog_mod(
    client: &reqwest::Client,
    data: &Path,
    m: &Manifest,
    mod_id: &str,
    on_progress: impl Fn(Progress),
) -> Result<ModEntry, String> {
    let rec = require_installed(data, &m.id)?;
    let cm = m
        .mods
        .catalog
        .iter()
        .find(|c| c.id == mod_id)
        .ok_or("unknown mod")?;
    safe_id(&cm.id)?;
    if !compatible(cm, Some(&rec.tag)) {
        return Err(format!(
            "{} does not support installed version {}",
            cm.name, rec.tag
        ));
    }
    let mut state = read_state(data, &m.id);
    if state.iter().any(|e| e.id == cm.id) {
        return Err("mod already installed".into());
    }
    let target = target_of(m, Some(cm))?;
    on_progress(Progress::Resolving);
    let url = format!(
        "https://api.github.com/repos/{}/releases/tags/{}",
        cm.repo, cm.pinned.tag
    );
    let rel = install::fetch_release_url(client, &url).await?;
    let rule = crate::manifest::AssetRule {
        os: String::new(),
        arch: String::new(),
        pattern: cm.asset_pattern.clone(),
        kind: cm.kind.clone(),
        executable: None,
        pinned: Some(cm.pinned.clone()),
    };
    let asset = github::select_asset(&rule, &rel)
        .map_err(|e| e.to_string())?
        .clone();
    let work = data.join("ports").join(".work");
    fs::create_dir_all(&work).map_err(|e| e.to_string())?;
    let part = work.join(format!("mod-{}.download", cm.id));
    let staging = work.join(format!("mod-{}.staging", cm.id));
    let _ = fs::remove_dir_all(&staging);
    let res = async {
        let v = install::download_verified(
            client,
            &cm.repo,
            &asset,
            Some(&cm.pinned),
            &rel.tag_name,
            &part,
            &on_progress,
        )
        .await?;
        if !v.pinned_ok {
            return Err("mods must match a reviewed pinned checksum".to_string());
        }
        on_progress(Progress::Extracting);
        let kind = if cm.kind == "zip" { "zip" } else { "file" };
        let (_, files) = install::unpack(kind, None, &asset.name, &part, &staging)?;
        let dst = install::app_dir(data, &m.id).join(&target);
        place(&staging, &dst, &files)?;
        Ok(ModEntry {
            id: cm.id.clone(),
            name: cm.name.clone(),
            source: "catalog".into(),
            version: Some(rel.tag_name.clone()),
            sha256: v.sha256,
            target: target.clone(),
            files,
            enabled: true,
        })
    }
    .await;
    let _ = fs::remove_file(&part);
    let _ = fs::remove_dir_all(&staging);
    let entry = res?;
    state.push(entry.clone());
    write_state(data, &m.id, &state)?;
    on_progress(Progress::Done {
        tag: entry.version.clone().unwrap_or_default(),
    });
    Ok(entry)
}

fn sha256_file(path: &Path) -> io::Result<String> {
    let mut reader = BufReader::new(File::open(path)?);
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; 1 << 20];
    loop {
        let read = reader.read(&mut buf)?;
        if read == 0 {
            break;
        }
        hasher.update(&buf[..read]);
    }
    Ok(hex::encode(hasher.finalize()))
}

/// Copy a user-chosen local file into the mod folder (extension must be allowed by the manifest).
///
/// # Errors
/// Port not installed, disallowed type, too large, duplicate or collision.
pub fn add_local_mod(data: &Path, m: &Manifest, file: &Path) -> Result<ModEntry, String> {
    require_installed(data, &m.id)?;
    if !(m.mods.supported && m.mods.folder.is_some()) {
        return Err("this port has no mod support in PortHub".into());
    }
    let name = file
        .file_name()
        .ok_or("no file name")?
        .to_string_lossy()
        .into_owned();
    let lower = name.to_ascii_lowercase();
    if !m
        .mods
        .file_types
        .iter()
        .any(|t| lower.ends_with(&t.to_ascii_lowercase()))
    {
        return Err(format!(
            "file type not allowed; expected one of {:?}",
            m.mods.file_types
        ));
    }
    if extract::safe_relative(&name).is_none_or(|p| p.components().count() != 1) {
        return Err("unsafe file name".into());
    }
    if fs::metadata(file).map_err(|e| e.to_string())?.len() > MAX_LOCAL_MOD_BYTES {
        return Err("file too large".into());
    }
    let sha = sha256_file(file).map_err(|e| e.to_string())?;
    let id = format!("local-{}", &sha[..12]);
    let mut state = read_state(data, &m.id);
    if state.iter().any(|e| e.id == id) {
        return Err("this file is already added".into());
    }
    let target = target_of(m, None)?;
    let dst_dir = install::app_dir(data, &m.id).join(&target);
    fs::create_dir_all(&dst_dir).map_err(|e| e.to_string())?;
    let dst = dst_dir.join(&name);
    if dst.exists() {
        return Err(format!("{name} already exists in the mod folder"));
    }
    fs::copy(file, &dst).map_err(|e| e.to_string())?;
    let entry = ModEntry {
        id,
        name: name.clone(),
        source: "local".into(),
        version: None,
        sha256: sha,
        target,
        files: vec![name],
        enabled: true,
    };
    state.push(entry.clone());
    write_state(data, &m.id, &state)?;
    Ok(entry)
}

/// Enable/disable by moving files between the mod folder and the disabled store.
///
/// # Errors
/// Unknown mod, collisions or I/O errors.
pub fn set_enabled(
    data: &Path,
    port: &str,
    mod_id: &str,
    enabled: bool,
) -> Result<ModEntry, String> {
    safe_id(mod_id)?;
    let mut state = read_state(data, port);
    let e = state
        .iter_mut()
        .find(|e| e.id == mod_id)
        .ok_or("unknown mod")?;
    if e.enabled != enabled {
        let active = install::app_dir(data, port).join(&e.target);
        let parked = disabled_dir(data, port, mod_id);
        if enabled {
            place(&parked, &active, &e.files)?;
            let _ = fs::remove_dir_all(&parked);
        } else {
            place(&active, &parked, &e.files)?;
        }
        e.enabled = enabled;
    }
    let out = e.clone();
    write_state(data, port, &state)?;
    Ok(out)
}

/// Remove a mod's files (wherever they are) and its record.
///
/// # Errors
/// Unknown mod or I/O errors.
pub fn uninstall(data: &Path, port: &str, mod_id: &str) -> Result<(), String> {
    safe_id(mod_id)?;
    let mut state = read_state(data, port);
    let idx = state
        .iter()
        .position(|e| e.id == mod_id)
        .ok_or("unknown mod")?;
    let e = state.remove(idx);
    let active = install::app_dir(data, port).join(&e.target);
    for f in &e.files {
        if let Some(rel) = extract::safe_relative(f) {
            let _ = fs::remove_file(active.join(rel));
        }
    }
    let _ = fs::remove_dir_all(disabled_dir(data, port, mod_id));
    write_state(data, port, &state)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::manifest::{Mods, Pinned, Releases};

    fn manifest() -> Manifest {
        Manifest {
            id: "soh".into(),
            name: "SoH".into(),
            repo: "HarbourMasters/Shipwright".into(),
            releases: Releases {
                channel: "latest".into(),
                tag: None,
                assets: vec![],
            },
            mods: Mods {
                supported: true,
                folder: Some("mods".into()),
                file_types: vec![".o2r".into(), ".otr".into()],
                catalog: vec![CatalogMod {
                    id: "demo".into(),
                    name: "Demo".into(),
                    author: "a".into(),
                    repo: "a/b".into(),
                    asset_pattern: r"^demo\.o2r$".into(),
                    kind: "file".into(),
                    pinned: Pinned {
                        tag: "1.0".into(),
                        sha256: "0".repeat(64),
                    },
                    license: "MIT".into(),
                    port_versions: vec!["9.3.0".into()],
                    target: None,
                }],
            },
        }
    }

    fn installed_port(tag: &str) -> tempfile::TempDir {
        let d = tempfile::tempdir().unwrap();
        let pd = install::port_dir(d.path(), "soh");
        fs::create_dir_all(pd.join("app")).unwrap();
        fs::write(
            pd.join("install.json"),
            format!(r#"{{"tag":"{tag}","assetName":"a.zip","sha256":"00","pinnedOk":true,"executable":"soh.exe","installedAt":1}}"#),
        )
        .unwrap();
        d
    }

    #[test]
    fn local_mod_lifecycle() {
        let data = installed_port("9.3.0");
        let m = manifest();
        let src = data.path().join("Synthetic Pack.o2r");
        fs::write(&src, b"synthetic test data, not a real mod").unwrap();

        let e = add_local_mod(data.path(), &m, &src).unwrap();
        assert!(e.id.starts_with("local-") && e.enabled);
        let active = install::app_dir(data.path(), "soh").join("mods/Synthetic Pack.o2r");
        assert!(active.exists());
        assert!(add_local_mod(data.path(), &m, &src).is_err(), "duplicate");

        let off = set_enabled(data.path(), "soh", &e.id, false).unwrap();
        assert!(!off.enabled);
        assert!(!active.exists());
        assert!(disabled_dir(data.path(), "soh", &e.id)
            .join("Synthetic Pack.o2r")
            .exists());

        set_enabled(data.path(), "soh", &e.id, true).unwrap();
        assert!(active.exists());

        uninstall(data.path(), "soh", &e.id).unwrap();
        assert!(!active.exists());
        assert_eq!(read_state(data.path(), "soh"), Vec::<ModEntry>::new());
    }

    #[test]
    fn local_mod_rejections() {
        let m = manifest();
        let not_installed = tempfile::tempdir().unwrap();
        let f = not_installed.path().join("x.o2r");
        fs::write(&f, b"x").unwrap();
        assert!(add_local_mod(not_installed.path(), &m, &f)
            .unwrap_err()
            .contains("install the port"));

        let data = installed_port("9.3.0");
        let exe = data.path().join("evil.exe");
        fs::write(&exe, b"MZ").unwrap();
        assert!(add_local_mod(data.path(), &m, &exe)
            .unwrap_err()
            .contains("not allowed"));

        // collision with an existing user file is refused
        let mods = install::app_dir(data.path(), "soh").join("mods");
        fs::create_dir_all(&mods).unwrap();
        fs::write(mods.join("x.o2r"), b"user's own").unwrap();
        let f2 = data.path().join("x.o2r");
        fs::write(&f2, b"other").unwrap();
        assert!(add_local_mod(data.path(), &m, &f2).is_err());
        assert_eq!(fs::read(mods.join("x.o2r")).unwrap(), b"user's own");
        assert!(set_enabled(data.path(), "soh", "../etc", true).is_err());
    }

    #[test]
    fn catalog_view_and_compatibility() {
        let m = manifest();
        let data = installed_port("9.2.3");
        let v = view(data.path(), &m);
        assert!(v.supported);
        assert!(!v.catalog[0].compatible, "pinned to 9.3.0 only");
        let data = installed_port("9.3.0");
        assert!(view(data.path(), &m).catalog[0].compatible);
        let r = tauri::async_runtime::block_on(install_catalog_mod(
            &reqwest::Client::new(),
            installed_port("9.2.3").path(),
            &m,
            "demo",
            |_| {},
        ));
        assert!(r.unwrap_err().contains("does not support"));
    }

    #[test]
    fn mod_folder_must_be_safe() {
        let mut m = manifest();
        m.mods.folder = Some("../../outside".into());
        assert!(target_of(&m, None).is_err());
    }
}
