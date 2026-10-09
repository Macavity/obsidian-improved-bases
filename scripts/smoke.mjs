import { execSync } from "node:child_process";
import { parse as parseYaml } from "yaml";
import { obs, evalJs, assert, ensureVault, waitFor } from "./lib/cli.mjs";

ensureVault();
const teams = obs("base:query", { path: "Teams.base", format: "paths" }).trim().split("\n");
assert(teams.length === 4 && !teams.some((p) => p.includes("Omega")), `Teams.base: ${teams}`);
await waitFor(() => evalJs("!!app.plugins.plugins['improved-bases']") === "true", 15000);

// BaseQuery: collector-backed watch on Teams.base, live updates, rename → [] → refilled.
const SMOKE = "window.__ibSmoke";
const hostCount = () => Number(evalJs("document.querySelectorAll('.improved-bases-collector-host').length"));
await waitFor(() => evalJs("app.plugins.plugins['improved-bases'].membership.ready") === "true", 30000);
const hostsBefore = hostCount();
evalJs(
	`(() => { const q = app.plugins.plugins['improved-bases'].query; ${SMOKE}?.off?.(); ` +
		`${SMOKE} = { files: null }; ${SMOKE}.off = q.watch('Teams.base', (f) => (${SMOKE}.files = f.map((x) => x.path))); return 'ok'; })()`,
);
const teamCount = () => Number(evalJs(`${SMOKE}.files === null ? -1 : ${SMOKE}.files.length`));
try {
	// Initial result (CLI first scan, then collector) must arrive quickly.
	await waitFor(() => teamCount() === 4, 4500);
	assert(evalJs(`${SMOKE}.files.some((p) => p.includes('Omega'))`) === "false", "BaseQuery: Omega must be filtered");
	obs("property:set", { path: "Teams/Team Beta.md", name: "status", value: "archived" });
	await waitFor(() => teamCount() === 3, 10000);
	obs("rename", { path: "Teams.base", name: "Teams-renamed" });
	await waitFor(() => teamCount() === 0, 10000);
	obs("rename", { path: "Teams-renamed.base", name: "Teams" });
	await waitFor(() => teamCount() === 3, 10000);
	obs("property:set", { path: "Teams/Team Beta.md", name: "status", value: "active" });
	await waitFor(() => teamCount() === 4, 10000);
	const hidden = evalJs(
		"(() => { const s = [...document.styleSheets].flatMap((x) => { try { return [...x.cssRules]; } catch { return []; } }); " +
			"return s.some((r) => r.selectorText?.includes('svg.improved-bases-collector')); })()",
	);
	assert(hidden === "true", "collector view-selector rule missing from styles");
	console.log("BaseQuery ok");
} finally {
	evalJs(`(() => { ${SMOKE}?.off?.(); delete ${SMOKE}; return 'ok'; })()`);
}
assert(hostCount() === hostsBefore, "collector host leaked after unwatch");

// SchemaRegistry + Membership.
const PLUGIN = "app.plugins.plugins['improved-bases']";
await waitFor(() => evalJs(`${PLUGIN}.membership.ready`) === "true", 30000);
const resolveType = (p, f) => evalJs(`${PLUGIN}.membership.resolve(${JSON.stringify(p)}, ${JSON.stringify(f)})?.type ?? null`);
assert(resolveType("Mitarbeiter/Ada Albers.md", "team") === "relation", "resolve Ada/team");
assert(resolveType("Meetings/Weekly Alpha.md", "Team") === "text", "resolve Meeting/Team");
assert(resolveType("Notizen/Lose Notiz.md", "Team") === "null", "resolve Lose Notiz/Team");
await waitFor(() => resolveType("Mitarbeiter/Cora Conrad.md", "team") === "text", 1500); // conflict: Meetings.base < Mitarbeiter.base, first by path wins
assert(evalJs(`${PLUGIN}.registry.errors().has('Kaputt.base')`) === "true", "Kaputt.base must be reported");
evalJs(
	"(async () => { const f = app.vault.getAbstractFileByPath('Kaputt.base'); " +
		"await app.vault.modify(f, 'improved-bases: 5\\nviews: []\\n'); return 'ok'; })()",
);
await waitFor(() => evalJs("[...document.querySelectorAll('.notice')].filter((n) => n.textContent.includes('Kaputt.base')).length") === "1", 5000);
console.log("Registry/Membership ok");

