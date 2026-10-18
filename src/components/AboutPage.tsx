import { useI18n } from "../i18n";
import { openLink } from "../lib/api";
import type { AppInfo } from "../lib/types";
import logo from "../assets/logo.svg";
import { Icon } from "./Icon";
import { errorText, useToast } from "./Toasts";

export const REPO_URL = "https://github.com/DrummingBird1/PortHub";

export function AboutPage({ info }: { info: AppInfo | null }) {
  const { t } = useI18n();
  const toast = useToast();
  const open = (url: string) => {
    openLink(url).catch((e: unknown) => {
      toast("error", t("toast.error"), errorText(e));
    });
  };
  return (
    <section className="page about" aria-labelledby="about-title">
      <div className="about-hero panel">
        <img src={logo} alt="" width={72} height={72} />
        <div>
          <h1 id="about-title">{t("about.title")}</h1>
          <p>
            <strong>
              {info ? t("about.version", { version: info.version }) : t("common.loading")}
            </strong>{" "}
            <span className="chip chip-small">{t("about.preview")}</span>
          </p>
          {info && (
            <p className="small muted">{t("about.platform", { os: info.os, arch: info.arch })}</p>
          )}
        </div>
      </div>
      <section className="panel">
        <p>{t("about.body")}</p>
        <p className="small muted">{t("legal.short")}</p>
        <p className="small muted">{t("about.license")}</p>
      </section>
      <section className="panel">
        <h2>{t("about.links")}</h2>
        <div className="row-actions">
          <button
            type="button"
            className="btn"
            onClick={() => {
              open(REPO_URL);
            }}
          >
            <Icon name="globe" /> {t("about.repo")}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              open(`${REPO_URL}/issues`);
            }}
          >
            <Icon name="alert" /> {t("about.issues")}
          </button>
        </div>
      </section>
    </section>
  );
}
