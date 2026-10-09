---
title: Schema
description: "src/schema: field types, the improved-bases: parser, the SchemaRegistry, the SchemaWriter and key safety helpers."
type: module
tags:
  - wiki
  - module
---
# Schema

## Summary

`src/schema/` defines what a [schema base](../concepts/schema-base.md) is, reads every `.base` in the vault into validated [field schemas](../concepts/field-schema.md), and provides the single write path back into the `improved-bases.fields` node. [Membership.ts](../../src/schema/Membership.ts) also lives here but is documented as its own concept: [Membership](../concepts/membership.md).

## Responsibilities

- **Types** ([types.ts](../../src/schema/types.ts)): `COLORS` (13 names), `NativeType`, `RelationField`, `SelectField`, `NativeField`, `FieldSchema`, `BaseSchema` (fields keyed by lowercased name, original spelling kept), `SCHEMA_KEY = "improved-bases"`.
- **Parsing** ([parse.ts](../../src/schema/parse.ts)): `parseSchema(basePath, raw)` returns `{ schema, errors }`. A base without the key is simply not a schema base (`schema: null, errors: []`). Any error anywhere in the section rejects the whole base (`schema: null`), so a base is either fully valid or ignored. `isValidBasePath()` rejects absolute, backslash, `..` and non-`.base` targets; reserved names (`__proto__`, `constructor`, `prototype`) and case-insensitive duplicates are errors.
- **Registry** ([SchemaRegistry.ts](../../src/schema/SchemaRegistry.ts)): `load()` scans all `.base` files once (silently), subscribes to `create/modify/delete/rename` (a rename always refreshes the old path, even when the file is no longer a `.base`), and emits `changed` only when a schema signature or error text actually changed. Per-path sequence numbers (`seqs`) drop stale async reads. New errors surface as a `Notice` with the first message. `schemas()` is always sorted by `basePath`, which is what makes the "first base by path wins" conflict rule deterministic.
- **Writer** ([SchemaWriter.ts](../../src/schema/SchemaWriter.ts)): `updateSchemaSource(source, mutate)` parses with the `yaml` document API, snapshots `improved-bases.fields` as JSON, lets `mutate` edit a clone, and then applies only the per-field diffs with `setIn`/`deleteIn`. Unchanged input returns the identical string, so `vault.process()` is a no-op. `activateSchemaSource()` adds an empty `improved-bases: { fields: {} }`.
- **Key safety** ([keys.ts](../../src/schema/keys.ts)): `isUnsafeKey()`, `findOwnKey()` (case-insensitive own-key lookup, exact match preferred) and `setOption()` (own-property option write). Shared guards live next to the types: `isColor()` in [types.ts](../../src/schema/types.ts), `isRecord()` in [parse.ts](../../src/schema/parse.ts); the writer resolves its file through a private `fileOf()` (throws `Base not found`). Used by the parser, writer mutations and commands so user-supplied field/option names can never reach the prototype chain.

## Public API / entry points

- `parseSchema(basePath, raw)`
- `new SchemaRegistry(app)` → `load()`, `loaded`, `schemas()`, `errors()`, `on("changed")`, `dispose()`
- `new SchemaWriter(app)` → `update(basePath, mutate)`, `activate(basePath)`; pure helpers `updateSchemaSource()`, `activateSchemaSource()`; `RawFields` type for mutations
- `isUnsafeKey()`, `findOwnKey()`

## Key files

- [types.ts](../../src/schema/types.ts)
- [parse.ts](../../src/schema/parse.ts)
- [SchemaRegistry.ts](../../src/schema/SchemaRegistry.ts)
- [SchemaWriter.ts](../../src/schema/SchemaWriter.ts)
- [keys.ts](../../src/schema/keys.ts)
- [Membership.ts](../../src/schema/Membership.ts) — see [Membership](../concepts/membership.md)

## Dependencies

- `yaml` (`parseDocument`) for comment-preserving writes; `obsidian` `parseYaml` for reads.
- `obsidian`: `Events`, `TFile`, `Notice`, `vault.process`.

## Participates in

- [Plugin load and ready](../flows/plugin-load-and-ready.md) (registry scan)
- [Schema edit](../flows/schema-edit.md) (writer, registry refresh)

## Related

- [Schema base](../concepts/schema-base.md)
- [Field schema](../concepts/field-schema.md)
- [Commands](./commands.md)
- [Add a field type](../guides/add-a-field-type.md)
