import { describe, it, expect } from "vitest";
import { conflictText, renderConflictMarker } from "../src/widgets/conflictMarker";
import type { Resolution } from "../src/schema/Membership";

const relation = { type: "relation" as const, base: "Teams.base", multiple: true };
const text = { type: "text" as const };

describe("conflictText", () => {
	it("explains a context winner and a path-rule winner", () => {
		const inContext: Resolution = { field: relation, basePath: "Mitarbeiter.base", name: "Team", others: [{ basePath: "Meetings.base", field: text }] };
		expect(conflictText("Team", inContext, "Mitarbeiter.base")).toBe(
			"Team is defined in 2 bases. Showing Mitarbeiter.base (relation); Meetings.base defines it as text.",
		);
		const byPath: Resolution = { field: text, basePath: "Meetings.base", name: "TEAM", others: [{ basePath: "Mitarbeiter.base", field: relation }] };
		expect(conflictText("Team", byPath, null)).toBe(
			"Team is defined in 2 bases. Using Meetings.base (text, first by path); Mitarbeiter.base defines it as relation.",
		);
	});
	it("lists more than two bases", () => {
		const r: Resolution = { field: relation, basePath: "A.base", name: "Team", others: [{ basePath: "B.base", field: text }, { basePath: "C.base", field: { type: "select", multiple: false, options: [] } }] };
		expect(conflictText("Team", r, "A.base")).toBe("Team is defined in 3 bases. Showing A.base (relation); B.base defines it as text, C.base defines it as select.");
	});
});

describe("renderConflictMarker", () => {
	it("renders an info icon with the explanation as label and tooltip", () => {
		const el = document.body.createDiv();
		const r: Resolution = { field: relation, basePath: "A.base", name: "Team", others: [{ basePath: "B.base", field: text }] };
		renderConflictMarker(el, r, "Team", "A.base");
		const marker = el.querySelector<HTMLElement>(".improved-bases-conflict");
		expect(marker?.getAttribute("aria-label")).toContain("A.base");
		expect(marker?.getAttribute("data-icon")).toBe("info");
		expect(el.classList.contains("improved-bases-has-conflict")).toBe(true);
	});
});
