---
title: Wiki Log
description: Append-only audit trail of wiki generation and refresh runs.
---

# Wiki Log

Append-only audit trail. Add one dated entry per generation or refresh run, recording the profile, the `source_commit` it was anchored to, and the coverage. The codebase-wiki skill describes the entry shape.

## 2026-10-09: generate

- Profile: internal/standard
- source_commit: 92843cd
- Coverage: all of `src/` (schema, query, internals, widgets, commands, main, settings), `styles.css`, build/test tooling. Excluded: `node_modules/`, `main.js`, lockfile, `.ok/`, fixtures content.
- Pages: [Overview](./OVERVIEW.md), [Layers](./architecture/layers.md), [Obsidian internals](./architecture/obsidian-internals.md), [Plugin core](./modules/plugin-core.md), [Schema](./modules/schema.md), [Query](./modules/query.md), [Internals](./modules/internals.md), [Widgets](./modules/widgets.md), [Commands](./modules/commands.md), [Tooling](./modules/tooling.md), [Plugin load and ready](./flows/plugin-load-and-ready.md), [Widget render](./flows/widget-render.md), [Schema edit](./flows/schema-edit.md), [Base query watch](./flows/base-query-watch.md), [Schema base](./concepts/schema-base.md), [Field schema](./concepts/field-schema.md), [Membership](./concepts/membership.md), [Hull widget](./concepts/hull-widget.md), [Collector view](./concepts/collector-view.md), [Value mismatch](./concepts/value-mismatch.md), [Add a field type](./guides/add-a-field-type.md), [Run tests and smoke checks](./guides/run-tests-and-smoke.md)
- Audit: 23 documents, no broken links, no wiki orphans.

## 2026-10-09: refresh

- Profile: internal/standard
- source_commit: f31ff83 (was 92843cd)
- Coverage: shape-based hull `validate` and cache key, relation picker without target base, `BasePicker` and multi-base Configure field, exact-match Enter, rename refresh, settings merge, shared helpers, `baseFence`.
- Pages: [Hull widget](./concepts/hull-widget.md), [Membership](./concepts/membership.md), [Widget render](./flows/widget-render.md), [Internals](./modules/internals.md), [Widgets](./modules/widgets.md), [Commands](./modules/commands.md), [Schema](./modules/schema.md), [Query](./modules/query.md), [Plugin core](./modules/plugin-core.md), [Overview](./OVERVIEW.md)

## 2026-10-09: refresh

- Profile: internal/standard
- source_commit: 24a4ba9 (was f31ff83)
- Coverage: schema settings dialog replaces "Activate as schema base", "Configure field" and "Import option notes" (`importFolder` setting and `Optionen` fixtures removed); draft model, rename migration, `SchemaWriter.reset()`, Bases toolbar button, smoke section and test setup.
- Pages: [Commands](./modules/commands.md), [Internals](./modules/internals.md), [Schema](./modules/schema.md), [Plugin core](./modules/plugin-core.md), [Tooling](./modules/tooling.md), [Schema edit](./flows/schema-edit.md), [Plugin load and ready](./flows/plugin-load-and-ready.md), [Field schema](./concepts/field-schema.md), [Schema base](./concepts/schema-base.md), [Membership](./concepts/membership.md), [Widgets](./modules/widgets.md), [Layers](./architecture/layers.md), [Obsidian internals](./architecture/obsidian-internals.md), [Add a field type](./guides/add-a-field-type.md), [Overview](./OVERVIEW.md)

## 2026-10-10: refresh

- Profile: internal/standard
- source_commit: 85f2855 (was f31ff83)
- Coverage: fallow adoption (config, `pnpm quality`/`pnpm quality:audit`, Claude Code commit gate, CI workflow), merged eslint-disable check script, un-exported internals (`ConfigureFieldModal`, collector constants), new pure helpers `fieldNode()`, `splitNoteName()`, `wantedPaths()`; removed `tslib`, `jiti`, `@typescript-eslint/eslint-plugin`.
- Pages: [Tooling](./modules/tooling.md), [Commands](./modules/commands.md), [Add a field type](./guides/add-a-field-type.md), [Overview](./OVERVIEW.md)

