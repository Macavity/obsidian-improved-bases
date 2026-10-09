import { describe, it, expect } from "vitest";
import { baseFence } from "../src/query/CollectorView";

describe("baseFence", () => {
	it("uses three backticks for plain YAML", () => {
		expect(baseFence("a: 1\n")).toBe("```base\na: 1\n```\n");
	});
	it("lengthens the fence beyond backtick runs in the YAML", () => {
		const out = baseFence("filter: \"```x```\"\n");
		expect(out.startsWith("````base\n")).toBe(true);
		expect(out.endsWith("\n````\n")).toBe(true);
		expect(baseFence("a: `````\n").startsWith("``````base\n")).toBe(true);
	});
});
