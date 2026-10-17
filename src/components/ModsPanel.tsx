import { useCallback, useEffect, useState } from "react";
import { addLocalMod, installCatalogMod, listMods, setModEnabled, uninstallMod } from "../lib/api";
import { progressLabel } from "../lib/format";
import type { InstallProgress, Manifest, ModsView } from "../lib/types";

export function ModsPanel({ manifest: m, installed }: { manifest: Manifest; installed: boolean }) {
  const [view, setView] = useState<ModsView | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<InstallProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    listMods(m.id)
      .then(setView)
      .catch((e: unknown) => {
        setError(String(e));
      });
  }, [m.id]);

  useEffect(() => {
    refresh();
  }, [refresh, installed]);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e: unknown) {
      setError(String(e));
    } finally {
      setBusy(false);
      setProgress(null);
      refresh();
    }
  };

  if (!view?.supported) return null;

  return (
    <section className="mods">
      <h2>Mods &amp; texture packs</h2>
      <p className="muted small">
        Files go into the port&apos;s <code>{view.folder}</code> folder ({view.fileTypes.join(", ")}
        ). Disabled mods are parked outside it. Never add packs containing ripped game assets you
        don&apos;t own.
      </p>
      {!installed && <p className="small">Install the port to manage mods.</p>}

      {view.installed.length > 0 && (
        <table className="mod-table">
          <tbody>
            {view.installed.map((e) => (
              <tr key={e.id}>
                <td>
                  {e.name}
                  <span className="tag small">{e.source}</span>
                </td>
                <td className="small">{e.enabled ? "enabled" : "disabled"}</td>
                <td>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void run(() => setModEnabled(m.id, e.id, !e.enabled))}
                  >
                    {e.enabled ? "Disable" : "Enable"}
                  </button>{" "}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void run(() => uninstallMod(m.id, e.id))}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {view.catalog.length > 0 && (
        <ul className="mod-catalog">
          {view.catalog.map((c) => (
            <li key={c.id}>
              <strong>{c.name}</strong> by {c.author} · {c.license} · {c.version}{" "}
              <button
                type="button"
                disabled={busy || !installed || c.installed || !c.compatible}
                onClick={() => void run(() => installCatalogMod(m.id, c.id, setProgress))}
              >
                {c.installed ? "Installed" : c.compatible ? "Install" : "Incompatible"}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="actions">
        <button
          type="button"
          disabled={busy || !installed}
          onClick={() => void run(() => addLocalMod(m.id))}
        >
          Add local mod file…
        </button>
      </div>
      {busy && progress && <p className="small">{progressLabel(progress)}</p>}
      {error && <p className="error">Error: {error}</p>}
    </section>
  );
}
