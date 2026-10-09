---
title: Tooling
description: Build, lint, unit tests, the versioned test vault, and the Obsidian-CLI driven smoke and perf scripts.
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
- **Lint** ([scripts/lint-wrapper.mjs](../../scripts/lint-wrapper.mjs)): runs `check-disable-comments.mjs` first (every `eslint-disable` needs a description, mimicking the Obsidian review bot), then ESLint with `eslint-plugin-obsidianmd` ([eslint.config.mjs](../../eslint.config.mjs)).
- **Unit tests** ([vitest.config.ts](../../vitest.config.ts)): vitest + happy-dom; the `obsidian` import is aliased to [test/__mocks__/obsidian.ts](../../test/__mocks__/obsidian.ts). Sixteen test files in `test/` plus `setup.ts` (polyfills for the Obsidian DOM helpers) cover the parser, registry, writer, membership, `BaseQuery` (with injected `mount`/`cli`), the patch, value helpers, the schema draft model, schema settings, the toolbar button, settings, menu internals and the smoke tooling itself. `pnpm check` = typecheck + lint + test.
- **Test vault** (`test-vault/`): versioned fixtures (`Teams.base`, `Mitarbeiter.base`, `Departments.base`, `Meetings.base`, `Kaputt.base` for an invalid schema, `Verwaist.base` for a missing target, `Notizen/Embed.md` embedding `Mitarbeiter.base`). `pnpm vault:link` symlinks the repo into `.obsidian/plugins/improved-bases`; `pnpm vault:reset` restores it to `HEAD`.
- **Obsidian CLI wrapper** ([scripts/lib/cli.mjs](../../scripts/lib/cli.mjs)): `obs(cmd, args)` always passes `vault=test-vault`, times out after 30 s with a hint about hidden windows, and `ensureVault()` aborts unless that vault is registered at the repo path. `evalJs()` runs JavaScript inside Obsidian.
- **Smoke** ([scripts/smoke.mjs](../../scripts/smoke.mjs)): resets, builds, reloads, then drives the live plugin: `base:query` sanity, waits for `membership.ready`, watches `Teams.base` through `plugin.query.watch`, archives a team and expects the result to shrink, plus widget checks and a "Schema settings" section (toolbar button in the tab and in the embed, command, adding a relation field, rename with property migration).
- **Perf** ([scripts/perf.mjs](../../scripts/perf.mjs)): creates 2000 notes and 10 schema bases under `test-vault/_perf/` from inside Obsidian, measures time to `membership.ready` and first table render, fails above 3 s, then resets. Results and caveats (hidden-window throttling) are in the [README](../../README.md#performance) and [SPIKE_FINDINGS](../../SPIKE_FINDINGS.md).
- **Package hygiene**: `scripts/npm-proxy.mjs` redirects `npm install` to pnpm; [pnpm-workspace.yaml](../../pnpm-workspace.yaml) pins transitive overrides for advisories; `version-bump.mjs` syncs `manifest.json` and `versions.json`.

## Public API / entry points

| Script | Purpose |
|---|---|
| `pnpm build` / `pnpm dev` | production / watch build |
| `pnpm lint`, `pnpm lint:fix` | ESLint + disable-comment check |
| `pnpm test`, `pnpm check` | vitest; typecheck + lint + test |
| `pnpm vault:link`, `vault:open`, `vault:reset`, `reload` | test-vault lifecycle |
| `pnpm smoke`, `pnpm perf` | integration checks against the live app |

## Key files

- [package.json](../../package.json), [esbuild.config.mjs](../../esbuild.config.mjs), [vitest.config.ts](../../vitest.config.ts), [eslint.config.mjs](../../eslint.config.mjs)
- [scripts/lib/cli.mjs](../../scripts/lib/cli.mjs), [scripts/smoke.mjs](../../scripts/smoke.mjs), [scripts/perf.mjs](../../scripts/perf.mjs), [scripts/probe.mjs](../../scripts/probe.mjs)
- [test/__mocks__/obsidian.ts](../../test/__mocks__/obsidian.ts)

## Dependencies

- Node LTS, pnpm (pinned via `packageManager`), the Obsidian CLI for smoke/perf, esbuild, vitest, happy-dom, typescript-eslint, eslint-plugin-obsidianmd.

## Participates in

- [Run tests and smoke checks](../guides/run-tests-and-smoke.md)

## Related

- [Plugin core](./plugin-core.md) (the public fields the scripts poke)
- [Query](./query.md) (what the smoke test exercises)
