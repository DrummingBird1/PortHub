//! GitHub Releases: API types, asset selection, digest checks and host allow-listing.

use crate::manifest::{AssetRule, Manifest, Pinned};
use regex::Regex;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ReleaseAsset {
    pub name: String,
    pub browser_download_url: String,
    pub size: u64,
    /// e.g. "sha256:<hex>" (GitHub API). May be absent on old releases.
    pub digest: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Release {
    pub tag_name: String,
    #[serde(default)]
    pub body: Option<String>,
    #[serde(default)]
    pub html_url: Option<String>,
    pub assets: Vec<ReleaseAsset>,
}

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum SelectError {
    #[error("no asset rule for {0}/{1} in the manifest")]
    NoRule(String, String),
    #[error("invalid asset pattern: {0}")]
    BadPattern(String),
    #[error("no release asset matches pattern {0}")]
    NoMatch(String),
    #[error("more than one release asset matches pattern {0}")]
    Ambiguous(String),
}

/// API URL for the release the manifest asks for.
pub fn release_api_url(m: &Manifest) -> String {
    match (m.releases.channel.as_str(), m.releases.tag.as_deref()) {
        ("tag", Some(tag)) => format!(
            "https://api.github.com/repos/{}/releases/tags/{tag}",
            m.repo
        ),
        _ => format!("https://api.github.com/repos/{}/releases/latest", m.repo),
    }
}

/// Pick the manifest rule for this OS/arch (exact arch first, then "universal").
pub fn select_rule<'a>(
    m: &'a Manifest,
    os: &str,
    arch: &str,
) -> Result<&'a AssetRule, SelectError> {
    let rules = || m.releases.assets.iter().filter(|r| r.os == os);
    rules()
        .find(|r| r.arch == arch)
        .or_else(|| rules().find(|r| r.arch == "universal"))
        .ok_or_else(|| SelectError::NoRule(os.into(), arch.into()))
}

/// Exactly one release asset must match the rule's pattern.
pub fn select_asset<'a>(
    rule: &AssetRule,
    rel: &'a Release,
) -> Result<&'a ReleaseAsset, SelectError> {
    let re =
        Regex::new(&rule.pattern).map_err(|_| SelectError::BadPattern(rule.pattern.clone()))?;
    let mut hits = rel.assets.iter().filter(|a| re.is_match(&a.name));
    let first = hits
        .next()
        .ok_or_else(|| SelectError::NoMatch(rule.pattern.clone()))?;
    if hits.next().is_some() {
        return Err(SelectError::Ambiguous(rule.pattern.clone()));
    }
    Ok(first)
}

/// Only `https://github.com/<repo>/releases/download/...` may be requested.
pub fn is_official_download_url(repo: &str, url: &str) -> bool {
    let prefix = format!("https://github.com/{repo}/releases/download/");
    url.starts_with(&prefix) && !url[prefix.len()..].contains("..")
}

/// Hosts GitHub redirects release downloads to.
pub fn is_allowed_redirect_host(host: &str) -> bool {
    matches!(
        host,
        "github.com" | "objects.githubusercontent.com" | "release-assets.githubusercontent.com"
    )
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Verification {
    pub sha256: String,
    pub github_digest_ok: bool,
    /// true = matched a reviewed pinned checksum; false = no pin for this tag.
    pub pinned_ok: bool,
}

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum VerifyError {
    #[error("GitHub provides no sha256 digest for this asset; refusing to install")]
    NoDigest,
    #[error("checksum mismatch against GitHub digest (expected {expected}, got {actual})")]
    DigestMismatch { expected: String, actual: String },
    #[error(
        "checksum mismatch against reviewed pinned checksum (expected {expected}, got {actual})"
    )]
    PinnedMismatch { expected: String, actual: String },
}

/// Fail closed: GitHub digest is mandatory; the pinned checksum must match when it applies to this tag.
pub fn verify(
    actual_sha256: &str,
    asset: &ReleaseAsset,
    pinned: Option<&Pinned>,
    tag: &str,
) -> Result<Verification, VerifyError> {
    let expected = asset
        .digest
        .as_deref()
        .and_then(|d| d.strip_prefix("sha256:"))
        .ok_or(VerifyError::NoDigest)?;
    if !expected.eq_ignore_ascii_case(actual_sha256) {
        return Err(VerifyError::DigestMismatch {
            expected: expected.into(),
            actual: actual_sha256.into(),
        });
    }
    let mut pinned_ok = false;
    if let Some(p) = pinned.filter(|p| p.tag == tag) {
        if !p.sha256.eq_ignore_ascii_case(actual_sha256) {
            return Err(VerifyError::PinnedMismatch {
                expected: p.sha256.clone(),
                actual: actual_sha256.into(),
            });
        }
        pinned_ok = true;
    }
    Ok(Verification {
        sha256: actual_sha256.to_lowercase(),
        github_digest_ok: true,
        pinned_ok,
    })
}

fn parse_version(tag: &str) -> Option<Vec<u64>> {
    let t = tag.trim().trim_start_matches(['v', 'V']);
    let core = t.split(['-', '+']).next()?;
    core.split('.').map(|p| p.parse().ok()).collect()
}

