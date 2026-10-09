---
title: Membership
description: "The file-to-schema-base join: which schema applies to a (file, property) pair, when results are final, and which base wins on conflict."
type: concept
tags:
  - wiki
  - concept
---
# Membership

## Definition

**Membership** (`Membership` in [Membership.ts](../../src/schema/Membership.ts)) is the join between the [schema registry](../modules/schema.md) and the [query](../modules/query.md) layer. A file is a *member* of a schema base when it appears in that base's query result. `resolve(filePath, propName)` returns the [field schema](./field-schema.md) that applies, or `null`. It also tracks the result sets of relation target bases (`targetEntries(basePath)`) for the relation picker.

Three rules:

- **Latch**: `ready` becomes `true` once the registry is loaded, every schema base has a result, `metadataCache` has resolved, and 300 ms (`QUIET_MS`) passed without a new push. Before that `resolve()` returns `null` and everything renders native. The latch never resets.
- **Conflict**: if a file is in several schema bases defining the same field, the first base by path (registry order) wins; a console warning is logged once per `(file, field)`.
- **Events**: `changed(fieldNames[])` whenever the applicable fields may have changed (after latch, or schema diff); `targets-changed(basePath)` when a relation target's result set changes.

## Why it matters

It is the only place that knows *context*. Obsidian asks for a widget by property name alone; membership adds the file dimension so the same property can render differently per base. The latch prevents a flicker of wrong widgets during startup and guarantees that the first plugin render already sees complete relation target lists. Its `knownFieldNames()` set is also the cheap pre-filter the [hull](./hull-widget.md) uses to leave unrelated properties untouched.

## Where it lives

- [Membership.ts](../../src/schema/Membership.ts): `sync()` (diff schemas, manage watches), `onResult()`, `armQuiet()`, `resolveWithBase()`, `schemaBasesOf()`.
- Constructed in [main.ts](../../src/main.ts) with `{ cache: app.metadataCache }`; tests inject `quietMs` and a fake cache.
- Consumers: `typeInfoPatch` (resolve + events), `RelationWidget` (`targetEntries`), `SelectWidget` (`resolveWithBase` for the schema base to write to), `configureField` and `importOptions` (`ready`, `schemaBasesOf`, `targetEntries`).
- Smoke and perf scripts poll `plugin.membership.ready` ([Tooling](../modules/tooling.md)).

## Related

- [Plugin load and ready](../flows/plugin-load-and-ready.md)
- [Widget render](../flows/widget-render.md)
- [Schema base](./schema-base.md)
- [Layers](../architecture/layers.md)
