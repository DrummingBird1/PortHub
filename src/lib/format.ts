import type { CompatPlatform, CompatStatus, Console, Manifest, VerificationStatus } from "./types";

const CONSOLES: Record<Console, string> = {
  n64: "Nintendo 64",
  gamecube: "GameCube",
  ps1: "PlayStation",
  ps2: "PlayStation 2",
  snes: "SNES",
  gba: "Game Boy Advance",
  nds: "Nintendo DS",
  wii: "Wii",
  other: "Other",
};

export const consoleName = (c: Console): string => CONSOLES[c];

export const PLATFORMS: { key: CompatPlatform; label: string }[] = [
  { key: "windows", label: "Windows" },
  { key: "linux", label: "Linux" },
  { key: "steamdeck", label: "Steam Deck" },
  { key: "macos", label: "macOS" },
];

export const compatOf = (m: Manifest, p: CompatPlatform): CompatStatus =>
  m.compatibility?.[p] ?? "untested";

export const verificationLabel = (s: VerificationStatus): string =>
  ({ verified: "Verified", community: "Community", unverified: "Unverified" })[s];

export const licenseLabel = (spdx: string): string =>
  spdx === "NOASSERTION" ? "Not detected (review needed)" : spdx;

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KiB", "MiB", "GiB"];
  let v = n;
  let i = -1;
  do {
    v /= 1024;
    i++;
  } while (v >= 1024 && i < units.length - 1);
  return `${v.toFixed(1)} ${units[i] ?? "GiB"}`;
}

export const repoUrl = (repo: string): string => `https://github.com/${repo}`;

export function progressLabel(p: import("./types").InstallProgress): string {
  switch (p.phase) {
    case "resolving":
      return "Looking up the official release…";
    case "downloading": {
      const pct = p.total > 0 ? Math.floor((p.downloaded / p.total) * 100) : 0;
      return `Downloading ${formatBytes(p.downloaded)} / ${formatBytes(p.total)} (${pct}%)`;
    }
    case "verifying":
      return "Verifying SHA-256 checksum…";
    case "extracting":
      return "Extracting…";
    case "done":
      return `Installed ${p.tag}`;
  }
}
