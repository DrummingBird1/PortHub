import { useMemo, useState } from "react";
import { useI18n, type StringKey } from "../i18n";
import { consoleName } from "../lib/format";
import { DEFAULT_QUERY, consolesIn, queryLibrary, type LibraryQuery } from "../lib/library";
import type { InstallRecord, Manifest, UpdateInfo } from "../lib/types";
import { CoverArt } from "./CoverArt";
import { Icon } from "./Icon";

export function Library({
  manifests,
  installed,
  updates,
  onOpen,
}: {
  manifests: Manifest[];
  installed: Record<string, InstallRecord | null>;
  updates: Record<string, UpdateInfo | undefined>;
  onOpen: (id: string) => void;
}) {
  const { t } = useI18n();
  const [q, setQ] = useState<LibraryQuery>(DEFAULT_QUERY);
  const shown = useMemo(() => queryLibrary(manifests, installed, q), [manifests, installed, q]);
  const consoles = useMemo(() => consolesIn(manifests), [manifests]);
  const installedCount = manifests.filter((m) => installed[m.id]).length;
  const filtered = q.search !== "" || q.console !== "all" || q.status !== "all";

  return (
    <section className="page library" aria-labelledby="library-title">
      <header className="page-header">
        <div>
          <h1 id="library-title">{t("library.title")}</h1>
          <p className="muted">
            {t("library.subtitle", { count: manifests.length, installed: installedCount })}
          </p>
        </div>
      </header>

      <div className="toolbar" role="search">
        <label className="search">
          <Icon name="search" />
          <span className="sr-only">{t("library.search")}</span>
          <input
            type="search"
            value={q.search}
            placeholder={t("library.searchPlaceholder")}
            onChange={(e) => {
              setQ({ ...q, search: e.target.value });
            }}
          />
        </label>
        <label className="select">
          <span className="sr-only">{t("library.filterConsole")}</span>
          <select
            value={q.console}
            onChange={(e) => {
              setQ({ ...q, console: e.target.value as LibraryQuery["console"] });
            }}
          >
            <option value="all">{t("library.allConsoles")}</option>
            {consoles.map((c) => (
              <option key={c} value={c}>
                {consoleName(c)}
              </option>
            ))}
          </select>
        </label>
        <div className="segmented" role="group" aria-label={t("library.filterStatus")}>
          {(
            [
              ["all", "library.all"],
              ["installed", "library.installedOnly"],
              ["not-installed", "library.notInstalled"],
            ] as const
          ).map(([value, key]) => (
            <button
              key={value}
              type="button"
              aria-pressed={q.status === value}
              onClick={() => {
                setQ({ ...q, status: value });
              }}
            >
              {t(key)}
            </button>
          ))}
        </div>
        <label className="select">
          <span className="sr-only">{t("library.sort")}</span>
          <select
            value={q.sort}
            onChange={(e) => {
              setQ({ ...q, sort: e.target.value as LibraryQuery["sort"] });
            }}
          >
            <option value="name">{t("library.sortName")}</option>
            <option value="console">{t("library.sortConsole")}</option>
            <option value="installed">{t("library.sortInstalled")}</option>
          </select>
        </label>
      </div>

      {shown.length === 0 ? (
        <div className="empty-state">
          <Icon name="search" size={36} />
          <h2>{t("library.empty")}</h2>
          <p className="muted">{t("library.emptyHint")}</p>
          {filtered && (
            <button
              type="button"
              className="btn"
              onClick={() => {
                setQ(DEFAULT_QUERY);
              }}
            >
              {t("library.clearFilters")}
            </button>
          )}
        </div>
      ) : (
        <ul className="grid" aria-label={t("library.title")}>
          {shown.map((m) => {
            const rec = installed[m.id];
            const upd = updates[m.id];
            return (
              <li key={m.id}>
                <button
                  type="button"
                  className="card"
                  onClick={() => {
                    onOpen(m.id);
                  }}
                >
                  <CoverArt id={m.id} title={m.name} console={m.game.console} />
                  <span className="card-body">
                    <span className="card-sub" dir="auto">
                      {m.game.title}
                    </span>
                    <span className="card-meta">
                      <span className={`chip chip-${m.verification.status}`}>
                        {t(`status.${m.verification.status}` as StringKey)}
                      </span>
                      {upd?.updateAvailable ? (
                        <span className="chip chip-update">{t("card.update")}</span>
                      ) : rec ? (
                        <span className="chip chip-installed">
                          <Icon name="check" size={12} /> {t("card.installed", { tag: rec.tag })}
                        </span>
                      ) : (
                        <span className="chip chip-muted">{t("card.notInstalled")}</span>
                      )}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
