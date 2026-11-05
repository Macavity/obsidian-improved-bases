import { describe, it, expect, vi } from "vitest";
import { TFile, type App } from "obsidian";
import { parseSchema } from "../src/schema/parse";
import { WarningRegistry } from "../src/warnings/WarningRegistry";
import { WarningsModal } from "../src/warnings/WarningsModal";
import { renderWarningRow } from "../src/warnings/render";
import { conflictWarnings, relationWarnings, schemaWarnings } from "../src/warnings/sources";

describe("renderWarningRow", () => {
	it("renders icon, text, base links and a dismiss button for events only", () => {
		const parent = document.body.createDiv();
		const openBase = vi.fn();
		const dismiss = vi.fn();
		const state = renderWarningRow(parent, { id: "s", kind: "state", text: "bad schema", at: 1, bases: ["Teams/People.base"] }, { openBase, dismiss });
		expect(state.querySelector(".improved-bases-warning-icon")?.getAttribute("data-icon")).toBe("lucide-alert-triangle");
		expect(state.querySelector(".improved-bases-warning-text")?.textContent).toBe("bad schema");
		expect(state.querySelector(".improved-bases-warning-dismiss")).toBeNull();
		const link = state.querySelector<HTMLAnchorElement>(".improved-bases-warning-base")!;
		expect(link.textContent).toBe("People");
		expect(link.getAttribute("aria-label")).toBe("Open schema settings of Teams/People.base");
		link.click();
		expect(openBase).toHaveBeenCalledWith("Teams/People.base");
		const event = renderWarningRow(parent, { id: "e", kind: "event", text: "3 failed", at: 2, bases: ["A.base"] }, { dismiss });
		expect(event.querySelector(".improved-bases-warning-icon")?.getAttribute("data-icon")).toBe("lucide-alert-circle");
		expect(event.querySelector(".improved-bases-warning-base")).toBeNull();
		event.querySelector<HTMLButtonElement>(".improved-bases-warning-dismiss")!.click();
		expect(dismiss).toHaveBeenCalledWith("e");
	});
});

describe("WarningsModal", () => {
	it("lists the warnings, follows the registry while open and opens a base's schema settings", () => {
		const r = new WarningRegistry();
		const openBase = vi.fn();
		const modal = new WarningsModal({} as App, r, openBase);
		modal.open();
		expect(modal.contentEl.querySelector(".improved-bases-warnings-empty")?.textContent).toBe("No warnings");
		r.report("schema:A.base", { text: "A is broken", bases: ["A.base"] });
		const id = r.push({ text: "2 failed", bases: ["B.base"] });
		const rows = () => Array.from(modal.contentEl.querySelectorAll<HTMLElement>(".improved-bases-warning")).map((e) => e.dataset.warningId);
		expect(rows()).toEqual([id, "schema:A.base"]);
		modal.contentEl.querySelector<HTMLButtonElement>(".improved-bases-warning-dismiss")!.click();
		expect(r.count).toBe(1);
		expect(rows()).toEqual(["schema:A.base"]);
		modal.contentEl.querySelector<HTMLAnchorElement>(".improved-bases-warning-base")!.click();
		expect(openBase).toHaveBeenCalledWith("A.base");
		expect(document.body.contains(modal.modalEl)).toBe(false);
		r.resolve("schema:A.base");
		expect(modal.contentEl.querySelectorAll(".improved-bases-warning")).toHaveLength(0);
	});
});

describe("warning sources", () => {
	it("maps schema errors and conflicts to entries", () => {
		expect(schemaWarnings(new Map([["A.base", ["x", "y"]]]))).toEqual([{ id: "A.base", text: "A.base: x; y", bases: ["A.base"] }]);
		expect(conflictWarnings([{ name: "Team", bases: ["A.base", "B.base"], files: 2 }])).toEqual([
			{ id: "Team\0A.base\0B.base", text: '"Team" is defined in A.base, B.base; 2 notes are in all of them', bases: ["A.base", "B.base"] },
		]);
	});
});

describe("relationWarnings", () => {
	const schema = (basePath: string, fields: Record<string, unknown>) => parseSchema(basePath, { "improved-bases": { fields } }).schema!;
	const app = (bases: Record<string, string>) =>
		({
			vault: {
				getAbstractFileByPath: (p: string) => (p in bases ? Object.assign(new TFile(), { path: p, extension: "base" }) : null),
				cachedRead: (f: TFile) => Promise.resolve(bases[f.path] ?? ""),
			},
		}) as unknown as App;
	it("reports a missing target base and a missing view, nothing for a valid target", async () => {
		const schemas = [
			schema("A.base", { Team: { type: "relation", base: "Teams.base" }, Lead: { type: "relation", base: "People.base", view: "Leads" }, Gone: { type: "relation", base: "Nowhere.base" } }),
			schema("B.base", { Boss: { type: "relation", base: "People.base", view: "Bosses" } }),
		];
		const out = await relationWarnings(app({ "Teams.base": "views: []", "People.base": "views:\n  - type: table\n    name: Leads\n" }), schemas);
		expect(out).toEqual([
			{ id: "A.base:gone", text: "Target base not found: Nowhere.base", bases: ["A.base"] },
			{ id: "B.base:boss", text: 'View "Bosses" not found in People.base', bases: ["B.base"] },
		]);
	});
});
