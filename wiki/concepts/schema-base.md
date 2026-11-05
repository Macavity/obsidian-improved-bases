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

The section's `version` (`SCHEMA_VERSION = 1` in [types.ts](../../src/schema/types.ts)) is the contract between the file and the plugin. Reading: a missing `version` is 1; anything but a positive integer is a parse error. A version above `SCHEMA_VERSION` does not reject the base: `parseSchema()` keeps every field that parses, drops the rest silently (a `fields` value that is not a map counts as no fields, never as an error, so the dialog never offers to reset such a base) and sets `BaseSchema.unsupportedVersion`, so widgets still render what they understand. The registry announces such a base with a `Notice` once and includes the flag in the change signature. The schema settings dialog treats the flag as a read-only state: `schemaState()` returns the error kind without a reset button and a message that the plugin needs an update, so nothing is written back ([Schema settings](../modules/schema-settings.md)). Writing: `updateBaseSource()` inserts `version: 1` as the first key whenever it changes the section and the key is missing (`ensureVersion()`), never lowers an existing version, and refuses any change to the section when the version the file had before the change is newer (`assertVersionWritable()` throws `t("error.unsupportedVersion")`; the version is read before mutating, so dropping an icon-only newer section is refused too; column edits outside the section still go through, and a no-op stays a no-op), which also covers the select widget's option writes and a dialog opened before the file changed on disk; `resetSchemaSource()` writes `version: 1` too, replacing the whole section, but runs the same check first (`assertWritable()`), so a reset confirmed after the file gained a valid newer section is refused; keys the plugin does not know stay where they are, because the section is edited through the `yaml` document API (round-trip test in `test/baseDoc.test.ts`). Format 1 is declared stable: every later plugin reads it, and a change an older plugin could misread gets a new number rather than silently changing version 1.

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
