// Restores this checkout's test-vault/ to HEAD, removes untracked files and, from a worktree, mirrors the result into the
// registered vault (the main checkout's test-vault). Obsidian's local state (plugins/, themes/, workspace*.json, cache, .trash)
// stays; a running Obsidian is switched back to the default theme.
import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { evalJs, FIXTURES, REPO, VAULT_PATH } from "./lib/cli.mjs";
import { syncVault } from "./lib/vault-sync.mjs";

const git = (...a) => execFileSync("git", a, { cwd: REPO, stdio: "inherit" });
git("restore", "--source=HEAD", "--staged", "--worktree", "--", "test-vault");
git("clean", "-fdq", "--", "test-vault");
if (realpathSync(VAULT_PATH) === realpathSync(FIXTURES)) {
	console.log("test-vault reset");
} else {
	syncVault(FIXTURES, VAULT_PATH);
	console.log(`test-vault reset and mirrored into ${VAULT_PATH}`);
}
try {
	evalJs("app.customCss.setTheme('')");
} catch {
	// Obsidian not running; appearance.json is restored by git anyway.
}
