---
title: Collector view
description: The hidden Bases view type the plugin registers to receive a base's live query result through the public BasesView API.
type: concept
tags:
  - wiki
  - concept
---
# Collector view

## Definition

The **collector view** (`CollectorView extends BasesView`, type id `improved-bases-collector`, in [CollectorView.ts](../../src/query/CollectorView.ts)) is a Bases view that renders nothing. Its only job is `onDataUpdated()`: read `collectorId` from the view config and push `this.data.data.map(e => e.file)` to the listener registered under that id. To get one running for a base, `registerCollector()` renders the base as a ```` ```base ```` code block, with its `views` replaced by a single collector view (`collectorSource()`; for a target view that view's own config is kept, so its filters, sort and limit apply, and a missing view throws `ViewNotFoundError`; number/boolean YAML names match by their string form), into an offscreen host `div` in `document.body`.

## Why it matters

Obsidian has no public query API for Bases. The collector is the closest thing: it uses `registerBasesView` and `MarkdownRenderer.render`, evaluates filters and formulas exactly like a real base, delivers live updates from the Bases controller, and works on mobile. Its catch is that `QueryController.runQuery` waits for the view container to be shown, so the host must be in the DOM with layout (offscreen, not `display: none`), and a hidden window can delay it. That is why desktop also runs the CLI query first ([Base query watch](../flows/base-query-watch.md)). The research is in [SPIKE_FINDINGS](../../SPIKE_FINDINGS.md), section F1.

## Where it lives

- [CollectorView.ts](../../src/query/CollectorView.ts): `CollectorView`, `registerCollector()`, `COLLECTOR_VIEW`, `COLLECTOR_ICON`, `BaseNotFoundError`, `ViewNotFoundError`, `collectorSource()`.
- [styles.css](../../styles.css): `.improved-bases-collector-host` offscreen positioning and hiding the view-selector entry by icon class.
- Mounted by `createBaseQuery()` in [BaseQuery.ts](../../src/query/BaseQuery.ts); the smoke script counts hosts to verify cleanup ([Tooling](../modules/tooling.md)).

## Related

- [Query](../modules/query.md)
- [Obsidian internals](../architecture/obsidian-internals.md)
- [Membership](./membership.md)
