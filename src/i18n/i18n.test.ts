import { describe, expect, it } from "vitest";
import { en } from "./en";
import { he } from "./he";
import { translate } from "./index";

describe("i18n", () => {
  it("fills placeholders and leaves unknown ones", () => {
    expect(translate("en", "action.update", { tag: "9.3.0" })).toBe("Update to 9.3.0");
    expect(translate("en", "action.update")).toBe("Update to {tag}");
    expect(translate("he", "action.update", { tag: "9.3.0" })).toBe("עדכון ל-9.3.0");
  });
  it("Hebrew covers every key with non-empty text and the same placeholders", () => {
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(he[key].trim(), key).not.toBe("");
      const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
      expect(ph(he[key]), key).toEqual(ph(en[key]));
    }
  });
});
