//! Load the local catalog folder and validate every manifest against the JSON Schema.

use serde::Serialize;
use serde_json::Value;
use std::collections::HashSet;
use std::fs;
use std::path::Path;

#[derive(Debug, Serialize)]
pub struct CatalogError {
    pub source: String,
    pub messages: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct Catalog {
    pub manifests: Vec<Value>,
    pub errors: Vec<CatalogError>,
}

#[derive(Debug, thiserror::Error)]
pub enum LoadError {
    #[error("cannot read {0}: {1}")]
    Io(String, std::io::Error),
    #[error("invalid schema: {0}")]
    Schema(String),
}

/// Validate raw `(source, json text)` pairs. Invalid or duplicate manifests become errors.
///
/// # Errors
/// Fails only if the schema itself is invalid.
pub fn build_catalog(schema: &Value, files: Vec<(String, String)>) -> Result<Catalog, LoadError> {
    let validator =
        jsonschema::validator_for(schema).map_err(|e| LoadError::Schema(e.to_string()))?;
    let mut manifests = Vec::new();
    let mut errors = Vec::new();
    let mut ids = HashSet::new();

    for (source, text) in files {
        let value: Value = match serde_json::from_str(&text) {
            Ok(v) => v,
            Err(e) => {
                errors.push(CatalogError {
                    source,
                    messages: vec![format!("invalid JSON: {e}")],
                });
                continue;
            }
        };
        let messages: Vec<String> = validator
            .iter_errors(&value)
            .map(|e| format!("{} {}", e.instance_path, e))
            .collect();
        if !messages.is_empty() {
            errors.push(CatalogError { source, messages });
            continue;
        }
        let id = value["id"].as_str().unwrap_or_default().to_owned();
        if !ids.insert(id.clone()) {
            errors.push(CatalogError {
                source,
                messages: vec![format!("duplicate id \"{id}\"")],
            });
            continue;
        }
        manifests.push(value);
    }
    manifests.sort_by(|a, b| a["name"].as_str().cmp(&b["name"].as_str()));
    Ok(Catalog { manifests, errors })
}

/// Read `*.json` from `dir` and validate against the schema file.
///
/// # Errors
/// Fails if the schema or the folder cannot be read.
pub fn load_dir(dir: &Path, schema_path: &Path) -> Result<Catalog, LoadError> {
    let io = |p: &Path| {
        let p = p.display().to_string();
        move |e| LoadError::Io(p, e)
    };
    let schema_text = fs::read_to_string(schema_path).map_err(io(schema_path))?;
    let schema: Value =
        serde_json::from_str(&schema_text).map_err(|e| LoadError::Schema(e.to_string()))?;
    let mut files = Vec::new();
    for entry in fs::read_dir(dir).map_err(io(dir))? {
        let path = entry.map_err(io(dir))?.path();
        if path.extension().is_some_and(|e| e == "json") {
            let text = fs::read_to_string(&path).map_err(io(&path))?;
            let name = path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .into_owned();
            files.push((name, text));
        }
    }
    files.sort();
    build_catalog(&schema, files)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn root() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..")
    }

    #[test]
    fn repo_catalog_is_valid() {
        let c = load_dir(
            &root().join("catalog"),
            &root().join("docs/schema/manifest.schema.json"),
        )
        .unwrap();
        assert!(c.errors.is_empty(), "{:?}", c.errors);
        assert_eq!(c.manifests.len(), 3);
    }

    #[test]
    fn rejects_bad_and_duplicate() {
        let schema: Value = serde_json::from_str(
            &fs::read_to_string(root().join("docs/schema/manifest.schema.json")).unwrap(),
        )
        .unwrap();
        let good = fs::read_to_string(root().join("catalog/zelda64recomp.json")).unwrap();
        let mut extra: Value = serde_json::from_str(&good).unwrap();
        extra["postInstallScript"] = Value::from("echo hi");
        let c = build_catalog(
            &schema,
            vec![
                ("a.json".into(), good.clone()),
                ("b.json".into(), good),
                ("c.json".into(), extra.to_string()),
                ("d.json".into(), "{ not json".into()),
            ],
        )
        .unwrap();
        assert_eq!(c.manifests.len(), 1);
        let sources: Vec<_> = c.errors.iter().map(|e| e.source.as_str()).collect();
        assert_eq!(sources, ["b.json", "c.json", "d.json"]);
    }
}
