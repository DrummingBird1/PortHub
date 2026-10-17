// Types mirroring docs/schema/manifest.schema.json (schemaVersion 1).
export type Console = "n64" | "gamecube" | "ps1" | "ps2" | "snes" | "gba" | "nds" | "wii" | "other";
export type Os = "windows" | "linux" | "macos";
export type CompatPlatform = Os | "steamdeck";
export type CompatStatus = "verified" | "playable" | "issues" | "unsupported" | "untested";
export type VerificationStatus = "verified" | "community" | "unverified";

export interface RomHashes {
  sha1?: string;
  md5?: string;
  sha256?: string;
}

export interface RomRequirement {
  label: string;
  format?: "z64" | "n64" | "v64" | "iso" | "bin-cue" | "gcm" | "other";
  recommended?: boolean;
  hashes: RomHashes;
}

export interface ReleaseAsset {
  os: Os;
  arch: "x64" | "x86" | "arm64" | "universal";
  pattern: string;
  kind: string;
  executable?: string;
  pinned?: { tag: string; sha256: string };
}

export interface Manifest {
  schemaVersion: 1;
  id: string;
  name: string;
  game: { title: string; console: Console };
  description?: string;
  repo: string;
  homepage?: string;
  license: string;
  romRequirements: RomRequirement[];
  releases: { channel: "latest" | "prerelease" | "tag"; tag?: string; assets: ReleaseAsset[] };
  romSetup: { type: "in-app-prompt" | "copy-to-path" | "port-tool" | "build-from-source" };
  mods?: { supported?: boolean; folder?: string; fileTypes?: string[]; sources?: string[] };
  compatibility?: Partial<Record<CompatPlatform, CompatStatus>>;
  media?: { screenshots?: string[]; icon?: string };
  verification: {
    status: VerificationStatus;
    reviewedBy?: string[];
    reviewedAt?: string;
    notes?: string;
  };
}

/** Result returned by the Rust `pick_and_hash_rom` command. */
export interface RomCheckResult {
  fileName: string;
  sizeBytes: number;
  sha1: string;
  md5: string;
  sha256: string;
  /** Label of the matching supported version, or null if none matched. */
  matchedLabel: string | null;
}

export interface InstallRecord {
  tag: string;
  assetName: string;
  sha256: string;
  pinnedOk: boolean;
  executable: string | null;
  installedAt: number;
  preservedFiles: number;
}

export type InstallProgress =
  | { phase: "resolving" }
  | { phase: "downloading"; downloaded: number; total: number }
  | { phase: "verifying" }
  | { phase: "extracting" }
  | { phase: "done"; tag: string };

export interface UpdateInfo {
  installed: string | null;
  latest: string;
  updateAvailable: boolean;
  releaseUrl: string | null;
  notes: string | null;
}

export interface ModEntry {
  id: string;
  name: string;
  source: "catalog" | "local";
  version: string | null;
  sha256: string;
  target: string;
  files: string[];
  enabled: boolean;
}

export interface CatalogModView {
  id: string;
  name: string;
  author: string;
  repo: string;
  license: string;
  version: string;
  compatible: boolean;
  installed: boolean;
}

export interface ModsView {
  supported: boolean;
  folder: string | null;
  fileTypes: string[];
  catalog: CatalogModView[];
  installed: ModEntry[];
}

export interface SteamResult {
  usersUpdated: number;
  alreadyPresent: number;
  appid: number;
  backups: string[];
}
