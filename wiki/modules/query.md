---
title: Query
description: "src/query: the BaseQuery watch abstraction over a base's live result set, and the hidden collector view that feeds it."
type: module
tags:
  - wiki
  - module
---
# Query

## Summary

`src/query/` answers one question for the rest of the plugin: *which files are currently in the result of base X, and tell me when that changes.* `createBaseQuery()` in [BaseQuery.ts](../../src/query/BaseQuery.ts) exposes `watch(target, cb)` over a `QueryTarget` (`{ base, view? }`, [target.ts](../../src/query/target.ts); `targetKey()` = `base` or `base#view`, a map key only); it is backed by the [collector view](../concepts/collector-view.md) in [CollectorView.ts](../../src/query/CollectorView.ts) and, on desktop, by the internal CLI query as a fast first scan.

## Responsibilities

- Keep one `Entry` per watched target key with listeners, the last emitted result, a generation counter, and the current mode (`collector` | `cli`).
- Deduplicate: `emit()` compares path lists and the `failed` flag and skips identical results; listeners get `(files, failed)`, where `failed` marks the `[]` emitted after a CLI or collector failure (so a consumer can tell "no members" from "members unknown"; `Membership` ignores it); listener errors are caught and logged.
- **Mount strategy**: on first watch, run the CLI immediately if available (`mode = "cli"`), then mount the collector; the first collector push switches `mode` to `collector` and cancels any pending CLI timer. See [Base query watch](../flows/base-query-watch.md).
- **Generation guard**: every (re)mount or unmount bumps `gen`; async results from an older generation are dropped.
- **Collector fence**: `baseFence(yaml)` in [CollectorView.ts](../../src/query/CollectorView.ts) wraps the YAML in a ```` ```base ```` block whose fence is longer than any backtick run inside the YAML.
- **File events** act on all entries of a base (`ofBase(path)`: the whole base and each of its views): `modify` of the `.base` remounts them; `delete`/`rename` away resets them to `[]`; `create`/`rename` to the path mounts the not-yet-mounted ones. While an entry is in CLI mode, `metadataCache.changed` and vault `create/delete/rename` schedule a debounced (200 ms) CLI re-run.
- **Collector failure handling**: `BaseNotFoundError` leaves the entry empty until `create` remounts it; `ViewNotFoundError` (the target view is not in the base) does the same but emits `[]` with `failed = true` (result unknown, not empty), until `modify`/`create` remounts it; other errors keep CLI refreshes running if CLI mode is active, else emit `[]`.
- `registerCollector(plugin)` registers the Bases view type `improved-bases-collector` with its own icon and returns the `MountCollector` function: it waits for layout-ready, reads the `.base`, builds the source with `collectorSource(parsed, target, id)`: without a view `views` becomes a single collector view carrying a `collectorId`; with a view that view's config (filters, sort, limit) is kept and only retyped as the collector (first view of that name wins, none: `ViewNotFoundError`), renders it as a ```` ```base ```` code block into an offscreen host `div` and resolves with an unmount closure.

## Public API / entry points

- `createBaseQuery(plugin, deps?)` → `BaseQuery { watch, dispose }`. `deps.mount` and `deps.cli` are injection points for tests (`cli: null` disables the fallback).
- `firstResult(query, target)` → the first result, or `null` when that scan failed; no timeout (a large base must finish). The watch ends either way, also when `watch` replays a cached result synchronously. Used by the schema dialog for bases that `Membership` does not watch.
- `registerCollector(plugin)` → `MountCollector`
- `collectorSource()`, `COLLECTOR_VIEW`, `COLLECTOR_ICON`, `BaseNotFoundError`, `ViewNotFoundError`
- CLI: `cliQuery(app, target)` passes `view=` to `base:query` when the target has a view ([Internals](./internals.md)).

## Key files

- [BaseQuery.ts](../../src/query/BaseQuery.ts) — `createBaseQuery()`, `Entry`, `samePaths()`
- [CollectorView.ts](../../src/query/CollectorView.ts) — `CollectorView extends BasesView`, `registerCollector()`
- [cliQuery.ts](../../src/internals/cliQuery.ts) — the desktop fallback (documented under [Internals](./internals.md))
- [styles.css](../../styles.css) — `.improved-bases-collector-host` offscreen positioning and view-selector hiding

## Dependencies

- `obsidian`: `BasesView`, `QueryController`, `MarkdownRenderer`, `Component`, `addIcon`/`removeIcon`, `parseYaml`/`stringifyYaml`, vault + metadataCache events.
- [internals/cliQuery](./internals.md) and [internals/detect](./internals.md).

## Participates in

- [Base query watch](../flows/base-query-watch.md)
- [Plugin load and ready](../flows/plugin-load-and-ready.md) (first scans gate the membership latch)

## Related

- [Collector view](../concepts/collector-view.md)
- [Membership](../concepts/membership.md) (the only consumer of `watch`)
- [Obsidian internals](../architecture/obsidian-internals.md)
