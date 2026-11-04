import { describe, it, expect } from "vitest";
import { squeezedIcon } from "../scripts/lib/icon-check.mjs";

describe("squeezedIcon", () => {
	it("accepts a square icon of icon size", () => {
		expect(squeezedIcon({ svgWidth: 16, svgHeight: 16 })).toBeNull();
		expect(squeezedIcon({ svgWidth: 15.5, svgHeight: 16 })).toBeNull();
	});
	it("names an icon that a padding rule squeezed narrower than its height", () => {
		expect(squeezedIcon({ svgWidth: 4, svgHeight: 16 })).toBe("icon squeezed (svg 4x16px)");
		expect(squeezedIcon({ svgWidth: 14, svgHeight: 16 })).toBe("icon squeezed (svg 14x16px)");
	});
	it("names an icon that collapsed entirely", () => {
		expect(squeezedIcon({ svgWidth: 0, svgHeight: 0 })).toBe("icon squeezed (svg 0x0px)");
	});
});
