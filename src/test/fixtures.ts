import type { InstallRecord, Manifest, SettingsView } from "../lib/types";

export function manifest(id: string, name: string, extra: Partial<Manifest> = {}): Manifest {
  return {
    schemaVersion: 1,
    id,
    name,
    game: { title: `${name} Game`, console: "n64" },
    description: `${name} description`,
    repo: `owner/${id}`,
    license: "MIT",
    romRequirements: [{ label: "NTSC 1.0", recommended: true, hashes: { sha1: "a".repeat(40) } }],
    releases: { channel: "latest", assets: [] },
    romSetup: { type: "in-app-prompt" },
    compatibility: { windows: "playable", linux: "playable" },
    verification: { status: "unverified" },
    ...extra,
  };
}

export const record = (tag = "1.0.0"): InstallRecord => ({
  tag,
  assetName: "Game-Win64.zip",
  sha256: "b".repeat(64),
  pinnedOk: true,
  executable: "game.exe",
  installedAt: 1_760_000_000,
  preservedFiles: 0,
});

export const settings = (extra: Partial<SettingsView> = {}): SettingsView => ({
  theme: "dark",
  language: "en",
  checkUpdatesOnStartup: false,
  onboarded: true,
  libraryDir: null,
  libraryPath: "/library",
  defaultLibraryPath: "/library",
  libraryLocked: false,
  ...extra,
});
