import { parseDocument } from "yaml";
import { describe, it, expect } from "vitest";
import { readBaseColumns, referencesName, propertyName, EMPTY_EDITS, updateBaseSource } from "../src/schema/baseDoc";

const src = `filters:
  and:
    - file.inFolder("M")
    - 'Status != "archived"'
formulas:
  x: note["Status"].toUpperCase()
properties:
  note.Status:
    displayName: Stand
views:
  - type: table
    name: Tabelle
    order:
      - file.name
      - Team
      - note.Status
      - formula.x
    summaries:
      Status: Average
    sort:
      - property: note.Status
        direction: ASC
      - property: Team
        direction: DESC
    groupBy:
      property: Status
      direction: ASC
  - type: cards
    name: Karten
    filters:
      not:
        - 'Team == "X"'
    order:
      - Status
`;
export { src }; // other tests reuse this fixture

describe("readBaseColumns", () => {
	it("collects views, columns, configured properties and expressions", () => {
		const c = readBaseColumns(src);
		expect(c.views).toEqual(["Tabelle", "Karten"]);
		expect(c.orderByView).toEqual([["Team", "Status"], ["Status"]]);
		expect(c.configured).toEqual(["Status"]);
		expect(c.expressions).toEqual(['file.inFolder("M")', 'Status != "archived"', 'Team == "X"', 'note["Status"].toUpperCase()']);
	});
	it("names unnamed views and tolerates missing sections", () => {
		const c = readBaseColumns("views:\n  - type: table\n");
		expect(c).toEqual({ views: ["View 1"], orderByView: [[]], configured: [], expressions: [] });
	});
	it("throws without a views list", () => {
		expect(() => readBaseColumns("filters: x\n")).toThrow(/views/);
	});
});
describe("referencesName / propertyName", () => {
	it("matches whole words only", () => {
		const e = ['Status != "a"', "note.Status2"];
		expect(referencesName(e, "Status")).toBe(true);
		expect(referencesName(e, "Stat")).toBe(false);
		expect(referencesName(e, "Status2")).toBe(true);
	});
	it("maps order entries", () => {
		expect(propertyName("note.X")).toBe("X");
		expect(propertyName("X")).toBe("X");
		expect(propertyName("file.name")).toBeNull();
		expect(propertyName("formula.x")).toBeNull();
	});
});
describe("EMPTY_EDITS", () => {
	it("is frozen and empty", () => {
		expect(EMPTY_EDITS).toEqual({ add: [], remove: [], rename: [] });
		expect(Object.isFrozen(EMPTY_EDITS)).toBe(true);
	});
});

const noop = (): void => {};
describe("updateBaseSource", () => {
	it("adds to the chosen view and creates order when missing", () => {
		const out = updateBaseSource(src, { ...EMPTY_EDITS, add: [{ view: 1, names: ["Neu"] }] }, noop);
		expect(out).toMatch(/name: Karten[\s\S]*order:\n {6}- Status\n {6}- Neu\n/);
		const bare = updateBaseSource("views:\n  - type: table\n", { ...EMPTY_EDITS, add: [{ view: 0, names: ["Neu"] }] }, noop);
		expect(bare).toBe("views:\n  - type: table\n    order:\n      - file.name\n      - Neu\n");
	});
	it("skips names already in the order and rejects invalid views", () => {
		expect(updateBaseSource(src, { ...EMPTY_EDITS, add: [{ view: 1, names: ["status"] }] }, noop)).toBe(src);
		expect(() => updateBaseSource(src, { ...EMPTY_EDITS, add: [{ view: 5, names: ["X"] }] }, noop)).toThrow(/view/);
	});
	it("removes from every view, properties, summaries, sort and groupBy", () => {
		const out = updateBaseSource(src, { ...EMPTY_EDITS, remove: ["status"] }, noop);
		expect(out).not.toMatch(/- (note\.)?Status\n/);
		expect(out).not.toContain("note.Status:");
		expect(out).not.toContain("Status: Average");
		expect(out).not.toContain("groupBy");
		expect(out).toMatch(/sort:\n {6}- property: Team\n {8}direction: DESC\n/);
		expect(out).toContain('Status != "archived"'); // expressions untouched
	});
	it("renames keeping the note. prefix and comments", () => {
		const out = updateBaseSource(`# c\n${src}`, { ...EMPTY_EDITS, rename: [{ from: "Status", to: "Stand" }] }, noop);
		expect(out.startsWith("# c\n")).toBe(true);
		expect(out).toContain("- note.Stand\n");
		expect(out).toContain("- Stand\n");
		expect(out).toContain("note.Stand:\n");
		expect(out).toContain("Stand: Average");
		expect(out).toContain("- property: note.Stand\n");
		expect(out).toMatch(/groupBy:\n {6}property: Stand\n/);
		expect(out).not.toMatch(/Status(?!\s*!=|"\])/); // only expression strings still mention Status
	});
	it("drops renames that would create duplicate map keys", () => {
		const dup = `properties:
  note.Status:
    displayName: A
  note.status:
    displayName: B
views:
  - type: table
    summaries:
      Status: Average
      note.Status: Sum
`;
		const out = updateBaseSource(dup, { ...EMPTY_EDITS, rename: [{ from: "Status", to: "Stand" }] }, noop);
		const doc = parseDocument(out);
		expect(doc.errors).toEqual([]);
		const json = doc.toJS() as { properties: Record<string, unknown>; views: { summaries: unknown }[] };
		expect(json.properties).toEqual({ "note.Stand": { displayName: "A" } });
		expect(json.views[0]?.summaries).toEqual({ Stand: "Average", "note.Stand": "Sum" });
	});
	it("returns the identical string without changes", () => {
		expect(updateBaseSource(src, EMPTY_EDITS, noop)).toBe(src);
	});
	it("combines column edits with the schema mutation in one pass", () => {
		const out = updateBaseSource(src, { ...EMPTY_EDITS, rename: [{ from: "Status", to: "Stand" }] }, (f) => {
			f.Stand = { type: "select", multiple: false, options: { A: "red" } };
		});
		expect(out).toMatch(/improved-bases:\n {2}fields:\n {4}Stand:\n {6}type: select/);
		expect(out).toContain("- note.Stand\n");
	});
});
