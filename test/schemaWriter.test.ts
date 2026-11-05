import { describe, it, expect } from "vitest";
import { TFile, type App } from "obsidian";
import { SchemaWriter, resetSchemaSource, updateSchemaSource } from "../src/schema/SchemaWriter";
import { EMPTY_EDITS, updateBaseSource } from "../src/schema/baseDoc";

const src = `# keep me
filters:
  and:
    - file.inFolder("Mitarbeiter")
formulas:
  x: html(list(note["Role"]).join(" "))
views:
  - type: table
    name: Table
`;

describe("updateSchemaSource", () => {
  it("adds the schema node and leaves the rest untouched", () => {
    const out = updateSchemaSource(src, (f) => { f.Role = { type: "select", options: { A: "blue" } }; });
    expect(out.endsWith(src) || out.startsWith(src)).toBe(true);
    expect(out).toMatch(/improved-bases:\n {2}version: 1\n {2}fields:\n {4}Role:/);
  });
  it("edits an existing field without reformatting others", () => {
    const first = updateSchemaSource(src, (f) => { f.Role = { type: "select", options: { A: "blue" } }; });
    const second = updateSchemaSource(first, (f) => {
      const role = f.Role;
      if (role) (role.options as Record<string, unknown>).B = "grey";
    });
    expect(second).toContain("B: grey");
    expect(second.replace(/\n\s+B: grey/, "")).toBe(first);
  });
  it("keeps field order from the mutated object", () => {
    const first = updateSchemaSource(src, (f) => { f.A = { type: "text" }; f.B = { type: "text" }; f.C = { type: "text" }; });
    const second = updateSchemaSource(first, (f) => {
      const next = Object.fromEntries(Object.entries(f).map(([k, v]) => (k === "B" ? ["Bee", v] : [k, v])));
      for (const k of Object.keys(f)) delete f[k];
      Object.assign(f, next);
    });
    const block = second.slice(second.indexOf("fields:"));
    expect(block.match(/^ {4}\w+:/gm)).toEqual(["    A:", "    Bee:", "    C:"]);
  });
  it("removes a field", () => {
    const first = updateSchemaSource(src, (f) => { f.Role = { type: "select" }; f.Team = { type: "relation" }; });
    const second = updateSchemaSource(first, (f) => { delete f.Team; });
    expect(second).not.toContain("Team");
    expect(second).toContain("Role:");
  });
});

describe("resetSchemaSource", () => {
  it("replaces an invalid schema value with an empty schema and keeps the rest", () => {
    const out = resetSchemaSource("improved-bases: 5\nviews: []\n");
    expect(out).toMatch(/improved-bases:\n {2}version: 1\n {2}fields: \{\}/);
    expect(out).toContain("views: []");
    expect(out).not.toContain("5");
  });
  it("drops existing fields", () => {
    const out = resetSchemaSource(updateSchemaSource(src, (f) => { f.Role = { type: "text" }; }));
    expect(out).not.toContain("Role:");
    expect(out).toContain("filters:");
  });
});

describe("SchemaWriter.update", () => {
  it("applies column edits and the schema mutation through vault.process", async () => {
    const file = Object.assign(new TFile(), { path: "B.base" });
    let data = "views:\n  - type: table\n    order:\n      - Role\n";
    const app = {
      vault: {
        getAbstractFileByPath: (p: string) => (p === file.path ? file : null),
        process: (_f: TFile, fn: (d: string) => string) => { data = fn(data); return Promise.resolve(data); },
      },
    } as unknown as App;
    await new SchemaWriter(app).update("B.base", (f) => { f.Job = { type: "text" }; }, { ...EMPTY_EDITS, rename: [{ from: "Role", to: "Job" }] });
    expect(data).toContain("- Job\n");
    expect(data).toMatch(/fields:\n {4}Job:/);
    await expect(new SchemaWriter(app).update("X.base", () => {})).rejects.toThrow(/X.base/);
  });
});

describe("schema version on write", () => {
  it("writes version: 1 first when the section is created by a field", () => {
    const out = updateSchemaSource(src, (f) => { f.Role = { type: "text" }; });
    expect(out).toMatch(/improved-bases:\n {2}version: 1\n {2}fields:\n {4}Role:/);
  });
  it("writes version: 1 when the section is created by an icon alone", () => {
    const out = updateBaseSource(src, EMPTY_EDITS, () => {}, "👥");
    expect(out).toMatch(/improved-bases:\n {2}version: 1\n {2}icon: 👥\n/);
  });
  it("adds version: 1 to an existing section without one, keeping the rest in place", () => {
    const withSection = `improved-bases:\n  icon: 👥\n  fields:\n    A:\n      type: text\n${src}`;
    const out = updateSchemaSource(withSection, (f) => { f.B = { type: "text" }; });
    expect(out).toMatch(/^improved-bases:\n {2}version: 1\n {2}icon: 👥\n {2}fields:\n {4}A:/);
    expect(out).toContain("    B:\n      type: text\n");
  });
  it("refuses to write a section with a newer version, but a no-op stays a no-op", () => {
    const withV2 = `improved-bases:\n  version: 2\n  fields: {}\n${src}`;
    expect(() => updateSchemaSource(withV2, (f) => { f.B = { type: "text" }; })).toThrow(/version 2/);
    expect(() => updateBaseSource(withV2, EMPTY_EDITS, () => {}, "👥")).toThrow(/version 2/);
    expect(updateSchemaSource(withV2, () => {})).toBe(withV2);
    // Clearing the icon of an icon-only newer section would drop the section; the version before the change counts.
    const iconOnlyV2 = `improved-bases:\n  version: 2\n  icon: 👥\n${src}`;
    expect(() => updateBaseSource(iconOnlyV2, EMPTY_EDITS, () => {}, "")).toThrow(/version 2/);
    // Column edits alone do not touch the section, so they are still allowed.
    const withView = `improved-bases:\n  version: 2\n  fields: {}\nviews:\n  - type: table\n    order:\n      - Role\n`;
    expect(updateBaseSource(withView, { ...EMPTY_EDITS, rename: [{ from: "Role", to: "Job" }] }, () => {})).toContain("- Job\n");
  });
  it("leaves the source untouched when nothing changes", () => {
    const withSection = `improved-bases:\n  fields:\n    A:\n      type: text\n${src}`;
    expect(updateSchemaSource(withSection, () => {})).toBe(withSection);
  });
  it("reset refuses a valid newer section but still replaces an invalid one", () => {
    expect(() => resetSchemaSource(`improved-bases:\n  version: 2\n  fields: {}\n${src}`)).toThrow(/version 2/);
    expect(resetSchemaSource(`improved-bases:\n  version: x\n${src}`)).toContain("version: 1");
  });
  it("reset writes version: 1 with empty fields", () => {
    const out = resetSchemaSource("improved-bases: 5\nviews: []\n");
    expect(out).toMatch(/improved-bases:\n {2}version: 1\n {2}fields: \{\}/);
  });
});
