//! User settings (stored as JSON in the app config dir) and the library folder.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    #[default]
    System,
    Light,
    Dark,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum Language {
    #[default]
    En,
    He,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    /// Custom library folder (absolute). `None` = the default app data folder.
    pub library_dir: Option<PathBuf>,
    pub theme: Theme,
    pub language: Language,
    pub check_updates_on_startup: bool,
    pub onboarded: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            library_dir: None,
            theme: Theme::System,
            language: Language::En,
            check_updates_on_startup: true,
            onboarded: false,
        }
    }
}

/// Preferences the webview may change. The library folder is excluded on purpose:
/// it only changes through the Rust-side folder picker.
#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Prefs {
    pub theme: Theme,
    pub language: Language,
    pub check_updates_on_startup: bool,
    pub onboarded: bool,
}

fn file(config: &Path) -> PathBuf {
    config.join("settings.json")
}

/// Missing or unreadable settings fall back to defaults.
pub fn load(config: &Path) -> Settings {
    fs::read_to_string(file(config))
        .ok()
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_default()
}

/// Atomic write (temp file + rename).
///
/// # Errors
/// I/O or serialisation failure.
pub fn save(config: &Path, s: &Settings) -> Result<(), String> {
    fs::create_dir_all(config).map_err(|e| e.to_string())?;
    let tmp = config.join("settings.json.tmp");
    let text = serde_json::to_string_pretty(s).map_err(|e| e.to_string())?;
    fs::write(&tmp, text).map_err(|e| e.to_string())?;
    fs::rename(&tmp, file(config)).map_err(|e| e.to_string())
}

pub fn apply_prefs(s: &mut Settings, p: Prefs) {
    s.theme = p.theme;
    s.language = p.language;
    s.check_updates_on_startup = p.check_updates_on_startup;
    s.onboarded = p.onboarded;
}

/// The effective library root (contains `ports/`).
pub fn library_root(s: &Settings, default_root: &Path) -> PathBuf {
    s.library_dir
        .clone()
        .filter(|p| p.is_absolute())
        .unwrap_or_else(|| default_root.to_path_buf())
}

/// True if any port is installed under `root`.
pub fn has_installs(root: &Path) -> bool {
    fs::read_dir(root.join("ports")).is_ok_and(|rd| {
        rd.flatten()
            .any(|e| e.path().join("install.json").is_file())
    })
}

/// Checks a candidate library folder: absolute, an existing directory, writable.
///
/// # Errors
/// Explains why the folder can't be used.
pub fn validate_library_dir(dir: &Path) -> Result<(), String> {
    if !dir.is_absolute() {
        return Err("the library folder must be an absolute path".into());
    }
    if !dir.is_dir() {
        return Err("the library folder does not exist".into());
    }
    let probe = dir.join(".porthub-write-test");
    fs::write(&probe, b"ok").map_err(|e| format!("the library folder is not writable: {e}"))?;
    let _ = fs::remove_file(probe);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_and_roundtrip() {
        let dir = tempfile::tempdir().unwrap();
        let s = load(dir.path());
        assert_eq!(s, Settings::default());
        assert!(s.check_updates_on_startup);
        let mut s2 = s.clone();
        apply_prefs(
            &mut s2,
            Prefs {
                theme: Theme::Dark,
                language: Language::He,
                check_updates_on_startup: false,
                onboarded: true,
            },
        );
        save(dir.path(), &s2).unwrap();
        assert_eq!(load(dir.path()), s2);
    }

    #[test]
    fn corrupt_file_falls_back_to_defaults() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("settings.json"), b"{not json").unwrap();
        assert_eq!(load(dir.path()), Settings::default());
    }

    #[test]
    fn library_root_ignores_relative_paths() {
        let def = Path::new("/default");
        let mut s = Settings::default();
        assert_eq!(library_root(&s, def), def);
        s.library_dir = Some(PathBuf::from("relative/dir"));
        assert_eq!(library_root(&s, def), def);
        let abs = tempfile::tempdir().unwrap();
        s.library_dir = Some(abs.path().to_path_buf());
        assert_eq!(library_root(&s, def), abs.path());
    }

    #[test]
    fn validates_and_detects_installs() {
        let dir = tempfile::tempdir().unwrap();
        assert!(validate_library_dir(dir.path()).is_ok());
        assert!(validate_library_dir(&dir.path().join("missing")).is_err());
        assert!(validate_library_dir(Path::new("relative")).is_err());
        assert!(!has_installs(dir.path()));
        fs::create_dir_all(dir.path().join("ports/x")).unwrap();
        assert!(!has_installs(dir.path()));
        fs::write(dir.path().join("ports/x/install.json"), b"{}").unwrap();
        assert!(has_installs(dir.path()));
    }
}
