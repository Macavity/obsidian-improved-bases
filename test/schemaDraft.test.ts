import { describe, it, expect } from "vitest";
import { parse } from "yaml";
import { applyTypeChoice, conflictHint, draftsToEdits, knownFieldDrafts, mismatchHint, optionSuggestions, removals, renameKey, renames, typeChoice, typeChoices, TYPES, validateDrafts, optionMigrations, type FieldDraft, type OptionDraft, type OtherDefinition } from "../src/schema-settings/schemaDraft";
import type { Color } from "../src/schema/types";
import { updateSchemaSource } from "../src/schema/SchemaWriter";
import type { BaseColumns, RawFields } from "../src/schema/baseDoc";
import type { PropertyType } from "../src/internals/typeRegistry";
import { parseSchema } from "../src/schema/parse";

const d = (p: Partial<FieldDraft>): FieldDraft => ({ originalName: null, originalBase: null, name: "X", type: "native", detected: null, override: null, removed: false, multiple: false, options: [], ...p });
const o = (value: string, color: Color, p: Partial<OptionDraft> = {}): OptionDraft => ({ value, color, original: null, removal: null, ...p });
const mutation = (drafts: FieldDraft[], originals: string[]) => draftsToEdits(drafts, originals, 0).mutate;
const leadOf = (src: string): unknown => (parse(src) as { "improved-bases": { fields: Record<string, unknown> } })["improved-bases"].fields.Lead;
const none: BaseColumns = { views: [], orderByView: [], configured: [], expressions: [] };

