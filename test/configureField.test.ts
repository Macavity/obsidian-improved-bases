import { describe, it, expect } from "vitest";
import { draftToMutation, parseOptionLines, validateDraft } from "../src/commands/configureField";
import { addOptionMutation, setColorMutation } from "../src/widgets/values";
import { activateSchemaSource, updateSchemaSource, type RawFields } from "../src/schema/SchemaWriter";

describe("configure field", () => {
  it("builds relation and select nodes", () => {
    const f: RawFields = {};
    draftToMutation({ name: "Lead", type: "relation", multiple: false, base: "M.base" })(f);
    draftToMutation({ name: "Prio", type: "select", multiple: true, options: { Hoch: "red" } })(f);
    expect(f).toEqual({ Lead: { type: "relation", base: "M.base", multiple: false },
      Prio: { type: "select", multiple: true, options: { Hoch: "red" } } });
  });
  it("validates", () => {
    expect(validateDraft({ name: "", type: "text", multiple: false }, [])).not.toEqual([]);
    expect(validateDraft({ name: "Lead", type: "relation", multiple: false, base: "X.base" }, ["M.base"]).join()).toMatch(/base/i);
    expect(validateDraft({ name: "Lead", type: "relation", multiple: false, base: "M.base" }, ["M.base"])).toEqual([]);
  });
  it("keeps existing select options when none given, writes native types", () => {
    const f: RawFields = { Prio: { type: "select", multiple: false, options: { A: "red" } } };
    draftToMutation({ name: "Prio", type: "select", multiple: true })(f);
    draftToMutation({ name: "Due", type: "date", multiple: false })(f);
    expect(f).toEqual({ Prio: { type: "select", multiple: true, options: { A: "red" } }, Due: { type: "date" } });
  });
  it("parses option lines and flags bad colors", () => {
    const { options: o } = parseOptionLines("Hoch: red\n\nNiedrig\nX: nope");
    expect(o).toEqual({ Hoch: "red", Niedrig: "grey", X: "nope" });
    expect(validateDraft({ name: "P", type: "select", multiple: false, options: o }, []).join()).toMatch(/color/i);
  });
  it("activates an empty schema node once", () => {
    const src = "filters:\n  and:\n    - file.inFolder(\"D\")\n";
    const out = activateSchemaSource(src);
    expect(out).toContain("improved-bases:");
    expect(out.startsWith(src)).toBe(true);
    expect(activateSchemaSource(out)).toBe(out);
    expect(updateSchemaSource(out, (f) => { f.A = { type: "text" }; })).toContain("A:");
  });
  it("reuses an existing key case-insensitively", () => {
    const f: RawFields = { Role: { type: "select", multiple: false, options: { A: "red" } } };
    draftToMutation({ name: "role", type: "select", multiple: true })(f);
    expect(Object.keys(f)).toEqual(["Role"]);
    expect(f.Role).toEqual({ type: "select", multiple: true, options: { A: "red" } });
  });
  it("rejects name collisions with another type", () => {
    const existing = new Map([["role", { name: "Role", type: "select" }]]);
    expect(validateDraft({ name: "ROLE", type: "text", multiple: false }, [], existing))
      .toContain("Field 'Role' already exists with type select");
    expect(validateDraft({ name: "role", type: "select", multiple: false }, [], existing)).toEqual([]);
  });
  it("rejects prototype keys as names and option values", () => {
    for (const name of ["__proto__", "constructor", "prototype"]) {
      expect(validateDraft({ name, type: "text", multiple: false }, []).length).toBeGreaterThan(0);
    }
    const f: RawFields = {};
    draftToMutation({ name: "constructor", type: "text", multiple: false })(f);
    expect(Object.keys(f)).toEqual([]);
    const parsed = parseOptionLines("__proto__: red\nconstructor\nOk");
    expect(Object.keys(parsed.options)).toEqual(["Ok"]);
    expect(parsed.errors).toHaveLength(2);
  });
  it("ignores inherited members in addOptionMutation/setColorMutation", () => {
    const f: RawFields = {};
    addOptionMutation("constructor", "x")(f);
    setColorMutation("__proto__", "x", "red")(f);
    expect(Object.hasOwn(Object.prototype, "x")).toBe(false);
    expect(Object.keys(f)).toEqual([]);
  });
});