// getTypeInfo patch: table/panel dispatch per file, full uninstall on disable.
const OPEN = (path) =>
	`const leaf = app.workspace.getLeaf(false); await leaf.openFile(app.vault.getAbstractFileByPath(${JSON.stringify(path)})); ` +
	"app.workspace.setActiveLeaf(leaf, { focus: true }); await new Promise((r) => setTimeout(r, 1500)); const el = leaf.view.containerEl;";
const inspect = (path, expr) => JSON.parse(evalJs(`(async () => { ${OPEN(path)} return JSON.stringify(${expr}); })()`));
const TEAM_CELLS = `[...el.querySelectorAll('.bases-td[data-property="note.team" i]')]`;
const cells = (path) =>
	inspect(path, `${TEAM_CELLS}.map((c) => ({ plugin: !!c.querySelector('[data-improved-bases="relation"]'), native: !!c.querySelector('.metadata-property-value, .multi-select-container, input, [contenteditable]') }))`);
const panelTeam = (path) =>
	inspect(path, `(() => { const p = el.querySelector('.metadata-property[data-property-key="Team" i]'); return p ? { plugin: !!p.querySelector('[data-improved-bases]'), value: !!p.querySelector('.metadata-property-value') } : null; })()`);
await waitFor(() => cells("Mitarbeiter.base").filter((c) => c.plugin).length >= 3, 10000);
const meet = cells("Meetings.base");
assert(meet.length > 0 && meet.every((c) => !c.plugin && c.native), `Meetings.base Team cells must be native: ${JSON.stringify(meet)}`);
const ada = panelTeam("Mitarbeiter/Ada Albers.md");
assert(ada?.plugin, `panel Ada/Team must use plugin widget: ${JSON.stringify(ada)}`);
const lose = panelTeam("Notizen/Lose Notiz.md");
assert(lose && !lose.plugin && lose.value, `panel Lose Notiz/Team must be native: ${JSON.stringify(lose)}`);
const MARKED = "document.querySelectorAll('[data-improved-bases]').length";
try {
	cells("Mitarbeiter.base");
	evalJs("(async () => { await app.plugins.disablePlugin('improved-bases'); return 'ok'; })()");
	await waitFor(() => evalJs(MARKED) === "0", 5000);
	const restored = evalJs("(() => { const m = app.metadataTypeManager; return !Object.hasOwn(m, 'getTypeInfo') || m.getTypeInfo === Object.getPrototypeOf(m).getTypeInfo; })()");
	assert(restored === "true", "getTypeInfo not restored after disable");
	execSync("git diff --exit-code --quiet -- test-vault/.obsidian/types.json 'test-vault/Mitarbeiter/Hugo Hahn.md'", { stdio: "inherit" });
} finally {
	evalJs("(async () => { await app.plugins.enablePlugin('improved-bases'); return 'ok'; })()");
}
const enabledAt = Date.now();
await waitFor(() => evalJs(`!!${PLUGIN}?.membership?.ready`) === "true", 30000);
console.log(`membership.ready after enable: ${Date.now() - enabledAt} ms`);
await waitFor(() => cells("Mitarbeiter.base").some((c) => c.plugin), 10000);
console.log("TypeInfoPatch ok");

// RelationWidget: picker, write format, remove, rename, panel parity, hover, foreign/mismatch markers.
// Console warnings can precede the result line in `eval` output; the result is the last line.
const run = (path, body) => {
	const out = evalJs(`(async () => { ${OPEN(path)} const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); ${body} })()`);
	const i = out.lastIndexOf("=> ");
	return JSON.parse(i < 0 ? out : out.slice(i + 3));
};
const ROW = (name) =>
	`const row = [...el.querySelectorAll('.bases-tr')].find((r) => r.textContent.includes(${JSON.stringify(name)})); ` +
	`const cell = row.querySelector('.bases-td[data-property="note.team" i]');`;
