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
	},
	getTypeInfo: () => { throw new Error("unused"); },
	trigger: () => undefined,
} as unknown as MetadataTypeManager;

describe("typeRegistry", () => {
	it("lists registered widgets with resolved names and icons", () => {
		expect(listPropertyTypes(mtm)).toEqual([
			{ type: "text", name: "Text", icon: "lucide-text", reserved: false },
			{ type: "multitext", name: "Liste", icon: "lucide-list", reserved: false },
			{ type: "tags", name: "Tags", icon: "lucide-tags", reserved: true },
			{ type: "odd", name: "odd", icon: "lucide-text", reserved: false },
			{ type: "throwing", name: "throwing", icon: "lucide-text", reserved: false },
		]);
		expect(listPropertyTypes(null)).toEqual([]);
	});
	it("labels an unregistered id", () => {
		const types = listPropertyTypes(mtm);
		expect(propertyTypeOf(types, "multitext").name).toBe("Liste");
		expect(propertyTypeOf(types, "list")).toEqual({ type: "list", name: "list (not registered)", icon: "lucide-text", reserved: false });
	});
});
