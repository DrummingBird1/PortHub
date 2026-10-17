# Contributing to PortHub

Thanks for helping! There are two kinds of contribution: **catalog manifests** (new or updated ports) and **app code**.

## Ground rules

- Never add ROMs, ISOs, BIOS files, game assets, or links or instructions for getting them. The only exception is the hashes of supported dumps that a port publishes itself.
- Port binaries come only from the port's official GitHub Releases. Never rehost them.
- Tests use synthetic data only.

## Adding or updating a port

1. Copy `docs/examples/shipwright.json` to `catalog/<id>.json`, where `<id>` is the manifest's `id`.
2. Fill it in following `docs/schema/manifest.schema.json`. Keep `verification.status` set to `unverified`.
3. Download the release asset yourself and confirm that `pinned.sha256` equals the asset's `digest` in the GitHub API.
4. Run `npm run validate:catalog`, then open a PR and complete the checklist.

## Changing code

```sh
npm ci
npm run check
cd src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test
```

- Run the changed flow for real (`npm run tauri dev`) on at least one OS, and say which one in the PR.
- Any new Tauri command needs an entry in `src-tauri/permissions/app.toml` and a clear reason. Don't grant fs, shell or http access to the webview.
- Download, verification and extraction must fail closed. Add unit tests for every new path.
- Use small, focused PRs and conventional commit messages (`feat:`, `fix:`, `docs:`).

By contributing, you agree that your code is licensed under GPL-3.0-or-later, and manifests under CC0-1.0.
