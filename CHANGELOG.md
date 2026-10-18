# Changelog

All notable changes to PortHub are listed here. PortHub is an early preview; versions below 1.0 may change behavior.

## [0.0.2] - 2026-10-18

### Added

- Library grid with generated cover art, search, console and installed filters, and sorting.
- Game page with a banner and one main button that changes with the state (Install, Play, Update). Install progress shows speed and time left.
- Game page tabs: Overview, Mods, Updates (changelog) and Files & advanced (open the install folder, add to Steam, uninstall).
- First-run guide that explains bring-your-own-ROM and lets you choose the library folder.
- Settings page (library folder, theme, language, update check on startup) and an About page.
- Dark, light and system themes.
- English and Hebrew, with full right-to-left layout.
- Uninstall, with an option to keep saves, configs and mods (moved to the library's `saved-data` folder).
- Notifications (toasts), plus clear empty and error states.
- Keyboard and gamepad navigation (arrow keys or D-pad, A to select, B or Escape to go back).

### Changed

- Changelogs are shown as sanitized markdown. HTML is never rendered, and only github.com links can be opened.
- New native commands each have their own Tauri permission. Folder pickers open from the Rust side.

### Known limitations

- Installers are not code-signed, so Windows SmartScreen may warn you.
- Gamepad navigation has not been tested on a real Steam Deck or controller.
- All catalog entries are still marked Unverified.

## [0.0.1] - 2026-10-17

First public early preview.

### Added

- Catalog of ports: Ship of Harkinian, 2 Ship 2 Harkinian and Zelda64Recomp.
- Local ROM check (SHA-1/MD5/SHA-256) against supported game versions. The file never leaves your computer.
- Verified installs from official GitHub Releases only. The SHA-256 must match GitHub's digest and the pinned checksum. Archives are extracted safely.
- Updates with changelog, keeping saves, configs and mods.
- Per-port mod and texture-pack management.
- Add to Steam (non-Steam shortcut, with a backup of `shortcuts.vdf`).
- Windows NSIS installer, Linux AppImage and .deb, with SHA256SUMS.

[0.0.2]: https://github.com/DrummingBird1/PortHub/releases/tag/v0.0.2
[0.0.1]: https://github.com/DrummingBird1/PortHub/releases/tag/v0.0.1
