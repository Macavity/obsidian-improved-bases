import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * A rule left unclosed (a merge artefact, typically) makes Chromium parse every following rule as a nested rule of it,
 * which silently drops them from the cascade. Only at-rules (`@keyframes`, `@media`) may contain blocks.
 */
function nestedRuleLines(css: string): number[] {
	const lines: number[] = [];
	const stack: boolean[] = []; // true = at-rule block, which may contain rules
	let line = 1;
	for (let i = 0; i < css.length; i++) {
		const ch = css[i];
		if (ch === "\n") line++;
		if (css.startsWith("/*", i)) {
			const end = css.indexOf("*/", i + 2);
			line += css.slice(i, end).split("\n").length - 1;
			i = end + 1;
			continue;
		}
		if (ch === "{") {
			const head = css.slice(css.lastIndexOf("}", i) + 1, i).replace(/\/\*[\s\S]*?\*\//g, "").trim();
			const inRule = stack.length > 0 && !stack[stack.length - 1];
			if (inRule) lines.push(line);
			stack.push(head.startsWith("@"));
		} else if (ch === "}") {
			stack.pop();
		}
	}
	return lines;
}

describe("styles.css", () => {
	it("has no rule nested inside a plain rule (an unclosed block)", () => {
		expect(nestedRuleLines(readFileSync("styles.css", "utf8"))).toEqual([]);
	});

	it("detects an unclosed rule", () => {
		expect(nestedRuleLines(".a {\n\tcolor: red;\n.b {\n\tcolor: blue;\n}\n}")).toEqual([3]);
		expect(nestedRuleLines("@keyframes spin {\n\tfrom { x: 0 }\n\tto { x: 1 }\n}\n.a { color: red; }")).toEqual([]);
	});
});
