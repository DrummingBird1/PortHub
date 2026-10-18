import { describe, expect, it } from "vitest";
import { pickNext } from "./spatial";

const box = (x: number, y: number) => ({ x, y, w: 10, h: 10 });

describe("spatial navigation", () => {
  const from = box(100, 100);
  const cands = [box(200, 100), box(0, 100), box(100, 200), box(100, 0), box(200, 190)];
  it("picks the nearest element in each direction", () => {
    expect(pickNext(from, cands, "right")).toBe(0);
    expect(pickNext(from, cands, "left")).toBe(1);
    expect(pickNext(from, cands, "down")).toBe(2);
    expect(pickNext(from, cands, "up")).toBe(3);
  });
  it("returns -1 when nothing lies in that direction", () => {
    expect(pickNext(from, [box(0, 100)], "right")).toBe(-1);
  });
});
