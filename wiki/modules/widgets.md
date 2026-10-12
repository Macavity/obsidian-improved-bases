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

`src/widgets/` renders the two plugin property widgets inside whatever element Obsidian hands to the [hull](../concepts/hull-widget.md): a table cell, a properties-panel row, or the sidebar. Both widgets are plain functions of type `PluginWidget<F>` (`(el, value, ctx, field, env, source?) => WidgetHandle`) and never import Obsidian internals; everything they need arrives through `WidgetEnv`. `source` (`SchemaSource`: the base the displayed definition came from and the field's spelling there) is passed by the patch so that schema writes of the select widget go to the base whose definition is shown; without it the widget resolves the first base by path itself.

## Responsibilities

- **RelationWidget** ([RelationWidget.ts](../../src/widgets/RelationWidget.ts)): shows each link as a chip (no background, no remove button) made of an icon span (`renderIcon(entryIcon(app, dest, membership.baseIcon(field.base)))`) and the link rendered through `LinkValue.parseFromString(...).renderTo()` so hover previews and navigation stay native; marks chips whose destination is not in the target base (`is-foreign`, title "Not in target base"). The root fills the cell (`width: 100%`, chips on one line, side overflow hidden) and is focusable (`tabindex`, `role="button"`, `aria-haspopup="dialog"`): a click in the field outside a link (`a` / `.internal-link` keep their native click: open, modifier for a new tab), Enter or Space on the root opens an `EntryPicker` over `buildItems()`: the active links first (in field order, `label` = destination basename or raw text, `foreign` as on the chip), then the remaining `membership.targetEntries(field.base)` in query order as `[[linktext]]` via `metadataCache.fileToLinktext()`. `toggle()` adds or removes the item's `raw` link (`multiple`) or acts as a radio (`!multiple`: all items off, the picked one on, unchecking clears), flips `item.active` and commits immediately through `ctx.onChange(relationOutput(links, multiple))`; the picker stays open. When the target base file is missing it only shows a `Notice` and opens no picker.
- **Icons** ([icons.ts](../../src/widgets/icons.ts)): `entryIcon(app, file, baseIcon)` resolves the icon text of an entry — the `icon` frontmatter property of the destination note (non-empty string), else `baseIcon` (the target base's default icon, which the widget reads through `membership.baseIcon(field.base)`; see [Schema base](../concepts/schema-base.md)), else `DEFAULT_ICON` (📄). A base therefore looks the same in every relation that targets it. `renderIcon()` sets the text (`.improved-bases-icon.is-text`), or, when `getIcon()` knows the value (with or without a `lucide-` prefix, as icon plugins write it), renders the built-in icon via `setIcon()`.
- **SelectWidget** ([SelectWidget.ts](../../src/widgets/SelectWidget.ts)): colored pills (`data-color`), unknown values shown grey with title "Not in options" and never dropped. `+` opens `openOptionMenu` (pick toggles for `multiple`, replaces otherwise; create writes the option into the schema first via `writer.update(addOptionMutation)` then commits). Right-click on a pill opens `openColorMenu` and writes `setColorMutation`. The widget keeps a local copy of the options because the schema write only reaches it after the next patch refresh.
- **Pickers** ([pickers.ts](../../src/widgets/pickers.ts)): `EntryPicker` (a `FuzzySuggestModal<PickerItem>` over `{ raw, file, label, active, foreign }`; `getSuggestions()` keeps active items first even while filtering; each row renders a checkbox, the icon from `iconOf(item)` and the label with `renderMatches()`; `selectSuggestion()` does not close but calls `onToggle(item)` and re-syncs every row's checkbox from `item.active`; placeholder "Filter entries", empty-state "No entries"), `openOptionMenu` (DOM `Menu` with colored rows plus a prepended search/create input when [menu internals](./internals.md) are available; Enter picks only an exact match, otherwise creates), `openColorMenu`, `openOptionEditMenu` (Rename, Remove, separator, the colors with the current one checked; used by the schema settings dialog's option chips). All register with the `OverlayRegistry` so `uninstall()` can close them.
- **Conflict marker** ([conflictMarker.ts](../../src/widgets/conflictMarker.ts)): `conflictText()` builds "Team is defined in 2 bases. Showing X (relation); Y defines it as text." (or "Using X (text, first by path)" without view context) and `renderConflictMarker()` appends `span.improved-bases-conflict` (Lucide `info`, `aria-label` + `setTooltip`) to the cell or panel row, which gets `improved-bases-has-conflict`; clicks on the icon are stopped so neither the picker nor the cell editor opens. Called by the [getTypeInfo patch](./internals.md), not by the widgets.
- **Values** ([values.ts](../../src/widgets/values.ts)): `toList()`, `linkTarget()` (strips alias/heading/block), `relationOutput()`/`selectOutput()` (string vs list per `multiple`), `colorOf()`, and the two schema mutations `addOptionMutation()` / `setColorMutation()` which write options through the shared `setOption()` ([keys.ts](../../src/schema/keys.ts), `Object.defineProperty`) to stay prototype-safe; `isRecord()` comes from [parse.ts](../../src/schema/parse.ts).
- **Types** ([types.ts](../../src/widgets/types.ts)): `PropertyRenderContext` (`key` is lowercase from the table but original spelling from the panel; `sourcePath`; `onChange`; `blur`), `WidgetHandle`, `OverlayRegistry`, `WidgetEnv`, `PluginWidget`.
- Both widgets show a value in the other storage shape (a [value mismatch](../concepts/value-mismatch.md) of shape) like any other value, without a marker, and write the schema shape on the next commit.

## Public API / entry points

- `RelationWidget: PluginWidget<RelationField>`, `SelectWidget: PluginWidget<SelectField>` — passed to `installTypeInfoPatch()` by [main.ts](./plugin-core.md).
- `OverlayRegistry.add(close)` / `closeAll()`.
- Value helpers and mutations (pure, unit-tested in `test/relationValues.test.ts` and `test/selectValues.test.ts`).

## Key files

- [RelationWidget.ts](../../src/widgets/RelationWidget.ts)
- [SelectWidget.ts](../../src/widgets/SelectWidget.ts)
- [pickers.ts](../../src/widgets/pickers.ts)
- [icons.ts](../../src/widgets/icons.ts)
- [values.ts](../../src/widgets/values.ts)
- [types.ts](../../src/widgets/types.ts)
- [styles.css](../../styles.css) — `.improved-bases-relation` (focus ring, pointer), `.improved-bases-chip`, `.improved-bases-icon`, `.improved-bases-entry` (picker rows), `.improved-bases-select`, `.improved-bases-pill[data-color]`, `.improved-bases-menu-*`. Relation and select share one cell layout: a single non-wrapping flex line with `overflow: hidden`, so a narrow column clips to the side and the row never grows. The pill's `×` and `+` buttons are plain buttons styled by the plugin under two plugin classes (`.improved-bases-select .improved-bases-add`), not `clickable-icon`: Obsidian's `.metadata-property-value .clickable-icon` and theme rules (Cupertino pads `clickable-icon` to 10px, Primary pads `button:not(.clickable-icon)`) outrank a single plugin class and made the pills taller than the row. Rule: elements whose size must survive themes carry only plugin classes and are styled with two of them. In table cells they appear on hover/focus of `.bases-td`, as Obsidian's own cell icons do.

## Dependencies

- `obsidian`: `LinkValue`, `FuzzySuggestModal`, `renderMatches`, `getIcon`/`setIcon`, `Menu`, `Notice`, `TFile`, `metadataCache` (`getFirstLinkpathDest`, `fileToLinktext`, `getFileCache` for the `icon` property).
- [Schema](./schema.md) types and `RawFields`; [Membership](../concepts/membership.md) and `SchemaWriter` via `WidgetEnv`; [menu internals](./internals.md).

## Participates in

- [Widget render](../flows/widget-render.md)
- [Schema edit](../flows/schema-edit.md) (option create / recolor)

## Related

- [Hull widget](../concepts/hull-widget.md)
- [Value mismatch](../concepts/value-mismatch.md)
- [Add a field type](../guides/add-a-field-type.md)
