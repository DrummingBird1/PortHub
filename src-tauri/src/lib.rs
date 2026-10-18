//! Tauri app entry: exposes narrowly-scoped commands to the webview.
//! All network and filesystem access happens here in Rust; the webview has no fs/http/shell rights.

mod catalog;
mod extract;
mod github;
mod install;
mod manifest;
mod mods;
mod rom;
mod settings;
mod steam;

use serde::Serialize;
use std::collections::HashSet;
use std::fs::File;
use std::io::BufReader;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;

#[derive(Default)]
struct Busy(Mutex<HashSet<String>>);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RomCheckResult {
    file_name: String,
    size_bytes: u64,
    sha1: String,
    md5: String,
    sha256: String,
    matched_label: Option<String>,
}

fn load(app: &AppHandle) -> Result<catalog::Catalog, String> {
    let res = app.path().resource_dir().map_err(|e| e.to_string())?;
    catalog::load_dir(
        &res.join("catalog"),
        &res.join("schema").join("manifest.schema.json"),
    )
    .map_err(|e| e.to_string())
}

/// Look up a validated manifest by id from the app's own catalog (never trust webview data).
fn manifest_by_id(app: &AppHandle, id: &str) -> Result<manifest::Manifest, String> {
    let cat = load(app)?;
    let v = cat
        .manifests
        .into_iter()
        .find(|m| m["id"] == id)
        .ok_or_else(|| format!("unknown port id: {id}"))?;
    serde_json::from_value(v).map_err(|e| e.to_string())
}

fn config_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_config_dir().map_err(|e| e.to_string())
}

fn default_library(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_local_data_dir().map_err(|e| e.to_string())
}

/// Library root (contains `ports/`): the user's chosen folder or the default app data folder.
fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let s = settings::load(&config_dir(app)?);
    Ok(settings::library_root(&s, &default_library(app)?))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SettingsView {
    #[serde(flatten)]
    settings: settings::Settings,
    /// Effective library folder.
    library_path: PathBuf,
    default_library_path: PathBuf,
    /// The library folder can only change while no port is installed.
    library_locked: bool,
}

fn settings_view(app: &AppHandle) -> Result<SettingsView, String> {
    let s = settings::load(&config_dir(app)?);
    let def = default_library(app)?;
    let lib = settings::library_root(&s, &def);
    Ok(SettingsView {
        library_locked: settings::has_installs(&lib),
        library_path: lib,
        default_library_path: def,
        settings: s,
    })
}

#[allow(clippy::needless_pass_by_value)]
#[tauri::command]
fn get_settings(app: AppHandle) -> Result<SettingsView, String> {
    settings_view(&app)
}

#[allow(clippy::needless_pass_by_value)]
#[tauri::command]
fn save_prefs(app: AppHandle, prefs: settings::Prefs) -> Result<SettingsView, String> {
    let cfg = config_dir(&app)?;
    let mut s = settings::load(&cfg);
    settings::apply_prefs(&mut s, prefs);
    settings::save(&cfg, &s)?;
    settings_view(&app)
}

/// Native folder picker (Rust side). `reset` = go back to the default folder.
/// Refused while ports are installed in the current library.
#[tauri::command]
async fn choose_library_dir(app: AppHandle, reset: bool) -> Result<SettingsView, String> {
    let cfg = config_dir(&app)?;
    let mut s = settings::load(&cfg);
    let current = settings::library_root(&s, &default_library(&app)?);
    if settings::has_installs(&current) {
        return Err("uninstall your ports before changing the library folder".into());
    }
    if reset {
        s.library_dir = None;
    } else {
        let Some(picked) = app
            .dialog()
            .file()
            .set_title("Choose the PortHub library folder")
            .blocking_pick_folder()
        else {
            return settings_view(&app);
        };
        let dir = picked.into_path().map_err(|e| e.to_string())?;
        settings::validate_library_dir(&dir)?;
        s.library_dir = Some(dir);
    }
    settings::save(&cfg, &s)?;
    settings_view(&app)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AppInfo {
    version: String,
    os: &'static str,
    arch: &'static str,
}

#[allow(clippy::needless_pass_by_value)]
#[tauri::command]
fn app_info(app: AppHandle) -> AppInfo {
    AppInfo {
        version: app.package_info().version.to_string(),
        os: std::env::consts::OS,
        arch: std::env::consts::ARCH,
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct UninstallResult {
    kept_files_path: Option<PathBuf>,
}

#[tauri::command]
async fn uninstall_port(
    app: AppHandle,
    busy: State<'_, Busy>,
    port_id: String,
    keep_user_files: bool,
) -> Result<UninstallResult, String> {
    let m = manifest_by_id(&app, &port_id)?;
    if !busy
        .0
        .lock()
        .map_err(|e| e.to_string())?
        .insert(m.id.clone())
    {
        return Err("another operation for this port is running".into());
    }
    let data = data_dir(&app)?;
    let id = m.id.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        install::uninstall(&data, &id, keep_user_files)
    })
    .await
    .map_err(|e| e.to_string())
    .and_then(|r| r);
    busy.0.lock().map_err(|e| e.to_string())?.remove(&m.id);
    result.map(|kept_files_path| UninstallResult { kept_files_path })
}

/// Only plain `https://github.com/...` links may be opened (repo, releases, issues).
fn allowed_link(url: &str) -> bool {
    url.strip_prefix("https://github.com/").is_some_and(|rest| {
        !rest.is_empty()
            && rest
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || "-._~/?=&#%+".contains(c))
    })
}

