import { Channel, invoke } from "@tauri-apps/api/core";
import type {
  InstallProgress,
  InstallRecord,
  Manifest,
  ModEntry,
  ModsView,
  SteamResult,
  RomCheckResult,
  RomRequirement,
  UpdateInfo,
  AppInfo,
  Prefs,
  SettingsView,
  UninstallResult,
} from "./types";

export interface CatalogResponse {
  manifests: Manifest[];
  errors: { source: string; messages: string[] }[];
}

export const loadCatalog = (): Promise<CatalogResponse> => invoke<CatalogResponse>("load_catalog");

/** Opens a native picker in Rust; resolves null if the user cancels. */
export const pickAndHashRom = (requirements: RomRequirement[]): Promise<RomCheckResult | null> =>
  invoke<RomCheckResult | null>("pick_and_hash_rom", { requirements });

export const getInstallStatus = (portId: string): Promise<InstallRecord | null> =>
  invoke<InstallRecord | null>("get_install_status", { portId });

/** Download + verify + install, all in Rust. Progress arrives over an IPC channel. */
export function installPort(
  portId: string,
  onProgress: (p: InstallProgress) => void,
): Promise<InstallRecord> {
  const channel = new Channel<InstallProgress>();
  channel.onmessage = onProgress;
  return invoke<InstallRecord>("install_port", { portId, onProgress: channel });
}

export const checkUpdate = (portId: string): Promise<UpdateInfo> =>
  invoke<UpdateInfo>("check_update", { portId });

export const launchPort = (portId: string): Promise<number> =>
  invoke<number>("launch_port", { portId });

export const listMods = (portId: string): Promise<ModsView> =>
  invoke<ModsView>("list_mods", { portId });

export function installCatalogMod(
  portId: string,
  modId: string,
  onProgress: (p: InstallProgress) => void,
): Promise<ModEntry> {
  const channel = new Channel<InstallProgress>();
  channel.onmessage = onProgress;
  return invoke<ModEntry>("install_catalog_mod", { portId, modId, onProgress: channel });
}

/** Opens a filtered native picker in Rust; resolves null if cancelled. */
export const addLocalMod = (portId: string): Promise<ModEntry | null> =>
  invoke<ModEntry | null>("add_local_mod", { portId });

export const setModEnabled = (portId: string, modId: string, enabled: boolean): Promise<ModEntry> =>
  invoke<ModEntry>("set_mod_enabled", { portId, modId, enabled });

export const uninstallMod = (portId: string, modId: string): Promise<void> =>
  invoke<undefined>("uninstall_mod", { portId, modId });

export const addToSteam = (portId: string): Promise<SteamResult> =>
  invoke<SteamResult>("add_to_steam", { portId });

export const getSettings = (): Promise<SettingsView> => invoke<SettingsView>("get_settings");

export const savePrefs = (prefs: Prefs): Promise<SettingsView> =>
  invoke<SettingsView>("save_prefs", { prefs });

/** Opens a native folder picker in Rust. `reset` returns to the default folder. */
export const chooseLibraryDir = (reset: boolean): Promise<SettingsView> =>
  invoke<SettingsView>("choose_library_dir", { reset });

export const appInfo = (): Promise<AppInfo> => invoke<AppInfo>("app_info");

export const uninstallPort = (portId: string, keepUserFiles: boolean): Promise<UninstallResult> =>
  invoke<UninstallResult>("uninstall_port", { portId, keepUserFiles });

export const openInstallFolder = (portId: string): Promise<void> =>
  invoke<undefined>("open_install_folder", { portId });

/** Rust only opens https://github.com/ links. */
export const openLink = (url: string): Promise<void> => invoke<undefined>("open_link", { url });
