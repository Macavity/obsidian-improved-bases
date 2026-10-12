// Switches the test vault's theme for theme-compatibility checks: `pnpm vault:theme Cupertino`, `pnpm vault:theme default`.
// Themes live in test-vault/.obsidian/themes/ (versioned); the choice is Obsidian state and not reset by `vault:reset`.
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { ensureVault, evalJs, VAULT_PATH } from "./lib/cli.mjs";

ensureVault();
const installed = readdirSync(join(VAULT_PATH, ".obsidian", "themes"), { withFileTypes: true })
	.filter((d) => d.isDirectory())
	.map((d) => d.name);
const wanted = process.argv[2] ?? "";
const theme = wanted === "" || wanted === "default" ? "" : wanted;
if (theme && !installed.includes(theme)) {
	console.error(`unknown theme "${theme}"; installed: ${installed.join(", ") || "(none)"}`);
	process.exit(1);
}
evalJs(`app.customCss.setTheme(${JSON.stringify(theme)})`);
console.log(`theme: ${theme || "default"} (installed: ${installed.join(", ")})`);