/// Opens an allow-listed GitHub link in the default browser.
#[allow(clippy::needless_pass_by_value)]
#[tauri::command]
fn open_link(url: String) -> Result<(), String> {
    if !allowed_link(&url) {
        return Err("only github.com links can be opened".into());
    }
    let mut cmd = if cfg!(windows) {
        let mut c = std::process::Command::new("rundll32");
        c.arg("url.dll,FileProtocolHandler");
        c
    } else if cfg!(target_os = "macos") {
        std::process::Command::new("open")
    } else {
        std::process::Command::new("xdg-open")
    };
    cmd.arg(&url)
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("could not open the link: {e}"))
}

/// Opens the port's install folder in the system file manager. The path is resolved in Rust.
#[allow(clippy::needless_pass_by_value)]
#[tauri::command]
fn open_install_folder(app: AppHandle, port_id: String) -> Result<(), String> {
    let m = manifest_by_id(&app, &port_id)?;
    let dir = install::install_folder(&data_dir(&app)?, &m.id)?;
    let program = if cfg!(windows) {
        "explorer"
    } else if cfg!(target_os = "macos") {
        "open"
    } else {
        "xdg-open"
    };
    std::process::Command::new(program)
        .arg(&dir)
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("could not open the folder: {e}"))
}

// Tauri injects AppHandle by value.
#[allow(clippy::needless_pass_by_value)]
#[tauri::command]
fn load_catalog(app: AppHandle) -> Result<catalog::Catalog, String> {
    load(&app)
}

