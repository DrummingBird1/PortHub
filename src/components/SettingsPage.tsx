import { useI18n } from "../i18n";
import { chooseLibraryDir } from "../lib/api";
import type { Prefs, SettingsView, Theme } from "../lib/types";
import { Icon } from "./Icon";
import { errorText, useToast } from "./Toasts";

export function SettingsPage({
  settings: s,
  onSettings,
  onPrefs,
}: {
  settings: SettingsView;
  onSettings: (s: SettingsView) => void;
  onPrefs: (p: Partial<Prefs>) => void;
}) {
  const { t } = useI18n();
  const toast = useToast();

  const choose = async (reset: boolean) => {
    try {
      onSettings(await chooseLibraryDir(reset));
    } catch (e) {
      toast("error", t("toast.error"), errorText(e));
    }
  };

  return (
    <section className="page settings" aria-labelledby="settings-title">
      <header className="page-header">
        <h1 id="settings-title">{t("settings.title")}</h1>
      </header>

      <section className="panel">
        <h2>{t("settings.library")}</h2>
        <p className="muted small">{t("settings.libraryHint")}</p>
        <div className="path-box">
          <Icon name="folder" />
          <code dir="ltr">{s.libraryPath}</code>
          {s.libraryDir === null && (
            <span className="chip chip-small">{t("settings.default")}</span>
          )}
        </div>
        <div className="row-actions">
          <button
            type="button"
            className="btn"
            disabled={s.libraryLocked}
            onClick={() => void choose(false)}
          >
            <Icon name="folder" /> {t("action.change")}
          </button>
          {s.libraryDir !== null && (
            <button
              type="button"
              className="btn ghost"
              disabled={s.libraryLocked}
              onClick={() => void choose(true)}
            >
              {t("action.useDefault")}
            </button>
          )}
        </div>
        {s.libraryLocked && <p className="notice small">{t("settings.libraryLocked")}</p>}
      </section>

      <section className="panel">
        <h2>{t("settings.appearance")}</h2>
        <div className="field">
          <span id="theme-label">{t("settings.theme")}</span>
          <div className="segmented" role="group" aria-labelledby="theme-label">
            {(
              [
                ["system", "settings.themeSystem"],
                ["light", "settings.themeLight"],
                ["dark", "settings.themeDark"],
              ] as [Theme, "settings.themeSystem" | "settings.themeLight" | "settings.themeDark"][]
            ).map(([value, key]) => (
              <button
                key={value}
                type="button"
                aria-pressed={s.theme === value}
                onClick={() => {
                  onPrefs({ theme: value });
                }}
              >
                {t(key)}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span id="lang-label">{t("settings.language")}</span>
          <div className="segmented" role="group" aria-labelledby="lang-label">
            {(
              [
                ["en", "English"],
                ["he", "עברית"],
              ] as const
            ).map(([code, label]) => (
              <button
                key={code}
                type="button"
                lang={code}
                aria-pressed={s.language === code}
                onClick={() => {
                  onPrefs({ language: code });
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="panel">
        <h2>{t("settings.updates")}</h2>
        <label className="switch">
          <input
            type="checkbox"
            role="switch"
            checked={s.checkUpdatesOnStartup}
            onChange={(e) => {
              onPrefs({ checkUpdatesOnStartup: e.target.checked });
            }}
          />
          <span className="switch-track" aria-hidden="true" />
          <span>{t("settings.checkOnStartup")}</span>
        </label>
        <div className="row-actions">
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              onPrefs({ onboarded: false });
            }}
          >
            {t("settings.showWelcome")}
          </button>
        </div>
      </section>
    </section>
  );
}
