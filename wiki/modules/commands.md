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

`src/commands/` implements the schema settings dialog and everything that opens it: one palette command, one `file-menu` item and a toolbar button (see the [README](../../README.md#schema-settings)). The dialog edits a pure draft model; saving writes the base edits through `SchemaWriter` in one write and then migrates renamed and removed property keys in the member notes.

## Responsibilities

- **Registration** ([schemaSettings.ts](../../src/commands/schemaSettings.ts)): `registerSchemaSettings(plugin, env, registry)` adds the `checkCallback` command `open-schema-settings` ("Open schema settings", available on an active `.base`), a `file-menu` item "Schema settings" for `.base` files from the sources `tab-header`, `more-options` and `file-explorer-context-menu`, and installs the toolbar button through `installSchemaButton()` ([Internals](./internals.md)). Open failures show a `Notice`.
- **Opening** (`buildSchemaSettings(plugin, env, registry, basePath, viewName)`, async, pure apart from reading the vault; `registerSchemaSettings()` opens the modal with its result): reads the base source, collects the member frontmatter keys (datalist suggestions and field rows), the other `.base` paths as relation targets, `otherDefinitions(registry, membership, basePath, name)` (other schema bases defining a field name, each with the count of this base's members also in that base), and the modal state from `schemaState()` (known fields via `knownFieldDrafts()`, or the parse error of an invalid base or unreadable file). `viewName` picks the preselected view (`defaultViewIndex`, first view if null or unknown); the toolbar button passes the view switcher label, command and file menu pass null. Native type labels come from `metadataTypeManager.getTypeInfo(name, null).expected.type`.
- **Dialog** ([SchemaSettingsModal.ts](../../src/commands/SchemaSettingsModal.ts)): `SchemaSettingsModal` is a wide modal (`.improved-bases-schema-modal`, built with Obsidian DOM helpers and components only, no UI framework) laid out as a dense table: a toolbar (search filtering rows by name, the "Add new fields to" dropdown with more than one view, "Add field"), a column head and one grid row per known field with a disclosure chevron, the inline name input (datalist of property names), a type icon plus dropdown (`native (<type>)`, `relation`, `select`; Lucide icon per Obsidian type via `NATIVE_ICONS`), a details column (up to three option color dots and the count for a select; target base and a "Multiple" tag for a relation; a dash for native) and the remove button. Next to the modal title, in Obsidian's `.modal-header`, a "Default entry icon" input edits the base's own icon (`input.icon`, passed trimmed as the third `onSave` argument, "" = none; the hint about the system emoji picker is its tooltip; see [Schema base](../concepts/schema-base.md)). Only `relation` and `select` rows expand (switching to one of them opens the panel): a relation shows "Related base" (via `BasePicker`) and "Allow multiple" (`ToggleComponent`); a select shows its options as chips (color via `openColorMenu`, pencil to rename, × to remove, "+ Option" to add) and the toggle. Warning rows under a field (orange, with icon) hold the rename hint (`referencesName()`) and the conflict hint (`conflictHint()` over `input.otherDefinitions(name)`, advising without blocking the save: "Also defined in Meetings.base as text; 1 note is in both bases."; select options and colors do not count); both are shown without expanding. Removing a known field turns the row into an inline confirmation "Remove 'X' and its value from N notes?" (N from `countAffected`) and then into a struck-through row with Undo; remove and rename are refused while `membersKnown()` is false. The footer status line reports pending renames and removals ("1 pending rename · Role → Position") or, without any, that Save writes the base and migrates the notes; errors appear below it. Rows are validated with `validateDrafts()` before Save. For a base with an invalid schema it shows the parse error and a "Reset schema" button with a confirm step. Styling uses Obsidian tokens and classes only (`--size-*`, `--radius-*`, `--font-ui-*`, `--background-modifier-*`, `--color-*-rgb`; `search-input-container`, `dropdown`, `checkbox-container`, `mod-cta`, `clickable-icon`) so themes restyle the dialog.
- **Draft model** ([schemaDraft.ts](../../src/commands/schemaDraft.ts), pure): `FieldDraft` (with `nativeLabel`, `pinned` hand-written native entry kept unchanged, `removed`) / `OptionDraft`, `knownFieldDrafts()` (union of all views' `order`, `properties:` keys, member keys and schema fields; current view's order first, rest alphabetical; fields without a schema entry are native), `validateDrafts()` (empty or padded names, reserved names only for new or renamed fields, case-insensitive duplicates, swapped renames, a live field taking a removed field's name, relation needs an existing base or its already saved target, option values and colors), `draftsToEdits(drafts, originalNames, addView)` (returns `ColumnEdits` plus the schema mutation: native drafts delete their plugin entry unless pinned; untouched entries keep their key spelling), `removals()`, `renames()` (changed names including case-only), `renameKey()` (moves one frontmatter key by exact name, as in YAML; `renamed`, `missing` or `conflict`).
- **Save** (`onSave(drafts, addView, icon)` from `buildSchemaSettings()`): writes `draftsToEdits()` and the base icon with one `writer.update(basePath, mutate, edits, icon)` call (activation is implicit), then `migrateRenames()` renames the keys in the member notes whose frontmatter on disk has an old key (read via `cachedRead`, not the metadata cache; unparseable frontmatter is passed on and ends as `failed`), sequentially through `fileManager.processFrontMatter`, skipping notes that already have both keys, and `removeProperties()` deletes removed keys from the members in one pass, matching keys case-insensitively (Obsidian treats `Status` and `status` as one property) and reporting counts per name; an unreadable note counts as `failed` instead of aborting. `renameSummary()` and `saveSummary()` build the notice: rename counts, removed counts, and "Filters or formulas still reference 'X', update them manually"; when the members are unknown nothing is renamed or removed and the notice says so.
- **Reset**: `onReset` calls `writer.reset()` which replaces the whole `improved-bases` value with an empty schema ([Schema](./schema.md)).

## Public API / entry points

- `registerSchemaSettings(plugin, env, registry)`, `buildSchemaSettings()`, `schemaState()`, `migrateRenames()`, `renameSummary()`, `removeProperties()`, `countNotesWithKey()`, `saveSummary()`
- `SchemaSettingsModal`, `SchemaSettingsInput`
- `knownFieldDrafts()`, `validateDrafts()`, `draftsToEdits()`, `removals()`, `renames()`, `renameKey()`, `TYPES`, `FieldDraft`, `OptionDraft`

## Key files

- [schemaSettings.ts](../../src/commands/schemaSettings.ts)
- [SchemaSettingsModal.ts](../../src/commands/SchemaSettingsModal.ts)
- [schemaDraft.ts](../../src/commands/schemaDraft.ts)
- Tests: `test/schemaDraft.test.ts`, `test/schemaSettings.test.ts`, `test/toolbar.test.ts` (see [Tooling](./tooling.md))

## Dependencies

- [Schema](./schema.md): `SchemaWriter`, `SchemaRegistry`, `RawFields`, `readBaseColumns`, `referencesName`, `ColumnEdits`, `NATIVE_TYPES`, `isColor`, `findOwnKey`, `isUnsafeKey`, `setOption`.
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
