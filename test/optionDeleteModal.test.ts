import { describe, it, expect, beforeEach } from "vitest";
import type { App } from "obsidian";
import { confirmOptionDelete } from "../src/widgets/OptionDeleteModal";
import { OverlayRegistry } from "../src/widgets/types";

const app = {} as App;
const button = (text: string): HTMLButtonElement => {
	const b = Array.from(document.body.querySelectorAll("button")).find((x) => x.textContent === text);
	if (!b) throw new Error(`no button ${text}`);
	return b;
};

beforeEach(() => {
	document.body.innerHTML = "";
});

describe("confirmOptionDelete", () => {
	it("shows the count and styles the destructive button", () => {
		void confirmOptionDelete(app, "A", 2, new OverlayRegistry());
		expect(document.body.textContent).toContain('"A" is set in 2 notes of this base.');
		expect(button("Remove from notes").classList.contains("mod-warning")).toBe(true);
	});
	it("uses the singular", () => {
		void confirmOptionDelete(app, "A", 1, new OverlayRegistry());
		expect(document.body.textContent).toContain("1 note of this base");
	});
	it.each([
		["Remove from notes", "notes"],
		["Only remove from schema", "schema"],
		["Cancel", null],
	])("%s resolves %s", async (label, expected) => {
		const p = confirmOptionDelete(app, "A", 2, new OverlayRegistry());
		button(label).click();
		expect(await p).toBe(expected);
		expect(document.body.querySelector("button")).toBeNull();
	});
	it("resolves null when closed from outside, once", async () => {
		const overlays = new OverlayRegistry();
		const p = confirmOptionDelete(app, "A", 2, overlays);
		overlays.closeAll();
		expect(await p).toBeNull();
	});
	it("unregisters from the overlays on close", async () => {
		const overlays = new OverlayRegistry();
		const p = confirmOptionDelete(app, "A", 2, overlays);
		button("Cancel").click();
		await p;
		overlays.closeAll();
		expect(document.body.querySelector("button")).toBeNull();
	});
});
