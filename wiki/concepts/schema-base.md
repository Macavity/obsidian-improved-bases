---
title: Schema base
description: "A .base file carrying a valid improved-bases: section; its query result defines which notes the schema applies to."
type: concept
tags:
  - wiki
  - concept
---
# Schema base

## Definition

A **schema base** is any `.base` file whose YAML has an `improved-bases:` key that parses without errors (a `fields:` map, which may be absent or empty, and an optional `icon`). Its [field schemas](./field-schema.md) apply to exactly the notes in that base's query result (filters included, folder irrelevant). The `icon` (`BaseSchema.icon`, trimmed; blank, null or non-string values are ignored) is the base's **default entry icon**: every relation that targets this base shows it next to entries whose note has no `icon` property, so a base looks the same wherever it is referenced ([Widgets](../modules/widgets.md), `entryIcon()`); the schema settings dialog edits it as "Default entry icon" in its header ([Commands](../modules/commands.md)). A base referenced only as a relation target does not need a schema itself; one that carries only an icon is a schema base without fields. The user-facing format is in the [README](../../README.md#schema-format).

## Why it matters

It is the unit of scoping: the same property name can be a relation in one base and a select in another, and notes outside every schema base keep Obsidian's global types. It is also the unit of validity: one error anywhere in the section rejects the whole base (the registry then shows a `Notice` and the base's widgets stay native), so a half-broken schema never applies partially. When a note is in several schema bases defining the same field, the first base by path wins ([Membership](./membership.md)).

## Where it lives

- Parsed by `parseSchema()` in [parse.ts](../../src/schema/parse.ts); `SCHEMA_KEY` in [types.ts](../../src/schema/types.ts).
- Tracked by `SchemaRegistry` in [SchemaRegistry.ts](../../src/schema/SchemaRegistry.ts) (`schemas()` sorted by path, `errors()`).
- Created implicitly by `updateBaseSource()` in [baseDoc.ts](../../src/schema/baseDoc.ts) when the first save of the schema settings dialog writes a customization ([Commands](../modules/commands.md)); a broken section is replaced by `resetSchemaSource()` ("Reset schema").
- Fixtures: `test-vault/Teams.base`, `Mitarbeiter.base`, and `Kaputt.base` as an invalid example ([Tooling](../modules/tooling.md)).

## Related

- [Field schema](./field-schema.md)
- [Membership](./membership.md)
- [Schema module](../modules/schema.md)
- [Schema edit flow](../flows/schema-edit.md)
