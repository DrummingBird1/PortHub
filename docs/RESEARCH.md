# Research findings (2026-10-17)

Star counts and dates come from the GitHub API on 2026-10-17. Facts about each port come from its README unless noted otherwise.

## 1. Ports

| Port | Game / console | How users get it | Required dump and verification | Asset step | Platforms | License | Mods |
|---|---|---|---|---|---|---|---|
| [Ship of Harkinian](https://github.com/HarbourMasters/Shipwright) | OoT / N64 (+GC variants) | GitHub Releases zip (Win), AppImage (Linux), .app (mac). Nightlies come from CI via nightly.link | Many versions (NTSC 1.0–1.2, PAL, GC, MQ, debug). SHA-1 list in [`docs/supportedHashes.json`](https://github.com/HarbourMasters/Shipwright/blob/develop/docs/supportedHashes.json), checker at ship.equipment | On first launch it asks for the ROM and generates `oot.o2r` / `oot-mq.o2r` itself. Data lives in `~/.local/share/soh`, overridable with `SHIP_HOME` | Win, Linux, macOS | No SPDX license detected by GitHub (check before listing) | `.otr`/`.o2r` packs in `mods/`; tools: retro, fast64 |
| [2 Ship 2 Harkinian](https://github.com/HarbourMasters/2ship2harkinian) | MM / N64 | Releases, same format as SoH | SHA-1 list in `docs/supportedHashes.json`, checker at 2ship.equipment | Generates its O2R on first run. On Linux the ROM sits next to the AppImage | Win, Linux, macOS | Check before listing | `.o2r`/`.otr` in `mods/` |
| [Zelda64Recomp](https://github.com/Zelda64Recomp/Zelda64Recomp) | MM / N64 (static recompilation, not a decomp) | Releases: Windows, Linux X64/ARM64, **Flatpak**, macOS | Accepts **only** the US MM ROM. Other formats are auto-converted to .z64 | No separate extraction: assets load from the ROM chosen in the menu | Win, Linux, Steam Deck (documented "Add to Steam"), macOS | GPL-3.0 | Built-in mod menu; mods on [Thunderstore](https://thunderstore.io/c/zelda-64-recompiled/) ("Manual Download"); RT64 texture packs |
| [OpenGOAL](https://github.com/open-goal/jak-project) | Jak 1–3 / PS2 | Through its own [OpenGOAL Launcher](https://github.com/open-goal/launcher) (Tauri) | The user's own PS2 ISO | The launcher extracts and compiles from the ISO (dev route: `iso_data/` + `task extract`) | Win, Linux, macOS | ISC | Texture packs and mods managed in the launcher |
| [sm64ex](https://github.com/sm64pc/sm64ex) / [Render96ex](https://github.com/Render96/Render96ex) | SM64 / N64 | **Build from source** (wiki). No official binary releases | ROM needed at build time (`extract_assets.py`) | Assets extracted at build time | Win, Linux (+ more) | No SPDX detected | External texture packs and soundbanks; Render96 HD models/textures. sm64ex last pushed 2024-12, so it is stale |
| [Perfect Dark port](https://github.com/fgsfdsfgs/perfect_dark) | PD / N64 | Rolling `ci-dev-build` release (Win/Linux i686+x64, Switch) | MD5 per version: ntsc-final `e03b088b6ac9e0080440efed07c1e40f` (recommended), ntsc-1.0, jpn-final, pal-final (separate exes) | No extraction. ROM must be at `data/pd.ntsc-final.z64` | Win, Linux, macOS, Switch | Check before listing | Basic mod support (custom levels) |

**Observations**
- Each port does it differently: O2R generation at runtime (HarbourMasters), direct ROM load (Recomp), ISO extract and compile (OpenGOAL), fixed file name and path (PD), build-time only (sm64ex). The manifest needs a typed `romSetup` step to cover these.
- Ports publish hashes in different algorithms (SHA-1 for HM, MD5 for PD). The schema must allow multiple algorithms.
- **GitHub Releases now expose a `digest` (`sha256:…`) per asset in the API** (seen on SoH 9.3.0, Zelda64Recomp v1.2.2 and OpenGOAL Launcher v2.11.2). This gives us upstream-provided checksums without any work from the porters.
- Some ports use rolling or nightly tags (PD `ci-dev-build`, nightly.link). These need a "pinned digest + re-review" policy.
- Licenses are often missing from GitHub's metadata. Reviewers must confirm the license by hand.

## 2. Existing launchers

| Project | Stack | Extension / manifest model | Notes / gaps |
|---|---|---|---|
| [Playnite](https://github.com/JosefNemec/Playnite) (MIT, ~14k★) | C# / .NET WPF, **Windows-only** | Extensions (C#/PowerShell) plus emulator definitions. Add-ons listed through a central add-on database repo with PRs | A generic library. It knows nothing about ROM hashes for ports, asset extraction or port updates |
| [Lutris](https://github.com/lutris/lutris) (GPL-3.0, ~10k★) | Python + GTK, Linux | Community **YAML installer scripts** hosted on lutris.net ([website](https://github.com/lutris/website), moderated) | Closest to our manifest idea, but Linux-only. Scripts can run arbitrary tasks (a security risk). Not port-aware |
| [Heroic](https://github.com/Heroic-Games-Launcher/HeroicGamesLauncher) (GPL-3.0, ~12k★) | Electron + React/TS | Store integrations (Epic/GOG/Amazon) plus sideloading | Very good Steam Deck UX (shows the demand), but store-focused |
| [OpenGOAL Launcher](https://github.com/open-goal/launcher) (ISC) | **Tauri** (Rust + Svelte) | Covers a single project, with a built-in mod and texture-pack manager. Its updater uses signed `.sig` files and `latest.json` | Proves that Tauri works for this exact use case, including ISO extraction and Linux AppImage/deb. One project only |
| Parallel Launcher (parallel-launcher.ca, GitLab) | Qt/C++ | Launches N64 ROMs through RetroArch/ParallelN64. Has romhack integration (romhacking.com) | Emulation-focused, not native ports |

**Gaps we can fill:** nobody offers a cross-platform, **port-aware** hub with ROM-hash verification, per-port install and update, a mods hub, and Steam Deck support across many projects.

## 3. Name check: "PortHub" (2026-10-17)
- GitHub: the user `porthub` exists (created 2017, inactive since 2018), so `github.com/porthub` is **not available**. `porthub-app` and `porthubapp` were free when checked. There are about 91 repos named porthub, mostly small. The closest is [RouBR-dev/PortHub](https://github.com/RouBR-dev/PortHub) (3★, created 2026-09): an Android app that collects game ports. It has the same name and a similar concept, but it is small and new.
- Products: [port-hub.net](https://www.port-hub.net/) (drayage logistics), GPHA PortHub (Ghana Ports Authority app), the former name of Shippio (Japanese freight startup), and Wargaming's 2016 AR photo app "PortHub" (later renamed PortUP). No game launcher by that name and no clear trademark found in the gaming/software-launcher space (web search only, not a formal trademark database search).
- Note: the name differs from a well-known adult site's brand by one letter. Expect some confusion and content-filter risk, and avoid a black/orange "Hub" logo style.