const teamOf = (name) => obs("property:read", { path: `Mitarbeiter/${name}.md`, name: "Team" }).trim().split("\n").map((l) => l.trim());
const picker = run("Mitarbeiter.base",
	`for (let i = 0; i < 3; i++) { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(100); } ` +
		`${ROW("Ada Albers")} cell.querySelector('.improved-bases-add').click(); await sleep(600); ` +
		`const items = [...document.querySelectorAll('.suggestion-item')].map((i) => i.textContent); ` +
		`[...document.querySelectorAll('.suggestion-item')].find((i) => i.textContent === 'Team Delta').click(); await sleep(1500); ` +
		`return JSON.stringify(items);`);
assert(JSON.stringify([...picker].sort()) === JSON.stringify(["Team Alpha", "Team Beta", "Team Delta", "Team Gamma"]), `picker entries: ${picker}`);
await waitFor(() => JSON.stringify(teamOf("Ada Albers")) === JSON.stringify(["[[Team Alpha]]", "[[Team Delta]]"]), 5000);
obs("rename", { path: "Teams/Team Alpha.md", name: "Team Aurora" });
await waitFor(() => teamOf("Ada Albers").includes("[[Team Aurora]]"), 8000);
const panel = run("Mitarbeiter/Ada Albers.md",
	`const p = el.querySelector('.metadata-property[data-property-key="Team" i]'); ` +
		`const a = p.querySelector('.improved-bases-chip .internal-link'); let hov = null; ` +
		`const ref = app.workspace.on('hover-link', (e) => { hov = e.linktext ?? 'x'; }); ` +
		`a.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, metaKey: true, ctrlKey: true })); await sleep(1200); app.workspace.offref(ref); ` +
		`return JSON.stringify({ chips: [...p.querySelectorAll('.improved-bases-chip')].map((c) => c.textContent.replace('×', '')), hov, popover: !!document.querySelector('.popover.hover-popover') });`);
assert(JSON.stringify(panel.chips) === JSON.stringify(["Team Aurora", "Team Delta"]), `panel chips: ${JSON.stringify(panel)}`);
assert(panel.hov === "Team Aurora", `hover-link event: ${JSON.stringify(panel)}`);
console.log(`popover: ${panel.popover} (environment-dependent)`);
run("Mitarbeiter.base",
	`${ROW("Ada Albers")} cell.querySelector('.improved-bases-chip-remove').click(); await sleep(1500); return JSON.stringify(1);`);
await waitFor(() => JSON.stringify(teamOf("Ada Albers")) === JSON.stringify(["[[Team Delta]]"]), 5000);
const marks = run("Mitarbeiter.base",
		`const cellOf = (n) => [...el.querySelectorAll('.bases-tr')].find((r) => r.textContent.includes(n)).querySelector('.bases-td[data-property="note.team" i]'); ` +
		`return JSON.stringify({ foreign: !!cellOf('Gina Graf').querySelector('.is-foreign'), okChip: !cellOf('Cora Conrad').querySelector('.is-foreign'), mismatch: !!cellOf('Hugo Hahn').querySelector('.is-mismatch') });`);
assert(marks.foreign && marks.okChip && marks.mismatch, `foreign/mismatch markers: ${JSON.stringify(marks)}`);
console.log("RelationWidget ok");

const sortKeys = (v) => Array.isArray(v) ? v.map(sortKeys) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v;
// SelectWidget: schema colors, create option, recolor, base diff limited to the schema block, unknown value grey.
const ESC = "for (let i = 0; i < 3; i++) { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(100); } ";
const RROW = (name) =>
	`const row = [...el.querySelectorAll('.bases-tr')].find((r) => r.textContent.includes(${JSON.stringify(name)})); ` +
	`const rcell = row.querySelector('.bases-td[data-property="note.role" i]');`;
