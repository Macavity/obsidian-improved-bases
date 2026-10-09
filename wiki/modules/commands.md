---
title: Commands
description: "src/commands: the three palette commands that mutate a schema base through SchemaWriter."
type: module
tags:
  - wiki
  - module
---
# Commands

## Summary

`src/commands/` registers the three commands listed in the [README](../../README.md#commands). Each is a `checkCallback` command whose availability depends on the active file, and each writes exclusively through `SchemaWriter.update()` / `activate()` using a pure mutation function that is unit-tested on its own.

## Responsibilities

- **Activate as schema base** ([activateSchema.ts](../../src/commands/activateSchema.ts), id `activate-schema-base`): available on an active `.base` that the loaded registry neither lists as a schema nor as an error (`canActivate()`). Writes an empty `improved-bases: { fields: {} }` via `writer.activate()`.
- **Configure field** ([configureField.ts](../../src/commands/configureField.ts), id `configure-field`): available on an active schema `.base`, or on a Markdown note that is a member of at least one schema base (after `membership.ready`). `candidateBases()` (pure) lists the applicable bases; with several, a `BasePicker` ([pickers.ts](../../src/widgets/pickers.ts)) asks which one, then `ConfigureFieldModal` opens with a datalist of property names collected from the members' frontmatter, prefills an existing field case-insensitively, validates with `validateDraft()` (reserved names, type collisions, target base must exist, colors), parses `value: color` lines with `parseOptionLines()`, and writes `draftToMutation(draft)`. `buildDraft()` (pure) assembles the draft: an emptied options textarea clears the options of an existing select. Colors are checked with the shared `isColor()`.
- **Import option notes** ([importOptions.ts](../../src/commands/importOptions.ts), id `import-option-notes`): available on any active `.base`; at run time requires the base to be a schema base (membership must know its members). Reads notes directly inside the configured import folder named `<Column> - <Value>`, takes the color from the `Farbe` property, and `planImport()` builds select options only for columns that exist as member properties. `importMutation()` adds missing options, never recolors existing ones, never converts non-select fields; new fields become `multiple` when any member stores that property as a list. A `ResultModal` lists written fields, skipped notes and formulas named `<field>_pill` that are now obsolete.

## Public API / entry points

- `registerActivateSchema(plugin, writer, registry)`, `canActivate(registry, path)`
- `registerConfigureField(plugin, env, registry)`, `ConfigureFieldModal`, `draftToMutation()`, `validateDraft()`, `parseOptionLines()`, `FieldDraft`
- `registerImportOptions(plugin, env, getFolder)`, `planImport()`, `importMutation()`, `OptionNote`, `ImportPlan`

## Key files

- [activateSchema.ts](../../src/commands/activateSchema.ts)
- [configureField.ts](../../src/commands/configureField.ts)
- [importOptions.ts](../../src/commands/importOptions.ts)
- Tests: `test/activateSchema.test.ts`, `test/configureField.test.ts`, `test/importOptions.test.ts` (see [Tooling](./tooling.md))

## Dependencies

- [Schema](./schema.md): `SchemaWriter`, `SchemaRegistry`, `RawFields`, `COLORS`, `NATIVE_TYPES`, `findOwnKey`, `isUnsafeKey`.
- [Membership](../concepts/membership.md) via `WidgetEnv` for `targetEntries()`, `schemaBasesOf()`, `ready`.
- `obsidian`: `Modal`, `Setting`, `FuzzySuggestModal`, `Notice`, `normalizePath`, `parseYaml`.

## Participates in

- [Schema edit](../flows/schema-edit.md)

## Related

- [Schema base](../concepts/schema-base.md)
- [Field schema](../concepts/field-schema.md)
- [Plugin core](./plugin-core.md) (registration and the `importFolder` setting)
