---
title: Run tests and smoke checks
description: "How to verify a change: unit tests with the obsidian mock, then the CLI-driven smoke and perf runs against the versioned test vault."
type: guide
tags:
  - wiki
  - guide
---
# Run tests and smoke checks

## Goal

Prove a change works at both levels the project supports: fast unit tests without Obsidian, and integration checks inside a real Obsidian instance on the versioned `test-vault/`.

## Steps

1. **Unit level**: `pnpm check` runs typecheck, lint (including the eslint-disable description check) and vitest. For a single file: `pnpm vitest run test/membership.test.ts`. Tests import `obsidian` through the alias to [test/__mocks__/obsidian.ts](../../test/__mocks__/obsidian.ts); extend the mock if you need a new API surface rather than stubbing per test.
2. **One-time vault setup** (needs the Obsidian CLI): `pnpm vault:link-test` (symlink `test-vault/.obsidian/plugins/improved-bases` → this checkout's `dist/`), `pnpm vault:open`, confirm the vault dialog, disable Restricted mode, enable the plugin.
3. **Iterate**: `pnpm dev` in one terminal, `pnpm reload` after each rebuild.
4. **Smoke**: `pnpm smoke` = `vault:reset` + `vault:link-test` + `build` + `reload` + [scripts/smoke.mjs](../../scripts/smoke.mjs). Keep the test-vault window visible; a hidden window throttles the collector and causes the 30 s CLI timeout.
5. **Perf** (optional, for anything touching startup, membership or queries): `pnpm perf` generates 2000 notes and 10 schema bases, prints `ready` and first-render times, fails above 3 s, and resets the vault.
6. **Themes**: anything touching `styles.css` runs `pnpm themes:smoke` with Obsidian open on the test vault: for the default theme and every theme in [scripts/themes.json](../../scripts/themes.json), light and dark, it measures the select cells of `Mitarbeiter.base` (no taller than the row, pills on one line) and the schema dialog's footer (no background of its own), and writes `<theme>-<mode>-table.png` / `-dialog.png` into `$THEMES_SMOKE_OUT` (default `<tmp>/improved-bases-themes`); look at those. `pnpm themes:smoke Primary` runs one theme. To look manually: `pnpm vault:theme Cupertino`, then `pnpm vault:theme default`. Themes are downloaded into `test-vault/.obsidian/themes/` on first use and never versioned. Use only Obsidian tokens; style plugin elements that must keep their size through plugin classes only, with two classes (`.improved-bases-select .improved-bases-add`) because themes target `.clickable-icon` and `button:not(.clickable-icon)` with that specificity.
7. **Recover** a hung Obsidian: `obsidian vault="test-vault" reload`, then `pnpm vault:reset`.

## Relevant code

- [Tooling module](../modules/tooling.md) for what each script does.
- [scripts/lib/cli.mjs](../../scripts/lib/cli.mjs): every CLI call is pinned to `vault=test-vault`; `ensureVault()` refuses to run against anything else. `VAULT_PATH` is the main checkout's `test-vault` (the one Obsidian registers), `FIXTURES` this checkout's copy; [scripts/lib/vault-sync.mjs](../../scripts/lib/vault-sync.mjs) mirrors the latter into the former.
- [CONTRIBUTING](../../CONTRIBUTING.md) for the human-facing version of these steps.

## Gotchas

- Fixtures in `test-vault/` are versioned; change them only in a commit, because `vault:reset` discards everything else (the symlink and `workspace*.json` are gitignored and survive).
- Git worktrees share the one registered vault: `smoke` and `perf` mirror the worktree's fixtures into it and re-point the plugin symlink, so Obsidian loads whichever checkout ran last. Run `pnpm vault:link-test` in the main checkout to switch back.
- Smoke assertions depend on the fixture content (four teams in `Teams.base`, "Team Omega" filtered out); adjust both together.
- Production builds must stay sourcemap-free ([esbuild.config.mjs](../../esbuild.config.mjs)) for reproducible release verification.

## Related

- [Plugin load and ready](../flows/plugin-load-and-ready.md) (what `membership.ready` means)
- [Base query watch](../flows/base-query-watch.md) (what the smoke watch exercises)