const colors = run("Mitarbeiter.base",
	`const c = (n) => [...el.querySelectorAll('.bases-tr')].find((r) => r.textContent.includes(n)).querySelector('.bases-td[data-property="note.role" i] .improved-bases-pill')?.dataset.color ?? null; ` +
		`return JSON.stringify({ ada: c('Ada Albers'), ben: c('Ben Brandt'), wizard: c('Hugo Hahn') ?? c('Gina Graf') });`);
assert(colors.ada === "blue" && colors.ben === "pink", `select colors: ${JSON.stringify(colors)}`);
const unknown = run("Mitarbeiter.base",
	`const out = [...el.querySelectorAll('.bases-td[data-property="note.role" i] .improved-bases-pill')].filter((p) => p.textContent.includes('Wizard') || p.textContent.includes('Manager')).map((p) => p.dataset.color); return JSON.stringify(out);`);
assert(unknown.length === 2 && unknown.every((c) => c === "grey"), `unknown options must be grey: ${JSON.stringify(unknown)}`);
const created = run("Mitarbeiter.base",
	`${ESC} ${RROW("Ada Albers")} rcell.querySelector('.improved-bases-add').click(); await sleep(600); ` +
		`const input = document.querySelector('.improved-bases-menu-search input'); const items = [...document.querySelectorAll('.menu-item.improved-bases-menu-item')].map((i) => i.textContent); ` +
		`input.value = 'Tester'; input.dispatchEvent(new Event('input')); input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await sleep(2000); ` +
		`return JSON.stringify({ items, pill: rcell.querySelector('.improved-bases-pill')?.dataset.color });`);
assert(created.items.includes("Developer") && created.items.includes("Product Owner"), `option menu: ${JSON.stringify(created)}`);
await waitFor(() => obs("property:read", { path: "Mitarbeiter/Ada Albers.md", name: "Role" }).trim() === "Tester", 5000);
const baseSrc = () => evalJs("(async () => await app.vault.read(app.vault.getAbstractFileByPath('Mitarbeiter.base')))()");
await waitFor(() => /Tester: grey/.test(baseSrc()), 5000);
run("Mitarbeiter.base",
	`${ESC} ${RROW("Ada Albers")} rcell.querySelector('.improved-bases-pill').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 50, clientY: 50 })); await sleep(600); ` +
		`[...document.querySelectorAll('.menu-item.improved-bases-menu-item')].find((i) => i.textContent === 'Green').click(); await sleep(1500); return JSON.stringify(1);`);
await waitFor(() => /Tester: green/.test(baseSrc()), 5000);
// Obsidian re-serializes an open .base itself, so compare parsed content: only the Role options may differ from git.
const headBase = parseYaml(execSync("git show HEAD:test-vault/Mitarbeiter.base", { encoding: "utf8" }));
const nowBase = parseYaml(baseSrc().replace(/^=> /, ""));
const roleOptions = (doc) => doc["improved-bases"].fields.Role.options;
assert(roleOptions(nowBase).Tester === "green", "Tester option missing");
delete roleOptions(nowBase).Tester;
assert(JSON.stringify(headBase) === JSON.stringify(nowBase) || JSON.stringify(sortKeys(headBase)) === JSON.stringify(sortKeys(nowBase)), "Mitarbeiter.base changed outside the Tester option");
const panelRole = run("Mitarbeiter/Ada Albers.md",
	`const p = el.querySelector('.metadata-property[data-property-key="Role" i]'); const pill = p.querySelector('.improved-bases-pill'); return JSON.stringify({ text: pill?.textContent.replace('×', ''), color: pill?.dataset.color });`);
assert(panelRole.text === "Tester" && panelRole.color === "green", `panel Role pill: ${JSON.stringify(panelRole)}`);
console.log("SelectWidget ok");

