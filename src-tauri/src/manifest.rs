//! Typed view of the manifest fields the installer needs (schema-validated beforehand).

use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
pub struct Pinned {
    pub tag: String,
    pub sha256: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AssetRule {
    pub os: String,
    pub arch: String,
    pub pattern: String,
    pub kind: String,
    pub executable: Option<String>,
    pub pinned: Option<Pinned>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Releases {
    pub channel: String,
    pub tag: Option<String>,
    pub assets: Vec<AssetRule>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogMod {
    pub id: String,
    pub name: String,
    pub author: String,
    pub repo: String,
    pub asset_pattern: String,
    pub kind: String,
    pub pinned: Pinned,
    pub license: String,
    pub port_versions: Vec<String>,
    pub target: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Mods {
    #[serde(default)]
    pub supported: bool,
    pub folder: Option<String>,
    #[serde(default)]
    pub file_types: Vec<String>,
    #[serde(default)]
    pub catalog: Vec<CatalogMod>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Manifest {
    pub id: String,
    pub name: String,
    pub repo: String,
    pub releases: Releases,
    #[serde(default)]
    pub mods: Mods,
}

/// Current platform in manifest terms.
pub fn current_os() -> &'static str {
    match std::env::consts::OS {
        "windows" => "windows",
        "macos" => "macos",
        _ => "linux",
    }
}

pub fn current_arch() -> &'static str {
    match std::env::consts::ARCH {
        "x86_64" => "x64",
        "x86" => "x86",
        "aarch64" => "arm64",
        _ => "unknown",
    }
}
