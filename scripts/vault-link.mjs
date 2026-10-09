// Links (or with --copy: copies) the plugin into a vault's .obsidian/plugins/improved-bases. Idempotent.
// Usage:
//   node scripts/vault-link.mjs --test            -> test-vault in this repo (pnpm vault:link-test)
//   node scripts/vault-link.mjs [vault-name]      -> a vault registered in Obsidian; without a name, pick from a list
//   --copy copies the three plugin files instead of linking
import { copyFileSync, existsSync, lstatSync, mkdirSync, readlinkSync, realpathSync, symlinkSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { REPO, VAULT_PATH, listVaults } from "./lib/cli.mjs";

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const wanted = args.find((a) => !a.startsWith("--"));

async function pickVault() {
	const vaults = listVaults().filter((v) => resolve(v.path) !== resolve(VAULT_PATH));
	if (vaults.length === 0) throw new Error("No vaults registered in Obsidian (besides test-vault).");
	if (wanted) {
		const hits = vaults.filter((v) => v.name === wanted);
		if (hits.length === 1) return hits[0];
		if (hits.length > 1) throw new Error(`Several vaults are named "${wanted}":\n` + hits.map((v) => `  ${v.path}`).join("\n"));
		console.error(`No registered vault named "${wanted}".`);
	}
	if (!process.stdin.isTTY) throw new Error("Pass a vault name: pnpm vault:link <name>");
	console.log("Registered vaults:");
	vaults.forEach((v, i) => console.log(`  ${String(i + 1).padStart(2)}  ${v.name}\t${v.path}`));
	const rl = createInterface({ input: process.stdin, output: process.stdout });
	try {
		const answer = (await rl.question("Link plugin into vault # (empty to abort): ")).trim();
		const idx = Number(answer);
		if (!answer || !Number.isInteger(idx) || idx < 1 || idx > vaults.length) throw new Error("aborted");
		return vaults[idx - 1];
	} finally {
		rl.close();
	}
}

function install(vaultPath, label) {
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
		return;
	}
	let st = null;
	try {
		st = lstatSync(target);
	} catch {}
	if (st) {
		if (st.isSymbolicLink() && realpathSync(target) === realpathSync(REPO)) {
			console.log(`link ok: ${target} -> ${readlinkSync(target)}`);
			return;
		}
		throw new Error(`${target} exists and is not the expected link; remove it manually.`);
	}
	if (process.platform === "win32") symlinkSync(resolve(REPO), target, "junction");
	else symlinkSync(relative(pluginsDir, resolve(REPO)), target);
	console.log(`linked ${target} -> ${readlinkSync(target)}`);
	if (label) console.log(`Enable "Improved Bases" under Settings → Community plugins in "${label}" (or: obsidian vault="${label}" plugin:enable id=improved-bases).`);
}

try {
	if (flags.has("--test")) install(VAULT_PATH, null);
	else {
		const v = await pickVault();
		install(v.path, v.name);
	}
} catch (e) {
	console.error(e instanceof Error ? e.message : String(e));
	process.exit(1);
}
