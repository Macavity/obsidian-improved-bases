import { parseDocument } from "yaml";
import type { App } from "obsidian";
import { TFile } from "obsidian";

// TODO: import from ./types once Task 4 lands.
const SCHEMA_KEY = "improved-bases";

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

export type RawFields = Record<string, Record<string, unknown>>;

/** Edits only `improved-bases.fields`; everything else is preserved byte-for-byte. */
export function updateSchemaSource(source: string, mutate: (fields: RawFields) => void): string {
  const doc = parseDocument(source);
  const current = doc.getIn([SCHEMA_KEY, "fields"]);
  const before = (current && typeof (current as { toJSON?: unknown }).toJSON === "function"
    ? (current as { toJSON: () => unknown }).toJSON()
    : {}) as RawFields;
  const after = structuredClone(before);
  mutate(after);

  if (same(before, after)) return source;

  if (!doc.getIn([SCHEMA_KEY, "fields"])) {
    doc.setIn([SCHEMA_KEY, "fields"], doc.createNode({}));
  }
  for (const name of Object.keys(before)) {
    if (!(name in after)) doc.deleteIn([SCHEMA_KEY, "fields", name]);
  }
  for (const [name, value] of Object.entries(after)) {
    if (!same(before[name], value)) doc.setIn([SCHEMA_KEY, "fields", name], value);
  }
  return doc.toString();
}

export class SchemaWriter {
  constructor(private readonly app: App) {}

  async update(basePath: string, mutate: (fields: RawFields) => void): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(basePath);
    if (!(file instanceof TFile)) throw new Error(`Base not found: ${basePath}`);
    await this.app.vault.process(file, (data) => updateSchemaSource(data, mutate));
  }
}
