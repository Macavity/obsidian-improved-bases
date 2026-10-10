import { describe, it, expect, vi, beforeEach } from "vitest";
import type { App } from "obsidian";
import { SchemaSettingsModal, type SchemaSettingsInput } from "../src/commands/SchemaSettingsModal";
import type { FieldDraft } from "../src/commands/schemaDraft";
import { OverlayRegistry } from "../src/widgets/types";

const d = (p: Partial<FieldDraft>): FieldDraft => ({ originalName: null, originalBase: null, name: "X", type: "text", multiple: false, options: [], ...p });
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

function open(state: SchemaSettingsInput["state"], opts: Partial<SchemaSettingsInput> = {}) {
	const onSave = vi.fn(() => Promise.resolve());
	const onReset = vi.fn(() => Promise.resolve());
	const input: SchemaSettingsInput = {
		basePath: "Teams/Mitarbeiter.base",
		state,
		propertyNames: ["Role"],
		basePaths: ["Teams.base"],
		overlays: new OverlayRegistry(),
		membersKnown: () => true,
		...opts,
	};
	const modal = new SchemaSettingsModal({} as App, input, { onSave, onReset });
	modal.open();
	const el = modal.contentEl;
	const q = <T extends Element>(sel: string): T => {
		const found = el.querySelector<T>(sel);
		if (!found) throw new Error(`missing ${sel}`);
		return found;
	};
	const error = () => q(".improved-bases-form-error").textContent;
	return { modal, el, q, onSave, onReset, error };
}

beforeEach(() => {
	document.body.innerHTML = "";
});

