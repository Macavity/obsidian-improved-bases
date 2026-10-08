// Restores test-vault/ to HEAD and removes untracked files. Ignored files (plugins/, workspace*.json) stay.
import { execFileSync } from "node:child_process";
import { REPO } from "./lib/cli.mjs";

const git = (...a) => execFileSync("git", a, { cwd: REPO, stdio: "inherit" });
git("restore", "--source=HEAD", "--staged", "--worktree", "--", "test-vault");
git("clean", "-fdq", "--", "test-vault");
console.log("test-vault reset");
