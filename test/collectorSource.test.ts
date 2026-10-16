import { describe, it, expect } from "vitest";
import { collectorSource, ViewNotFoundError } from "../src/query/CollectorView";

describe("collectorSource", () => {
	it("replaces all views with the collector when no view is given", () => {
		const src = collectorSource({ filters: "g", views: [{ type: "table", name: "Alle", limit: 3 }] }, { base: "M.base" }, "c1");
		expect(src).toEqual({ filters: "g", views: [{ type: "improved-bases-collector", name: "collector", collectorId: "c1" }] });
	});

	it("keeps the named view's config and retypes it", () => {
		const src = collectorSource(
			{ filters: "g", views: [{ type: "table", name: "Alle" }, { type: "table", name: "FKs", filters: { and: ['Rolle == "FK"'] }, limit: 5 }] },
			{ base: "M.base", view: "FKs" },
			"c1",
		);
		expect(src.views).toEqual([{ type: "improved-bases-collector", name: "collector", collectorId: "c1", filters: { and: ['Rolle == "FK"'] }, limit: 5 }]);
		expect(src.filters).toBe("g");
	});

	it("takes the first view of a duplicated name", () => {
		const src = collectorSource({ views: [{ type: "table", name: "A", limit: 1 }, { type: "table", name: "A", limit: 2 }] }, { base: "M.base", view: "A" }, "c1");
		expect(src.views).toEqual([{ type: "improved-bases-collector", name: "collector", collectorId: "c1", limit: 1 }]);
	});

	it("throws ViewNotFoundError for a missing view", () => {
		expect(() => collectorSource({ views: [] }, { base: "M.base", view: "X" }, "c2")).toThrow(ViewNotFoundError);
		expect(() => collectorSource({}, { base: "M.base", view: "X" }, "c2")).toThrow(ViewNotFoundError);
		expect(() => collectorSource({ views: ["junk", null] }, { base: "M.base", view: "X" }, "c2")).toThrow(ViewNotFoundError);
	});
});