/// `true` if `latest` is newer than `installed`. Non-numeric tags: any difference counts as an update.
pub fn is_newer(installed: &str, latest: &str) -> bool {
    match (parse_version(installed), parse_version(latest)) {
        (Some(mut a), Some(mut b)) => {
            let n = a.len().max(b.len());
            a.resize(n, 0);
            b.resize(n, 0);
            b > a
        }
        _ => installed.trim() != latest.trim(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::manifest::Releases;

    fn rule(os: &str, arch: &str, pattern: &str, pinned: Option<Pinned>) -> AssetRule {
        AssetRule {
            os: os.into(),
            arch: arch.into(),
            pattern: pattern.into(),
            kind: "zip".into(),
            executable: Some("soh.exe".into()),
            pinned,
        }
    }

    fn fixture_release() -> Release {
        serde_json::from_str(include_str!("../tests/fixtures/release_soh.json")).unwrap()
    }

    fn manifest(rules: Vec<AssetRule>) -> Manifest {
        Manifest {
            id: "x".into(),
            name: "X".into(),
            repo: "HarbourMasters/Shipwright".into(),
            releases: Releases {
                channel: "latest".into(),
                tag: None,
                assets: rules,
            },
            mods: crate::manifest::Mods::default(),
        }
    }

    const SHA: &str = "bf46cfc41be17f3b63901db46dac46ac2a63ed3851aa13e3ba6c9ec5d0ac2632";

    #[test]
    fn selects_rule_and_asset() {
        let m = manifest(vec![
            rule("windows", "x64", r"^SoH-.*-Win64\.zip$", None),
            rule("linux", "x64", r"^SoH-.*\.appimage$", None),
            rule("macos", "universal", r"^SoH-.*-Mac\.zip$", None),
        ]);
        let rel = fixture_release();
        let r = select_rule(&m, "windows", "x64").unwrap();
        assert_eq!(
            select_asset(r, &rel).unwrap().name,
            "SoH-Dewey-Alpha-Win64.zip"
        );
        // universal fallback
        assert_eq!(select_rule(&m, "macos", "arm64").unwrap().arch, "universal");
        assert_eq!(
            select_rule(&m, "linux", "arm64").unwrap_err(),
            SelectError::NoRule("linux".into(), "arm64".into())
        );
    }

    #[test]
    fn asset_selection_errors() {
        let rel = fixture_release();
        let none = rule("windows", "x64", r"^Nope\.zip$", None);
        assert!(matches!(
            select_asset(&none, &rel),
            Err(SelectError::NoMatch(_))
        ));
        let many = rule("windows", "x64", r"^SoH-", None);
        assert!(matches!(
            select_asset(&many, &rel),
            Err(SelectError::Ambiguous(_))
        ));
        let bad = rule("windows", "x64", r"(", None);
        assert!(matches!(
            select_asset(&bad, &rel),
            Err(SelectError::BadPattern(_))
        ));
    }

    #[test]
    fn verification_fails_closed() {
        let rel = fixture_release();
        let asset = rel
            .assets
            .iter()
            .find(|a| a.name.ends_with("Win64.zip"))
            .unwrap();
        let pinned = rule(
            "windows",
            "x64",
            "",
            Some(Pinned {
                tag: "9.3.0".into(),
                sha256: SHA.into(),
            }),
        );
        let v = verify(SHA, asset, pinned.pinned.as_ref(), "9.3.0").unwrap();
        assert!(v.github_digest_ok && v.pinned_ok);
        // Pin for another tag does not apply.
        assert!(
            !verify(SHA, asset, pinned.pinned.as_ref(), "9.4.0")
                .unwrap()
                .pinned_ok
        );
        // Wrong bytes.
        let bad = "0".repeat(64);
        assert!(matches!(
            verify(&bad, asset, pinned.pinned.as_ref(), "9.3.0"),
            Err(VerifyError::DigestMismatch { .. })
        ));
        // Pinned disagrees with GitHub digest.
        let wrong_pin = rule(
            "windows",
            "x64",
            "",
            Some(Pinned {
                tag: "9.3.0".into(),
                sha256: bad,
            }),
        );
        assert!(matches!(
            verify(SHA, asset, wrong_pin.pinned.as_ref(), "9.3.0"),
            Err(VerifyError::PinnedMismatch { .. })
        ));
        // No digest at all.
        let mut nodigest = asset.clone();
        nodigest.digest = None;
        assert_eq!(
            verify(SHA, &nodigest, pinned.pinned.as_ref(), "9.3.0"),
            Err(VerifyError::NoDigest)
        );
    }

    #[test]
    fn url_allowlist() {
        let repo = "HarbourMasters/Shipwright";
        assert!(is_official_download_url(
            repo,
            "https://github.com/HarbourMasters/Shipwright/releases/download/9.3.0/a.zip"
        ));
        assert!(!is_official_download_url(
            repo,
            "https://github.com/Evil/Shipwright/releases/download/9.3.0/a.zip"
        ));
        assert!(!is_official_download_url(
            repo,
            "http://github.com/HarbourMasters/Shipwright/releases/download/9.3.0/a.zip"
        ));
        assert!(!is_official_download_url(
            repo,
            "https://github.com/HarbourMasters/Shipwright/releases/download/../../x"
        ));
        assert!(is_allowed_redirect_host(
            "release-assets.githubusercontent.com"
        ));
        assert!(!is_allowed_redirect_host("example.com"));
    }

    #[test]
    fn version_compare() {
        assert!(is_newer("9.3.0", "9.10.0"));
        assert!(is_newer("v1.2.2", "v1.3"));
        assert!(!is_newer("v1.2.2", "1.2.2"));
        assert!(!is_newer("9.3.0", "9.2.9"));
        assert!(is_newer("ci-dev-build", "ci-dev-build-2"));
        assert!(!is_newer("ci-dev-build", "ci-dev-build"));
    }

    #[test]
    fn api_url() {
        let mut m = manifest(vec![]);
        assert!(release_api_url(&m).ends_with("/releases/latest"));
        m.releases.channel = "tag".into();
        m.releases.tag = Some("9.3.0".into());
        assert!(release_api_url(&m).ends_with("/releases/tags/9.3.0"));
    }
}
