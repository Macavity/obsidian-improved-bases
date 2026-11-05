import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * A rule left unclosed (a merge artefact, typically) makes Chromium parse every following rule as a nested rule of it,
 * which silently drops them from the cascade. Only at-rules (`@keyframes`, `@media`) may contain blocks.
 */
/** Replaces every comment with spaces (newlines kept), so delimiters inside comments cannot be mistaken for syntax. */
function maskComments(css: string): string {
	let out = "";
	for (let i = 0; i < css.length; ) {
		const open = css.indexOf("/*", i);
		if (open < 0) return out + css.slice(i);
		const close = css.indexOf("*/", open + 2);
		if (close < 0) throw new Error(`unterminated comment at line ${out.split("\n").length + css.slice(i, open).split("\n").length - 1}`);
		out += css.slice(i, open) + css.slice(open, close + 2).replace(/[^\n]/g, " ");
		i = close + 2;
	}
	return out;
}

function nestedRuleLines(raw: string): number[] {
	const css = maskComments(raw);
	const lines: number[] = [];
	const stack: boolean[] = []; // true = at-rule block, which may contain rules
	let line = 1;
	for (let i = 0; i < css.length; i++) {
		const ch = css[i];
		if (ch === "\n") line++;
		if (ch === "{") {
			const start = Math.max(css.lastIndexOf("}", i), css.lastIndexOf("{", i - 1), css.lastIndexOf(";", i));
			const head = css.slice(start + 1, i).trim();
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
		expect(nestedRuleLines("@media (max-width: 1px) {\n\t.a {\n\t\tcolor: red;\n\t.b { color: blue; }\n}\n}")).toEqual([4]);
		expect(nestedRuleLines("@media (max-width: 1px) {\n\t.a { color: red; }\n\t.b { color: blue; }\n}")).toEqual([]);
		expect(() => nestedRuleLines(".a { /* open")).toThrow(/unterminated/);
		expect(nestedRuleLines("/* ; */\n@media (max-width: 1px) { .a { color: red; } }")).toEqual([]);
		expect(nestedRuleLines(".a {\n\tcolor: red; /* } */\n.b { color: blue; }\n}")).toEqual([3]);
	});
});
