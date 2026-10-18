import { describe, expect, it } from "vitest";
import { formatEta, pushSample, rateOf } from "./progress";

describe("download rate", () => {
  it("computes speed, ETA and fraction from samples", () => {
    let s = pushSample([], { at: 0, bytes: 0 });
    s = pushSample(s, { at: 1000, bytes: 1_000_000 });
    s = pushSample(s, { at: 2000, bytes: 2_000_000 });
    const r = rateOf(s, 10_000_000);
    expect(r.speed).toBeCloseTo(1_000_000);
    expect(r.eta).toBeCloseTo(8);
    expect(r.fraction).toBeCloseTo(0.2);
  });

  it("drops samples outside the window and handles unknown totals", () => {
    let s = pushSample([], { at: 0, bytes: 0 });
    s = pushSample(s, { at: 10_000, bytes: 5 });
    expect(s).toHaveLength(1);
    expect(rateOf(s, 0)).toEqual({ speed: 0, eta: null, fraction: null });
  });

  it("formats ETA", () => {
    expect(formatEta(5.2)).toBe("6s");
    expect(formatEta(125)).toBe("2m 05s");
    expect(formatEta(3725)).toBe("1h 02m");
  });
});
