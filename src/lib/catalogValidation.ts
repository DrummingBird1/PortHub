// CI/test-only validation (Node). The app itself validates in Rust (src-tauri/src/catalog.rs)
// so the webview never needs eval for Ajv and the CSP can stay strict.
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import schema from "../../docs/schema/manifest.schema.json";
import type { Manifest } from "./types";

export interface CatalogError {
  source: string;
  messages: string[];
}

export interface Catalog {
  manifests: Manifest[];
  errors: CatalogError[];
}

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validate = ajv.compile<Manifest>(schema);

/**
 * Validate raw manifest objects against the JSON Schema.
 * Invalid manifests are reported, never silently shown.
 */
export function buildCatalog(raw: Record<string, unknown>): Catalog {
  const manifests: Manifest[] = [];
  const errors: CatalogError[] = [];
  const seen = new Set<string>();

  for (const [source, data] of Object.entries(raw)) {
    if (!validate(data)) {
      errors.push({
        source,
        messages: (validate.errors ?? []).map(
          (e) => `${e.instancePath || "/"} ${e.message ?? "invalid"}`,
        ),
      });
      continue;
    }
    if (seen.has(data.id)) {
      errors.push({ source, messages: [`duplicate id "${data.id}"`] });
      continue;
    }
    seen.add(data.id);
    manifests.push(data);
  }

  manifests.sort((a, b) => a.name.localeCompare(b.name));
  return { manifests, errors };
}

/** Local catalog folder, bundled at build time (remote signed catalog is a later step). */
export function loadLocalCatalog(): Catalog {
  const modules = import.meta.glob<unknown>("../../catalog/*.json", {
    eager: true,
    import: "default",
  });
  return buildCatalog(modules);
}
