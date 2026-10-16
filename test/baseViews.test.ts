import { describe, it, expect } from "vitest";
import { TFile, type App } from "obsidian";
import { baseViewNames } from "../src/schema/baseViews";

const appWith = (content: string | null): App =>
	({
		vault: {
			getAbstractFileByPath: () => (content === null ? null : Object.assign(new TFile(), { path: "M.base" })),
			cachedRead: () => Promise.resolve(content),
		},
	}) as unknown as App;

describe("baseViewNames", () => {
	it("lists view names in file order, skipping unnamed views", async () => {
		const yaml = "views:\n  - type: table\n    name: Alle\n  - type: table\n  - type: table\n    name: FKs\n";
		expect(await baseViewNames(appWith(yaml), "M.base")).toEqual(["Alle", "FKs"]);
	});
	it("returns null for a missing file or a non-mapping document", async () => {
		expect(await baseViewNames(appWith(null), "M.base")).toBeNull();
		expect(await baseViewNames(appWith("- a\n- b\n"), "M.base")).toBeNull();
	});
	it("returns [] without views", async () => {
		expect(await baseViewNames(appWith("filters: {}\n"), "M.base")).toEqual([]);
	});
});
