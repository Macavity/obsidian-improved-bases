import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** UI text must come from `src/i18n`; these patterns catch a literal handed straight to the DOM or a notice. */
const PATTERNS = [
	/\b(text|placeholder|title): "[^"]*[A-Za-z]{2}[^"]*"/,
	/"aria-label": "[^"]*[A-Za-z]{2}[^"]*"/,
	/new Notice\("/,
	/\.(setButtonText|setTitle|setPlaceholder|setName|setDesc|setText)\("[^"]*[A-Za-z]{2}/,
	/emptyStateText = "/,
];

function files(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		return statSync(path).isDirectory() ? files(path) : path.endsWith(".ts") ? [path] : [];
	});
}

describe("UI strings", () => {
	it("come from the i18n module, not from literals", () => {
		const hits: string[] = [];
		for (const file of files("src").filter((f) => !f.includes(`${join("src", "i18n")}`))) {
			readFileSync(file, "utf8").split("\n").forEach((line, i) => {
				if (PATTERNS.some((p) => p.test(line))) hits.push(`${file}:${i + 1}: ${line.trim()}`);
			});
		}
		expect(hits).toEqual([]);
	});
});
