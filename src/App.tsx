import { useEffect, useState } from "react";
import { loadCatalog, type CatalogResponse } from "./lib/api";
import { consoleName, verificationLabel } from "./lib/format";
import { GamePage } from "./components/GamePage";
import logo from "./assets/logo.svg";

type State =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; catalog: CatalogResponse };

export function App() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    loadCatalog()
      .then((catalog) => {
        setState({ kind: "ready", catalog });
      })
      .catch((e: unknown) => {
        setState({ kind: "error", message: String(e) });
      });
  }, []);

  if (state.kind === "loading") return <main className="center">Loading catalog…</main>;
  if (state.kind === "error")
    return <main className="center error">Failed to load catalog: {state.message}</main>;

  const { manifests, errors } = state.catalog;
  const selected = manifests.find((m) => m.id === selectedId) ?? manifests[0];

  return (
    <div className="layout">
      <aside className="sidebar">
        <header className="brand">
          <img src={logo} alt="" width={28} height={28} />
          PortHub
        </header>
        <nav aria-label="Games">
          {manifests.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`game-item${m.id === selected?.id ? " active" : ""}`}
              onClick={() => {
                setSelectedId(m.id);
              }}
            >
              <span className="game-name">{m.name}</span>
              <span className="game-meta">
                {consoleName(m.game.console)} ·{" "}
                <span className={`badge ${m.verification.status}`}>
                  {verificationLabel(m.verification.status)}
                </span>
              </span>
            </button>
          ))}
        </nav>
        {errors.length > 0 && (
          <section className="catalog-errors" role="alert">
            <strong>{errors.length} manifest(s) rejected</strong>
            {errors.map((e) => (
              <details key={e.source}>
                <summary>{e.source}</summary>
                <ul>
                  {e.messages.map((msg) => (
                    <li key={msg}>{msg}</li>
                  ))}
                </ul>
              </details>
            ))}
          </section>
        )}
        <footer className="legal">
          No game files are hosted or downloaded. Use your own legally obtained copy.
        </footer>
      </aside>
      <main className="content">
        {selected ? (
          <GamePage key={selected.id} manifest={selected} />
        ) : (
          <p>No games in catalog.</p>
        )}
      </main>
    </div>
  );
}