// Commands: activate schema base, configure field via modal, panel shows relation widget.
const cmdAvailable = (id) => evalJs(`(() => { const c = app.commands.commands['improved-bases:${id}']; return c.checkCallback(true) === true; })()`) === "true";
const OPEN_ACTIVE = (path) => evalJs(`(async () => { ${OPEN(path)} return 'ok'; })()`);
OPEN_ACTIVE("Mitarbeiter.base");
assert(!cmdAvailable("activate-schema-base"), "activate must be hidden on an existing schema base");
OPEN_ACTIVE("Departments.base");
assert(cmdAvailable("activate-schema-base"), "activate must be offered on Departments.base");
assert(!cmdAvailable("configure-field"), "configure must be hidden before activation");
evalJs("(app.commands.executeCommandById('improved-bases:activate-schema-base'), 'ok')");
const depSrc = () => evalJs("(async () => await app.vault.read(app.vault.getAbstractFileByPath('Departments.base')))()");
await waitFor(() => parseYaml(depSrc().replace(/^=> /, ""))?.["improved-bases"]?.fields !== undefined, 5000);
assert(JSON.stringify(parseYaml(depSrc().replace(/^=> /, ""))["improved-bases"].fields) === "{}", "activate must write an empty fields node");
await waitFor(() => cmdAvailable("configure-field") && !cmdAvailable("activate-schema-base"), 5000);
obs("property:set", { path: "Departments/Engineering.md", name: "Lead", value: "[[Ada Albers]]" });
evalJs("(app.commands.executeCommandById('improved-bases:configure-field'), 'ok')");
await waitFor(() => evalJs("!!document.querySelector('.improved-bases-configure')") === "true", 5000);
const saved = evalJs(
	`(async () => { const m = document.querySelector('.improved-bases-configure'); const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); ` +
		`const name = m.querySelector('.improved-bases-field-name'); name.value = 'Lead'; name.dispatchEvent(new Event('input', { bubbles: true })); ` +
		`const type = m.querySelector('.improved-bases-field-type'); type.value = 'relation'; type.dispatchEvent(new Event('change', { bubbles: true })); await sleep(200); ` +
		`m.querySelector('.improved-bases-field-base').click(); await sleep(500); ` +
		`[...document.querySelectorAll('.suggestion-item')].find((i) => i.textContent === 'Mitarbeiter.base').click(); await sleep(300); ` +
		`[...m.querySelectorAll('button')].find((b) => b.textContent === 'Save').click(); await sleep(1500); return 'ok'; })()`,
);
assert(saved === "ok", "configure modal drive failed");
await waitFor(() => parseYaml(depSrc().replace(/^=> /, ""))?.["improved-bases"]?.fields?.Lead?.type === "relation", 5000);
const lead = parseYaml(depSrc().replace(/^=> /, ""))["improved-bases"].fields.Lead;
assert(lead.base === "Mitarbeiter.base" && lead.multiple === false, `Lead field: ${JSON.stringify(lead)}`);
await waitFor(() => run("Departments/Engineering.md", `return JSON.stringify(!!el.querySelector('.metadata-property[data-property-key="Lead" i] [data-improved-bases="relation"]'));`) === true, 10000);
console.log("Commands ok");

// Error table: orphaned target base hints in the picker; Kaputt.base did not break the others (checked above).
OPEN_ACTIVE("Verwaist.base");
await waitFor(() => cells("Verwaist.base").some((c) => c.plugin), 10000);
run("Verwaist.base",
	`${ESC} document.querySelectorAll('.notice').forEach((n) => n.remove()); const cell = [...el.querySelectorAll('.bases-td[data-property="note.team" i]')][0]; ` +
		`cell.querySelector('.improved-bases-add').click(); await sleep(800); return JSON.stringify(1);`);
await waitFor(() => evalJs("[...document.querySelectorAll('.notice')].some((n) => n.textContent.includes('Target base not found'))") === "true", 5000);
run("Verwaist.base", `${ESC} return JSON.stringify(1);`);
await waitFor(() => evalJs("document.querySelectorAll('.modal-container').length") === "0", 5000);
execSync("git diff --exit-code --quiet -- test-vault/Verwaist.base", { stdio: "inherit" });
console.log("Orphaned target ok");

