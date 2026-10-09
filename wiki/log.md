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
