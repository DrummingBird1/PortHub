import { describe, expect, it } from "vitest";
import { compatOf, formatBytes, licenseLabel, consoleName, progressLabel } from "./format";
import { buildCatalog, loadLocalCatalog } from "./catalogValidation";

describe("format helpers", () => {
  it("formats bytes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1023)).toBe("1023 B");
    expect(formatBytes(1024)).toBe("1.0 KiB");
    expect(formatBytes(32 * 1024 * 1024)).toBe("32.0 MiB");
    expect(formatBytes(5 * 1024 ** 3)).toBe("5.0 GiB");
  });

  it("labels licenses and consoles", () => {
    expect(licenseLabel("NOASSERTION")).toMatch(/review/);
    expect(licenseLabel("GPL-3.0")).toBe("GPL-3.0");
    expect(consoleName("n64")).toBe("Nintendo 64");
  });

  it("defaults missing compatibility to untested", () => {
    const m = loadLocalCatalog().manifests[0];
    if (!m) throw new Error("no fixture");
    const copy = structuredClone(m);
    delete copy.compatibility;
    expect(buildCatalog({ "x.json": copy }).errors).toEqual([]);
    expect(compatOf(copy, "steamdeck")).toBe("untested");
  });
});

describe("progressLabel", () => {
  it("describes each phase", () => {
    expect(progressLabel({ phase: "downloading", downloaded: 512, total: 1024 })).toBe(
      "Downloading 512 B / 1.0 KiB (50%)",
    );
    expect(progressLabel({ phase: "downloading", downloaded: 0, total: 0 })).toMatch(/\(0%\)/);
    expect(progressLabel({ phase: "verifying" })).toMatch(/SHA-256/);
    expect(progressLabel({ phase: "done", tag: "9.3.0" })).toBe("Installed 9.3.0");
  });
});
