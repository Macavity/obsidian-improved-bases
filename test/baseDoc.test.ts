import { describe, it, expect } from "vitest";
import { readBaseColumns, referencesName, propertyName, EMPTY_EDITS } from "../src/schema/baseDoc";

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
