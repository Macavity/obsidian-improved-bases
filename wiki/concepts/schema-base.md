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

A **schema base** is any `.base` file whose YAML has an `improved-bases:` key that parses without errors (a `fields:` map, which may be absent or empty, an optional `icon`, and an optional `version`). Its [field schemas](./field-schema.md) apply to exactly the notes in that base's query result (filters included, folder irrelevant). The `icon` (`BaseSchema.icon`, trimmed; blank, null or non-string values are ignored) is the base's **default entry icon**: every relation that targets this base shows it next to entries whose note has no `icon` property, so a base looks the same wherever it is referenced ([Widgets](../modules/widgets.md), `entryIcon()`); the schema settings dialog edits it as "Default entry icon" in its header ([Schema settings](../modules/schema-settings.md)). A base referenced only as a relation target does not need a schema itself; one that carries only an icon is a schema base without fields. The user-facing format is in the [README](../../README.md#schema-format).

## Format version

The section's `version` (`SCHEMA_VERSION = 1` in [types.ts](../../src/schema/types.ts)) is the contract between the file and the plugin; format 1 is declared stable, and a change an older plugin could misread gets a new number. Reading (`parseSchema()`): a missing `version` is 1, anything but a positive integer is a parse error, and a newer version keeps the fields that parse, drops the rest silently and sets `BaseSchema.unsupportedVersion`; the registry shows a `Notice` once (`t("notice.unsupportedVersion")`) and the schema settings dialog opens read-only without a reset button (`schemaState()`, `t("dialog.unsupportedVersion")`). Writing (`updateBaseSource()`, `resetSchemaSource()`): `assertWritable()` refuses any write to a base whose section declares a newer version (`t("error.unsupportedVersion")`), `ensureVersion()` inserts `version: 1` as the first key when it is missing and never changes an existing one, and unknown keys survive every write because the section is edited through the `yaml` document API (round-trip test in `test/baseDoc.test.ts`).

## Why it matters

It is the unit of scoping: the same property name can be a relation in one base and a select in another, and notes outside every schema base keep Obsidian's global types. It is also the unit of validity: one error anywhere in the section rejects the whole base (the registry then shows a `Notice` and the base's widgets stay native), so a half-broken schema never applies partially. When a note is in several schema bases defining the same field, the first base by path wins ([Membership](./membership.md)).

## Where it lives

- Parsed by `parseSchema()` in [parse.ts](../../src/schema/parse.ts); `SCHEMA_KEY` in [types.ts](../../src/schema/types.ts).
- Tracked by `SchemaRegistry` in [SchemaRegistry.ts](../../src/schema/SchemaRegistry.ts) (`schemas()` sorted by path, `errors()`).
- Created implicitly by `updateBaseSource()` in [baseDoc.ts](../../src/schema/baseDoc.ts) when the first save of the schema settings dialog writes a customization ([Schema settings](../modules/schema-settings.md)); a broken section is replaced by `resetSchemaSource()` ("Reset schema").
- Fixtures: `test-vault/Teams.base`, `Mitarbeiter.base`, and `Kaputt.base` as an invalid example ([Tooling](../modules/tooling.md)).

## Related

- [Field schema](./field-schema.md)
- [Membership](./membership.md)
- [Schema module](../modules/schema.md)
- [Schema edit flow](../flows/schema-edit.md)
