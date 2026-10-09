// Links (or with --copy: copies) the plugin into a vault's .obsidian/plugins/improved-bases. Idempotent.
// Usage: node scripts/vault-link.mjs [vault-name] [--copy] [--list]
//   no name  -> test-vault in this repo
//   name     -> a vault registered in Obsidian (see --list)
import { copyFileSync, existsSync, lstatSync, mkdirSync, readlinkSync, realpathSync, symlinkSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { REPO, VAULT_PATH, listVaults } from "./lib/cli.mjs";

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const name = args.find((a) => !a.startsWith("--"));

if (flags.has("--list")) {
	for (const v of listVaults()) console.log(`${v.name}\t${v.path}`);
	process.exit(0);
}

let vaultPath = VAULT_PATH;
if (name) {
	const hits = listVaults().filter((v) => v.name === name);
	if (hits.length === 0) {
		console.error(`No registered vault named "${name}". Known vaults:\n` + listVaults().map((v) => `  ${v.name}`).join("\n"));
		process.exit(1);
	}
	if (hits.length > 1) {
		console.error(`Several vaults are named "${name}":\n` + hits.map((v) => `  ${v.path}`).join("\n"));
		process.exit(1);
	}
	vaultPath = hits[0].path;
}

const pluginsDir = join(vaultPath, ".obsidian", "plugins");
const target = join(pluginsDir, "improved-bases");
mkdirSync(pluginsDir, { recursive: true });

if (flags.has("--copy")) {
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
	else symlinkSync(relative(pluginsDir, resolve(REPO)), target);
	console.log(`linked ${target} -> ${readlinkSync(target)}`);
	if (name) console.log(`Enable "Improved Bases" under Settings → Community plugins in "${name}" (or: obsidian vault="${name}" plugin:enable id=improved-bases).`);
}
