# AGENTS.md — guidance for AI agents and contributors (PortHub)

## Scope

- Work only inside the repository folder. Do not touch anything outside it.
- Before overwriting an existing file, read it first and mention the change in your report.
- Current phase: **early preview (0.0.x)**. Do not push to `main`, tag or publish releases without maintainer approval.

## Legal constraints (hard rules)

1. Never add, link to or describe how to obtain ROMs, ISOs, BIOS files, game assets or extracted archives (`.otr`/`.o2r` built from a ROM, and so on).
2. Hashes of _supported dumps_ are allowed (ports publish them). The dumps themselves are never allowed.
3. Port binaries come only from the official upstream GitHub Releases listed in the catalog. Never rehost them.
4. Respect each port's license. Credit the upstream projects on the port's game page.
5. Mods and texture packs follow the same rules: official sources only, and no packs that contain copyrighted ROM data.

## Verification requirements (once code exists)

A change is "done" only when all of these pass and you report them:

- Lint and format checks (per the chosen stack)
- Type checks (strict mode)
- Unit tests, plus schema validation of every catalog manifest
- A **real run**: launch the app and exercise the changed flow (install, hash check, launch) on at least one OS. Say which one.
- Do not claim success for anything you did not run.

## Docs to keep up to date

- `README.md`: status line
- `docs/PLAN.md`: scope, decisions, pending items
- `docs/RESEARCH.md`: add sources (with links) when you learn new facts about ports or launchers
- `docs/schema/manifest.schema.json` together with `docs/examples/*`: keep them in sync. Bump `schemaVersion` on breaking changes.

## Conventions

- Files are UTF-8 (no BOM) with LF line endings. Docs are in English.
- On Windows/PowerShell: use `;` instead of `&&`, use `-LiteralPath`, and write files as UTF-8.

## Project structure

```
catalog/            port manifests (one JSON per port), bundled as app resources
docs/schema/        manifest JSON Schema (source of truth); docs/examples/ holds the reference example
src/                React + TS UI (lib/ = types, API wrappers, markdown (sanitized), spatial/gamepad nav, progress;
                    components/ = Library, GamePage, ModsPanel, Onboarding, SettingsPage, AboutPage, Toasts, CoverArt;
                    i18n/ = en.ts + he.ts (typed keys, RTL); tests are *.test.ts(x) with Vitest + Testing Library)
src/lib/catalogValidation.ts   Ajv validation used ONLY by tests/CI (Node)
src-tauri/src/      Rust: lib.rs (commands), catalog.rs (load + validate), rom.rs (hash + match),
                    manifest.rs (typed fields), github.rs (release API, asset selection, verify, version compare),
                    extract.rs (safe zip/tar.gz), install.rs (download, install, upgrade, launch),
                    mods.rs (mods), steam.rs (shortcuts.vdf), settings.rs (settings.json, library folder)
                    Commands added for the UI: get_settings, save_prefs, choose_library_dir, app_info,
                    uninstall_port, open_install_folder, open_link (https://github.com/ only)
src-tauri/tests/fixtures/  recorded GitHub API JSON (no binaries)
docs/brand/         logo SVG (source for `npx tauri icon`)
src-tauri/capabilities/default.json   webview permissions (keep minimal)
src-tauri/permissions/app.toml        per-command permissions
```

## Dev commands

- `npm install`, then `npm run tauri dev`
- `npm run check` (prettier --check, eslint --max-warnings 0, tsc strict, vitest)
- `cd src-tauri; cargo fmt --check; cargo clippy --all-targets -- -D warnings; cargo test`

## Security rules for code

- The webview gets **only** the app's own commands (listed in `src-tauri/permissions/app.toml`). Commands take a port id; Rust resolves the manifest itself. Do not add fs, shell, http, opener or dialog permissions to the webview without an explicit design note in PLAN.md.
- File paths come from native pickers opened in Rust, never from the frontend.
- Keep the CSP strict: no `unsafe-eval`. That is why manifests are validated in Rust (the `jsonschema` crate), not with Ajv in the webview.
- Tests use synthetic data only. Never commit or use real ROMs/ISOs.

## Windows notes

- Rust lives in `%USERPROFILE%\.cargo\bin`. If PATH isn't refreshed yet, run `$env:Path="$env:USERPROFILE\.cargo\bin;$env:Path"`.
- The release exe without a bundle needs `catalog\` and `schema\manifest.schema.json` next to it (these are Tauri resources).
- E2E ROM check: put a test-only manifest (synthetic hash) **only** in `target\release\catalog\`, never in `catalog\`, and delete it afterwards.

## Installer and end-to-end testing

- `npm run tauri build` produces the NSIS installer under `src-tauri/target/release/bundle/nsis/`. Test it with `setup.exe /S /D=<repo>\.test-install`, then `uninstall.exe /S`.
- Installed ports live in `%LOCALAPPDATA%\dev.porthub.desktop\ports\<id>`. Delete test installs afterwards.
- Port builds contain no ROM data, so installing them for testing is fine. Never put ROMs or ISOs into tests or fixtures.
- Screenshots: capture the PortHub window only (PrintWindow), never the full screen.
- Download, install and verification must stay fail-closed. Any new asset `kind` needs an extraction path and unit tests before it is enabled.

## Upgrade, Steam and Linux notes

- Upgrade policy: user files are those not in `files.txt` and are copied forward. On a collision the user copy becomes `*.porthub-old`. Never overwrite an install that has no file list.
- Steam: refuse to write while Steam is running; always back up `shortcuts.vdf` before writing; root map 0x08 = EOF.
- Linux AppImage build in a container needs `APPIMAGE_EXTRACT_AND_RUN=1` and the `file` command.
- Releases: push a `v*` tag; `.github/workflows/release.yml` builds a draft pre-release that a maintainer publishes.

## Working copy and sync

- The canonical working copy is the maintainer's local clone, kept in sync with `origin/main` on GitHub. Other copies (scratch or CI machines) must be fresh clones; never treat an untracked copy as the source of truth.
- Pull before work, keep `git status` clean, and push only commits that pass `npm run check` and the cargo checks. Never force-push `main`.
- Headless Linux (Xvfb, no GPU): if the window renders black, run with `WEBKIT_DISABLE_COMPOSITING_MODE=1`.
