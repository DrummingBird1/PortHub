## What and why

## How I tested

- [ ] `npm run check`
- [ ] `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test`
- [ ] Ran the changed flow for real on: <!-- Windows / Linux / Steam Deck -->

## Catalog manifest checklist (only for `catalog/` changes)

- [ ] `repo` is the official upstream project (not a fork or mirror)
- [ ] The upstream license allows redistributing builds; `license` is filled in
- [ ] No ROMs, assets or non-GitHub-Releases download links anywhere
- [ ] Each asset `pattern` matches exactly one asset per OS in the pinned release
- [ ] `pinned.sha256` equals the GitHub asset `digest`, and I re-downloaded the file to confirm it
- [ ] ROM hashes come from the port's own public docs
- [ ] Mods listed only if freely distributable with no Nintendo assets
- [ ] `verification.status` stays `unverified` (maintainers set `verified` after testing)
