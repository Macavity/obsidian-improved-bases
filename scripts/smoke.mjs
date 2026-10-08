import { execSync } from "node:child_process";
import { obs, evalJs, assert, ensureVault, waitFor } from "./lib/cli.mjs";

ensureVault();
const teams = obs("base:query", { path: "Teams.base", format: "paths" }).trim().split("\n");
assert(teams.length === 4 && !teams.some((p) => p.includes("Omega")), `Teams.base: ${teams}`);
assert(evalJs("!!app.plugins.plugins['improved-bases']") === "true", "plugin not loaded");

const read = () => obs("property:read", { path: "Mitarbeiter/Ada Albers.md", name: "Role" }).trim();
const before = read();
obs("property:set", { path: "Mitarbeiter/Ada Albers.md", name: "Role", value: "Changed" });
assert(read() === "Changed", "property:set had no effect");
execSync("pnpm vault:reset", { stdio: "inherit" });
await waitFor(() => read() === before, 10000);
console.log("smoke ok");
