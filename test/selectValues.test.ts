import { describe, it, expect } from "vitest";
import type { RawFields } from "../src/schema/SchemaWriter";
import type { SelectField } from "../src/schema/types";
import { selectOutput, colorOf, addOptionMutation, nextOptionColor, setColorMutation, countNotesWithValue, renameOptionMutation, removeOptionMutation, StaleOptionError } from "../src/widgets/values";

const field: SelectField = { type: "select", multiple: false, options: [{ value: "Dev", color: "blue" }] };
const fresh = (): RawFields => ({ Role: { type: "select", options: { Dev: "blue" } } });

describe("select values", () => {
  it("writes schema format", () => {
    expect(selectOutput(["Dev"], false)).toBe("Dev");
    expect(selectOutput(["Dev", "PO"], true)).toEqual(["Dev", "PO"]);
    expect(selectOutput(["Dev", "PO", "Dev"], true)).toEqual(["Dev", "PO"]);
    expect(selectOutput([], false)).toBeNull();
  });
  it("colors unknown values grey", () => {
    expect(colorOf(field, "Dev")).toBe("blue");
    expect(colorOf(field, "Nope")).toBe("grey");
  });
  it("adds options without duplicates and recolors", () => {
    const f = fresh();
    addOptionMutation("Role", "PO", "grey")(f); addOptionMutation("Role", "PO", "grey")(f);
    expect(f.Role?.options).toEqual({ Dev: "blue", PO: "grey" });
    setColorMutation("Role", "PO", "green")(f);
    expect((f.Role?.options as Record<string, string>).PO).toBe("green");
    // An option removed elsewhere is not brought back by a recolor.
    expect(() => setColorMutation("Role", "Gone", "green")(f)).toThrow(StaleOptionError);
    expect(f.Role?.options).not.toHaveProperty("Gone");
  });
  it("keeps an existing color when adding", () => {
    const f = fresh();
    addOptionMutation("Role", "Dev", "red")(f);
    expect((f.Role?.options as Record<string, string>).Dev).toBe("blue");
  });
	it("cycles new option colors without grey, black, white", () => {
		const seen = Array.from({ length: 10 }, (_, i) => nextOptionColor(i));
		expect(new Set(seen).size).toBe(10);
		expect(seen).not.toContain("grey");
		expect(seen).not.toContain("black");
		expect(seen).not.toContain("white");
		expect(nextOptionColor(0)).toBe("red");
		expect(nextOptionColor(10)).toBe(nextOptionColor(0));
	});
	it("adds an option with the given color", () => {
		const fields: RawFields = { Status: { type: "select", options: {} } };
		addOptionMutation("Status", "A", "blue")(fields);
		expect(fields.Status?.options).toEqual({ A: "blue" });
	});
	it("treats prototype names as ordinary options", () => {
		for (const name of ["constructor", "__proto__", "toString"]) {
			const fields: RawFields = { Status: { options: {} } };
			addOptionMutation("Status", name, "grey")(fields);
			const opts = fields.Status?.options as Record<string, unknown>;
			expect(Object.hasOwn(opts, name)).toBe(true);
			expect(opts[name]).toBe("grey");
			setColorMutation("Status", name, "red")(fields);
			expect(opts[name]).toBe("red");
		}
	});
});

describe("option value edits", () => {
  it("counts notes with a value", () => {
    expect(countNotesWithValue(["A", ["A", "B"], "B", null], "A")).toBe(2);
  });
  it("renames an option keeping order and color", () => {
    const f: RawFields = { Role: { type: "select", options: { A: "red", B: "blue" } } };
    renameOptionMutation("Role", "A", "Z")(f);
    const o = f.Role?.options as Record<string, string>;
    expect(Object.keys(o)).toEqual(["Z", "B"]);
    expect(o.Z).toBe("red");
  });
  it("throws instead of renaming onto an existing option or a missing one", () => {
    const f: RawFields = { Role: { type: "select", options: { A: "red", B: "blue" } } };
    expect(() => renameOptionMutation("Role", "A", "B")(f)).toThrow(StaleOptionError);
    expect(() => renameOptionMutation("Role", "Q", "Z")(f)).toThrow(StaleOptionError);
    expect(f.Role?.options).toEqual({ A: "red", B: "blue" });
  });
  it("removes an option", () => {
    const f: RawFields = { Role: { type: "select", options: { A: "red", B: "blue" } } };
    removeOptionMutation("Role", "A")(f);
    expect(f.Role?.options).toEqual({ B: "blue" });
  });
});