/// Opens a native file picker from Rust (the webview gets no dialog/fs permission and can't
/// pass arbitrary paths), hashes the chosen file locally and matches it. `None` = cancelled.
#[tauri::command]
async fn pick_and_hash_rom(
    app: AppHandle,
    requirements: Vec<rom::RomRequirement>,
) -> Result<Option<RomCheckResult>, String> {
    let Some(picked) = app
        .dialog()
        .file()
        .set_title("Select your own game dump (ROM/ISO)")
        .blocking_pick_file()
    else {
        return Ok(None);
    };
    let path = picked.into_path().map_err(|e| e.to_string())?;
    tauri::async_runtime::spawn_blocking(move || {
        let file = File::open(&path).map_err(|e| e.to_string())?;
        let h = rom::hash_reader(BufReader::new(file)).map_err(|e| e.to_string())?;
        let matched_label = rom::find_match(&requirements, &h).map(str::to_owned);
        Ok(Some(RomCheckResult {
            file_name: path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .into_owned(),
            size_bytes: h.size_bytes,
            sha1: h.sha1,
            md5: h.md5,
            sha256: h.sha256,
            matched_label,
        }))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[allow(clippy::needless_pass_by_value)]
#[tauri::command]
fn get_install_status(
    app: AppHandle,
    port_id: String,
) -> Result<Option<install::InstallRecord>, String> {
    let m = manifest_by_id(&app, &port_id)?;
    Ok(install::read_record(&data_dir(&app)?, &m.id))
}

#[tauri::command]
async fn install_port(
    app: AppHandle,
    busy: State<'_, Busy>,
    port_id: String,
    on_progress: Channel<install::Progress>,
) -> Result<install::InstallRecord, String> {
    let m = manifest_by_id(&app, &port_id)?;
    if !busy
        .0
        .lock()
        .map_err(|e| e.to_string())?
        .insert(m.id.clone())
    {
        return Err("an install for this port is already running".into());
    }
    let result = async {
        let client = install::client()?;
        install::install(&client, &data_dir(&app)?, &m, |p| {
            let _ = on_progress.send(p);
        })
        .await
    }
    .await;
    busy.0.lock().map_err(|e| e.to_string())?.remove(&m.id);
    result
}

#[tauri::command]
async fn check_update(app: AppHandle, port_id: String) -> Result<install::UpdateInfo, String> {
    let m = manifest_by_id(&app, &port_id)?;
    let client = install::client()?;
    install::check_update(&client, &data_dir(&app)?, &m).await
}

#[allow(clippy::needless_pass_by_value)]
#[tauri::command]
fn launch_port(app: AppHandle, port_id: String) -> Result<u32, String> {
    let m = manifest_by_id(&app, &port_id)?;
    install::launch(&data_dir(&app)?, &m.id)
}

#[allow(clippy::needless_pass_by_value)]
#[tauri::command]
fn list_mods(app: AppHandle, port_id: String) -> Result<mods::ModsView, String> {
    let m = manifest_by_id(&app, &port_id)?;
    Ok(mods::view(&data_dir(&app)?, &m))
}

#[tauri::command]
async fn install_catalog_mod(
    app: AppHandle,
    busy: State<'_, Busy>,
    port_id: String,
    mod_id: String,
    on_progress: Channel<install::Progress>,
) -> Result<mods::ModEntry, String> {
    let m = manifest_by_id(&app, &port_id)?;
    if !busy
        .0
        .lock()
        .map_err(|e| e.to_string())?
        .insert(m.id.clone())
    {
        return Err("another operation for this port is running".into());
    }
    let result = async {
        let client = install::client()?;
        mods::install_catalog_mod(&client, &data_dir(&app)?, &m, &mod_id, |p| {
            let _ = on_progress.send(p);
        })
        .await
    }
    .await;
    busy.0.lock().map_err(|e| e.to_string())?.remove(&m.id);
    result
}

/// Native picker (Rust side) filtered to the port's allowed mod file types.
#[tauri::command]
async fn add_local_mod(app: AppHandle, port_id: String) -> Result<Option<mods::ModEntry>, String> {
    let m = manifest_by_id(&app, &port_id)?;
    let exts: Vec<String> = m
        .mods
        .file_types
        .iter()
        .map(|t| t.trim_start_matches('.').to_owned())
        .collect();
    let ext_refs: Vec<&str> = exts.iter().map(String::as_str).collect();
    let Some(picked) = app
        .dialog()
        .file()
        .set_title("Select a mod / texture pack file")
        .add_filter("Mod files", &ext_refs)
        .blocking_pick_file()
    else {
        return Ok(None);
    };
    let path = picked.into_path().map_err(|e| e.to_string())?;
    let data = data_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || mods::add_local_mod(&data, &m, &path).map(Some))
        .await
        .map_err(|e| e.to_string())?
}

#[allow(clippy::needless_pass_by_value)]
#[tauri::command]
fn set_mod_enabled(
    app: AppHandle,
    port_id: String,
    mod_id: String,
    enabled: bool,
) -> Result<mods::ModEntry, String> {
    let m = manifest_by_id(&app, &port_id)?;
    mods::set_enabled(&data_dir(&app)?, &m.id, &mod_id, enabled)
}

#[allow(clippy::needless_pass_by_value)]
#[tauri::command]
fn uninstall_mod(app: AppHandle, port_id: String, mod_id: String) -> Result<(), String> {
    let m = manifest_by_id(&app, &port_id)?;
    mods::uninstall(&data_dir(&app)?, &m.id, &mod_id)
}

#[allow(clippy::needless_pass_by_value)]
#[tauri::command]
fn add_to_steam(app: AppHandle, port_id: String) -> Result<steam::SteamResult, String> {
    let m = manifest_by_id(&app, &port_id)?;
    let exe = install::installed_executable(&data_dir(&app)?, &m.id)?;
    let dir = exe
        .parent()
        .map(std::path::Path::to_path_buf)
        .unwrap_or_default();
    steam::add_to_steam(&steam::steam_roots(), &m.name, &exe, &dir, install::now())
}

/// # Panics
/// Panics if the Tauri runtime fails to start.
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(Busy::default())
        .invoke_handler(tauri::generate_handler![
            load_catalog,
            pick_and_hash_rom,
            get_install_status,
            install_port,
            check_update,
            launch_port,
            list_mods,
            install_catalog_mod,
            add_local_mod,
            set_mod_enabled,
            uninstall_mod,
            add_to_steam,
            get_settings,
            save_prefs,
            choose_library_dir,
            app_info,
            uninstall_port,
            open_install_folder,
            open_link
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::allowed_link;

    #[test]
    fn only_plain_github_links_are_allowed() {
        assert!(allowed_link("https://github.com/DrummingBird1/PortHub"));
        assert!(allowed_link("https://github.com/o/r/releases/tag/v1.0"));
        assert!(!allowed_link("https://github.com/"));
        assert!(!allowed_link("http://github.com/o/r"));
        assert!(!allowed_link("https://github.com.evil.example/o"));
        assert!(!allowed_link("https://evil.example/https://github.com/"));
        assert!(!allowed_link("https://github.com/o/r\" & calc"));
        assert!(!allowed_link("https://github.com/o r"));
        assert!(!allowed_link("file:///etc/passwd"));
    }
}
