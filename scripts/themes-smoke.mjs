// Theme compatibility smoke: for the default theme and every theme in scripts/themes.json, in light and dark mode,
// checks the select cells of Mitarbeiter.base and the schema dialog, and saves screenshots. Obsidian must be running
// with the test vault open (`pnpm smoke` first). Output dir: $THEMES_SMOKE_OUT or <tmp>/improved-bases-themes.
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assert, ensureVault, evalJs, obs, waitFor } from "./lib/cli.mjs";
import { activateTheme, ensureTheme, THEMES } from "./lib/themes.mjs";

const OUT = process.env.THEMES_SMOKE_OUT ?? join(tmpdir(), "improved-bases-themes");
const MODES = { light: "moonstone", dark: "obsidian" };
const only = process.argv.slice(2);
const names = only.length ? only : ["default", ...Object.keys(THEMES)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const json = (code) => JSON.parse(evalJs(`JSON.stringify(${code})`));

ensureVault();
mkdirSync(OUT, { recursive: true });
function focusObsidian() {
	try {
		execFileSync("osascript", ["-e", 'tell application "Obsidian" to activate']); // dev:screenshot hangs on a hidden window
	} catch {
		// not macOS or no permission; screenshots may still work
	}
}
function screenshot(path) {
	for (let attempt = 0; ; attempt++) {
		focusObsidian();
		try {
			return obs("dev:screenshot", { path });
		} catch (e) {
			if (attempt >= 1) throw e;
			console.warn(`screenshot ${path} failed once, retrying: ${e.message}`);
		}
	}
}
const originalMode = evalJs("app.vault.getConfig('theme') ?? 'obsidian'");
obs("open", { file: "Mitarbeiter.base" });
await waitFor(() => evalJs("document.querySelectorAll('.bases-td .improved-bases-select').length") !== "0", 15000);

const MEASURE = `(() => {
	const cells = [...document.querySelectorAll('.bases-td .improved-bases-select')].map((root) => {
		const td = root.closest('.bases-td'), r = root.getBoundingClientRect(), t = td.getBoundingClientRect();
		const pills = [...root.querySelectorAll('.improved-bases-pill')].map((p) => p.getBoundingClientRect());
		return { root: r.height, td: t.height, overflow: r.bottom - t.bottom, pills: pills.length,
			wrapped: pills.some((p) => Math.abs(p.top - pills[0].top) > 1 || p.bottom > r.bottom + 1 || p.top < r.top - 1) };
	});
	return { cells, multi: cells.filter((c) => c.pills > 1).length };
})()`;
const FOOTER = `(() => { const f = document.querySelector('.improved-bases-schema-modal .improved-bases-footer');
	return f ? getComputedStyle(f).backgroundColor : null; })()`;

const failures = [];
function check(label, m) {
	assert(m.multi > 0, `${label}: no multi-value select cell rendered`);
	for (const c of m.cells) {
		if (c.overflow > 1) failures.push(`${label}: select ${c.root}px taller than its cell ${c.td}px`);
		if (c.wrapped) failures.push(`${label}: pills wrap or overflow the row`);
	}
}

for (const name of names) {
	const active = name === "default" ? "" : await ensureTheme(name);
	await activateTheme(active);
	for (const [mode, obsidianMode] of Object.entries(MODES)) {
		const label = `${name}/${mode}`;
		evalJs(`app.changeTheme(${JSON.stringify(obsidianMode)})`);
		await sleep(600);
		check(label, json(MEASURE));
		const file = (what) => join(OUT, `${name.replace(/\s+/g, "-")}-${mode}-${what}.png`);
		screenshot(file("table"));
		evalJs("app.commands.executeCommandById('improved-bases:open-schema-settings')");
		await waitFor(() => evalJs(FOOTER) !== "null", 5000);
		const bg = evalJs(FOOTER);
		if (bg !== "rgba(0, 0, 0, 0)") failures.push(`${label}: dialog footer paints its own background (${bg})`);
		screenshot(file("dialog"));
		evalJs("document.querySelector('.improved-bases-footer-buttons .improved-bases-close')?.click()");
		await waitFor(() => evalJs(FOOTER) === "null", 5000);
		console.log(`${failures.some((f) => f.startsWith(label)) ? "FAIL" : "ok  "} ${label}`);
	}
}
await activateTheme("");
evalJs(`app.changeTheme(${JSON.stringify(originalMode)})`);
console.log(`screenshots in ${OUT}`);
if (failures.length) {
	console.error(failures.join("\n"));
	process.exit(1);
}
console.log("themes ok");
