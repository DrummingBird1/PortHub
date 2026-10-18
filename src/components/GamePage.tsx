import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { useI18n, type StringKey } from "../i18n";
import {
  addToSteam,
  checkUpdate,
  installPort,
  launchPort,
  openInstallFolder,
  openLink,
  pickAndHashRom,
  uninstallPort,
} from "../lib/api";
import { PLATFORMS, compatOf, consoleName, formatBytes, repoUrl } from "../lib/format";
import { Markdown } from "../lib/markdown";
import { formatEta, formatSpeed, pushSample, rateOf, type Sample } from "../lib/progress";
import type {
  InstallProgress,
  InstallRecord,
  Manifest,
  RomCheckResult,
  UpdateInfo,
} from "../lib/types";
import { CoverArt } from "./CoverArt";
import { Icon } from "./Icon";
import { ModsPanel } from "./ModsPanel";
import { errorText, useToast } from "./Toasts";

type Tab = "overview" | "mods" | "updates" | "advanced";
const TABS: { id: Tab; key: StringKey }[] = [
  { id: "overview", key: "game.tabOverview" },
  { id: "mods", key: "game.tabMods" },
  { id: "updates", key: "game.tabUpdates" },
  { id: "advanced", key: "game.tabAdvanced" },
];

export interface GamePageProps {
  manifest: Manifest;
  record: InstallRecord | null;
  update: UpdateInfo | undefined;
  onRecord: (r: InstallRecord | null) => void;
  onUpdate: (u: UpdateInfo) => void;
  onBack: () => void;
}

