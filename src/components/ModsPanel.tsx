import { useCallback, useEffect, useState } from "react";
import { useI18n } from "../i18n";
import { addLocalMod, installCatalogMod, listMods, setModEnabled, uninstallMod } from "../lib/api";
import type { Manifest, ModsView } from "../lib/types";
import { Icon } from "./Icon";
import { errorText, useToast } from "./Toasts";

export function ModsPanel({ manifest: m, installed }: { manifest: Manifest; installed: boolean }) {
  const { t } = useI18n();
  const toast = useToast();
  const [view, setView] = useState<ModsView | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    listMods(m.id)
      .then(setView)
      .catch((e: unknown) => {
        toast("error", t("toast.error"), errorText(e));
      });
  }, [m.id, toast, t]);

  useEffect(() => {
    refresh();
  }, [refresh, installed]);

  const run = async (action: () => Promise<unknown>, success?: string) => {
    setBusy(true);
    try {
      const r = await action();
      if (success && r !== null) toast("success", success);
    } catch (e: unknown) {
      toast("error", t("toast.error"), errorText(e));
    } finally {
      setBusy(false);
      refresh();
    }
  };

  if (!view) return <p className="muted">{t("common.loading")}</p>;
  if (!view.supported)
    return (
      <div className="empty-state small">
        <Icon name="info" size={32} />
        <p>{t("mods.unsupported")}</p>
      </div>
    );

  return (
    <div className="mods">
      <section className="panel">
        <div className="row">
          <div>
            <h2>{t("mods.title")}</h2>
            <p className="muted small">
              {t("mods.hint", { folder: view.folder ?? "mods", types: view.fileTypes.join(", ") })}
            </p>
          </div>
          <button
            type="button"
            className="btn primary"
            disabled={busy || !installed}
            onClick={() => void run(() => addLocalMod(m.id), t("toast.modAdded"))}
          >
            <Icon name="upload" /> {t("mods.addLocal")}
          </button>
        </div>
        {!installed && <p className="notice">{t("mods.installFirst")}</p>}
        {installed && view.installed.length === 0 && <p className="muted">{t("mods.empty")}</p>}
        {view.installed.length > 0 && (
          <ul className="mod-list">
            {view.installed.map((e) => (
              <li key={e.id} className={e.enabled ? "" : "is-disabled"}>
                <div className="mod-name">
                  <strong dir="auto">{e.name}</strong>
                  <span className="chip chip-small">
                    {e.source === "local" ? t("mods.local") : t("mods.catalog")}
                  </span>
                </div>
                <label className="switch">
                  <input
                    type="checkbox"
                    role="switch"
                    checked={e.enabled}
                    disabled={busy}
                    onChange={() => void run(() => setModEnabled(m.id, e.id, !e.enabled))}
                  />
                  <span className="switch-track" aria-hidden="true" />
                  <span>{e.enabled ? t("mods.enabled") : t("mods.disabled")}</span>
                </label>
                <button
                  type="button"
                  className="btn ghost"
                  disabled={busy}
                  aria-label={`${t("mods.remove")} ${e.name}`}
                  onClick={() => void run(() => uninstallMod(m.id, e.id))}
                >
                  <Icon name="trash" /> {t("mods.remove")}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {view.catalog.length > 0 && (
        <section className="panel">
          <ul className="mod-list">
            {view.catalog.map((c) => (
              <li key={c.id}>
                <div className="mod-name">
                  <strong>{c.name}</strong>
                  <span className="small muted">
                    {c.author} · {c.license} · {c.version}
                  </span>
                </div>
                <button
                  type="button"
                  className="btn"
                  disabled={busy || !installed || c.installed || !c.compatible}
                  onClick={() => void run(() => installCatalogMod(m.id, c.id, () => undefined))}
                >
                  <Icon name="download" /> {c.installed ? t("mods.enabled") : t("action.install")}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
