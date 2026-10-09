import { describe, it, expect } from "vitest";
import { activateSchemaSource, resetSchemaSource, updateSchemaSource } from "../src/schema/SchemaWriter";

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
    expect(out).toMatch(/improved-bases:\n {2}fields:\n {4}Role:/);
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
  it("removes a field", () => {
    const first = updateSchemaSource(src, (f) => { f.Role = { type: "select" }; f.Team = { type: "relation" }; });
    const second = updateSchemaSource(first, (f) => { delete f.Team; });
    expect(second).not.toContain("Team");
    expect(second).toContain("Role:");
  });
});

describe("activateSchemaSource", () => {
  it("activates an empty schema node once", () => {
    const text = "filters:\n  and:\n    - file.inFolder(\"D\")\n";
    const out = activateSchemaSource(text);
    expect(out).toContain("improved-bases:");
    expect(out.startsWith(text)).toBe(true);
    expect(activateSchemaSource(out)).toBe(out);
    expect(updateSchemaSource(out, (f) => { f.A = { type: "text" }; })).toContain("A:");
  });
});

describe("resetSchemaSource", () => {
  it("replaces an invalid schema value with an empty schema and keeps the rest", () => {
    const out = resetSchemaSource("improved-bases: 5\nviews: []\n");
    expect(out).toMatch(/improved-bases:\n {2}fields: \{\}/);
    expect(out).toContain("views: []");
    expect(out).not.toContain("5");
  });
  it("drops existing fields", () => {
    const out = resetSchemaSource(updateSchemaSource(src, (f) => { f.Role = { type: "text" }; }));
    expect(out).not.toContain("Role:");
    expect(out).toContain("filters:");
  });
});
