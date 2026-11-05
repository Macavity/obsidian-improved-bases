import { describe, it, expect } from "vitest";
import { placePopover } from "../src/widgets/placePopover";

const rect = (left: number, top: number, width: number, height: number) =>
	({ left, top, width, height, right: left + width, bottom: top + height }) as DOMRect;
const size = { width: 260, height: 320 };

describe("placePopover", () => {
	it("opens below the anchor when it fits", () => {
		const pos = placePopover(rect(10, 100, 100, 30), { width: 1000, height: 800 }, size);
		expect(pos).toMatchObject({ top: 130, left: 10, width: 260, above: false, docked: false });
	});

	it("flips above when below is too small and above is larger", () => {
		const pos = placePopover(rect(10, 700, 100, 30), { width: 1000, height: 800 }, size);
		expect(pos).toMatchObject({ top: 380, above: true, docked: false });
	});

	it("right-aligns to the anchor with align end and clamps into the viewport", () => {
		expect(placePopover(rect(500, 100, 100, 30), { width: 1000, height: 800 }, { width: 200, height: 100 }, "end").left).toBe(400);
		expect(placePopover(rect(900, 100, 100, 30), { width: 1000, height: 800 }, size).left).toBe(740);
	});

	it("docks to the full viewport width at the bottom when asked to", () => {
		const pos = placePopover(rect(300, 100, 100, 30), { width: 420, height: 800 }, size, "start", true);
		expect(pos).toMatchObject({ left: 0, width: 420, above: false, docked: true });
	});
});
