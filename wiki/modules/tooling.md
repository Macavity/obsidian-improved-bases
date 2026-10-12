---
title: Tooling
description: Build, lint, unit tests, fallow code-quality gate, CI workflow, the versioned test vault, and the Obsidian-CLI driven smoke and perf scripts.
type: module
tags:
  - wiki
  - module
---
# Tooling

## Summary

Everything outside `src/` that builds, checks or exercises the plugin. The commands are listed in [package.json](../../package.json) and explained for humans in [CONTRIBUTING](../../CONTRIBUTING.md); this page records what each piece does and where its guardrails are.

## Responsibilities

- **Build** ([esbuild.config.mjs](../../esbuild.config.mjs)): bundles `src/main.ts` to `main.js` at the repo root, CJS, target es2018, `obsidian`/`electron`/CodeMirror/Node builtins external. Production builds (`pnpm build`, after `tsc -noEmit`) ship **no** sourcemap so the output is reproducible for the Obsidian scorecard; `pnpm dev` watches with an inline sourcemap.
- **Lint** ([scripts/lint-wrapper.mjs](../../scripts/lint-wrapper.mjs)): runs [scripts/check-eslint-disables.mjs](../../scripts/check-eslint-disables.mjs) first (every `eslint-disable` needs a description and the rules in `DISALLOWED_RULES` may never be disabled, mimicking the Obsidian review bot; the pure check `findDisableIssues()` lives in [scripts/lib/eslint-disables.mjs](../../scripts/lib/eslint-disables.mjs) and is unit-tested), then [scripts/check-css-classes.mjs](../../scripts/check-css-classes.mjs) (dead CSS: every class selector in `styles.css` must appear in a string literal under `src/`, except the Obsidian-rendered classes listed with a reason in `OBSIDIAN_CLASSES`; stale allowlist entries fail too; the pure check `checkCssClasses()` lives in [scripts/lib/css-classes.mjs](../../scripts/lib/css-classes.mjs) and the unit test also runs it against the repository), then ESLint with `eslint-plugin-obsidianmd` ([eslint.config.mjs](../../eslint.config.mjs)).
- **Code quality** ([.fallowrc.json](../../.fallowrc.json)): [fallow](https://fallow.tools) (pinned devDependency) reports dead code, duplication and complexity. `pnpm quality` runs the full analysis, `pnpm quality:audit` only the changed files against `main` (gate `new-only`). The config declares `scripts/*.mjs`, `esbuild.config.mjs` and `version-bump.mjs` as entry points, allowlists Obsidian overrides (`FuzzySuggestModal`, `PluginSettingTab`) via `usedClassMembers`, relaxes `maxCrap` for `scripts/**` because the CLI scripts need a live Obsidian, and turns the `css-dead-surface` rule off: fallow credits CSS classes only from markup files (`.tsx`, `.html`, `.md`), never from `.ts`, so it flagged every class the plugin sets through Obsidian's `cls:` option; the stricter check in `scripts/check-css-classes.mjs` replaces it. The same audit runs on every PR in [.github/workflows/ci.yml](../../.github/workflows/ci.yml) (`fallow-rs/fallow@v3`, sticky PR comment) and as a Claude Code `PreToolUse` gate ([.claude/hooks/fallow-gate.sh](../../.claude/hooks/fallow-gate.sh), blocks `git commit`/`git push` on `fail`).
- **CI** ([.github/workflows/ci.yml](../../.github/workflows/ci.yml)): on pull requests and pushes to `main`, job `check` runs typecheck, lint, tests and the production build; job `fallow` runs the audit (PR) or the full analysis with health score (`main`). [release.yml](../../.github/workflows/release.yml) builds and attaches release assets on tags.
- **Unit tests** ([vitest.config.ts](../../vitest.config.ts)): vitest + happy-dom; the `obsidian` import is aliased to [test/__mocks__/obsidian.ts](../../test/__mocks__/obsidian.ts). Twenty-four test files in `test/` plus `setup.ts` (loads `domPolyfills.ts`, stand-ins for the Obsidian DOM helpers) cover the parser, registry, writer, membership, `BaseQuery` (with injected `mount`/`cli`), the patch, value helpers, the schema draft model, schema settings, the toolbar button, settings, menu internals, the eslint-disable check, the vault mirror and the manifest. `pnpm test` also writes Istanbul coverage to `coverage/` (`vitest.config.ts`), which fallow reads through `health.coverage` for exact CRAP scores: an untested function is fixed with a test, not a threshold override (overrides need the user's approval, see `CLAUDE.md`). `pnpm check` = typecheck + lint + test + quality.
- **Test vault** (`test-vault/`): versioned fixtures (`Teams.base`, `Mitarbeiter.base`, `Departments.base`, `Meetings.base`, `Kaputt.base` for an invalid schema, `Verwaist.base` for a missing target, `Notizen/Embed.md` embedding `Mitarbeiter.base`). Obsidian registers only one vault of that name, the main checkout's; `pnpm vault:link-test` symlinks `.obsidian/plugins/improved-bases` there to the current checkout (replacing a link to another worktree), `pnpm vault:reset` restores this checkout's fixtures to `HEAD` and, from a worktree, mirrors them into the registered vault via [scripts/lib/vault-sync.mjs](../../scripts/lib/vault-sync.mjs) (`syncVault()` keeps the plugin dir, `workspace*.json`, cache and `.trash`). `IMPROVED_BASES_TEST_VAULT` overrides the vault location. Third-party themes for compatibility checks live versioned in `test-vault/.obsidian/themes/` (currently Cupertino); `vault:reset` would delete an unversioned one. `Mitarbeiter.base` pins the Role column to 133px so the select's narrow-column behaviour is visible.
- **Obsidian CLI wrapper** ([scripts/lib/cli.mjs](../../scripts/lib/cli.mjs)): `obs(cmd, args)` always passes `vault=test-vault`, times out after 30 s with a hint about hidden windows, and `ensureVault()` aborts unless that vault is registered at the repo path. `evalJs()` runs JavaScript inside Obsidian.
- **Smoke** ([scripts/smoke.mjs](../../scripts/smoke.mjs)): resets, builds, reloads, then drives the live plugin: `base:query` sanity, waits for `membership.ready`, watches `Teams.base` through `plugin.query.watch`, archives a team and expects the result to shrink, plus widget checks (relation: field click opens the picker, active entries first with checked boxes, entry icons from the `icon` property of `Teams/Team Delta.md`, toggling keeps the picker open and writes immediately) and a "Schema settings" section (toolbar button in the tab and in the embed, command, adding a relation field, rename with property migration).
- **Perf** ([scripts/perf.mjs](../../scripts/perf.mjs)): creates 2000 notes and 10 schema bases under `test-vault/_perf/` from inside Obsidian, measures time to `membership.ready` and first table render, fails above 3 s, then resets. Results and caveats (hidden-window throttling) are in the [README](../../README.md#performance) and [SPIKE_FINDINGS](../../SPIKE_FINDINGS.md).
- **Package hygiene**: `scripts/npm-proxy.mjs` redirects `npm install` to pnpm; [pnpm-workspace.yaml](../../pnpm-workspace.yaml) pins transitive overrides for advisories; `version-bump.mjs` syncs `manifest.json` and `versions.json`.

## Public API / entry points

| Script | Purpose |
|---|---|
| `pnpm build` / `pnpm dev` | production / watch build |
| `pnpm lint`, `pnpm lint:fix` | ESLint + eslint-disable check |
| `pnpm quality`, `pnpm quality:audit` | fallow: whole repo; changed files vs `main` |
| `pnpm test`, `pnpm check` | vitest; typecheck + lint + test + quality |
| `pnpm vault:link`, `vault:open`, `vault:reset`, `vault:theme <name|default>`, `reload` | test-vault lifecycle; `vault:theme` switches the vault's theme via `app.customCss.setTheme()` |
| `pnpm smoke`, `pnpm perf` | integration checks against the live app |

## Key files

- [package.json](../../package.json), [esbuild.config.mjs](../../esbuild.config.mjs), [vitest.config.ts](../../vitest.config.ts), [eslint.config.mjs](../../eslint.config.mjs)
- [scripts/lib/cli.mjs](../../scripts/lib/cli.mjs), [scripts/lib/vault-sync.mjs](../../scripts/lib/vault-sync.mjs), [scripts/vault-reset.mjs](../../scripts/vault-reset.mjs), [scripts/vault-link.mjs](../../scripts/vault-link.mjs), [scripts/smoke.mjs](../../scripts/smoke.mjs), [scripts/perf.mjs](../../scripts/perf.mjs), [scripts/probe.mjs](../../scripts/probe.mjs)
- [test/__mocks__/obsidian.ts](../../test/__mocks__/obsidian.ts)

## Dependencies

- Node LTS, pnpm (pinned via `packageManager`), the Obsidian CLI for smoke/perf, esbuild, vitest, happy-dom, typescript-eslint, eslint-plugin-obsidianmd, fallow (plus `jq` for the commit gate).

## Participates in

- [Run tests and smoke checks](../guides/run-tests-and-smoke.md)

## Related

- [Plugin core](./plugin-core.md) (the public fields the scripts poke)
- [Query](./query.md) (what the smoke test exercises)
