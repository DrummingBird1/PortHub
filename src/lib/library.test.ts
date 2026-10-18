import { describe, expect, it } from "vitest";
import { manifest, record } from "../test/fixtures";
import { DEFAULT_QUERY, consolesIn, queryLibrary } from "./library";

const a = manifest("alpha", "Alpha Port");
const b = manifest("beta", "Beta Port", { game: { title: "Zelda", console: "gamecube" } });
const c = manifest("gamma", "Gamma Port");
const all = [c, b, a];

describe("queryLibrary", () => {
  it("sorts by name by default", () => {
    expect(queryLibrary(all, {}, DEFAULT_QUERY).map((m) => m.id)).toEqual([
      "alpha",
      "beta",
      "gamma",
    ]);
  });
  it("searches name and game title, case-insensitively", () => {
    expect(queryLibrary(all, {}, { ...DEFAULT_QUERY, search: "zel" }).map((m) => m.id)).toEqual([
      "beta",
    ]);
    expect(queryLibrary(all, {}, { ...DEFAULT_QUERY, search: "GAMMA" }).map((m) => m.id)).toEqual([
      "gamma",
    ]);
  });
  it("filters by console and install status", () => {
    const inst = { gamma: record() };
    expect(
      queryLibrary(all, inst, { ...DEFAULT_QUERY, console: "gamecube" }).map((m) => m.id),
    ).toEqual(["beta"]);
    expect(
      queryLibrary(all, inst, { ...DEFAULT_QUERY, status: "installed" }).map((m) => m.id),
    ).toEqual(["gamma"]);
    expect(queryLibrary(all, inst, { ...DEFAULT_QUERY, status: "not-installed" })).toHaveLength(2);
    expect(queryLibrary(all, inst, { ...DEFAULT_QUERY, sort: "installed" })[0]?.id).toBe("gamma");
  });
  it("lists consoles present", () => {
    expect(consolesIn(all)).toEqual(["gamecube", "n64"]);
  });
});
