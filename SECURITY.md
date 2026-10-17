# Security policy

## Reporting a vulnerability

Please report privately via **[GitHub private vulnerability reporting](https://github.com/DrummingBird1/PortHub/security/advisories/new)**. Do not open a public issue. We aim to reply within 7 days and to publish a fix and advisory within 90 days.

## Scope

In scope:

- download and checksum verification
- the GitHub host allowlist and redirects
- archive extraction (path traversal, symlinks, archive bombs)
- Tauri IPC permissions and CSP
- launching ports
- `shortcuts.vdf` writes
- catalog/manifest validation

Out of scope: vulnerabilities in the upstream ports themselves (report those upstream).

## Supported versions

Only the latest release. PortHub is an early preview.

## Release integrity

Releases are built by GitHub Actions from tagged commits, and each release includes a `SHA256SUMS` file. The installers are **not code-signed yet**.
