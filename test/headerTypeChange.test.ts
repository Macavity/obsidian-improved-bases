import { describe, it, expect, vi } from "vitest";
import { installHeaderTypeChange } from "../src/internals/headerTypeChange";

function setup(entry = false) {
	document.body.innerHTML = "";
	const row = document.body.createDiv({ cls: "bases-thead" }).createDiv({ cls: "bases-tr" });
	row.createDiv({ cls: "bases-td mod-implicit", text: "File" });
	row.createDiv({ cls: "bases-td", text: "Lead", attr: { id: "lead" } });
	document.body.createDiv({ cls: "menu", attr: { id: "menu" } });
	document.body.createDiv({ attr: { id: "outside" } });
	const original = vi.fn();
	const mtm = { registeredTypeWidgets: {}, getTypeInfo: vi.fn(), trigger: vi.fn(), setType: original } as never;
	const open = vi.fn();
	const hook = installHeaderTypeChange(document, mtm, {
		resolve: () => ({ basePath: "Departments.base", viewName: "Table" }),
		pluginTypes: () => new Set(["select", "relation"]),
		hasBaseEntry: () => entry,
		open,
	})!;
	const rightClick = (id: string) => document.getElementById(id)!.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
	return { mtm: mtm as { setType: (n: string, t: string) => unknown }, original, open, hook, rightClick };
}

describe("header type change", () => {
	it("opens the dialog for select/relation chosen from a header", () => {
		const s = setup();
		s.rightClick("lead");
		s.mtm.setType("Lead", "select");
		expect(s.original).toHaveBeenCalledWith("Lead", "select");
		expect(s.open).toHaveBeenCalledWith({ basePath: "Departments.base", viewName: "Table" }, { name: "Lead", type: "select" });
		s.hook.uninstall();
	});
	it("opens for a native type only when the base has its own entry", () => {
		const a = setup(false);
		a.rightClick("lead");
		a.mtm.setType("Lead", "text");
		expect(a.open).not.toHaveBeenCalled();
		a.hook.uninstall();
		const b = setup(true);
		b.rightClick("lead");
		b.mtm.setType("Lead", "text");
		expect(b.open).toHaveBeenCalledOnce();
		b.hook.uninstall();
	});
	it("forgets the header on the next input outside a menu, or after one setType", () => {
		const s = setup();
		document.getElementById("menu")!.remove(); // native menu: no .menu in the DOM
		s.rightClick("lead");
		document.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
		s.mtm.setType("Lead", "select");
		s.rightClick("lead");
		document.getElementById("outside")!.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
		s.mtm.setType("Lead", "select");
		s.rightClick("lead");
		s.mtm.setType("Lead", "text");
		s.mtm.setType("Lead", "select");
		expect(s.open).not.toHaveBeenCalled();
		s.hook.uninstall();
	});
	it("ignores the file-name column and keeps the menu click alive", () => {
		const s = setup();
		document.querySelector(".mod-implicit")!.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
		expect(s.hook.pending()).toBeNull();
		s.rightClick("lead");
		document.getElementById("menu")!.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
		expect(s.hook.pending()).not.toBeNull();
		document.getElementById("menu")!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
		expect(s.hook.pending()).not.toBeNull(); // keyboard navigation inside an open DOM menu
		s.hook.uninstall();
	});
	it("still calls the original when open throws, and restores setType on uninstall", () => {
		const s = setup();
		s.open.mockImplementation(() => {
			throw new Error("x");
		});
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		s.rightClick("lead");
		s.mtm.setType("Lead", "select");
		expect(s.original).toHaveBeenCalled();
		expect(error).toHaveBeenCalled();
		error.mockRestore();
		s.hook.uninstall();
		expect(s.mtm.setType).toBe(s.original);
	});
	it("returns the original result and stops listening after uninstall", () => {
		const s = setup();
		s.original.mockReturnValue("saved");
		expect(s.mtm.setType("Lead", "text")).toBe("saved");
		s.hook.uninstall();
		s.rightClick("lead");
		expect(s.hook.pending()).toBeNull();
	});
	it("returns null without setType", () => {
		const mtm = { registeredTypeWidgets: {}, getTypeInfo: vi.fn(), trigger: vi.fn() } as never;
		const hook = installHeaderTypeChange(document, mtm, { resolve: () => null, pluginTypes: () => new Set(), hasBaseEntry: () => false, open: vi.fn() });
		expect(hook).toBeNull();
	});
});
