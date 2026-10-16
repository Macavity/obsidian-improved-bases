import { describe, it, expect } from "vitest";
import { parseSchema } from "../src/schema/parse";

const ok = {
  "improved-bases": { fields: {
    Team: { type: "relation", base: "Teams.base", multiple: true },
    Role: { type: "select", options: { Developer: "blue", "Product Owner": "orange" } },
    Notes: { type: "text" },
  } },
};

describe("parseSchema", () => {
  it("returns null without errors when key is absent", () => {
    expect(parseSchema("A.base", { filters: {} })).toEqual({ schema: null, errors: [] });
    expect(parseSchema("A.base", null)).toEqual({ schema: null, errors: [] });
  });
  it("parses relation, select, native", () => {
    const { schema, errors } = parseSchema("A.base", ok);
    expect(errors).toEqual([]);
    expect(schema!.fields.get("team")).toEqual({ name: "Team",
      field: { type: "relation", base: "Teams.base", multiple: true } });
    expect(schema!.fields.get("role")!.field).toEqual({ type: "select", multiple: false,
      options: [{ value: "Developer", color: "blue" }, { value: "Product Owner", color: "orange" }] });
    expect(schema!.fields.get("notes")!.field).toEqual({ type: "text" });
  });
  it("passes any type id through as a native field", () => {
    for (const type of ["multitext", "text", "my-plugin-type"]) {
      const { schema, errors } = parseSchema("A.base", { "improved-bases": { fields: { F: { type } } } });
      expect(errors).toEqual([]);
      expect(schema?.fields.get("f")?.field).toEqual({ type });
    }
  });
  it("parses the optional base icon", () => {
    const withIcon = parseSchema("A.base", { "improved-bases": { icon: " 👥 ", fields: { Team: { type: "relation", base: "T.base" } } } });
    expect(withIcon.schema?.icon).toBe("👥");
    expect(withIcon.schema?.fields.get("team")?.field).toEqual({ type: "relation", base: "T.base", multiple: false });
    const none = parseSchema("A.base", { "improved-bases": { fields: { Team: { type: "relation", base: "T.base" } } } });
    expect(none.schema).not.toHaveProperty("icon");
    // A base may carry only an icon; it is then a schema base without fields.
    expect(parseSchema("A.base", { "improved-bases": { icon: "👥" } }).schema).toEqual({ basePath: "A.base", icon: "👥", fields: new Map() });
    // A blank, null or non-string icon is cosmetic: ignored, the schema stays valid.
    for (const icon of ["", "  ", null, 5]) {
      const lenient = parseSchema("A.base", { "improved-bases": { icon, fields: { Team: { type: "relation", base: "T.base" } } } });
      expect(lenient.errors).toEqual([]);
      expect(lenient.schema).not.toHaveProperty("icon");
    }
  });
  it.each([
    [{ Role: { type: "select", options: { A: "purple" } } }, /color/i],
    [{ Role: { type: "select", options: { A: 5 } } }, /color/i],
    [{ Role: { type: "select", options: ["A"] } }, /options/i],
    [{ Role: { type: "select", multiple: "yes", options: {} } }, /multiple/i],
    [{ Team: { type: "relation", base: "../x.base" } }, /base/i],
    [{ Team: { type: "relation", base: "a/../x.base" } }, /base/i],
    [{ Team: { type: "relation", base: "/etc/x.base" } }, /base/i],
    [{ Team: { type: "relation", base: "a\\x.base" } }, /base/i],
    [{ Team: { type: "relation", base: "C:/x.base" } }, /base/i],
    [{ Team: { type: "relation", base: 5 } }, /base/i],
    [{ Team: { type: "relation", base: "Teams.md" } }, /base/i],
    [{ Team: { type: "relation" } }, /base/i],
    [{ X: { type: "" } }, /type/i],
    [{ X: { type: "constructor" } }, /type/i],
    [{ X: { type: "__proto__" } }, /type/i],
    [{ X: { type: 3 } }, /type/i],
    [{ X: {} }, /type/i],
    [{ X: "text" }, /field/i],
    [{ team: { type: "text" }, Team: { type: "text" } }, /duplicate/i],
  ])("rejects %j", (fields, msg) => {
    const r = parseSchema("A.base", { "improved-bases": { fields } });
    expect(r.schema).toBeNull();
    expect(r.errors.join(" ")).toMatch(msg);
  });
  it("rejects malformed containers", () => {
    for (const v of [null, "x", [], { fields: [] }, { fields: "x" }]) {
      const r = parseSchema("A.base", { "improved-bases": v });
      expect(r.schema).toBeNull();
      expect(r.errors.length).toBeGreaterThan(0);
    }
  });
  it("treats missing fields as empty schema", () => {
    const r = parseSchema("A.base", { "improved-bases": {} });
    expect(r.errors).toEqual([]);
    expect(r.schema!.fields.size).toBe(0);
  });
});

describe("parseSchema unsafe names", () => {
  it("rejects reserved field names case-insensitively", () => {
    const raw = { "improved-bases": { fields: { Constructor: { type: "text" } } } };
    const { schema, errors } = parseSchema("A.base", raw);
    expect(schema).toBeNull();
    expect(errors[0]).toMatch(/reserved/);
  });

  it("parses an optional relation view", () => {
    const rel = (view: unknown) => ({ "improved-bases": { fields: { Lead: { type: "relation", base: "M.base", view } } } });
    const good = parseSchema("A.base", rel("FKs"));
    expect(good.schema?.fields.get("lead")?.field).toEqual({ type: "relation", base: "M.base", multiple: false, view: "FKs" });
    for (const view of ["", "  ", 3, null, ["x"]]) {
      expect(parseSchema("A.base", rel(view)).errors.join()).toContain('field "Lead": view must be a non-empty string');
    }
    const none = parseSchema("A.base", { "improved-bases": { fields: { Lead: { type: "relation", base: "M.base" } } } });
    expect(none.schema?.fields.get("lead")?.field).not.toHaveProperty("view");
  });
});