## 2026-10-10: refresh (worktree vault)

- Profile: internal/standard
- source_commit: 2c6a55a (was 85f2855)
- Coverage: shared test vault for git worktrees: `VAULT_PATH` resolves to the main checkout, `FIXTURES` to the current one; `vault-sync.mjs` mirrors fixtures, `vault:link-test` re-links, `smoke`/`perf` include the relink step; `IMPROVED_BASES_TEST_VAULT` override.
- Pages: [Tooling](./modules/tooling.md), [Run tests and smoke checks](./guides/run-tests-and-smoke.md), [Overview](./OVERVIEW.md)

## 2026-10-10: refresh (review fixes)

- Profile: internal/standard
- source_commit: f26dfc8 (was 24a4ba9)
- Coverage: review fixes: validation (trim, swapped renames), case-insensitive rename migration with prefilter and per-note counts, field order kept on rename, code-block toolbars skipped, button-based toolbar idempotency.
- Pages: [Commands](./modules/commands.md), [Internals](./modules/internals.md), [Schema](./modules/schema.md), [Schema edit](./flows/schema-edit.md), [Overview](./OVERVIEW.md)

## 2026-10-10: refresh (merge main)

- Profile: internal/standard
- source_commit: 0c710b9 (was f26dfc8)
- Coverage: merge of main's fallow adoption into the schema settings branch; Istanbul coverage from `pnpm test` feeds fallow CRAP scores; new unit tests for the settings modal, save handler, widget toggle, collector mount, CLI detection and both widgets; `buildSchemaSettings()` split from the modal opener; `Membership.schemaBasesOf()` removed; smoke compares `Verwaist.base` semantically.
- Pages: [Tooling](./modules/tooling.md), [Commands](./modules/commands.md), [Overview](./OVERVIEW.md)

## 2026-10-10: refresh (rename semantics)

- Profile: internal/standard
- source_commit: 8e51900 (was 0c710b9)
- Coverage: `renameKey()` matches exact keys; `migrateRenames()` prefilters from frontmatter on disk; `membersKnown()` replaces `canRename`; saved relation targets stay valid in validation.
- Pages: [Commands](./modules/commands.md), [Schema edit](./flows/schema-edit.md), [Overview](./OVERVIEW.md)

## 2026-10-10: refresh (toolbar item markup)

- Profile: internal/standard
- source_commit: aed8819 (was 8e51900)
- Coverage: Schema toolbar item mirrors Obsidian's `div.bases-toolbar-item > div.text-icon-button` markup; plugin CSS for the item removed.
- Pages: [Internals](./modules/internals.md), [Overview](./OVERVIEW.md)

## 2026-10-10: refresh (base-wide schema fields)

- Profile: internal/standard
- source_commit: 391fff1 (was aed8819)
- Coverage: dialog lists all base fields (view orders, `properties:`, member keys) with native type labels; add to chosen view; remove deletes from notes and base; rename also rewrites view columns; new pure `baseDoc.ts`, `SchemaWriter.activate` removed, toolbar passes the view name.
- Pages: [Commands](./modules/commands.md), [Schema](./modules/schema.md), [Internals](./modules/internals.md), [Schema edit](./flows/schema-edit.md), [Field schema](./concepts/field-schema.md), [Schema base](./concepts/schema-base.md), [Overview](./OVERVIEW.md)

## 2026-10-10: refresh (review fixes)

- Profile: internal/standard
- source_commit: 9b45bc0 (was 391fff1)
- Coverage: validation blocks reusing a removed field's name and checks reserved names only for new or renamed fields; untouched schema entries keep their key spelling; removal matches note keys case-insensitively in one pass and counts unreadable notes as failed; duplicate map keys are dropped on column rename; pinned type shown in the dialog; removal warns about filter/formula references.
- Pages: [Commands](./modules/commands.md), [Schema edit](./flows/schema-edit.md), [Overview](./OVERVIEW.md)
