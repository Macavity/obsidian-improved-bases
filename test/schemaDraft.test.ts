import { describe, it, expect } from "vitest";
import { parse } from "yaml";
import { draftsToEdits, knownFieldDrafts, removals, renameKey, renames, TYPES, validateDrafts, type FieldDraft } from "../src/commands/schemaDraft";
import { updateSchemaSource } from "../src/schema/SchemaWriter";
import type { BaseColumns, RawFields } from "../src/schema/baseDoc";
import { parseSchema } from "../src/schema/parse";

const d = (p: Partial<FieldDraft>): FieldDraft => ({ originalName: null, originalBase: null, name: "X", type: "native", nativeLabel: null, pinned: null, removed: false, multiple: false, icon: "", options: [], ...p });
const mutation = (drafts: FieldDraft[], originals: string[]) => draftsToEdits(drafts, originals, 0).mutate;
const leadOf = (src: string): unknown => (parse(src) as { "improved-bases": { fields: Record<string, unknown> } })["improved-bases"].fields.Lead;
const none: BaseColumns = { views: [], orderByView: [], configured: [], expressions: [] };

describe("schemaDraft", () => {
	it("maps schema fields to drafts", () => {
		const fields = new Map([["role", { name: "Role", field: { type: "select" as const, multiple: true, options: [{ value: "A", color: "red" as const }] } }]]);
		expect(knownFieldDrafts({ columns: none, schemaFields: fields, memberKeys: [], nativeLabel: () => null, currentView: 0 })).toEqual([d({ originalName: "Role", name: "Role", type: "select", multiple: true, options: [{ value: "A", color: "red" }] })]);
		const rel = new Map([["lead", { name: "Lead", field: { type: "relation" as const, base: "M.base", multiple: false } }]]);
		expect(knownFieldDrafts({ columns: none, schemaFields: rel, memberKeys: [], nativeLabel: () => null, currentView: 0 })).toEqual([d({ originalName: "Lead", originalBase: "M.base", name: "Lead", type: "relation", base: "M.base" })]);
	});
	it("round-trips the relation icon and drops it when empty", () => {
		const rel = new Map([["lead", { name: "Lead", field: { type: "relation" as const, base: "M.base", multiple: false, icon: "👤" } }]]);
		expect(knownFieldDrafts({ columns: none, schemaFields: rel, memberKeys: [], nativeLabel: () => null, currentView: 0 })[0]?.icon).toBe("👤");
		const withIcon = updateSchemaSource("improved-bases:\n  fields: {}\n", mutation([d({ name: "Lead", type: "relation", base: "M.base", icon: " 👤 " })], []));
		expect(leadOf(withIcon)).toEqual({ type: "relation", base: "M.base", multiple: false, icon: "👤" });
		const cleared = updateSchemaSource(withIcon, mutation([d({ originalName: "Lead", name: "Lead", type: "relation", base: "M.base", icon: "  " })], ["Lead"]));
		expect(leadOf(cleared)).not.toHaveProperty("icon");
	});
	it("validates names, duplicates, bases, options", () => {
		expect(validateDrafts([d({ name: "" })], [])).toHaveLength(1);
		expect(validateDrafts([d({ name: "__proto__", pinned: { type: "text" } })], []).join()).toMatch(/reserved/i);
		expect(validateDrafts([d({ name: "Role" }), d({ name: "role" })], []).join()).toMatch(/duplicate/i);
		expect(validateDrafts([d({ name: "L", type: "relation", base: "X.base" })], ["M.base"]).join()).toMatch(/base/i);
		expect(validateDrafts([d({ name: "L", type: "relation", base: "M.base" })], ["M.base"])).toEqual([]);
		// a saved target that no longer exists (orphaned base) stays valid, a different missing one does not
		expect(validateDrafts([d({ originalName: "L", originalBase: "Gone.base", name: "L", type: "relation", base: "Gone.base" })], ["M.base"])).toEqual([]);
		expect(validateDrafts([d({ originalName: "L", originalBase: "Gone.base", name: "L", type: "relation", base: "Other.base" })], ["M.base"]).join()).toMatch(/base/i);
		expect(validateDrafts([d({ name: "S", type: "select", options: [{ value: "", color: "red" }] })], []).join()).toMatch(/option/i);
		expect(validateDrafts([d({ name: "S", type: "select", options: [{ value: "A", color: "red" }, { value: "A", color: "blue" }] })], []).join()).toMatch(/duplicate/i);
		expect(validateDrafts([d({ name: "S", type: "select", options: [{ value: "A", color: "nope" as never }] })], []).join()).toMatch(/color/i);
	});
	it("writes, deletes and renames fields; options replaced in draft order", () => {
		const f: RawFields = { Role: { type: "select", multiple: false, options: { A: "red" } }, Old: { type: "text" }, Keep: { type: "date" } };
		mutation([
			d({ originalName: "Role", name: "Role", type: "select", options: [{ value: "B", color: "blue" }, { value: "A", color: "red" }] }),
			d({ originalName: "Old", name: "New", pinned: { type: "text" } }),
			d({ originalName: "Keep", name: "Keep", pinned: { type: "date" } }),
			d({ name: "Lead", type: "relation", base: "M.base", multiple: true }),
		], ["Role", "Old", "Keep"])(f);
		expect(Object.keys(f)).toEqual(["Role", "Keep", "New", "Lead"]);
		expect(Object.keys(f.Role!.options as object)).toEqual(["B", "A"]);
		expect(f.Lead).toEqual({ type: "relation", base: "M.base", multiple: true });
		expect(f.Old).toBeUndefined();
	});
	it("is prototype-safe", () => {
		const f: RawFields = {};
		mutation([d({ name: "__proto__", pinned: { type: "text" } }), d({ name: "S", type: "select", options: [{ value: "__proto__", color: "red" }] })], [])(f);
		expect(Object.getPrototypeOf(f)).toBe(Object.prototype);
		expect(Object.hasOwn(f.S!.options as object, "__proto__")).toBe(true);
	});
	it("produces a parseable schema through updateSchemaSource", () => {
		const src = "improved-bases:\n  fields: {}\nviews: []\n";
		const out = updateSchemaSource(src, mutation([d({ name: "Role", type: "select", options: [{ value: "A", color: "red" }] })], []));
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
	it("rejects names with surrounding whitespace", () => {
		expect(validateDrafts([d({ name: "Role " })], []).join()).toMatch(/whitespace/i);
		expect(validateDrafts([d({ name: " Role" })], []).join()).toMatch(/whitespace/i);
	});
	it("rejects swapped and chained renames", () => {
		expect(validateDrafts([d({ originalName: "A", name: "B" }), d({ originalName: "B", name: "A" })], []).join()).toMatch(/renamed from/i);
		expect(validateDrafts([d({ originalName: "A", name: "b" }), d({ originalName: "B", name: "C" })], []).join()).toMatch(/renamed from/i);
		expect(validateDrafts([d({ originalName: "a", name: "A" }), d({ originalName: "B", name: "B" })], [])).toEqual([]);
	});
	it("matches frontmatter keys exactly, as YAML does", () => {
		const fm: Record<string, unknown> = { team: "old", Team: "" };
		expect(renameKey(fm, "Team", "Teams")).toBe("renamed");
		expect(fm).toEqual({ team: "old", Teams: "" });
		expect(renameKey({ team: "old" }, "Team", "Teams")).toBe("missing");
		const caseOnly: Record<string, unknown> = { Team: 1 };
		expect(renameKey(caseOnly, "Team", "team")).toBe("renamed");
		expect(caseOnly).toEqual({ team: 1 });
	});
	const cols: BaseColumns = { views: ["A", "B"], orderByView: [["Team", "Status"], ["Zeta", "Status"]], configured: ["Alpha"], expressions: [] };
	const schema = new Map([
		["status", { name: "Status", field: { type: "select" as const, multiple: false, options: [{ value: "x", color: "red" as const }] } }],
		["alpha", { name: "Alpha", field: { type: "text" as const } }],
	]);
	it("builds the union ordered by the current view", () => {
		const drafts = knownFieldDrafts({ columns: cols, schemaFields: schema, memberKeys: ["created", "team", "position"], nativeLabel: (n) => (n === "Team" ? "multitext" : null), currentView: 1 });
		expect(drafts.map((x) => x.name)).toEqual(["Zeta", "Status", "Alpha", "created", "Team"]);
		expect(drafts[1]).toMatchObject({ type: "select", originalName: "Status" });
		expect(drafts[2]).toMatchObject({ type: "native", pinned: { type: "text" }, originalName: "Alpha" });
		expect(drafts[4]).toMatchObject({ type: "native", nativeLabel: "multitext", originalName: "Team", pinned: null });
	});
	it("treats an out-of-range view as no current view", () => {
		const drafts = knownFieldDrafts({ columns: cols, schemaFields: null, memberKeys: [], nativeLabel: () => null, currentView: 5 });
		expect(drafts.map((x) => x.name)).toEqual(["Alpha", "Status", "Team", "Zeta"]);
	});
	it("turns drafts into column edits and a schema mutation", () => {
		const drafts = [
			d({ originalName: "Status", name: "Stand", type: "select", options: [{ value: "x", color: "red" }] }),
			d({ originalName: "Team", name: "Team", type: "native" }),
			d({ originalName: "Alpha", name: "Alpha", type: "native", pinned: { type: "text" } }),
			d({ originalName: "Old", name: "Old", removed: true }),
			d({ originalName: null, name: "Neu", type: "native" }),
		];
		const { edits, mutate } = draftsToEdits(drafts, ["Status", "Team", "Alpha"], 1);
		expect(edits).toEqual({ add: [{ view: 1, names: ["Neu"] }], remove: ["Old"], rename: [{ from: "Status", to: "Stand" }] });
		const f: RawFields = { Status: { type: "select", multiple: false, options: { x: "red" } }, Team: { type: "relation", base: "T.base", multiple: true }, Alpha: { type: "text" } };
		mutate(f);
		expect(Object.keys(f)).toEqual(["Alpha", "Stand"]);
		expect(f.Alpha).toEqual({ type: "text" });
		expect(removals(drafts)).toEqual(["Old"]);
		expect(renames(drafts)).toEqual([{ from: "Status", to: "Stand" }]);
		expect(TYPES).toEqual(["native", "relation", "select"]);
	});
	it("rejects live names that a removed field still holds", () => {
		const gone = d({ originalName: "Status", name: "Status", removed: true });
		expect(validateDrafts([gone, d({ originalName: "X", name: "Status" })], []).join()).toMatch(/removed field/i);
		expect(validateDrafts([gone, d({ originalName: null, name: "status" })], [])).toHaveLength(1);
		expect(validateDrafts([gone, d({ originalName: "X", name: "Y" })], [])).toEqual([]);
	});
	it("reports reserved names only for new or renamed fields", () => {
		expect(validateDrafts([d({ originalName: "Prototype", name: "Prototype" })], [])).toEqual([]);
		expect(validateDrafts([d({ originalName: null, name: "prototype" })], []).join()).toMatch(/reserved/i);
		expect(validateDrafts([d({ originalName: "X", name: "constructor" })], []).join()).toMatch(/reserved/i);
	});
	it("keeps an untouched reserved key in the schema", () => {
		const f: RawFields = { Prototype: { type: "text" } };
		mutation([d({ originalName: "Prototype", name: "Prototype", pinned: { type: "text" } })], ["Prototype"])(f);
		expect(f).toEqual({ Prototype: { type: "text" } });
	});
	it("keeps the existing key spelling unless explicitly renamed", () => {
		const f: RawFields = { status: { type: "text" } };
		mutation([d({ originalName: "Status", name: "Status", pinned: { type: "text" } })], ["Status"])(f);
		expect(Object.keys(f)).toEqual(["status"]);
		expect(f.status).toEqual({ type: "text" });
		const g: RawFields = { status: { type: "text" } };
		mutation([d({ originalName: "status", name: "Status", pinned: { type: "text" } })], ["status"])(g);
		expect(Object.keys(g)).toEqual(["Status"]);
		expect(g.Status).toEqual({ type: "text" });
	});
	it("skips removed drafts in validation", () => {
		expect(validateDrafts([d({ name: "", removed: true, originalName: "X" })], [])).toEqual([]);
	});
});
