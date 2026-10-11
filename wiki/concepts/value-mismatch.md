---
title: Value mismatch
description: A stored property value whose shape or content does not fit its field schema; preserved and only rewritten on the next edit, with a marker for content that is outside the schema (not for shape).
type: concept
tags:
  - wiki
  - concept
---
# Value mismatch

## Definition

A **value mismatch** is any existing property value that does not fit the [field schema](./field-schema.md) it now falls under:

- **Shape**: a list where `multiple: false`, or a scalar where `multiple: true`. Not marked: it is a valid value and is shown like any other, exactly as Obsidian shows a property after its type was changed. Only the next edit through the widget writes the schema shape.
- **Relation content**: a link whose destination is not in the target base's result; the chip gets `is-foreign` (dashed underline) and the title "Not in target base". In the entry picker such links still appear at the top as active rows (also marked `is-foreign`) so they can be unchecked.
- **Select content**: a value with no option in the schema; the pill is grey with the title "Not in options".

In all cases the value is displayed as-is and never dropped. The next edit through the widget commits in schema shape (`relationOutput()` / `selectOutput()`), which clears the marker. Documented for users in the [README](../../README.md#schema-format).

## Why it matters

Schemas are applied to existing vaults. Silently converting or discarding data on render would be destructive and would also fire property writes just from opening a table. The plugin therefore treats a schema as a target shape that edits converge to, not a constraint it enforces on read. This keeps `types.json` and note files untouched until the user acts.

## Where it lives

- Shape handling (`toList()` on read, `relationOutput()` / `selectOutput()` on commit) in [RelationWidget.ts](../../src/widgets/RelationWidget.ts) and [SelectWidget.ts](../../src/widgets/SelectWidget.ts); no marker.
- `is-foreign` check against `membership.targetEntries()` in the relation widget; "Not in options" and `colorOf()` fallback to grey in the select widget / [values.ts](../../src/widgets/values.ts).
- Styling in [styles.css](../../styles.css).

## Related

- [Widgets](../modules/widgets.md)
- [Field schema](./field-schema.md)
- [Widget render](../flows/widget-render.md)
