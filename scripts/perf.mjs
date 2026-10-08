// Performance probe: 2000 notes + 10 schema bases in test-vault/_perf/. Measures time to membership.ready and first table render.
// Everything is removed again via `pnpm vault:reset`. Fails (exit 1) if ready > 3 s.
import { execSync } from "node:child_process";
import { evalJs, ensureVault, waitFor } from "./lib/cli.mjs";

const BASES = 10;
const PER_BASE = 200;
const LIMIT_MS = 3000;
const PLUGIN = "app.plugins.plugins['improved-bases']";

ensureVault();
const teams = ["Team Alpha", "Team Beta", "Team Delta", "Team Gamma"];
const roles = ["Developer", "Designer", "Product Owner"];
let result;
try {
	// Create inside Obsidian: the file watcher is unreliable while the window is hidden.
	const gen =
		`(async () => { const teams = ${JSON.stringify(teams)}; const roles = ${JSON.stringify(roles)}; ` +
		`for (let b = 0; b < ${BASES}; b++) { await app.vault.createFolder('_perf/set-' + b).catch(() => {}); ` +
		`for (let i = 0; i < ${PER_BASE}; i++) await app.vault.create('_perf/set-' + b + '/Note ' + b + '-' + i + '.md', ` +
		"'---\\nTeam:\\n  - \"[[' + teams[i % 4] + ']]\"\\nRole: ' + roles[i % 3] + '\\n---\\nPerf note.\\n'); " +
		`await app.vault.create('_perf/Perf-' + b + '.base', ` +
		"'filters:\\n  and:\\n    - file.inFolder(\"_perf/set-' + b + '\")\\nimproved-bases:\\n  fields:\\n    Team:\\n      type: relation\\n      base: Teams.base\\n      multiple: true\\n    Role:\\n      type: select\\n      multiple: false\\n      options:\\n        Developer: blue\\n        Designer: pink\\n        \"Product Owner\": orange\\nviews:\\n  - type: table\\n    name: Tabelle\\n    order:\\n      - file.name\\n      - Team\\n      - Role\\n'); } return 'ok'; })()";
	evalJs(gen);
	const indexed = () => Number(evalJs("app.vault.getMarkdownFiles().filter((f) => f.path.startsWith('_perf/')).length"));
	await waitFor(() => indexed() === BASES * PER_BASE, 120000, 1000);
	await waitFor(() => Number(evalJs(`${PLUGIN}.registry.schemas().filter((s) => s.basePath.startsWith('_perf/')).length`)) === BASES, 30000);
	await new Promise((r) => setTimeout(r, 3000)); // let Obsidian settle after indexing

	evalJs("(async () => { await app.plugins.disablePlugin('improved-bases'); return 'ok'; })()");
	const t0 = Date.now();
	evalJs("(async () => { await app.plugins.enablePlugin('improved-bases'); return 'ok'; })()");
	await waitFor(() => evalJs(`!!${PLUGIN}?.membership?.ready`) === "true", 60000, 50);
	const ready = Date.now() - t0;

	const t1 = Date.now();
	evalJs(
		"(async () => { const leaf = app.workspace.getLeaf(false); await leaf.openFile(app.vault.getAbstractFileByPath('_perf/Perf-0.base')); " +
			"app.workspace.setActiveLeaf(leaf, { focus: true }); return 'ok'; })()",
	);
	await waitFor(
		() => evalJs("document.querySelectorAll('.bases-td[data-property=\"note.team\" i] [data-improved-bases=\"relation\"]').length") !== "0",
		60000,
		50,
	);
	const render = Date.now() - t1;
	result = { notes: BASES * PER_BASE, bases: BASES, readyMs: ready, tableRenderMs: render };
	console.log(`perf: ${JSON.stringify(result)}`);
} finally {
	execSync("pnpm vault:reset", { stdio: "inherit" });
}
if (result.readyMs > LIMIT_MS) {
	console.error(`PERF LIMIT EXCEEDED: membership.ready ${result.readyMs} ms > ${LIMIT_MS} ms. Inform the user before releasing.`);
	process.exit(1);
}
