import { describe, it, expect } from "vitest";
import { parse } from "yaml";
import { draftsToMutation, fieldsToDrafts, renameKey, renames, validateDrafts, type FieldDraft } from "../src/commands/schemaDraft";
import { updateSchemaSource, type RawFields } from "../src/schema/SchemaWriter";
import { parseSchema } from "../src/schema/parse";

const d = (p: Partial<FieldDraft>): FieldDraft => ({ originalName: null, name: "X", type: "text", multiple: false, options: [], ...p });

describe("schemaDraft", () => {
	it("roundtrips fields to drafts", () => {
		const fields = new Map([["role", { name: "Role", field: { type: "select" as const, multiple: true, options: [{ value: "A", color: "red" as const }] } }]]);
		expect(fieldsToDrafts(fields)).toEqual([d({ originalName: "Role", name: "Role", type: "select", multiple: true, options: [{ value: "A", color: "red" }] })]);
	});
	it("validates names, duplicates, bases, options", () => {
		expect(validateDrafts([d({ name: "" })], [])).toHaveLength(1);
		expect(validateDrafts([d({ name: "__proto__" })], []).join()).toMatch(/reserved/i);
		expect(validateDrafts([d({ name: "Role" }), d({ name: "role" })], []).join()).toMatch(/duplicate/i);
		expect(validateDrafts([d({ name: "L", type: "relation", base: "X.base" })], ["M.base"]).join()).toMatch(/base/i);
		expect(validateDrafts([d({ name: "L", type: "relation", base: "M.base" })], ["M.base"])).toEqual([]);
		expect(validateDrafts([d({ name: "S", type: "select", options: [{ value: "", color: "red" }] })], []).join()).toMatch(/option/i);
		expect(validateDrafts([d({ name: "S", type: "select", options: [{ value: "A", color: "red" }, { value: "A", color: "blue" }] })], []).join()).toMatch(/duplicate/i);
		expect(validateDrafts([d({ name: "S", type: "select", options: [{ value: "A", color: "nope" as never }] })], []).join()).toMatch(/color/i);
	});
	it("writes, deletes and renames fields; options replaced in draft order", () => {
		const f: RawFields = { Role: { type: "select", multiple: false, options: { A: "red" } }, Old: { type: "text" }, Keep: { type: "date" } };
		draftsToMutation([
			d({ originalName: "Role", name: "Role", type: "select", options: [{ value: "B", color: "blue" }, { value: "A", color: "red" }] }),
			d({ originalName: "Old", name: "New", type: "text" }),
			d({ originalName: "Keep", name: "Keep", type: "date" }),
			d({ name: "Lead", type: "relation", base: "M.base", multiple: true }),
		], ["Role", "Old", "Keep"])(f);
		expect(Object.keys(f)).toEqual(["Role", "Keep", "New", "Lead"]);
		expect(Object.keys(f.Role!.options as object)).toEqual(["B", "A"]);
		expect(f.Lead).toEqual({ type: "relation", base: "M.base", multiple: true });
		expect(f.Old).toBeUndefined();
	});
	it("is prototype-safe", () => {
		const f: RawFields = {};
		draftsToMutation([d({ name: "__proto__" }), d({ name: "S", type: "select", options: [{ value: "__proto__", color: "red" }] })], [])(f);
		expect(Object.getPrototypeOf(f)).toBe(Object.prototype);
		expect(Object.hasOwn(f.S!.options as object, "__proto__")).toBe(true);
	});
	it("produces a parseable schema through updateSchemaSource", () => {
		const src = "improved-bases:\n  fields: {}\nviews: []\n";
		const out = updateSchemaSource(src, draftsToMutation([d({ name: "Role", type: "select", options: [{ value: "A", color: "red" }] })], []));
		expect(parseSchema("x.base", parse(out)).errors).toEqual([]);
	});
	it("detects renames including case-only", () => {
		expect(renames([d({ originalName: "role", name: "Role" }), d({ originalName: "K", name: "K" }), d({ name: "N" })])).toEqual([{ from: "role", to: "Role" }]);
	});
	it("renames frontmatter keys", () => {
		const fm: Record<string, unknown> = { role: "x", other: 1 };
		expect(renameKey(fm, "role", "Role")).toBe("renamed");
		expect(fm).toEqual({ other: 1, Role: "x" });
		expect(renameKey(fm, "role", "Role")).toBe("missing");
		expect(renameKey({ a: 1, b: 2 }, "a", "b")).toBe("conflict");
		const p: Record<string, unknown> = { a: 1 };
		expect(renameKey(p, "a", "__proto__")).toBe("conflict");
		expect(Object.getPrototypeOf(p)).toBe(Object.prototype);
	});
});
