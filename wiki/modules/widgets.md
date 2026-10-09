---
title: Widgets
description: "src/widgets: RelationWidget, SelectWidget, the pickers and menus they open, value helpers and the shared WidgetEnv / OverlayRegistry."
type: module
tags:
  - wiki
  - module
---
# Widgets

## Summary

`src/widgets/` renders the two plugin property widgets inside whatever element Obsidian hands to the [hull](../concepts/hull-widget.md): a table cell, a properties-panel row, or the sidebar. Both widgets are plain functions of type `PluginWidget<F>` (`(el, value, ctx, field, env) => WidgetHandle`) and never import Obsidian internals; everything they need arrives through `WidgetEnv`.

## Responsibilities

- **RelationWidget** ([RelationWidget.ts](../../src/widgets/RelationWidget.ts)): shows each link as a chip rendered through `LinkValue.parseFromString(...).renderTo()` so hover previews and navigation stay native, marks chips whose destination is not in the target base (`is-foreign`, title "Not in target base"), and opens an `EntryPicker` restricted to `membership.targetEntries(field.base)`; when the target base file is missing it only shows a `Notice` and opens no picker. Picked files become `[[linktext]]` via `metadataCache.fileToLinktext()`. Commits go through `ctx.onChange(relationOutput(links, multiple))`.
- **SelectWidget** ([SelectWidget.ts](../../src/widgets/SelectWidget.ts)): colored pills (`data-color`), unknown values shown grey with title "Not in options" and never dropped. `+` opens `openOptionMenu` (pick toggles for `multiple`, replaces otherwise; create writes the option into the schema first via `writer.update(addOptionMutation)` then commits). Right-click on a pill opens `openColorMenu` and writes `setColorMutation`. The widget keeps a local copy of the options because the schema write only reaches it after the next patch refresh.
- **Pickers** ([pickers.ts](../../src/widgets/pickers.ts)): `EntryPicker` (a `FuzzySuggestModal<TFile>`, empty-state "No entries"), `BasePicker` (a `FuzzySuggestModal<string>` over base paths, used by the schema settings dialog), `openOptionMenu` (DOM `Menu` with colored rows plus a prepended search/create input when [menu internals](./internals.md) are available; Enter picks only an exact match, otherwise creates), `openColorMenu`. All register with the `OverlayRegistry` so `uninstall()` can close them.
- **Values** ([values.ts](../../src/widgets/values.ts)): `toList()`, `linkTarget()` (strips alias/heading/block), `relationOutput()`/`selectOutput()` (string vs list per `multiple`), `colorOf()`, and the two schema mutations `addOptionMutation()` / `setColorMutation()` which write options through the shared `setOption()` ([keys.ts](../../src/schema/keys.ts), `Object.defineProperty`) to stay prototype-safe; `isRecord()` comes from [parse.ts](../../src/schema/parse.ts).
- **Types** ([types.ts](../../src/widgets/types.ts)): `PropertyRenderContext` (`key` is lowercase from the table but original spelling from the panel; `sourcePath`; `onChange`; `blur`), `WidgetHandle`, `OverlayRegistry`, `WidgetEnv`, `PluginWidget`.
- Both widgets detect a [value mismatch](../concepts/value-mismatch.md) (`Array.isArray(value) !== field.multiple`) and add `is-mismatch` until the next commit.

## Public API / entry points

- `RelationWidget: PluginWidget<RelationField>`, `SelectWidget: PluginWidget<SelectField>` — passed to `installTypeInfoPatch()` by [main.ts](./plugin-core.md).
- `OverlayRegistry.add(close)` / `closeAll()`.
- Value helpers and mutations (pure, unit-tested in `test/relationValues.test.ts` and `test/selectValues.test.ts`).

## Key files

- [RelationWidget.ts](../../src/widgets/RelationWidget.ts)
- [SelectWidget.ts](../../src/widgets/SelectWidget.ts)
- [pickers.ts](../../src/widgets/pickers.ts)
- [values.ts](../../src/widgets/values.ts)
- [types.ts](../../src/widgets/types.ts)
- [styles.css](../../styles.css) — `.improved-bases-relation`, `.improved-bases-chip`, `.improved-bases-select`, `.improved-bases-pill[data-color]`, `.improved-bases-menu-*`

## Dependencies

- `obsidian`: `LinkValue`, `FuzzySuggestModal`, `Menu`, `Notice`, `TFile`, `metadataCache`.
- [Schema](./schema.md) types and `RawFields`; [Membership](../concepts/membership.md) and `SchemaWriter` via `WidgetEnv`; [menu internals](./internals.md).

## Participates in

- [Widget render](../flows/widget-render.md)
- [Schema edit](../flows/schema-edit.md) (option create / recolor)

## Related

- [Hull widget](../concepts/hull-widget.md)
- [Value mismatch](../concepts/value-mismatch.md)
- [Add a field type](../guides/add-a-field-type.md)
