import { describe, it, expect } from "vitest";
import type { MetadataTypeManager } from "../src/internals/detect";
import { listPropertyTypes, propertyTypeOf } from "../src/internals/typeRegistry";

const widget = (type: string, extra: Record<string, unknown> = {}) => ({ type, validate: () => true, render: () => undefined, ...extra });
const mtm = {
	registeredTypeWidgets: {
		text: widget("text", { name: "Text", icon: "lucide-text" }),
		multitext: widget("multitext", { name: () => "Liste", icon: "lucide-list" }),
		tags: widget("tags", { name: "Tags", icon: "lucide-tags", reservedKeys: ["tags"] }),
		odd: widget("odd"),
		throwing: widget("throwing", { name: () => { throw new Error("no name"); } }),
		gone: undefined,
		alias: widget("text", { name: "Text again" }),
	},
	getTypeInfo: () => { throw new Error("unused"); },
	trigger: () => undefined,
} as unknown as MetadataTypeManager;

describe("typeRegistry", () => {
	// The id is the registry key: the patch looks widgets up by key, so a widget whose `type` differs from its key must still resolve.
	it("lists registered widgets by key with resolved names and icons", () => {
		expect(listPropertyTypes(mtm).map(({ validate: _v, ...t }) => t)).toEqual([
			{ type: "text", name: "Text", icon: "lucide-text", reserved: false },
			{ type: "multitext", name: "Liste", icon: "lucide-list", reserved: false },
			{ type: "tags", name: "Tags", icon: "lucide-tags", reserved: true },
			{ type: "odd", name: "odd", icon: "lucide-text", reserved: false },
				{ type: "throwing", name: "throwing", icon: "lucide-text", reserved: false },
			{ type: "alias", name: "Text again", icon: "lucide-text", reserved: false },
		]);
		expect(listPropertyTypes(null)).toEqual([]);
	});
	it("passes each widget's validate on, treating a throw as valid", () => {
		const types = listPropertyTypes({ registeredTypeWidgets: {
			number: widget("number", { validate: (v: unknown) => typeof v === "number" }),
			broken: widget("broken", { validate: () => { throw new Error("x"); } }),
		} } as never);
		expect(types[0]?.validate?.(3)).toBe(true);
		expect(types[0]?.validate?.("a")).toBe(false);
		expect(types[1]?.validate?.("a")).toBe(true);
	});
	it("labels an unregistered id", () => {
		const types = listPropertyTypes(mtm);
		expect(propertyTypeOf(types, "multitext").name).toBe("Liste");
		expect(propertyTypeOf(types, "list")).toEqual({ type: "list", name: "list (not registered)", icon: "lucide-text", reserved: false });
	});
});
