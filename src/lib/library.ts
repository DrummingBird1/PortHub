import type { Console, InstallRecord, Manifest } from "./types";

export type StatusFilter = "all" | "installed" | "not-installed";
export type SortKey = "name" | "console" | "installed";

export interface LibraryQuery {
  search: string;
  console: Console | "all";
  status: StatusFilter;
  sort: SortKey;
}

export const DEFAULT_QUERY: LibraryQuery = {
  search: "",
  console: "all",
  status: "all",
  sort: "name",
};

const norm = (s: string) => s.toLocaleLowerCase().normalize("NFKD");

/** Filter + sort the catalog. Pure, so it is unit tested. */
export function queryLibrary(
  manifests: Manifest[],
  installed: Record<string, InstallRecord | null | undefined>,
  q: LibraryQuery,
): Manifest[] {
  const needle = norm(q.search.trim());
  const isInstalled = (m: Manifest) => Boolean(installed[m.id]);
  const byName = (a: Manifest, b: Manifest) => a.name.localeCompare(b.name);
  return manifests
    .filter((m) => q.console === "all" || m.game.console === q.console)
    .filter((m) =>
      q.status === "all" ? true : q.status === "installed" ? isInstalled(m) : !isInstalled(m),
    )
    .filter(
      (m) =>
        needle === "" ||
        [m.name, m.game.title, m.repo, m.id].some((field) => norm(field).includes(needle)),
    )
    .sort((a, b) => {
      if (q.sort === "console") return a.game.console.localeCompare(b.game.console) || byName(a, b);
      if (q.sort === "installed")
        return Number(isInstalled(b)) - Number(isInstalled(a)) || byName(a, b);
      return byName(a, b);
    });
}

/** Consoles present in the catalog, for the filter menu. */
export const consolesIn = (manifests: Manifest[]): Console[] =>
  [...new Set(manifests.map((m) => m.game.console))].sort();
