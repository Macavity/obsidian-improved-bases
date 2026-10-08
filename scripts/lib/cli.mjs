// Obsidian CLI wrapper. Every call targets vault="test-vault"; nothing else is allowed.
import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const VAULT = "test-vault";
export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const VAULT_PATH = join(REPO, "test-vault");

function run(args) {
	return execFileSync("obsidian", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

/** Runs `obsidian vault="test-vault" <cmd> key=value ...`. Throws if the output starts with "Error:". */
export function obs(cmd, args = {}) {
	const argv = [`vault=${VAULT}`, cmd];
	for (const [k, v] of Object.entries(args)) argv.push(v === true ? k : `${k}=${v}`);
	const out = run(argv);
	if (out.trimStart().startsWith("Error:")) throw new Error(`obsidian ${cmd}: ${out.trim()}`);
	return out;
}

export function evalJs(code) {
	return obs("eval", { code }).trim().replace(/^=> /, ""); // eval prints "=> <result>"
}

export function assert(cond, msg) {
	if (!cond) throw new Error(`Assertion failed: ${msg}`);
}

export async function waitFor(fn, timeoutMs = 10000, intervalMs = 250) {
	const end = Date.now() + timeoutMs;
	let last;
	while (Date.now() < end) {
		try {
			last = await fn();
			if (last) return last;
		} catch (e) {
			last = e;
		}
		await new Promise((r) => setTimeout(r, intervalMs));
	}
	throw new Error(`waitFor timed out after ${timeoutMs}ms (last: ${last instanceof Error ? last.message : last})`);
}

/** Aborts unless exactly one registered vault is named "test-vault" and it points to <repo>/test-vault. */
export function ensureVault() {
	const rows = run(["vaults", "verbose"])
		.split("\n")
		.map((l) => l.split("\t"))
		.filter((c) => c.length >= 2);
	const hits = rows.filter(([name]) => name === VAULT);
	const hint = "Run `pnpm vault:link`, then `pnpm vault:open` and confirm the dialog in Obsidian.";
	if (hits.length === 0) throw new Error(`Vault "${VAULT}" is not registered. ${hint}`);
	if (hits.length > 1) throw new Error(`Several vaults are named "${VAULT}"; refusing to run.`);
	const real = (p) => {
		try {
			return realpathSync(p);
		} catch {
			return resolve(p);
		}
	};
	if (real(hits[0][1]) !== real(VAULT_PATH)) {
		throw new Error(`Vault "${VAULT}" points to ${hits[0][1]}, expected ${VAULT_PATH}. Refusing to run.`);
	}
}