describe("schemaDraft", () => {
	it("maps schema fields to drafts", () => {
		const fields = new Map([["role", { name: "Role", field: { type: "select" as const, multiple: true, options: [{ value: "A", color: "red" as const }] } }]]);
		expect(knownFieldDrafts({ columns: none, schemaFields: fields, memberKeys: [], detected: () => null, currentView: 0 })).toEqual([d({ originalName: "Role", name: "Role", type: "select", multiple: true, options: [o("A", "red", { original: "A" })] })]);
		const rel = new Map([["lead", { name: "Lead", field: { type: "relation" as const, base: "M.base", multiple: false } }]]);
		expect(knownFieldDrafts({ columns: none, schemaFields: rel, memberKeys: [], detected: () => null, currentView: 0 })).toEqual([d({ originalName: "Lead", originalBase: "M.base", name: "Lead", type: "relation", base: "M.base" })]);
	});
	it("writes a relation without an icon", () => {
		const out = updateSchemaSource("improved-bases:\n  fields: {}\n", mutation([d({ name: "Lead", type: "relation", base: "M.base" })], []));
		expect(leadOf(out)).toEqual({ type: "relation", base: "M.base", multiple: false });
	});
	it("validates names, duplicates, bases, options", () => {
		expect(validateDrafts([d({ name: "" })], [])).toHaveLength(1);
		expect(validateDrafts([d({ name: "__proto__", override: { type: "text" } })], []).join()).toMatch(/reserved/i);
		expect(validateDrafts([d({ name: "Role" }), d({ name: "role" })], []).join()).toMatch(/duplicate/i);
		expect(validateDrafts([d({ name: "L", type: "relation", base: "X.base" })], ["M.base"]).join()).toMatch(/base/i);
		expect(validateDrafts([d({ name: "L", type: "relation", base: "M.base" })], ["M.base"])).toEqual([]);
		// a saved target that no longer exists (orphaned base) stays valid, a different missing one does not
		expect(validateDrafts([d({ originalName: "L", originalBase: "Gone.base", name: "L", type: "relation", base: "Gone.base" })], ["M.base"])).toEqual([]);
		expect(validateDrafts([d({ originalName: "L", originalBase: "Gone.base", name: "L", type: "relation", base: "Other.base" })], ["M.base"]).join()).toMatch(/base/i);
		expect(validateDrafts([d({ name: "S", type: "select", options: [o("", "red")] })], []).join()).toMatch(/option/i);
		expect(validateDrafts([d({ name: "S", type: "select", options: [o("A", "red"), o("A", "blue")] })], []).join()).toMatch(/duplicate/i);
		expect(validateDrafts([d({ name: "S", type: "select", options: [o("A", "nope" as never)] })], []).join()).toMatch(/color/i);
	});
	it("writes, deletes and renames fields; options replaced in draft order", () => {
		const f: RawFields = { Role: { type: "select", multiple: false, options: { A: "red" } }, Old: { type: "text" }, Keep: { type: "date" } };
		mutation([
			d({ originalName: "Role", name: "Role", type: "select", options: [o("B", "blue"), o("A", "red")] }),
			d({ originalName: "Old", name: "New", override: { type: "text" } }),
			d({ originalName: "Keep", name: "Keep", override: { type: "date" } }),
			d({ name: "Lead", type: "relation", base: "M.base", multiple: true }),
		], ["Role", "Old", "Keep"])(f);
		expect(Object.keys(f)).toEqual(["Role", "Keep", "New", "Lead"]);
		expect(Object.keys(f.Role!.options as object)).toEqual(["B", "A"]);
		expect(f.Lead).toEqual({ type: "relation", base: "M.base", multiple: true });
		expect(f.Old).toBeUndefined();
	});
	it("is prototype-safe", () => {
		const f: RawFields = {};
		mutation([d({ name: "__proto__", override: { type: "text" } }), d({ name: "S", type: "select", options: [o("__proto__", "red")] })], [])(f);
		expect(Object.getPrototypeOf(f)).toBe(Object.prototype);
		expect(Object.hasOwn(f.S!.options as object, "__proto__")).toBe(true);
	});
	it("produces a parseable schema through updateSchemaSource", () => {
		const src = "improved-bases:\n  fields: {}\nviews: []\n";
		const out = updateSchemaSource(src, mutation([d({ name: "Role", type: "select", options: [o("A", "red")] })], []));
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
		const drafts = knownFieldDrafts({ columns: cols, schemaFields: schema, memberKeys: ["created", "team", "position"], detected: (n) => (n === "Team" ? "multitext" : null), currentView: 1 });
		expect(drafts.map((x) => x.name)).toEqual(["Zeta", "Status", "Alpha", "created", "Team"]);
		expect(drafts[1]).toMatchObject({ type: "select", originalName: "Status" });
		expect(drafts[2]).toMatchObject({ type: "native", override: { type: "text" }, originalName: "Alpha" });
		expect(drafts[4]).toMatchObject({ type: "native", detected: "multitext", originalName: "Team", override: null });
	});
	it("treats an out-of-range view as no current view", () => {
		const drafts = knownFieldDrafts({ columns: cols, schemaFields: null, memberKeys: [], detected: () => null, currentView: 5 });
		expect(drafts.map((x) => x.name)).toEqual(["Alpha", "Status", "Team", "Zeta"]);
	});
	it("turns drafts into column edits and a schema mutation", () => {
		const drafts = [
			d({ originalName: "Status", name: "Stand", type: "select", options: [o("x", "red")] }),
			d({ originalName: "Team", name: "Team", type: "native" }),
			d({ originalName: "Alpha", name: "Alpha", type: "native", override: { type: "text" } }),
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
	describe("optionMigrations", () => {
		const select = (options: OptionDraft[], p: Partial<FieldDraft> = {}) => d({ originalName: "Status", name: "Stand ", type: "select", options, ...p });
		it("lists renamed options under the new field name", () => {
			expect(optionMigrations([select([o("Offen", "red", { original: "Open" }), o("Done", "blue", { original: "Done" })])]))
				.toEqual([{ field: "Stand", renames: [{ from: "Open", to: "Offen" }], removals: [] }]);
		});
		it("lists options removed from the notes by their saved value", () => {
			expect(optionMigrations([select([o("Renamed", "red", { original: "Old", removal: "notes" })])]))
				.toEqual([{ field: "Stand", renames: [], removals: ["Old"] }]);
		});
		it("skips schema-only removals, new options and removed or non-select fields", () => {
			expect(optionMigrations([
				select([o("Old", "red", { original: "Old", removal: "schema" }), o("New", "blue")]),
				select([o("B", "red", { original: "A" })], { removed: true }),
				select([o("B", "red", { original: "A" })], { type: "native" }),
			])).toEqual([]);
		});
	});
	it("writes neither removed options nor validates them", () => {
		const draft = d({ originalName: "S", name: "S", type: "select", options: [o("A", "red", { original: "A", removal: "notes" }), o("A", "blue"), o("B", "red", { original: "B", removal: "schema" })] });
		const f: RawFields = {};
		mutation([draft], ["S"])(f);
		expect(f.S).toEqual({ type: "select", multiple: false, options: { A: "blue" } });
		expect(validateDrafts([draft], [])).toEqual([]);
		expect(optionSuggestions(["B", "A"], draft.options)).toEqual([{ value: "B", count: 1 }]);
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
		mutation([d({ originalName: "Prototype", name: "Prototype", override: { type: "text" } })], ["Prototype"])(f);
		expect(f).toEqual({ Prototype: { type: "text" } });
	});
	it("keeps the existing key spelling unless explicitly renamed", () => {
		const f: RawFields = { status: { type: "text" } };
		mutation([d({ originalName: "Status", name: "Status", override: { type: "text" } })], ["Status"])(f);
		expect(Object.keys(f)).toEqual(["status"]);
		expect(f.status).toEqual({ type: "text" });
		const g: RawFields = { status: { type: "text" } };
		mutation([d({ originalName: "status", name: "Status", override: { type: "text" } })], ["status"])(g);
		expect(Object.keys(g)).toEqual(["Status"]);
		expect(g.Status).toEqual({ type: "text" });
	});
	it("skips removed drafts in validation", () => {
		expect(validateDrafts([d({ name: "", removed: true, originalName: "X" })], [])).toEqual([]);
	});
	it("hints at member values the overriding type rejects", () => {
		const types: PropertyType[] = [
			{ type: "text", name: "Text", icon: "lucide-text", reserved: false },
			{ type: "number", name: "Zahl", icon: "lucide-binary", reserved: false, validate: (v) => typeof v === "number" },
			{ type: "broken", name: "Broken", icon: "lucide-text", reserved: false, validate: () => { throw new Error("x"); } },
		];
		const status = d({ name: "Status", detected: "text", override: { type: "number" } });
		expect(mismatchHint(status, types, ["Aktiv", "Urlaub", 3, null, undefined, ""])).toBe("2 notes have a Status that is not a valid Zahl; they keep their value and show as Text");
		expect(mismatchHint(status, types, ["Aktiv"])).toBe("1 note has a Status that is not a valid Zahl; it keeps its value and shows as Text");
		expect(mismatchHint({ ...status, detected: null }, types, ["Aktiv"])).toBe("1 note has a Status that is not a valid Zahl; it keeps its value and shows as is");
		expect(mismatchHint(status, types, [1, 2, null, ""])).toBeNull();
		expect(mismatchHint(d({ name: "Status", detected: "text" }), types, ["Aktiv"])).toBeNull();
		expect(mismatchHint({ ...status, type: "select" }, types, ["Aktiv"])).toBeNull();
		expect(mismatchHint(d({ name: "Status", override: { type: "text" } }), types, ["Aktiv"])).toBeNull();
		expect(mismatchHint(d({ name: "Status", override: { type: "broken" } }), types, ["Aktiv"])).toBeNull();
		expect(mismatchHint(d({ name: "Status", override: { type: "gone" } }), types, ["Aktiv"])).toBeNull();
	});
	it("hints at conflicting definitions in other bases, with the overlap count", () => {
		const relation = d({ name: "Team", type: "relation", base: "Teams.base", multiple: true });
		const others: OtherDefinition[] = [{ basePath: "Meetings.base", field: { type: "text" }, shared: 1 }];
		expect(conflictHint(relation, others)).toBe("Also defined in Meetings.base as text; 1 note is in both bases.");
		expect(conflictHint(relation, [{ basePath: "Meetings.base", field: { type: "text" }, shared: 0 }])).toBe("Also defined in Meetings.base as text; no note is in both bases yet.");
		expect(conflictHint(relation, [{ basePath: "Meetings.base", field: { type: "text" }, shared: 3 }, { basePath: "X.base", field: { type: "relation", base: "Other.base", multiple: true }, shared: 0 }]))
			.toBe("Also defined in Meetings.base as text; 3 notes are in both bases. Also defined in X.base as relation to Other.base (multiple); no note is in both bases yet.");
		// Compatible: same type, multiple and target; select options and colors do not count.
		expect(conflictHint(relation, [{ basePath: "X.base", field: { type: "relation", base: "Teams.base", multiple: true }, shared: 2 }])).toBeNull();
		const select = d({ name: "Status", type: "select", multiple: false, options: [o("A", "red")] });
		expect(conflictHint(select, [{ basePath: "X.base", field: { type: "select", multiple: false, options: [{ value: "B", color: "blue" }] }, shared: 2 }])).toBeNull();
		expect(conflictHint(select, [{ basePath: "X.base", field: { type: "select", multiple: true, options: [] }, shared: 2 }])).toBe("Also defined in X.base as select (multiple); 2 notes are in both bases.");
		// Native drafts: an overriding type compares, one without override is not defined here.
		expect(conflictHint(d({ name: "Team", type: "native", override: { type: "text" } }), others)).toBeNull();
		expect(conflictHint(d({ name: "Team", type: "native", override: { type: "list" } }), others)).toBe("Also defined in Meetings.base as text; 1 note is in both bases.");
		expect(conflictHint(d({ name: "Team", type: "native" }), others)).toBeNull();
		expect(conflictHint(relation, [])).toBeNull();
	});

	describe("type choices", () => {
		const types: PropertyType[] = [
			{ type: "text", name: "Text", icon: "lucide-text", reserved: false },
			{ type: "multitext", name: "Liste", icon: "lucide-list", reserved: false },
			{ type: "tags", name: "Tags", icon: "lucide-tags", reserved: true },
		];
		it("lists unreserved registry types, Obsidian's own first when it is not one of them", () => {
			expect(typeChoices(d({ detected: "multitext" }), types)).toEqual(["native:text", "native:multitext", "relation", "select"]);
			expect(typeChoices(d({ detected: "tags" }), types)).toEqual(["native", "native:text", "native:multitext", "relation", "select"]);
			expect(typeChoices(d({ detected: null }), types)).toEqual(["native", "native:text", "native:multitext", "relation", "select"]);
			expect(typeChoices(d({ detected: "text", override: { type: "list" } }), types)).toEqual(["native:text", "native:multitext", "native:list", "relation", "select"]);
			expect(typeChoices(d({ detected: "text" }), [])).toEqual(["native", "relation", "select"]);
		});
		it("shows the overriding type, else Obsidian's", () => {
			expect(typeChoice(d({ detected: "multitext" }), types)).toBe("native:multitext");
			expect(typeChoice(d({ detected: "text", override: { type: "number" } }), types)).toBe("native:number");
			expect(typeChoice(d({ detected: "text", override: { type: "list" } }), types)).toBe("native:list");
			expect(typeChoice(d({ detected: "tags" }), types)).toBe("native");
			expect(typeChoice(d({ detected: null }), types)).toBe("native");
			expect(typeChoice(d({ type: "select" }), types)).toBe("select");
		});
		it("drops the override for Obsidian's own type and writes another id", () => {
			const draft = d({ detected: "multitext", override: { type: "text" } });
			applyTypeChoice(draft, "native:multitext");
			expect(draft).toMatchObject({ type: "native", override: null });
			applyTypeChoice(draft, "native:number");
			expect(draft).toMatchObject({ type: "native", override: { type: "number" } });
			applyTypeChoice(draft, "select");
			expect(draft.type).toBe("select");
			applyTypeChoice(draft, "native");
			expect(draft).toMatchObject({ type: "native", override: null });
		});
		it("suggests note values by frequency, excluding existing options", () => {
			const values = ["Aktiv", ["MMO", "RPG"], "Aktiv", 3, null, ["RPG"], "Done"];
			expect(optionSuggestions(values, [o("Done", "red")])).toEqual([
				{ value: "Aktiv", count: 2 }, { value: "RPG", count: 2 }, { value: "MMO", count: 1 },
			]);
		});
		it("sets multiple from a list type when switching to select or relation", () => {
			const list = d({ detected: "multitext" });
			applyTypeChoice(list, "select");
			expect(list.multiple).toBe(true);
			const text = d({ detected: "text", multiple: true });
			applyTypeChoice(text, "select");
			expect(text.multiple).toBe(false);
			const keep = d({ type: "select", multiple: false, detected: "multitext" });
			applyTypeChoice(keep, "relation");
			expect(keep.multiple).toBe(false);
		});
		it("labels the conflicting type through the registry", () => {
			const others: OtherDefinition[] = [{ basePath: "Meetings.base", field: { type: "multitext" }, shared: 1 }];
			expect(conflictHint(d({ name: "Team", override: { type: "text" } }), others, (t) => (t === "multitext" ? "Liste" : t)))
				.toBe("Also defined in Meetings.base as Liste; 1 note is in both bases.");
		});
		it("writes a type override chosen in the dialog", () => {
			const draft = d({ originalName: "Due", name: "Due", detected: "text" });
			applyTypeChoice(draft, "native:date");
			const f: RawFields = {};
			mutation([draft], ["Due"])(f);
			expect(f.Due).toEqual({ type: "date" });
		});
	});
});
