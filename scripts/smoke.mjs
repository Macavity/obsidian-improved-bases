import { execSync } from "node:child_process";
import { obs, evalJs, assert, ensureVault, waitFor } from "./lib/cli.mjs";

ensureVault();
const teams = obs("base:query", { path: "Teams.base", format: "paths" }).trim().split("\n");
assert(teams.length === 4 && !teams.some((p) => p.includes("Omega")), `Teams.base: ${teams}`);
await waitFor(() => evalJs("!!app.plugins.plugins['improved-bases']") === "true", 15000);

// BaseQuery: collector-backed watch on Teams.base, live updates, rename → [] → refilled.
const SMOKE = "window.__ibSmoke";
const hostCount = () => Number(evalJs("document.querySelectorAll('.improved-bases-collector-host').length"));
await waitFor(() => evalJs("app.plugins.plugins['improved-bases'].membership.ready") === "true", 15000);
const hostsBefore = hostCount();
evalJs(
	`(() => { const q = app.plugins.plugins['improved-bases'].query; ${SMOKE}?.off?.(); ` +
		`${SMOKE} = { files: null }; ${SMOKE}.off = q.watch('Teams.base', (f) => (${SMOKE}.files = f.map((x) => x.path))); return 'ok'; })()`,
);
const teamCount = () => Number(evalJs(`${SMOKE}.files === null ? -1 : ${SMOKE}.files.length`));
try {
	// < 5 s: result must come from the collector, not from the CLI fallback.
	await waitFor(() => teamCount() === 4, 4500);
	assert(evalJs(`${SMOKE}.files.some((p) => p.includes('Omega'))`) === "false", "BaseQuery: Omega must be filtered");
	obs("property:set", { path: "Teams/Team Beta.md", name: "status", value: "archived" });
	await waitFor(() => teamCount() === 3, 10000);
	obs("rename", { path: "Teams.base", name: "Teams-renamed" });
	await waitFor(() => teamCount() === 0, 10000);
	obs("rename", { path: "Teams-renamed.base", name: "Teams" });
	await waitFor(() => teamCount() === 3, 10000);
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
await waitFor(() => evalJs(`${PLUGIN}.membership.ready`) === "true", 15000);
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
} finally {
	evalJs("(async () => { await app.plugins.enablePlugin('improved-bases'); return 'ok'; })()");
}
await waitFor(() => evalJs(`!!${PLUGIN}?.membership?.ready`) === "true", 15000);
await waitFor(() => cells("Mitarbeiter.base").some((c) => c.plugin), 10000);
console.log("TypeInfoPatch ok");

const read = () => obs("property:read", { path: "Mitarbeiter/Ada Albers.md", name: "Role" }).trim();
const before = read();
obs("property:set", { path: "Mitarbeiter/Ada Albers.md", name: "Role", value: "Changed" });
assert(read() === "Changed", "property:set had no effect");
execSync("pnpm vault:reset", { stdio: "inherit" });
await waitFor(() => read() === before, 10000);
console.log("smoke ok");
