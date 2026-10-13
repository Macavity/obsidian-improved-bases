import { describe, it, expect } from "vitest";
import type { MenuItem } from "obsidian";
import { itemDom } from "../src/internals/menu";

describe("itemDom", () => {
	it("is null without an HTMLElement", () => {
		expect(itemDom({} as MenuItem)).toBeNull();
		expect(itemDom({ dom: "x" } as unknown as MenuItem)).toBeNull();
		const dom = document.createElement("div");
		expect(itemDom({ dom } as unknown as MenuItem)).toBe(dom);
	});
});
