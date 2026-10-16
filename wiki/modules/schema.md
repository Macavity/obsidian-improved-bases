---
title: Schema
description: "src/schema: field types, the improved-bases: parser, the SchemaRegistry, the SchemaWriter, the pure base document editor and key safety helpers."
type: module
tags:
  - wiki
  - module
---
# Schema

## Summary

`src/schema/` defines what a [schema base](../concepts/schema-base.md) is, reads every `.base` in the vault into validated [field schemas](../concepts/field-schema.md), and provides the single write path back into the `.base` file: the `improved-bases.fields` node plus, for field edits, the view columns. [Membership.ts](../../src/schema/Membership.ts) also lives here but is documented as its own concept: [Membership](../concepts/membership.md).

## Responsibilities

- **Types** ([types.ts](../../src/schema/types.ts)): `COLORS` (13 names), `RelationField`, `SelectField`, `NativeField` (any other type id as a string), the narrowing guards `isRelation`/`isSelect`, `FieldSchema`, `BaseSchema` (fields keyed by lowercased name, original spelling kept; optional `icon`, the base's default entry icon), `SCHEMA_KEY = "improved-bases"`.
- **Parsing** ([parse.ts](../../src/schema/parse.ts)): `parseSchema(basePath, raw)` returns `{ schema, errors }`. A base without the key is simply not a schema base (`schema: null, errors: []`); `fields` may be missing, and a top-level `icon` string is stored trimmed (blank, null or non-string values are dropped, never an error). Any error anywhere in the section rejects the whole base (`schema: null`), so a base is either fully valid or ignored. `isValidBasePath()` rejects absolute, backslash, `..` and non-`.base` targets; reserved names (`__proto__`, `constructor`, `prototype`) and case-insensitive duplicates are errors.
- **Registry** ([SchemaRegistry.ts](../../src/schema/SchemaRegistry.ts)): `load()` scans all `.base` files once (silently), subscribes to `create/modify/delete/rename` (a rename always refreshes the old path, even when the file is no longer a `.base`), and emits `changed` only when a schema signature (path, base icon, fields) or error text actually changed. Per-path sequence numbers (`seqs`) drop stale async reads. New errors surface as a `Notice` with the first message. `schemas()` is always sorted by `basePath`, which is what makes the "first base by path wins" conflict rule deterministic.
- **Relation view** (parse.ts, [baseViews.ts](../../src/schema/baseViews.ts)): a relation's optional `view` must be a non-empty name, kept verbatim (no trimming); an unquoted number or boolean (`view: 2024`) is read as text via `viewName()` from [target.ts](../../src/query/target.ts), the same helper `baseViewNames` and `collectorSource` use. `baseViewNames(app, basePath)` lists `views[].name` in file order (number/boolean names such as `2024` as strings, other types skipped) and never rejects: null for a missing, unreadable or unparsable base.
- **Base document** ([baseDoc.ts](../../src/schema/baseDoc.ts), pure): `updateBaseSource(source, edits, mutate, icon?)` parses with the `yaml` document API, applies `ColumnEdits` (`add` names to a view's `order`, `remove` and `rename` across every view's `order`, `summaries`, `sort`, `groupBy` and the `properties:` keys; the `note.` prefix spelling is kept, `file.*`/`formula.*` entries are never touched), then snapshots `improved-bases.fields` as JSON, lets `mutate` edit a clone and applies only the per-field diffs with `setIn`/`deleteIn`, sorting the map to the mutated key order so a renamed field keeps its place. With `icon` given (`undefined` = untouched), it sets `improved-bases.icon` (trimmed), creating the section when needed, or deletes the key when empty and drops the section if nothing else is left in it. Filter and formula expressions are never rewritten. Unchanged input returns the identical string, so `vault.process()` is a no-op. `readBaseColumns(source)` returns the view names, each view's `order` names, the `note.X` keys of `properties:` and all filter/formula expressions (throws on invalid YAML or a missing `views` list); `referencesName(expressions, name)` is a word-boundary check; `propertyName()` maps `note.X`/`X` to `X`.
- **Writer** ([SchemaWriter.ts](../../src/schema/SchemaWriter.ts)): `update(basePath, mutate, edits = EMPTY_EDITS, icon?)` runs `updateBaseSource()` inside one `vault.process()`; `updateSchemaSource(source, mutate)` is the edits-free variant. There is no activation step: a base without the key gets `improved-bases.fields` created by the first non-empty mutation. `resetSchemaSource()` replaces the whole value with an empty schema, even if it was invalid.
- **Option migration** ([optionMigration.ts](../../src/schema/optionMigration.ts)): `optionValueEdit(renames, removals)` builds one `ValueEdit` for all option changes of a field (each original value is mapped once; a removed string becomes null, removed list elements are dropped, an edited list never holds a value twice; undefined = leave the note); `renameInList()` applies the same rule to a plain list (the picker's and widget's own copies). `migrateOptionValues(app, files, key, edit, previousKey?)` skips notes whose cached frontmatter (also under `previousKey`, a just-renamed field) shows nothing to change, edits the rest one by one through `processFrontMatter` and returns `{ changed, failed }`. Used by the schema dialog's Save and by the select widget's rename/delete. [messages.ts](../../src/schema/messages.ts) holds `MEMBERS_LOADING`.
- **Key safety** ([keys.ts](../../src/schema/keys.ts)): `isUnsafeKey()`, `findOwnKey()` (case-insensitive own-key lookup, exact match preferred) and `setOption()` (own-property option write). Shared guards live next to the types: `isColor()` in [types.ts](../../src/schema/types.ts), `isRecord()` in [parse.ts](../../src/schema/parse.ts); the writer resolves its file through a private `fileOf()` (throws `Base not found`). Used by the parser, writer mutations and commands so user-supplied field/option names can never reach the prototype chain.

## Public API / entry points

- `parseSchema(basePath, raw)`
- `new SchemaRegistry(app)` → `load()`, `loaded`, `schemas()`, `errors()`, `on("changed")`, `dispose()`
- `new SchemaWriter(app)` → `update(basePath, mutate, edits?, icon?)`, `reset(basePath)`; pure helpers `updateBaseSource()`, `updateSchemaSource()`, `resetSchemaSource()`, `readBaseColumns()`, `referencesName()`, `propertyName()`; `ColumnEdits`, `EMPTY_EDITS`, `RawFields` types
- `isUnsafeKey()`, `findOwnKey()`

## Key files

- [types.ts](../../src/schema/types.ts)
- [parse.ts](../../src/schema/parse.ts)
- [baseViews.ts](../../src/schema/baseViews.ts)
- [SchemaRegistry.ts](../../src/schema/SchemaRegistry.ts)
- [baseDoc.ts](../../src/schema/baseDoc.ts)
- [SchemaWriter.ts](../../src/schema/SchemaWriter.ts)
- [keys.ts](../../src/schema/keys.ts)
- [optionMigration.ts](../../src/schema/optionMigration.ts)
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
- [Schema settings](schema-settings.md)
- [Add a field type](../guides/add-a-field-type.md)
