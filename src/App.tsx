import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { I18nProvider, useI18n, type StringKey } from "./i18n";
import {
  appInfo,
  checkUpdate,
  getInstallStatus,
  getSettings,
  loadCatalog,
  savePrefs,
  type CatalogResponse,
} from "./lib/api";
import type {
  AppInfo,
  InstallRecord,
  Language,
  Prefs,
  SettingsView,
  UpdateInfo,
} from "./lib/types";
import { useNavigation } from "./lib/useNavigation";
import { AboutPage } from "./components/AboutPage";
import { GamePage } from "./components/GamePage";
import { Icon, type IconName } from "./components/Icon";
import { Library } from "./components/Library";
import { Onboarding } from "./components/Onboarding";
import { SettingsPage } from "./components/SettingsPage";
import { ToastProvider, errorText, useToast } from "./components/Toasts";
import logo from "./assets/logo.svg";

type View =
  { page: "library" } | { page: "game"; id: string } | { page: "settings" } | { page: "about" };

const FALLBACK_SETTINGS: SettingsView = {
  theme: "system",
  language: "en",
  checkUpdatesOnStartup: false,
  onboarded: true,
  libraryDir: null,
  libraryPath: "",
  defaultLibraryPath: "",
  libraryLocked: false,
};

const prefsOf = (s: SettingsView): Prefs => ({
  theme: s.theme,
  language: s.language,
  checkUpdatesOnStartup: s.checkUpdatesOnStartup,
  onboarded: s.onboarded,
});

function useResolvedTheme(theme: SettingsView["theme"]) {
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const apply = () => {
      const resolved = theme === "system" ? (mq.matches ? "light" : "dark") : theme;
      document.documentElement.dataset.theme = resolved;
    };
    apply();
    mq.addEventListener("change", apply);
    return () => {
      mq.removeEventListener("change", apply);
    };
  }, [theme]);
}

export function App() {
  const [settings, setSettings] = useState<SettingsView | null>(null);
  useEffect(() => {
    getSettings()
      .then(setSettings)
      .catch(() => {
        setSettings(FALLBACK_SETTINGS);
      });
  }, []);
  useResolvedTheme(settings?.theme ?? "system");
  if (!settings) return <div className="splash" aria-busy="true" />;
  return (
    <I18nProvider lang={settings.language}>
      <ToastProvider>
        <Shell settings={settings} setSettings={setSettings} />
      </ToastProvider>
    </I18nProvider>
  );
}

type CatalogState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; catalog: CatalogResponse };

