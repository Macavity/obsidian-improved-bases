// Links (or with --copy: copies) the plugin into test-vault/.obsidian/plugins/improved-bases. Idempotent.
import { copyFileSync, existsSync, lstatSync, mkdirSync, readlinkSync, realpathSync, symlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { REPO, VAULT_PATH } from "./lib/cli.mjs";

const pluginsDir = join(VAULT_PATH, ".obsidian", "plugins");
const target = join(pluginsDir, "improved-bases");
mkdirSync(pluginsDir, { recursive: true });

if (process.argv.includes("--copy")) {
	mkdirSync(target, { recursive: true });
	for (const f of ["manifest.json", "main.js", "styles.css"]) {
		if (existsSync(join(REPO, f))) copyFileSync(join(REPO, f), join(target, f));
		else console.warn(`skipped ${f} (missing, run pnpm build)`);
	}
	console.log(`copied plugin files to ${target}`);
} else {
	let st = null;
	try {
		st = lstatSync(target);
	} catch {}
	if (st) {
		if (st.isSymbolicLink() && realpathSync(target) === realpathSync(REPO)) {
			console.log(`link ok: ${target} -> ${readlinkSync(target)}`);
			process.exit(0);
		}
		console.error(`${target} exists and is not the expected link; remove it manually.`);
		process.exit(1);
	}
	if (process.platform === "win32") symlinkSync(resolve(REPO), target, "junction");
	else symlinkSync(join("..", "..", ".."), target);
	console.log(`linked ${target} -> repo root`);
}
