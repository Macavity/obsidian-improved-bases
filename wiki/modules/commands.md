---
title: Commands
description: "src/commands: the schema settings dialog, its draft model and the command, menu item and toolbar button that open it."
type: module
tags:
  - wiki
  - module
---
# Commands

## Summary

`src/commands/` implements the schema settings dialog and everything that opens it: one palette command, one `file-menu` item and a toolbar button (see the [README](../../README.md#schema-settings)). The dialog edits a pure draft model; saving writes all fields through `SchemaWriter` in one mutation and then migrates renamed property keys in the member notes.

## Responsibilities

- **Registration** ([schemaSettings.ts](../../src/commands/schemaSettings.ts)): `registerSchemaSettings(plugin, env, registry)` adds the `checkCallback` command `open-schema-settings` ("Open schema settings", available on an active `.base`), a `file-menu` item "Schema settings" for `.base` files from the sources `tab-header`, `more-options` and `file-explorer-context-menu`, and installs the toolbar button through `installSchemaButton()` ([Internals](./internals.md)). Open failures show a `Notice`.
- **Opening** (`buildSchemaSettings()`, pure apart from reading the vault; `registerSchemaSettings()` opens the modal with its result): collects property names from the members' frontmatter (datalist suggestions), the other `.base` paths as relation targets, and the modal state from `schemaState()` (fields of the registered schema, the parse errors of an invalid base, or an empty list).
- **Dialog** ([SchemaSettingsModal.ts](../../src/commands/SchemaSettingsModal.ts)): `SchemaSettingsModal` shows one expandable row per field with name, type, `multiple`, target base (via `BasePicker`) and select options with colors (via `openColorMenu`). Rows are validated with `validateDrafts()` before Save; a rename is refused while `canRename` (membership ready) is false. For a base with an invalid schema it shows the parse error and a "Reset schema" button with a confirm step.
- **Draft model** ([schemaDraft.ts](../../src/commands/schemaDraft.ts), pure): `FieldDraft` / `OptionDraft`, `fieldsToDrafts()`, `validateDrafts()` (empty, padded or reserved names, case-insensitive duplicates, swapped renames, relation needs an existing base, option values and colors), `draftsToMutation(drafts, originalNames)` (drops removed or renamed fields, writes all drafts in order), `renames()` (changed names including case-only), `renameKey()` (moves one frontmatter key, matching the old key case-insensitively; `renamed`, `missing` or `conflict`).
- **Save** (`onSave` from `buildSchemaSettings()`): activates a base without schema via `writer.activate()`, writes `draftsToMutation()` with `writer.update()`, then `migrateRenames()` renames the keys in the member notes whose cached frontmatter has an old key, sequentially through `fileManager.processFrontMatter`, skipping notes that already have both keys. `renameSummary()` builds the per-note counts shown in the final `Notice`; when the members are unknown it reports that nothing was renamed.
- **Reset**: `onReset` calls `writer.reset()` which replaces the whole `improved-bases` value with an empty schema ([Schema](./schema.md)).

## Public API / entry points

- `registerSchemaSettings(plugin, env, registry)`, `buildSchemaSettings()`, `schemaState()`, `migrateRenames()`, `renameSummary()`
- `SchemaSettingsModal`, `SchemaSettingsInput`
- `fieldsToDrafts()`, `validateDrafts()`, `draftsToMutation()`, `renames()`, `renameKey()`, `TYPES`, `FieldDraft`, `OptionDraft`

## Key files

- [schemaSettings.ts](../../src/commands/schemaSettings.ts)
- [SchemaSettingsModal.ts](../../src/commands/SchemaSettingsModal.ts)
- [schemaDraft.ts](../../src/commands/schemaDraft.ts)
- Tests: `test/schemaDraft.test.ts`, `test/schemaSettings.test.ts`, `test/toolbar.test.ts` (see [Tooling](./tooling.md))

## Dependencies

- [Schema](./schema.md): `SchemaWriter`, `SchemaRegistry`, `RawFields`, `NATIVE_TYPES`, `isColor`, `findOwnKey`, `isUnsafeKey`, `setOption`.
- [Membership](../concepts/membership.md) via `WidgetEnv` for `targetEntries()` and `ready`.
- `obsidian`: `Modal`, `Setting`, `Notice`, `setIcon`, `fileManager.processFrontMatter`, the `file-menu` workspace event.
- [Widgets](./widgets.md): `BasePicker`, `openColorMenu`, `OverlayRegistry`.

## Participates in

- [Schema edit](../flows/schema-edit.md)

## Related

- [Schema base](../concepts/schema-base.md)
- [Field schema](../concepts/field-schema.md)
- [Plugin core](./plugin-core.md) (registration)
- [Internals](./internals.md) (toolbar button)
