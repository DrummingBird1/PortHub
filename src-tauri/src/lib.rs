//! Tauri app entry: exposes narrowly-scoped commands to the webview.
//! All network and filesystem access happens here in Rust; the webview has no fs/http/shell rights.

mod catalog;
mod extract;
mod github;
mod install;
mod manifest;
mod mods;
mod rom;
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

fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_local_data_dir().map_err(|e| e.to_string())
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
            add_to_steam
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
