import { describe, it, expect, vi } from "vitest";
import type { Menu, MenuItem } from "obsidian";
import { itemDom, menuInternals } from "../src/internals/menu";

const asMenu = (o: object) => o as unknown as Menu;

describe("menu internals detection", () => {
	it("returns null when dom is missing", () => {
		expect(menuInternals(asMenu({ scope: { register: () => ({}), keys: [] } }))).toBeNull();
	});
	it("returns null when scope.keys is missing", () => {
		expect(menuInternals(asMenu({ dom: document.createElement("div"), scope: { register: () => ({}) } }))).toBeNull();
	});
	it("returns null when scope.register is missing", () => {
		expect(menuInternals(asMenu({ dom: document.createElement("div"), scope: { keys: [] } }))).toBeNull();
	});
	it("returns null when scope is missing", () => {
		expect(menuInternals(asMenu({ dom: document.createElement("div") }))).toBeNull();
	});
	it("moves the Enter handler to the front", () => {
		const keys: unknown[] = ["a"];
		const handler = { id: 1 };
		const scope = { keys, register: vi.fn(() => (keys.push(handler), handler)) };
		const m = menuInternals(asMenu({ dom: document.createElement("div"), scope }));
		expect(m).not.toBeNull();
		m!.onEnter(() => {});
		expect(keys[0]).toBe(handler);
	});
	it("itemDom is null without an HTMLElement", () => {
		expect(itemDom({} as MenuItem)).toBeNull();
		expect(itemDom({ dom: "x" } as unknown as MenuItem)).toBeNull();
		const dom = document.createElement("div");
		expect(itemDom({ dom } as unknown as MenuItem)).toBe(dom);
	});
});
