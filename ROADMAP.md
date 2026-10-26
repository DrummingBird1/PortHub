# Roadmap

> עברית: מפת הדרכים של PortHub בקצרה. אין התחייבות לתאריכים.

PortHub is an early preview. This page lists what has shipped, what is known to be missing and what may come next. It is a status list, not a promise: there are no dates, and items can change or be dropped. Release details are in the [CHANGELOG](CHANGELOG.md).

## Shipped (0.0.2)

- Library grid with generated cover art, search, console and installed filters, and sorting.
- Game page with one main button that changes with the state (Install, Play, Update), install progress with speed and time left, and tabs for Overview, Mods, Updates and Files.
- First-run guide that explains the bring-your-own-ROM rule and lets you choose the library folder.
- Settings (library folder, theme, language, update check on startup) and an About page.
- Dark, light and system themes; English and Hebrew with full right-to-left layout.
- Uninstall with an option to keep saves, configs and mods.
- Keyboard and gamepad navigation.
- Ports are downloaded only from each project's official GitHub Releases. PortHub never hosts or links to game files.

## Known gaps

- Installers are not code-signed, so Windows SmartScreen may warn.
- Gamepad navigation has not been tested on a real Steam Deck or controller.
- Every catalog entry is still marked Unverified until maintainers have tested it.

## Planned

- Verify catalog entries one by one on real hardware and mark them as verified.
- Test and fix controller and Steam Deck use.
- Code-signed installers.
- Move toward a 1.0 release once the catalog and the installer flow are stable.

## Ideas

- More ports in the catalog, added through the documented contribution flow.
- More interface languages.

## Not planned

- Hosting, downloading or linking to ROMs, ISOs, BIOS files or game assets.

Suggestions and bug reports are welcome as [issues](https://github.com/DrummingBird1/PortHub/issues).
