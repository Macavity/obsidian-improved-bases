import { describe, it, expect } from "vitest";
import type { App, TFile } from "obsidian";
import { collectValues, isMultiple, validateGeneric } from "../src/widgets/genericValues";

const appWith = (notes: Record<string, unknown>[]): App => {
	const files = notes.map((_, i) => ({ path: `n${i}.md` }) as TFile);
	return {
		vault: { getMarkdownFiles: () => files },
		metadataCache: { getFileCache: (f: TFile) => ({ frontmatter: notes[files.indexOf(f)] }) },
	} as unknown as App;
};

describe("generic values", () => {
	it("validates strings, string lists and empty values", () => {
		for (const v of [null, undefined, "", "a", ["a", "b"]]) expect(validateGeneric(v)).toBe(true);
		for (const v of [1, true, { a: 1 }, ["a", 1]]) expect(validateGeneric(v)).toBe(false);
	});
	it("derives multiple from the value, else from the vault", () => {
		expect(isMultiple(["a"], () => false)).toBe(true);
		expect(isMultiple("a", () => true)).toBe(false);
		expect(isMultiple(null, () => true)).toBe(true);
		expect(isMultiple("", () => false)).toBe(false);
	});
	it("collects values case-insensitively by key, most frequent first, then alphabetical", () => {
		const app = appWith([{ Lead: "B" }, { lead: ["B", "A", "C"] }, { LEAD: "A" }, { lead: "Z" }, { other: "X" }, { lead: ["B", "B"] }]);
		expect(collectValues(app, "lead")).toEqual({ values: ["B", "A", "C", "Z"], anyList: true });
	});
	it("reports no list when all values are strings and ignores unsafe keys", () => {
		expect(collectValues(appWith([{ lead: "A" }]), "Lead")).toEqual({ values: ["A"], anyList: false });
		expect(collectValues(appWith([{ constructor: "A" }]), "constructor")).toEqual({ values: [], anyList: false });
	});
});