export function GamePage({
  manifest: m,
  record,
  update,
  onRecord,
  onUpdate,
  onBack,
}: GamePageProps) {
  const { t } = useI18n();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("overview");
  const [busy, setBusy] = useState<null | "install" | "check" | "other">(null);
  const [progress, setProgress] = useState<{ p: InstallProgress; samples: Sample[] } | null>(null);
  const [confirmUninstall, setConfirmUninstall] = useState(false);
  const idBase = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, [m.id]);

  const fail = useCallback(
    (e: unknown) => {
      toast("error", t("toast.error"), errorText(e));
    },
    [toast, t],
  );

  const onProgress = (p: InstallProgress) => {
    setProgress((prev) => ({
      p,
      samples:
        p.phase === "downloading"
          ? pushSample(prev?.samples ?? [], { at: performance.now(), bytes: p.downloaded })
          : (prev?.samples ?? []),
    }));
  };

  const install = async () => {
    setBusy("install");
    setProgress({ p: { phase: "resolving" }, samples: [] });
    try {
      const rec = await installPort(m.id, onProgress);
      onRecord(rec);
      onUpdate({
        installed: rec.tag,
        latest: rec.tag,
        updateAvailable: false,
        releaseUrl: update?.releaseUrl ?? null,
        notes: update?.notes ?? null,
      });
      toast(
        "success",
        t("toast.installed", { name: m.name, tag: rec.tag }),
        rec.preservedFiles > 0 ? t("toast.preserved", { count: rec.preservedFiles }) : undefined,
      );
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
      setProgress(null);
    }
  };

  const play = async () => {
    setBusy("other");
    try {
      await launchPort(m.id);
      toast("success", t("toast.launched", { name: m.name }));
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  };

  const check = async () => {
    setBusy("check");
    try {
      onUpdate(await checkUpdate(m.id));
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  };

  const steam = async () => {
    setBusy("other");
    try {
      const r = await addToSteam(m.id);
      toast(
        r.usersUpdated > 0 ? "success" : "info",
        r.usersUpdated > 0 ? t("toast.steamAdded") : t("toast.steamPresent"),
      );
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  };

  const uninstall = async (keep: boolean) => {
    setConfirmUninstall(false);
    setBusy("other");
    try {
      const r = await uninstallPort(m.id, keep);
      onRecord(null);
      toast(
        "success",
        t("toast.uninstalled", { name: m.name }),
        r.keptFilesPath ? t("toast.keptAt", { path: r.keptFilesPath }) : undefined,
      );
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  };

  const link = (url: string) => {
    openLink(url).catch(fail);
  };

  const onTabKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = TABS.findIndex((x) => x.id === tab);
    const rtl = document.documentElement.dir === "rtl";
    const fwd = rtl ? "ArrowLeft" : "ArrowRight";
    const back = rtl ? "ArrowRight" : "ArrowLeft";
    let next = -1;
    if (e.key === fwd) next = (i + 1) % TABS.length;
    else if (e.key === back) next = (i - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = TABS.length - 1;
    const target = TABS[next];
    if (!target) return;
    e.preventDefault();
    setTab(target.id);
    document.getElementById(`${idBase}-tab-${target.id}`)?.focus();
  };

  const hasUpdate = Boolean(record && update?.updateAvailable);

  return (
    <article className="page game">
      <button type="button" className="btn ghost back" onClick={onBack}>
        <Icon name="back" /> {t("game.back")}
      </button>

      <header className="hero">
        <CoverArt id={m.id} title={m.name} console={m.game.console} variant="hero" />
        <div className="hero-content">
          <p className="eyebrow">{consoleName(m.game.console)}</p>
          <h1 ref={titleRef} tabIndex={-1} dir="auto">
            {m.name}
          </h1>
          <p className="hero-sub" dir="auto">
            {m.game.title}
          </p>
          <div className="chips">
            <span className={`chip chip-${m.verification.status}`}>
              <Icon name="shield" size={12} /> {t(`status.${m.verification.status}` as StringKey)}
            </span>
            <span className="chip">
              {m.license === "NOASSERTION"
                ? t("game.licenseUnknown")
                : t("game.license", { license: m.license })}
            </span>
            {PLATFORMS.filter((p) => compatOf(m, p.key) !== "untested").map((p) => (
              <span key={p.key} className={`chip chip-compat-${compatOf(m, p.key)}`}>
                {p.label}
              </span>
            ))}
          </div>
          <div className="hero-actions">
            {busy === "install" ? (
              <button type="button" className="btn primary xl" disabled>
                <span className="spinner" aria-hidden="true" /> {t("action.installing")}
              </button>
            ) : !record ? (
              <button
                type="button"
                className="btn primary xl"
                disabled={busy !== null}
                onClick={() => void install()}
              >
                <Icon name="download" /> {t("action.install")}
              </button>
            ) : hasUpdate ? (
              <>
                <button
                  type="button"
                  className="btn primary xl"
                  disabled={busy !== null}
                  onClick={() => void install()}
                >
                  <Icon name="download" /> {t("action.update", { tag: update?.latest ?? "" })}
                </button>
                <button
                  type="button"
                  className="btn xl"
                  disabled={busy !== null}
                  onClick={() => void play()}
                >
                  <Icon name="play" /> {t("action.play")}
                </button>
              </>
            ) : (
              <button
                type="button"
                className="btn primary xl play"
                disabled={busy !== null}
                onClick={() => void play()}
              >
                <Icon name="play" /> {t("action.play")}
              </button>
            )}
            {record && busy !== "install" && (
              <button
                type="button"
                className="btn ghost-light"
                disabled={busy !== null}
                onClick={() => void check()}
              >
                <Icon name="refresh" />{" "}
                {busy === "check" ? t("action.checking") : t("action.checkUpdates")}
              </button>
            )}
          </div>
          {!record && busy === null && <p className="hero-hint">{t("action.selectRomHint")}</p>}
          {busy === "install" && progress && (
            <ProgressBar progress={progress.p} samples={progress.samples} />
          )}
        </div>
      </header>

      <div className="tabs" role="tablist" aria-label={m.name} onKeyDown={onTabKey}>
        {TABS.map((x) => (
          <button
            key={x.id}
            id={`${idBase}-tab-${x.id}`}
            type="button"
            role="tab"
            aria-selected={tab === x.id}
            aria-controls={`${idBase}-panel`}
            tabIndex={tab === x.id ? 0 : -1}
            onClick={() => {
              setTab(x.id);
            }}
          >
            {t(x.key)}
            {x.id === "updates" && hasUpdate && <span className="dot" aria-hidden="true" />}
          </button>
        ))}
      </div>

      <div
        id={`${idBase}-panel`}
        role="tabpanel"
        aria-labelledby={`${idBase}-tab-${tab}`}
        className="tab-panel"
        key={tab}
      >
        {tab === "overview" && <Overview manifest={m} onLink={link} />}
        {tab === "mods" && <ModsPanel manifest={m} installed={record !== null} />}
        {tab === "updates" && (
          <Updates
            record={record}
            update={update}
            busy={busy === "check"}
            onCheck={() => void check()}
            onLink={link}
          />
        )}
        {tab === "advanced" && (
          <Advanced
            manifest={m}
            record={record}
            busy={busy !== null}
            onOpenFolder={() => {
              openInstallFolder(m.id).catch(fail);
            }}
            onSteam={() => void steam()}
            onUninstall={() => {
              setConfirmUninstall(true);
            }}
          />
        )}
      </div>

      {confirmUninstall && (
        <UninstallDialog
          name={m.name}
          onCancel={() => {
            setConfirmUninstall(false);
          }}
          onConfirm={(keep) => void uninstall(keep)}
        />
      )}
    </article>
  );
}

function ProgressBar({ progress: p, samples }: { progress: InstallProgress; samples: Sample[] }) {
  const { t } = useI18n();
  let label: string;
  let fraction: number | null = null;
  let detail = "";
  switch (p.phase) {
    case "resolving":
      label = t("progress.resolving");
      break;
    case "downloading": {
      const r = rateOf(samples, p.total);
      fraction = p.total > 0 ? p.downloaded / p.total : null;
      label = `${t("progress.downloading")} ${formatBytes(p.downloaded)} / ${formatBytes(p.total)}`;
      const parts = [];
      if (r.speed > 0) parts.push(t("progress.speed", { speed: formatSpeed(r.speed) }));
      if (r.eta !== null) parts.push(t("progress.eta", { eta: formatEta(r.eta) }));
      detail = parts.join(" · ");
      break;
    }
    case "verifying":
      label = t("progress.verifying");
      fraction = 1;
      break;
    case "extracting":
      label = t("progress.extracting");
      fraction = 1;
      break;
    case "done":
      label = t("progress.done", { tag: p.tag });
      fraction = 1;
      break;
  }
  const pct = fraction === null ? undefined : Math.round(fraction * 100);
  return (
    <div className="progress">
      <div
        className={`progress-track${pct === undefined ? " indeterminate" : ""}`}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <div
          className="progress-fill"
          style={{ width: pct === undefined ? undefined : `${pct}%` }}
        />
      </div>
      <div className="progress-text">
        <span>{label}</span>
        <span className="muted">
          {pct !== undefined && p.phase === "downloading" ? `${pct}% · ${detail}` : detail}
        </span>
      </div>
    </div>
  );
}

function Overview({ manifest: m, onLink }: { manifest: Manifest; onLink: (url: string) => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<RomCheckResult | null>(null);
  const releases = `${repoUrl(m.repo)}/releases`;

  const runCheck = async () => {
    setChecking(true);
    try {
      const r = await pickAndHashRom(m.romRequirements);
      if (r) setResult(r);
    } catch (e) {
      toast("error", t("toast.error"), errorText(e));
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="overview">
      <div className="col-main">
        {m.description && (
          <p className="lead" dir="auto">
            {m.description}
          </p>
        )}
        <div className="callout">
          <Icon name="shield" />
          <p>{t("game.verifiedInfo", { repo: m.repo })}</p>
        </div>
        <p className="small muted">
          {t("game.officialReleases", { url: "" })}
          <button
            type="button"
            className="md-link"
            onClick={() => {
              onLink(releases);
            }}
          >
            {releases}
          </button>
        </p>

        <section className="panel">
          <h2>{t("game.romTitle")}</h2>
          <p className="muted small">{t("game.romHint")}</p>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">{t("game.romVersion")}</th>
                  <th scope="col">{t("game.romHash")}</th>
                </tr>
              </thead>
              <tbody>
                {m.romRequirements.map((r) => (
                  <tr
                    key={r.label}
                    className={result?.matchedLabel === r.label ? "match" : undefined}
                  >
                    <td>
                      {r.label}
                      {r.recommended && (
                        <span className="chip chip-small">{t("game.recommended")}</span>
                      )}
                    </td>
                    <td className="mono" dir="ltr">
                      {Object.entries(r.hashes).map(([algo, h]) => (
                        <div key={algo}>
                          <span className="muted">{algo}</span> {h}
                        </div>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" className="btn" disabled={checking} onClick={() => void runCheck()}>
            <Icon name="search" /> {checking ? t("game.hashing") : t("game.checkRom")}
          </button>
          {result && (
            <div className={`result ${result.matchedLabel ? "ok" : "bad"}`} role="status">
              <Icon name={result.matchedLabel ? "check" : "alert"} />
              <div>
                <strong>
                  {result.matchedLabel
                    ? t("game.romOk", { label: result.matchedLabel })
                    : t("game.romBad")}
                </strong>
                <div className="small">
                  {result.fileName} · {formatBytes(result.sizeBytes)}
                </div>
                {!result.matchedLabel && <div className="small">{t("game.romBadHint")}</div>}
                <div className="mono small" dir="ltr">
                  sha1 {result.sha1}
                </div>
              </div>
            </div>
          )}
        </section>
      </div>

      <aside className="col-side panel">
        <h2>{t("game.compatibility")}</h2>
        <ul className="compat-list">
          {PLATFORMS.map((p) => {
            const s = compatOf(m, p.key);
            return (
              <li key={p.key}>
                <span>{p.label}</span>
                <span className={`chip chip-compat-${s}`}>{t(`compat.${s}` as StringKey)}</span>
              </li>
            );
          })}
        </ul>
        <h2>{t("game.source")}</h2>
        <button
          type="button"
          className="md-link"
          onClick={() => {
            onLink(repoUrl(m.repo));
          }}
        >
          {m.repo}
        </button>
      </aside>
    </div>
  );
}

function Updates({
  record,
  update,
  busy,
  onCheck,
  onLink,
}: {
  record: InstallRecord | null;
  update: UpdateInfo | undefined;
  busy: boolean;
  onCheck: () => void;
  onLink: (url: string) => void;
}) {
  const { t } = useI18n();
  if (!record)
    return (
      <div className="empty-state small">
        <Icon name="refresh" size={32} />
        <p>{t("install.notInstalled")}</p>
      </div>
    );
  return (
    <div className="updates">
      <div className="panel row">
        <div>
          {update ? (
            update.updateAvailable ? (
              <strong>{t("updates.available", { from: record.tag, to: update.latest })}</strong>
            ) : (
              <strong>{t("updates.upToDate", { tag: record.tag })}</strong>
            )
          ) : (
            <span className="muted">{t("updates.notChecked")}</span>
          )}
          <p className="small muted">{t("updates.preserved")}</p>
        </div>
        <button type="button" className="btn" disabled={busy} onClick={onCheck}>
          <Icon name="refresh" /> {busy ? t("action.checking") : t("action.checkUpdates")}
        </button>
      </div>
      {update && (
        <section className="panel">
          <h2>{t("updates.changelog", { tag: update.latest })}</h2>
          {update.notes ? (
            <Markdown source={update.notes} onLink={onLink} />
          ) : (
            <p className="muted">{t("updates.noNotes")}</p>
          )}
        </section>
      )}
    </div>
  );
}

function Advanced({
  manifest: m,
  record,
  busy,
  onOpenFolder,
  onSteam,
  onUninstall,
}: {
  manifest: Manifest;
  record: InstallRecord | null;
  busy: boolean;
  onOpenFolder: () => void;
  onSteam: () => void;
  onUninstall: () => void;
}) {
  const { t, lang } = useI18n();
  if (!record) {
    return (
      <div className="empty-state small">
        <Icon name="download" size={32} />
        <p>{t("install.notInstalled")}</p>
      </div>
    );
  }
  return (
    <div className="advanced">
      <section className="panel">
        <h2>{t("install.installed", { tag: record.tag })}</h2>
        <dl className="facts">
          <dt>{t("install.asset")}</dt>
          <dd dir="ltr">{record.assetName}</dd>
          <dt>{t("install.date")}</dt>
          <dd>
            {new Date(record.installedAt * 1000).toLocaleString(lang === "he" ? "he-IL" : "en-US")}
          </dd>
          <dt>{t("install.sha")}</dt>
          <dd className="mono" dir="ltr">
            {record.sha256}
          </dd>
          <dt />
          <dd>
            <span className={`chip ${record.pinnedOk ? "chip-verified" : "chip-community"}`}>
              <Icon name="shield" size={12} />{" "}
              {record.pinnedOk ? t("install.pinnedOk") : t("install.digestOnly")}
            </span>
          </dd>
        </dl>
      </section>
      <section className="panel row">
        <div>
          <h2>{t("advanced.location")}</h2>
        </div>
        <button type="button" className="btn" disabled={busy} onClick={onOpenFolder}>
          <Icon name="folder" /> {t("action.openFolder")}
        </button>
      </section>
      <section className="panel row">
        <div>
          <h2>Steam</h2>
          <p className="small muted">{t("advanced.steam")}</p>
        </div>
        <button type="button" className="btn" disabled={busy} onClick={onSteam}>
          <Icon name="steam" /> {t("action.addToSteam")}
        </button>
      </section>
      <section className="panel row danger">
        <div>
          <h2>{t("advanced.danger")}</h2>
          <p className="small muted">{t("advanced.uninstallHint")}</p>
        </div>
        <button
          type="button"
          className="btn danger"
          disabled={busy}
          onClick={onUninstall}
          aria-label={`${t("action.uninstall")} ${m.name}`}
        >
          <Icon name="trash" /> {t("action.uninstall")}
        </button>
      </section>
    </div>
  );
}

function UninstallDialog({
  name,
  onCancel,
  onConfirm,
}: {
  name: string;
  onCancel: () => void;
  onConfirm: (keep: boolean) => void;
}) {
  const { t } = useI18n();
  const [keep, setKeep] = useState(true);
  const titleId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancelRef.current?.focus();
  }, []);
  return (
    <div
      className="modal-backdrop"
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <h2 id={titleId}>{t("uninstall.title", { name })}</h2>
        <p>{t("uninstall.body")}</p>
        <label className="check">
          <input
            type="checkbox"
            checked={keep}
            onChange={(e) => {
              setKeep(e.target.checked);
            }}
          />
          {t("uninstall.keep")}
        </label>
        <div className="modal-actions">
          <button ref={cancelRef} type="button" className="btn" data-cancel onClick={onCancel}>
            {t("action.cancel")}
          </button>
          <button
            type="button"
            className="btn danger"
            onClick={() => {
              onConfirm(keep);
            }}
          >
            <Icon name="trash" /> {t("uninstall.confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
