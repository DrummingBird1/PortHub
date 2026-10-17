import { useState } from "react";
import { pickAndHashRom } from "../lib/api";
import {
  PLATFORMS,
  compatOf,
  consoleName,
  formatBytes,
  licenseLabel,
  repoUrl,
  verificationLabel,
} from "../lib/format";
import type { Manifest, RomCheckResult } from "../lib/types";
import { InstallPanel } from "./InstallPanel";
import { ModsPanel } from "./ModsPanel";

type Check =
  | { kind: "idle" }
  | { kind: "hashing" }
  | { kind: "done"; result: RomCheckResult }
  | { kind: "error"; message: string };

export function GamePage({ manifest: m }: { manifest: Manifest }) {
  const [check, setCheck] = useState<Check>({ kind: "idle" });
  const [installed, setInstalled] = useState(false);

  const runCheck = async () => {
    setCheck({ kind: "hashing" });
    try {
      const result = await pickAndHashRom(m.romRequirements);
      setCheck(result ? { kind: "done", result } : { kind: "idle" });
    } catch (e: unknown) {
      setCheck({ kind: "error", message: String(e) });
    }
  };

  return (
    <article className="game-page">
      <header>
        <h1>{m.name}</h1>
        <p className="muted">
          {m.game.title} · {consoleName(m.game.console)}
        </p>
        <div className="tags">
          <span className={`badge ${m.verification.status}`}>
            {verificationLabel(m.verification.status)}
          </span>
          <span className="tag">License: {licenseLabel(m.license)}</span>
          <span className="tag">Source: {m.repo}</span>
        </div>
        {m.description && <p>{m.description}</p>}
        <p className="muted small">Official releases: {repoUrl(m.repo)}/releases</p>
      </header>

      <section>
        <h2>Compatibility</h2>
        <table className="compat">
          <tbody>
            {PLATFORMS.map((p) => {
              const s = compatOf(m, p.key);
              return (
                <tr key={p.key}>
                  <th scope="row">{p.label}</th>
                  <td>
                    <span className={`compat-${s}`}>{s}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Required game dump</h2>
        <p className="muted small">
          Supply your own copy. It is hashed locally and never uploaded.
        </p>
        <table className="roms">
          <thead>
            <tr>
              <th>Version</th>
              <th>Hash</th>
            </tr>
          </thead>
          <tbody>
            {m.romRequirements.map((r) => (
              <tr key={r.label}>
                <td>
                  {r.label}
                  {r.recommended && <span className="tag small">recommended</span>}
                </td>
                <td className="mono">
                  {Object.entries(r.hashes).map(([algo, h]) => (
                    <div key={algo}>
                      {algo}: {h}
                    </div>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <button
          type="button"
          className="primary"
          disabled={check.kind === "hashing"}
          onClick={() => {
            void runCheck();
          }}
        >
          {check.kind === "hashing" ? "Hashing…" : "Check my ROM/ISO…"}
        </button>

        {check.kind === "error" && <p className="error">Error: {check.message}</p>}
        {check.kind === "done" && <RomResult result={check.result} />}
      </section>

      <InstallPanel manifest={m} onInstalledChange={setInstalled} />
      <ModsPanel manifest={m} installed={installed} />
    </article>
  );
}

function RomResult({ result: r }: { result: RomCheckResult }) {
  const ok = r.matchedLabel !== null;
  return (
    <div className={`rom-result ${ok ? "ok" : "bad"}`} role="status">
      <strong>
        {ok ? `✔ Supported version: ${r.matchedLabel ?? ""}` : "✖ Not a supported version"}
      </strong>
      <div className="small">
        {r.fileName} · {formatBytes(r.sizeBytes)}
      </div>
      <div className="mono small">sha1 {r.sha1}</div>
      <div className="mono small">md5 {r.md5}</div>
      <div className="mono small">sha256 {r.sha256}</div>
    </div>
  );
}
