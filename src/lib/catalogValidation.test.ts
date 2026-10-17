import { describe, expect, it } from "vitest";
import { buildCatalog, loadLocalCatalog } from "./catalogValidation";

describe("local catalog", () => {
  it("every manifest in catalog/ validates against the schema", () => {
    const { manifests, errors } = loadLocalCatalog();
    expect(errors).toEqual([]);
    expect(manifests.map((m) => m.id).sort()).toEqual([
      "2ship2harkinian",
      "ship-of-harkinian",
      "zelda64recomp",
    ]);
  });

  it("asset patterns are valid regular expressions", () => {
    for (const m of loadLocalCatalog().manifests) {
      for (const a of m.releases.assets) {
        expect(() => new RegExp(a.pattern)).not.toThrow();
      }
    }
  });
});

describe("buildCatalog", () => {
  const base = loadLocalCatalog().manifests[0];

  it("rejects manifests with invalid hashes", () => {
    const bad = structuredClone(base);
    if (!bad) throw new Error("no fixture");
    bad.romRequirements = [{ label: "x", hashes: { sha1: "not-a-hash" } }];
    const { manifests, errors } = buildCatalog({ "bad.json": bad });
    expect(manifests).toHaveLength(0);
    expect(errors[0]?.source).toBe("bad.json");
  });

  it("rejects unknown fields (no scripting hooks)", () => {
    const bad = { ...structuredClone(base), postInstallScript: "rm -rf /" };
    expect(buildCatalog({ "x.json": bad }).errors).toHaveLength(1);
  });

  it("rejects duplicate ids", () => {
    const { errors } = buildCatalog({ "a.json": base, "b.json": base });
    expect(errors).toEqual([
      { source: "b.json", messages: [expect.stringContaining("duplicate")] },
    ]);
  });
});

describe("mods catalog schema", () => {
  const base = loadLocalCatalog().manifests.find((m) => m.id === "ship-of-harkinian");
  const mod = {
    id: "demo-pack",
    name: "Demo",
    author: "someone",
    repo: "someone/demo",
    assetPattern: "^demo\\.o2r$",
    kind: "file",
    pinned: { tag: "1.0.0", sha256: "a".repeat(64) },
    license: "MIT",
    portVersions: ["9.3.0"],
  };

  it("accepts a pinned catalog mod", () => {
    const m = structuredClone(base) as unknown as Record<string, unknown>;
    m.mods = { supported: true, folder: "mods", fileTypes: [".o2r"], catalog: [mod] };
    expect(buildCatalog({ "m.json": m }).errors).toEqual([]);
  });

  it("rejects unpinned mods", () => {
    const m = structuredClone(base) as unknown as Record<string, unknown>;
    m.mods = { supported: true, folder: "mods", catalog: [{ ...mod, pinned: undefined }] };
    expect(
      buildCatalog({ "m.json": JSON.parse(JSON.stringify(m)) as unknown }).errors,
    ).toHaveLength(1);
  });
});
