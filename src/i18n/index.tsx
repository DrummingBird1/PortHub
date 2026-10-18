import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from "react";
import { en, type StringKey } from "./en";
import { he } from "./he";

export type Lang = "en" | "he";
export type { StringKey };

const DICTS: Record<Lang, Record<StringKey, string>> = { en, he };
export const RTL: ReadonlySet<Lang> = new Set<Lang>(["he"]);

export type Vars = Record<string, string | number>;

/** Pure formatter, exported for tests. Unknown placeholders are left as-is. */
export function translate(lang: Lang, key: StringKey, vars?: Vars): string {
  const template = DICTS[lang][key];
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole,
  );
}

interface I18n {
  lang: Lang;
  dir: "ltr" | "rtl";
  t: (key: StringKey, vars?: Vars) => string;
}

const Ctx = createContext<I18n>({
  lang: "en",
  dir: "ltr",
  t: (key, vars) => translate("en", key, vars),
});

export function I18nProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  const dir = RTL.has(lang) ? "rtl" : "ltr";
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
  }, [lang, dir]);
  const t = useCallback((key: StringKey, vars?: Vars) => translate(lang, key, vars), [lang]);
  const value = useMemo(() => ({ lang, dir, t }) as const, [lang, dir, t]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useI18n = (): I18n => useContext(Ctx);