function Shell({
  settings,
  setSettings,
}: {
  settings: SettingsView;
  setSettings: (s: SettingsView) => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [view, setView] = useState<View>({ page: "library" });
  const [catalog, setCatalog] = useState<CatalogState>({ kind: "loading" });
  const [installed, setInstalled] = useState<Record<string, InstallRecord | null>>({});
  const [updates, setUpdates] = useState<Record<string, UpdateInfo | undefined>>({});
  const [info, setInfo] = useState<AppInfo | null>(null);
  const startupChecked = useRef(false);
  const mainRef = useRef<HTMLElement>(null);

  const fetchCatalog = useCallback(() => {
    loadCatalog()
      .then(async (c) => {
        const entries = await Promise.all(
          c.manifests.map(
            async (m) => [m.id, await getInstallStatus(m.id).catch(() => null)] as const,
          ),
        );
        setInstalled(Object.fromEntries(entries));
        setCatalog({ kind: "ready", catalog: c });
      })
      .catch((e: unknown) => {
        setCatalog({ kind: "error", message: errorText(e) });
      });
  }, []);

  const reload = useCallback(() => {
    setCatalog({ kind: "loading" });
    fetchCatalog();
  }, [fetchCatalog]);

  useEffect(() => {
    fetchCatalog();
    appInfo()
      .then(setInfo)
      .catch(() => undefined);
  }, [fetchCatalog]);

  // Optional startup update check for installed ports.
  useEffect(() => {
    if (catalog.kind !== "ready" || startupChecked.current || !settings.checkUpdatesOnStartup)
      return;
    startupChecked.current = true;
    for (const m of catalog.catalog.manifests) {
      if (!installed[m.id]) continue;
      checkUpdate(m.id)
        .then((u) => {
          setUpdates((prev) => ({ ...prev, [m.id]: u }));
          if (u.updateAvailable)
            toast("info", t("toast.updateAvailable", { name: m.name, tag: u.latest }));
        })
        .catch(() => undefined);
    }
  }, [catalog, installed, settings.checkUpdatesOnStartup, toast, t]);

  const updatePrefs = useCallback(
    (patch: Partial<Prefs>) => {
      const next = { ...prefsOf(settings), ...patch };
      setSettings({ ...settings, ...next });
      savePrefs(next)
        .then(setSettings)
        .catch((e: unknown) => {
          toast("error", t("toast.error"), errorText(e));
        });
    },
    [settings, setSettings, toast, t],
  );

  const go = useCallback((v: View) => {
    setView(v);
    mainRef.current?.scrollTo({ top: 0 });
  }, []);

  const back = useCallback(() => {
    if (view.page !== "library") go({ page: "library" });
  }, [view.page, go]);
  useNavigation(back);

  const manifests = useMemo(
    () => (catalog.kind === "ready" ? catalog.catalog.manifests : []),
    [catalog],
  );
  const current = view.page === "game" ? manifests.find((m) => m.id === view.id) : undefined;
  const nav: { page: "library" | "settings" | "about"; icon: IconName; key: StringKey }[] = [
    { page: "library", icon: "library", key: "nav.library" },
    { page: "settings", icon: "settings", key: "nav.settings" },
    { page: "about", icon: "info", key: "nav.about" },
  ];
  const activeNav = view.page === "game" ? "library" : view.page;

  return (
    <div className="shell">
      <nav className="rail" aria-label={t("nav.main")}>
        <div className="brand">
          <img src={logo} alt="" width={32} height={32} />
          <span>{t("app.name")}</span>
        </div>
        <ul>
          {nav.map((n) => (
            <li key={n.page}>
              <button
                type="button"
                className="rail-item"
                aria-current={activeNav === n.page ? "page" : undefined}
                onClick={() => {
                  go({ page: n.page });
                }}
              >
                <Icon name={n.icon} size={20} />
                <span>{t(n.key)}</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="rail-legal">{t("legal.short")}</p>
        {info && <p className="rail-version">v{info.version}</p>}
      </nav>

      <main className="main" ref={mainRef}>
        {catalog.kind === "loading" && (
          <div className="empty-state" aria-busy="true">
            <span className="spinner large" aria-hidden="true" />
            <p>{t("library.loading")}</p>
          </div>
        )}
        {catalog.kind === "error" && (
          <div className="empty-state" role="alert">
            <Icon name="alert" size={36} />
            <h2>{t("library.loadError")}</h2>
            <p className="muted mono">{catalog.message}</p>
            <button type="button" className="btn primary" onClick={reload}>
              <Icon name="refresh" /> {t("library.retry")}
            </button>
          </div>
        )}
        {catalog.kind === "ready" && (
          <div className="view" key={view.page === "game" ? `game-${view.id}` : view.page}>
            {catalog.catalog.errors.length > 0 && view.page === "library" && (
              <p className="notice" role="status">
                {t("library.rejected", { count: catalog.catalog.errors.length })}
              </p>
            )}
            {view.page === "library" && (
              <Library
                manifests={manifests}
                installed={installed}
                updates={updates}
                onOpen={(id) => {
                  go({ page: "game", id });
                }}
              />
            )}
            {view.page === "game" && current && (
              <GamePage
                manifest={current}
                record={installed[current.id] ?? null}
                update={updates[current.id]}
                onRecord={(r) => {
                  setInstalled((prev) => ({ ...prev, [current.id]: r }));
                  if (!r) setUpdates((prev) => ({ ...prev, [current.id]: undefined }));
                  getSettings()
                    .then(setSettings)
                    .catch(() => undefined);
                }}
                onUpdate={(u) => {
                  setUpdates((prev) => ({ ...prev, [current.id]: u }));
                }}
                onBack={back}
              />
            )}
            {view.page === "settings" && (
              <SettingsPage settings={settings} onSettings={setSettings} onPrefs={updatePrefs} />
            )}
            {view.page === "about" && <AboutPage info={info} />}
          </div>
        )}
      </main>

      {!settings.onboarded && (
        <Onboarding
          settings={settings}
          onSettings={setSettings}
          onLanguage={(language: Language) => {
            updatePrefs({ language });
          }}
          onDone={() => {
            updatePrefs({ onboarded: true });
          }}
        />
      )}
    </div>
  );
}
