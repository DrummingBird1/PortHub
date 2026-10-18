# PLAN

## Status: 0.0.2 early preview

Public at <https://github.com/DrummingBird1/PortHub>. Stack: Tauri 2 + React/TypeScript with a Rust core.

## Scope of 0.0.1

- Catalog with 3 ports: Ship of Harkinian, 2 Ship 2 Harkinian, Zelda64Recomp. All are `unverified`.
- ROM check: hashes the dump locally.
- Install from official GitHub Releases. SHA-256 must equal the GitHub digest and the pinned hash; fails closed.
- Safe zip/tar.gz extraction. Linux: AppImage exec bit and FUSE fallback.
- Launch; update check with changelog; upgrade that preserves user files (not in `files.txt`).
- Mods: local `.otr`/`.o2r` files; enable, disable, remove.
- Add to Steam (`shortcuts.vdf`, backup, only while Steam is closed).
- Windows NSIS installer and Linux AppImage/deb, unsigned.

## Manifest schema

- JSON Schema (draft 2020-12): [`schema/manifest.schema.json`](schema/manifest.schema.json). Example: [`examples/shipwright.json`](examples/shipwright.json).
- Purely declarative, with **no scripting hooks**. Validated in Rust at runtime and with Ajv in CI.

## Security model

- Trust chain: reviewed manifest → official GitHub repo → release asset → SHA-256 equal to the GitHub digest (and the pinned hash).
- HTTPS to GitHub hosts only; redirects allowlisted.
- Extraction blocks path traversal, symlinks and archive bombs.
- The webview can call only PortHub's commands, which take a port id. CSP without `unsafe-eval`.
- ROMs never leave the machine. No telemetry.

## Decisions

- Licenses: app GPL-3.0-or-later; catalog manifests CC0-1.0.
- Repo: `DrummingBird1/PortHub`. The catalog lives in `catalog/` for now.
- Code signing: skipped for now; the release notes explain SmartScreen.
- Updater: not enabled yet. When it is, the Tauri updater private key stays with the maintainer and is stored only as a release-environment secret. It is never committed.

## Done after 0.0.1 (UI redesign)

- Library grid, game pages with tabs, first-run guide, settings (library folder, theme, language), About, uninstall (with an option to keep user files), toasts, keyboard and gamepad focus, English and Hebrew (RTL), and sanitized changelog markdown.

## Next

- Steam Deck hardware test (Game Mode).
- Freely distributable catalog mods (Thunderstore for Recomp).
- Signed self-updater; code signing.
- **Split the catalog** into its own repo (`catalog/` → separate repo with CC0, a signed `index.json` built on merge, and a stricter CI that checks the repo, digests and licenses). The app would then fetch the signed index and fall back to the bundled snapshot.
- More ports (Perfect Dark, OpenGOAL integration); controller profiles; macOS.
