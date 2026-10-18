import { useEffect, useId, useRef, useState } from "react";
import { useI18n } from "../i18n";
import { chooseLibraryDir } from "../lib/api";
import type { Language, SettingsView } from "../lib/types";
import logo from "../assets/logo.svg";
import { Icon } from "./Icon";
import { errorText, useToast } from "./Toasts";

const TOTAL = 2;

export function Onboarding({
  settings,
  onSettings,
  onLanguage,
  onDone,
}: {
  settings: SettingsView;
  onSettings: (s: SettingsView) => void;
  onLanguage: (l: Language) => void;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [step, setStep] = useState(1);
  const titleId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  const choose = async (reset: boolean) => {
    try {
      onSettings(await chooseLibraryDir(reset));
    } catch (e) {
      toast("error", t("toast.error"), errorText(e));
    }
  };

  return (
    <div className="modal-backdrop onboarding-backdrop">
      <div className="modal onboarding" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <p className="eyebrow">{t("onboarding.step", { n: step, total: TOTAL })}</p>
        {step === 1 ? (
          <>
            <div className="onboarding-brand">
              <img src={logo} alt="" width={56} height={56} />
              <div>
                <h1 id={titleId} ref={headingRef} tabIndex={-1}>
                  {t("onboarding.title")}
                </h1>
                <p className="muted">{t("onboarding.lead")}</p>
              </div>
            </div>
            <div className="feature">
              <Icon name="shield" size={22} />
              <div>
                <h2>{t("onboarding.byoTitle")}</h2>
                <p>{t("onboarding.byoBody")}</p>
              </div>
            </div>
            <div className="feature">
              <Icon name="check" size={22} />
              <div>
                <h2>{t("onboarding.officialTitle")}</h2>
                <p>{t("onboarding.officialBody")}</p>
              </div>
            </div>
            <div className="feature">
              <Icon name="globe" size={22} />
              <div>
                <h2>{t("onboarding.languageTitle")}</h2>
                <div className="segmented" role="group" aria-label={t("onboarding.languageTitle")}>
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
                      aria-pressed={settings.language === code}
                      onClick={() => {
                        onLanguage(code);
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            <h1 id={titleId} ref={headingRef} tabIndex={-1}>
              {t("onboarding.libraryTitle")}
            </h1>
            <p className="muted">{t("onboarding.libraryBody")}</p>
            <div className="path-box">
              <Icon name="folder" />
              <code dir="ltr">{settings.libraryPath}</code>
              {settings.libraryDir === null && (
                <span className="chip chip-small">{t("settings.default")}</span>
              )}
            </div>
            <div className="row-actions">
              <button
                type="button"
                className="btn"
                disabled={settings.libraryLocked}
                onClick={() => void choose(false)}
              >
                <Icon name="folder" /> {t("action.change")}
              </button>
              {settings.libraryDir !== null && (
                <button
                  type="button"
                  className="btn ghost"
                  disabled={settings.libraryLocked}
                  onClick={() => void choose(true)}
                >
                  {t("action.useDefault")}
                </button>
              )}
            </div>
            {settings.libraryLocked && <p className="small muted">{t("settings.libraryLocked")}</p>}
          </>
        )}
        <div className="modal-actions">
          {step > 1 && (
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                setStep(step - 1);
              }}
            >
              {t("action.back")}
            </button>
          )}
          {step < TOTAL ? (
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                setStep(step + 1);
              }}
            >
              {t("action.next")}
            </button>
          ) : (
            <button type="button" className="btn primary" onClick={onDone}>
              {t("action.getStarted")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