// Non-regression Cards/List (not covered by the plugin, spec 2026-10-08): render without console errors, relation values as links, no plugin DOM.
evalJs(
	"(async () => { const f = app.vault.getAbstractFileByPath('_views.base'); if (f) await app.vault.delete(f); " +
		"await app.vault.create('_views.base', 'filters:\\n  and:\\n    - file.inFolder(\"Mitarbeiter\")\\nviews:\\n  - type: cards\\n    name: Karten\\n    order:\\n      - file.name\\n      - Team\\n      - Role\\n" +
		"  - type: list\\n    name: Liste\\n    order:\\n      - file.name\\n      - Team\\n      - Role\\n'); return 'ok'; })()",
);
const viewCheck = (viewName) =>
	run("_views.base",
		`const errs = []; const orig = console.error; console.error = (...a) => { errs.push(a.map(String).join(' ')); orig.apply(console, a); }; ` +
			`try { document.querySelectorAll('.view-header-title-container, .bases-toolbar-views-menu, .bases-toolbar-views-button'); ` +
			`const btn = el.querySelector('.bases-toolbar-views-menu'); btn?.click(); await sleep(500); ` +
			`const item = [...document.querySelectorAll('.menu-item')].find((i) => i.textContent.trim() === ${JSON.stringify(viewName)}); item?.click(); await sleep(2000); ` +
			`const links = el.querySelectorAll('.internal-link, a[data-href]'); ` +
			`const teamLinks = [...links].filter((a) => /Team /.test(a.textContent)).length; ` +
			`return JSON.stringify({ errs, teamLinks, marked: el.querySelectorAll('[data-improved-bases]').length, rendered: el.querySelectorAll('.bases-cards-item, .bases-list-item, .bases-list-entry, .bases-rendered-value').length }); } ` +
			`finally { console.error = orig; }`);
for (const [name, label] of [["Karten", "cards"], ["Liste", "list"]]) {
	const r = viewCheck(name);
	assert(r.errs.length === 0, `${label}: console errors: ${JSON.stringify(r.errs)}`);
	assert(r.marked === 0, `${label}: plugin DOM present: ${JSON.stringify(r)}`);
	assert(r.rendered > 0, `${label}: nothing rendered: ${JSON.stringify(r)}`);
	assert(r.teamLinks > 0, `${label}: relation values must render as links: ${JSON.stringify(r)}`);
}
console.log("Cards/List ok");

// Settings: toggle off removes all widgets, on restores them; settings persist merged.
OPEN_ACTIVE("Mitarbeiter.base");
await waitFor(() => cells("Mitarbeiter.base").some((c) => c.plugin), 10000);
evalJs(`(${PLUGIN}.settings.widgetsEnabled = false, ${PLUGIN}.applyWidgetsEnabled(), 'ok')`);
await waitFor(() => evalJs(MARKED) === "0", 5000);
assert(evalJs(`${PLUGIN}.typeInfoPatch === null`) === "true", "patch must be gone when widgets are disabled");
evalJs(`(${PLUGIN}.settings.widgetsEnabled = true, ${PLUGIN}.applyWidgetsEnabled(), 'ok')`);
await waitFor(() => cells("Mitarbeiter.base").some((c) => c.plugin), 10000);
console.log("Settings ok");

// Perf (2000 notes, 10 schema bases) is measured separately: `pnpm perf`.
const read = () => obs("property:read", { path: "Mitarbeiter/Ada Albers.md", name: "Role" }).trim();
const before = "Developer"; // fixture value; the select check above changed it to Tester
obs("property:set", { path: "Mitarbeiter/Ada Albers.md", name: "Role", value: "Changed" });
await waitFor(() => read() === "Changed", 5000);
execSync("pnpm vault:reset", { stdio: "inherit" });
await waitFor(() => read() === before, 10000);
console.log("smoke ok");
