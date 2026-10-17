import { useEffect, useState } from "react";
import { addToSteam, checkUpdate, getInstallStatus, installPort, launchPort } from "../lib/api";
import { progressLabel } from "../lib/format";
import type { InstallProgress, InstallRecord, Manifest, UpdateInfo } from "../lib/types";

export function InstallPanel({
  manifest: m,
  onInstalledChange,
}: {
  manifest: Manifest;
  onInstalledChange?: (installed: boolean) => void;
}) {
  const [record, setRecord] = useState<InstallRecord | null>(null);
  const [progress, setProgress] = useState<InstallProgress | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [update, setUpdate] = useState<UpdateInfo | null>(null);

  useEffect(() => {
    getInstallStatus(m.id)
      .then((r) => {
        setRecord(r);
        onInstalledChange?.(r !== null);
      })
      .catch((e: unknown) => {
        setError(String(e));
      });
  }, [m.id, onInstalledChange]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch (e: unknown) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const install = () =>
    run(async () => {
      const rec = await installPort(m.id, setProgress);
      setRecord(rec);
      setUpdate(null);
      onInstalledChange?.(true);
      if (rec.preservedFiles > 0) {
        setNotice(
          `Kept ${rec.preservedFiles} user file(s) (saves, config, mods) from the previous version.`,
        );
      }
    });
  const launch = () =>
    run(async () => {
      const pid = await launchPort(m.id);
      setNotice(`Started (process ${pid}).`);
    });
  const steam = () =>
    run(async () => {
      const r = await addToSteam(m.id);
      setNotice(
        r.usersUpdated > 0
          ? `Added to Steam for ${r.usersUpdated} Steam user(s). Restart Steam to see it.`
          : "Already in Steam.",
      );
    });
  const check = () =>
    run(async () => {
      setUpdate(await checkUpdate(m.id));
    });

  return (
    <section className="install">
      <h2>Install</h2>
      <p className="muted small">
        Downloaded only from the official GitHub Releases of {m.repo}. The SHA-256 must match
        GitHub&apos;s digest and the reviewed pinned checksum (when present), or nothing is
        installed.
      </p>

      {record ? (
        <div className="installed" role="status">
          <strong>✔ Installed {record.tag}</strong>
          <div className="small">
            {record.assetName} ·{" "}
            {record.pinnedOk
              ? "matches reviewed pinned checksum"
              : "GitHub digest verified (not pinned)"}
          </div>
          <div className="mono small">sha256 {record.sha256}</div>
        </div>
      ) : (
        <p className="small">Not installed.</p>
      )}

      <div className="actions">
        {record ? (
          <>
            <button type="button" className="primary" disabled={busy} onClick={() => void launch()}>
              Launch
            </button>
            <button type="button" disabled={busy} onClick={() => void check()}>
              Check for updates
            </button>
            <button type="button" disabled={busy} onClick={() => void steam()}>
              Add to Steam
            </button>
            {update?.updateAvailable && (
              <button type="button" disabled={busy} onClick={() => void install()}>
                Update to {update.latest}
              </button>
            )}
          </>
        ) : (
          <button type="button" className="primary" disabled={busy} onClick={() => void install()}>
            Install
          </button>
        )}
      </div>

      {busy && progress && progress.phase !== "done" && (
        <div className="progress">
          <div className="small">{progressLabel(progress)}</div>
          {progress.phase === "downloading" && progress.total > 0 && (
            <progress value={progress.downloaded} max={progress.total} />
          )}
        </div>
      )}
      {update?.updateAvailable && (
        <div className="update" role="status">
          <strong>
            Update available: {update.installed} → {update.latest}
          </strong>
          {update.notes && (
            <details open>
              <summary>Changelog ({update.latest})</summary>
              <pre className="notes">{update.notes}</pre>
            </details>
          )}
        </div>
      )}
      {update && !update.updateAvailable && (
        <p className="small">Up to date (latest official release: {update.latest}).</p>
      )}
      {notice && <p className="small">{notice}</p>}
      {error && <p className="error">Error: {error}</p>}
    </section>
  );
}
