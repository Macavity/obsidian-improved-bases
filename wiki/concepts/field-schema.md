---
title: Field schema
description: "The validated definition of one property inside a schema base: relation, select, or a native type pass-through."
type: concept
tags:
  - wiki
  - concept
---
# Field schema

## Definition

A **field schema** (`FieldSchema` in [types.ts](../../src/schema/types.ts)) describes one property of a [schema base](./schema-base.md). Three shapes:

| Shape | Keys | Storage |
|---|---|---|
| `RelationField` | `type: relation`, `base` (vault-relative `.base` path), `multiple`. The icon shown next to an entry is not part of the field: it comes from the entry's note (`icon` property) or from the target base's own default icon (`BaseSchema.icon`, see [Schema base](./schema-base.md)) | `"[[X]]"` or a list of wikilinks |
| `SelectField` | `type: select`, `multiple`, `options` (value → one of 13 `COLORS`, map order = display order) | `Value` or a list of values |
| `NativeField` | `type` in `text`, `list`, `number`, `checkbox`, `date`, `datetime` | native |

Field names are matched case-insensitively (the map key is lowercased, the original spelling is kept for writes). Reserved names (`__proto__`, `constructor`, `prototype`) and duplicates are rejected.

## Why it matters

It is the contract between the three sides of the plugin: the parser guarantees the shape, the widgets render from it, and the writer mutations produce it. `multiple` decides the storage shape; an existing property in the other shape is a [value mismatch](./value-mismatch.md) that is shown as-is and rewritten on the next edit. The plugin section stores only customization (`relation`, `select`); a property without an entry is "native" and the dialog shows Obsidian's detected type. A native type in a schema (a type override, chosen in the dialog) forces that native widget for members regardless of `types.json` (`NATIVE_WIDGET` map in [typeInfoPatch.ts](../../src/internals/typeInfoPatch.ts)).

## Where it lives

- Types and `COLORS`/`NATIVE_TYPES` constants: [types.ts](../../src/schema/types.ts).
- Validation: `parseField()` in [parse.ts](../../src/schema/parse.ts) (`isValidBasePath()` for relation targets).
- Creation: `draftsToEdits()` in [schemaDraft.ts](../../src/schema-settings/schemaDraft.ts) (edited in the schema settings dialog), option mutations in [values.ts](../../src/widgets/values.ts).
- Consumption: `RelationWidget` / `SelectWidget` ([Widgets](../modules/widgets.md)).

## Related

- [Schema base](./schema-base.md)
- [Value mismatch](./value-mismatch.md)
- [Add a field type](../guides/add-a-field-type.md)
