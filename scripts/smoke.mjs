import { execSync } from "node:child_process";
import { obs, evalJs, assert, ensureVault, waitFor } from "./lib/cli.mjs";

ensureVault();
const teams = obs("base:query", { path: "Teams.base", format: "paths" }).trim().split("\n");
assert(teams.length === 4 && !teams.some((p) => p.includes("Omega")), `Teams.base: ${teams}`);
await waitFor(() => evalJs("!!app.plugins.plugins['improved-bases']") === "true", 15000);

// BaseQuery: collector-backed watch on Teams.base, live updates, rename → [] → refilled.
const SMOKE = "window.__ibSmoke";
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
assert(evalJs("document.querySelectorAll('.improved-bases-collector-host').length") === "0", "collector host leaked after unwatch");

const read = () => obs("property:read", { path: "Mitarbeiter/Ada Albers.md", name: "Role" }).trim();
const before = read();
obs("property:set", { path: "Mitarbeiter/Ada Albers.md", name: "Role", value: "Changed" });
assert(read() === "Changed", "property:set had no effect");
execSync("pnpm vault:reset", { stdio: "inherit" });
await waitFor(() => read() === before, 10000);
console.log("smoke ok");
