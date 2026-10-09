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
