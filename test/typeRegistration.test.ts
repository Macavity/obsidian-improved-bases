import { describe, it, expect } from "vitest";
import { registerPluginTypes } from "../src/internals/typeRegistration";
import type { MetadataTypeManager, TypeWidget } from "../src/internals/detect";

const w = (type: string): TypeWidget => ({ type, validate: () => true, render: () => null });
const mtmWith = (widgets: Record<string, TypeWidget>) =>
	({
		registeredTypeWidgets: { text: w("text"), ...widgets },
		getTypeInfo: () => ({ expected: w("text"), inferred: w("text") }),
		trigger: () => {},
	}) as MetadataTypeManager;

describe("registerPluginTypes", () => {
	it("registers free ids and removes them again", () => {
		const mtm = mtmWith({});
		const own = { select: w("select"), relation: w("relation") };
		const reg = registerPluginTypes(mtm, own);
		expect(mtm.registeredTypeWidgets.select).toBe(own.select);
		expect([...reg.registered].sort()).toEqual(["relation", "select"]);
		reg.unregister();
		expect(mtm.registeredTypeWidgets.select).toBeUndefined();
		expect(mtm.registeredTypeWidgets.relation).toBeUndefined();
	});
	it("skips ids taken by another plugin and never removes them", () => {
		const foreign = w("select");
		const mtm = mtmWith({ select: foreign });
		const reg = registerPluginTypes(mtm, { select: w("select"), relation: w("relation") });
		expect(reg.skipped).toEqual(["select"]);
		expect(reg.registered.has("select")).toBe(false);
		reg.unregister();
		expect(mtm.registeredTypeWidgets.select).toBe(foreign);
	});
	it("leaves an entry alone that was replaced after registration", () => {
		const mtm = mtmWith({});
		const reg = registerPluginTypes(mtm, { select: w("select"), relation: w("relation") });
		const later = w("select");
		mtm.registeredTypeWidgets.select = later;
		reg.unregister();
		expect(mtm.registeredTypeWidgets.select).toBe(later);
	});
});