describe("SchemaSettingsModal", () => {
	it("summarises fields and expands a row into the editor", () => {
		const { modal, el, q } = open({
			kind: "fields",
			drafts: [
				d({ name: "Lead", type: "relation", base: "Teams.base", multiple: true }),
				d({ name: "Status", type: "select", multiple: true, options: [{ value: "A", color: "red" }] }),
				d({ name: " ", type: "text" }),
			],
		});
		expect(modal.titleEl.textContent).toBe("Schema settings – Mitarbeiter");
		const rows = Array.from(el.querySelectorAll(".improved-bases-field-summary-text")).map((r) => r.textContent);
		expect(rows).toEqual(["Lead · relation · Teams.base · multiple", "Status · select · 1 options · multiple", "Unnamed field · text"]);
		expect(el.querySelector(".improved-bases-field-editor")).toBeNull();
		q<HTMLElement>(".improved-bases-field-summary").click();
		expect(q(".improved-bases-field-base").textContent).toBe("Teams.base");
		expect(el.querySelector(".improved-bases-field-multiple")).not.toBeNull();
		q<HTMLElement>(".improved-bases-field-summary").click();
		expect(el.querySelector(".improved-bases-field-editor")).toBeNull();
	});

	it("re-renders the body when the type changes and keeps options", () => {
		const { el, q } = open({ kind: "fields", drafts: [d({ name: "S", type: "select", options: [{ value: "A", color: "red" }] })] });
		q<HTMLElement>(".improved-bases-field-summary").click();
		expect(el.querySelectorAll(".improved-bases-pill")).toHaveLength(1);
		const type = q<HTMLSelectElement>(".improved-bases-field-type");
		type.value = "text";
		type.dispatchEvent(new Event("change"));
		expect(el.querySelector(".improved-bases-pill")).toBeNull();
		expect(el.querySelector(".improved-bases-field-multiple")).toBeNull();
		type.value = "relation";
		type.dispatchEvent(new Event("change"));
		expect(q(".improved-bases-field-base").textContent).toBe("Choose base");
		type.value = "select";
		type.dispatchEvent(new Event("change"));
		expect(el.querySelectorAll(".improved-bases-pill")).toHaveLength(1);
	});

	it("edits options: add, rename, remove, and toggles multiple", () => {
		const { el, q } = open({ kind: "fields", drafts: [d({ name: "S", type: "select", options: [{ value: "A", color: "red" }] })] });
		q<HTMLElement>(".improved-bases-field-summary").click();
		const input = q<HTMLInputElement>(".improved-bases-option-new");
		input.value = " B ";
		input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
		expect(Array.from(el.querySelectorAll(".improved-bases-pill")).map((p) => p.textContent)).toEqual(["A", "B"]);
		q<HTMLElement>(".improved-bases-option-edit").click();
		const rename = q<HTMLInputElement>(".improved-bases-option-input");
		rename.value = "AA";
		rename.dispatchEvent(new Event("blur"));
		expect(Array.from(el.querySelectorAll(".improved-bases-pill")).map((p) => p.textContent)).toEqual(["AA", "B"]);
		q<HTMLElement>(".improved-bases-option-remove").click();
		expect(Array.from(el.querySelectorAll(".improved-bases-pill")).map((p) => p.textContent)).toEqual(["B"]);
		q<HTMLElement>(".improved-bases-field-multiple").click();
		expect(q(".improved-bases-field-summary-text").textContent).toBe("S · select · 1 options · multiple");
	});

	it("adds and removes fields", () => {
		const { el, q } = open({ kind: "fields", drafts: [d({ name: "A" })] });
		q<HTMLElement>(".improved-bases-add-field").click();
		expect(el.querySelectorAll(".improved-bases-field-row")).toHaveLength(2);
		const name = q<HTMLInputElement>(".improved-bases-field-name");
		name.value = "B";
		name.dispatchEvent(new Event("input"));
		expect(Array.from(el.querySelectorAll(".improved-bases-field-summary-text")).map((r) => r.textContent)).toEqual(["A · text", "B · text"]);
		q<HTMLElement>(".improved-bases-field-remove").click();
		expect(el.querySelectorAll(".improved-bases-field-row")).toHaveLength(1);
	});

	it("shows validation errors and refuses renames while members are unknown", async () => {
		const { q, onSave, error } = open({ kind: "fields", drafts: [d({ originalName: "A", name: "A" }), d({ name: "" })] }, { membersKnown: () => false });
		q<HTMLElement>(".improved-bases-save").click();
		await tick();
		expect(error()).toBe("Field name is empty");
		expect(onSave).not.toHaveBeenCalled();
		q<HTMLElement>(".improved-bases-field-row:nth-child(2) .improved-bases-field-remove").click();
		q<HTMLElement>(".improved-bases-field-summary").click();
		const name = q<HTMLInputElement>(".improved-bases-field-name");
		name.value = " B ";
		name.dispatchEvent(new Event("input"));
		q<HTMLElement>(".improved-bases-save").click();
		await tick();
		expect(error()).toMatch(/still loading/);
		expect(onSave).not.toHaveBeenCalled();
	});

	it("saves trimmed drafts and closes, or shows the handler error", async () => {
		const { modal, q, onSave, error } = open({ kind: "fields", drafts: [d({ originalName: "A", name: "A" })] });
		q<HTMLElement>(".improved-bases-field-summary").click();
		const name = q<HTMLInputElement>(".improved-bases-field-name");
		name.value = " B ";
		name.dispatchEvent(new Event("input"));
		onSave.mockRejectedValueOnce(new Error("disk full"));
		q<HTMLElement>(".improved-bases-save").click();
		await tick();
		expect(onSave).toHaveBeenCalledWith([expect.objectContaining({ originalName: "A", name: "B" })]);
		expect(error()).toBe("disk full");
		expect(q<HTMLButtonElement>(".improved-bases-save").disabled).toBe(false);
		expect(document.body.contains(modal.modalEl)).toBe(true);
		q<HTMLElement>(".improved-bases-save").click();
		await tick();
		expect(document.body.contains(modal.modalEl)).toBe(false);
	});

	it("resets a broken schema after confirmation", async () => {
		const { modal, q, onReset, error } = open({ kind: "error", message: "bad yaml" });
		expect(q(".improved-bases-schema-error").textContent).toBe("bad yaml");
		const reset = q<HTMLButtonElement>(".improved-bases-reset");
		reset.click();
		expect(reset.textContent).toBe("Confirm reset");
		expect(onReset).not.toHaveBeenCalled();
		onReset.mockRejectedValueOnce(new Error("locked"));
		reset.click();
		await tick();
		expect(error()).toBe("locked");
		reset.click();
		await tick();
		expect(onReset).toHaveBeenCalledTimes(2);
		expect(document.body.contains(modal.modalEl)).toBe(false);
	});
});
