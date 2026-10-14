import { afterEach, describe, expect, it, vi } from "vitest";
import { openOptionEditor, type OptionEditorHandlers } from "../src/widgets/OptionEditor";
import { OverlayRegistry } from "../src/widgets/types";

const setup = () => {
	const fns = {
		rename: vi.fn((_to: string) => Promise.resolve(true)),
		recolor: vi.fn((_color: string) => Promise.resolve(true)),
		remove: vi.fn(() => Promise.resolve(true)),
	};
	const handlers: OptionEditorHandlers = fns;
	const overlays = new OverlayRegistry();
	const editor = openOptionEditor(document.body.createDiv(), { value: "Alpha", color: "red" }, handlers, overlays);
	const root = () => document.body.querySelector<HTMLElement>(".improved-bases-option-editor");
	const input = () => root()?.querySelector("input") as HTMLInputElement;
	const key = (k: string) => {
		const e = new KeyboardEvent("keydown", { key: k, cancelable: true, bubbles: true });
		input().dispatchEvent(e);
		return e;
	};
	return { handlers: fns, editor, root, input, key };
};

afterEach(() => {
	document.body.empty();
});

describe("openOptionEditor", () => {
	it("opens at body with the name selected and the current color active", () => {
		const { root, input } = setup();
		expect(root()?.parentElement).toBe(document.body);
		expect(input().value).toBe("Alpha");
		expect(document.activeElement).toBe(input());
		expect(root()?.querySelector(".is-active")?.getAttribute("data-color")).toBe("red");
		expect(root()?.querySelectorAll("[data-color]").length).toBe(13);
		expect(root()?.querySelector("[data-icon='lucide-trash-2']")).not.toBeNull();
	});
	it("renames on Enter with the trimmed new name, not when empty or unchanged", () => {
		const { handlers, input, key } = setup();
		key("Enter");
		input().value = "  ";
		key("Enter");
		input().value = " Alpha ";
		key("Enter");
		expect(handlers.rename).not.toHaveBeenCalled();
		input().value = " Omega ";
		const e = key("Enter");
		expect(e.defaultPrevented).toBe(true);
		expect(handlers.rename).toHaveBeenCalledWith("Omega");
	});
	it("renames on blur", () => {
		const { handlers, input } = setup();
		input().value = "Omega";
		input().dispatchEvent(new Event("blur"));
		expect(handlers.rename).toHaveBeenCalledWith("Omega");
	});
	it("saves a typed name when dismissed by an outside mousedown", () => {
		const { handlers, root, input } = setup();
		input().value = "Omega";
		document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
		expect(handlers.rename).toHaveBeenCalledWith("Omega");
		expect(root()).toBeNull();
	});
	it("ignores further saves while a rename is pending", async () => {
		const { handlers, input, key } = setup();
		let done: (ok: boolean) => void = () => undefined;
		handlers.rename.mockReturnValueOnce(new Promise<boolean>((r) => (done = r)));
		input().value = "Omega";
		key("Enter");
		key("Enter");
		input().dispatchEvent(new Event("blur"));
		expect(handlers.rename).toHaveBeenCalledTimes(1);
		expect(input().disabled).toBe(true);
		done(false);
		await vi.waitFor(() => expect(input().disabled).toBe(false));
	});
	it("Escape cancels, closes only the editor and stops propagation", () => {
		const { handlers, root, input, key } = setup();
		const outer = vi.fn();
		document.body.addEventListener("keydown", outer);
		input().value = "Omega";
		key("Escape");
		expect(handlers.rename).not.toHaveBeenCalled();
		expect(root()).toBeNull();
		expect(outer).not.toHaveBeenCalled();
		document.body.removeEventListener("keydown", outer);
	});
	it("leaves Enter and Escape to an IME composition", () => {
		const { handlers, input, root } = setup();
		input().value = "Beta";
		for (const key of ["Enter", "Escape"]) input().dispatchEvent(new KeyboardEvent("keydown", { key, isComposing: true, bubbles: true }));
		expect(handlers.rename).not.toHaveBeenCalled();
		expect(root()).not.toBeNull();
	});
	it("ignores other keys", () => {
		const { input, key } = setup();
		expect(key("a").defaultPrevented).toBe(false);
		expect(input().isConnected).toBe(true);
	});
	it("moves the active ring to the new color once the recolor succeeds, keeps it on failure", async () => {
		const { handlers, root } = setup();
		const active = () => root()?.querySelector(".is-active")?.getAttribute("data-color");
		root()?.querySelector<HTMLElement>("[data-color='blue']")?.click();
		await Promise.resolve();
		expect(active()).toBe("blue");
		handlers.recolor.mockResolvedValueOnce(false);
		root()?.querySelector<HTMLElement>("[data-color='green']")?.click();
		await Promise.resolve();
		expect(active()).toBe("blue");
	});
	it("recolors on swatch click and removes on Delete", () => {
		const { handlers, root } = setup();
		root()?.querySelector<HTMLElement>("[data-color='blue']")?.click();
		expect(handlers.recolor).toHaveBeenCalledWith("blue");
		root()?.querySelector<HTMLElement>(".improved-bases-option-editor-delete")?.click();
		expect(handlers.remove).toHaveBeenCalled();
	});
	it("keeps the focus on mousedown of buttons", () => {
		const { root } = setup();
		const e = new MouseEvent("mousedown", { cancelable: true, bubbles: true });
		root()?.querySelector(".improved-bases-option-editor-delete")?.dispatchEvent(e);
		expect(e.defaultPrevented).toBe(true);
	});
	it("closes on outside mousedown and via the overlay registry, idempotently", () => {
		const a = setup();
		a.root()?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
		expect(a.root()).not.toBeNull();
		document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
		expect(a.root()).toBeNull();
		a.editor.close();
		const b = setup();
		b.editor.close();
		expect(b.root()).toBeNull();
	});
});
