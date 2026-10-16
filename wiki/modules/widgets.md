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

- **RelationWidget** ([RelationWidget.ts](../../src/widgets/RelationWidget.ts)): shows each link as a chip (no background, no remove button) made of an icon span (`renderIcon(entryIcon(app, dest, membership.baseIcon(field.base)))`) and the link rendered through `LinkValue.parseFromString(...).renderTo()` so hover previews and navigation stay native; marks chips whose destination is not in the target base (`is-foreign`, title "Not in target base"). The root fills the cell (`width: 100%`, chips on one line, side overflow hidden) and is focusable (`tabindex`, `role="button"`, `aria-haspopup="dialog"`): a click in the field outside a link (`a` / `.internal-link` keep their native click: open, modifier for a new tab), Enter or Space on the root opens an `EntryPicker` over `buildItems()`: the active links first (in field order, `label` = destination basename or raw text, `foreign` as on the chip), then the remaining `membership.targetEntries(key)` (key = `targetKey({ base, view })`, so a relation with a `view` offers only that view's entries, in the view's sort order) in query order as `[[linktext]]` via `metadataCache.fileToLinktext()`. `toggle()` adds or removes the item's `raw` link (`multiple`) or acts as a radio (`!multiple`: all items off, the picked one on, unchecking clears), flips `item.active` and commits immediately through `ctx.onChange(relationOutput(links, multiple))`; the picker stays open. When the target base file is missing it only shows a `Notice` and opens no picker; likewise for a `view` that is not among `baseViewNames(app, field.base)` ([baseViews.ts](../../src/schema/baseViews.ts): `views[].name` in file order, null for a missing or unparsable base): `View "X" not found in <base>`. Values outside the view keep the `is-foreign` mark "Not in target base".
- **Icons** ([icons.ts](../../src/widgets/icons.ts)): `entryIcon(app, file, baseIcon)` resolves the icon text of an entry — the `icon` frontmatter property of the destination note (non-empty string), else `baseIcon` (the target base's default icon, which the widget reads through `membership.baseIcon(field.base)`; see [Schema base](../concepts/schema-base.md)), else `DEFAULT_ICON` (📄). A base therefore looks the same in every relation that targets it. `renderIcon()` sets the text (`.improved-bases-icon.is-text`), or, when `getIcon()` knows the value (with or without a `lucide-` prefix, as icon plugins write it), renders the built-in icon via `setIcon()`.
- **SelectWidget** ([SelectWidget.ts](../../src/widgets/SelectWidget.ts)): colored pills (`data-color`), unknown values shown grey with title "Not in options" and never dropped. No `+` or `×` on the pills: like the relation widget the root is focusable and a click (or Enter / Space) opens the [OptionPicker](#option-picker) with a `host()` of own copies of options and values plus `commit`, `create`, `recolor`, `rename`, `remove`. `create` writes the option (color from `nextOptionColor()`) via `writer.update(addOptionMutation)` then commits; `recolor` writes `setColorMutation`, which throws `StaleOptionError` instead of bringing back an option removed elsewhere; `rename` / `remove` rewrite the schema (`renameOptionMutation` / `removeOptionMutation`, which throw `StaleOptionError` when the schema moved on) and migrate the value in all member notes through `migrateOptionValues()` with the same `optionValueEdit()` the schema dialog uses ([optionMigration.ts](../../src/schema/optionMigration.ts)), so both entry points write the same note values; it refuses while the members are unknown (`MEMBERS_LOADING`, [messages.ts](../../src/schema/messages.ts)) and a rename onto an existing or reserved name. Delete asks through `confirmOptionDelete()` only when `countNotesWithValue()` finds users. The widget keeps a local copy of the options because the schema write only reaches it after the next patch refresh.
- **Option picker** (<a id="option-picker"></a>[OptionPicker.ts](../../src/widgets/OptionPicker.ts)): `openOptionPicker(anchor, host, overlays)` builds a popover at `document.body`, placed below or above the field by `placePopover()` ([placePopover.ts](../../src/widgets/placePopover.ts), pure; width at least the field, `align: "start" | "end"`) and dismissed on an outside mousedown by `dismissOnOutside()` ([popover.ts](../../src/widgets/popover.ts)), which also registers with the `OverlayRegistry` and treats a mousedown in a `.modal-container` (the delete confirmation) as inside. Layout: header with the active values (× removes), filter input, one row per option (pill, pencil, ✓ when active), `Create "X"` when no option equals the query. Arrow keys move the highlight and scroll it into view (`scrollIntoView({ block: "nearest" })`), Enter picks it; picker and editor inputs ignore keys while an IME composes (`isComposing`). `nextValues()`: single replaces (or clears the active one) and closes, multiple toggles and stays open. It works on its own copies and updates them after successful host actions (a rename through `renameInList()`), so it survives the cell re-rendering; a rejected host action closes the picker and logs, like a render failure.
- **Option editor** ([OptionEditor.ts](../../src/widgets/OptionEditor.ts)): `openOptionEditor(anchor, option, handlers, overlays)`, a small popover at the pencil: name input (Enter or blur saves a rename, Escape closes only the editor), Delete, and a grid of the `COLORS`. **Option delete** ([OptionDeleteModal.ts](../../src/widgets/OptionDeleteModal.ts)): `confirmOptionDelete()` resolves `"notes"` ("Remove from notes"), `"schema"` ("Only remove from schema") or `null` (Cancel).
- **Pickers** ([pickers.ts](../../src/widgets/pickers.ts)): `EntryPicker` (a `FuzzySuggestModal<PickerItem>` over `{ raw, file, label, active, foreign }`; `getSuggestions()` keeps active items first even while filtering; each row renders a checkbox, the icon from `iconOf(item)` and the label with `renderMatches()`; `selectSuggestion()` does not close but calls `onToggle(item)` and re-syncs every row's checkbox from `item.active`; placeholder "Filter entries", empty-state "No entries") and `openOptionEditMenu` (DOM `Menu`: Rename, Remove, separator, the colors with the current one checked; used by the schema settings dialog's option chips only). Both register with the `OverlayRegistry` so `uninstall()` can close them.
- **Conflict marker** ([conflictMarker.ts](../../src/widgets/conflictMarker.ts)): `conflictText()` builds "Team is defined in 2 bases. Showing X (relation); Y defines it as text." (or "Using X (text, first by path)" without view context) and `renderConflictMarker()` appends `span.improved-bases-conflict` (Lucide `info`, `aria-label` + `setTooltip`) to the cell or panel row, which gets `improved-bases-has-conflict`; clicks on the icon are stopped so neither the picker nor the cell editor opens. Called by the [getTypeInfo patch](./internals.md), not by the widgets.
- **Values** ([values.ts](../../src/widgets/values.ts)): `toList()`, `linkTarget()` (strips alias/heading/block), `relationOutput()`/`selectOutput()` (string vs list per `multiple`; a select list is written without duplicates), `colorOf()`, `nextOptionColor()` (cycles the palette without grey, black, white), `countNotesWithValue()` for note values and the schema mutations `addOptionMutation()` / `setColorMutation()` / `renameOptionMutation()` / `removeOptionMutation()` which write options through the shared `setOption()` ([keys.ts](../../src/schema/keys.ts), `Object.defineProperty`) to stay prototype-safe; `isRecord()` comes from [parse.ts](../../src/schema/parse.ts).
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
- [styles.css](../../styles.css) — `.improved-bases-relation` (focus ring, pointer), `.improved-bases-chip`, `.improved-bases-icon`, `.improved-bases-entry` (picker rows), `.improved-bases-select`, `.improved-bases-pill[data-color]`, `.improved-bases-option-picker`, `.improved-bases-option-editor`. Relation and select share one cell rule: a single non-wrapping flex line with `overflow: hidden`, so a narrow column clips to the side and the row never grows, and `min-height: var(--input-height)`, so an empty field (no chips/pills) keeps its click area instead of collapsing to zero height. Plugin-drawn buttons (the picker's `×`, pencil) are plain buttons styled under two plugin classes, not `clickable-icon`: Obsidian's `.metadata-property-value .clickable-icon` and theme rules (Cupertino pads `clickable-icon` to 10px, Primary pads `button:not(.clickable-icon)`) outrank a single plugin class and made the pills taller than the row. Rule: elements whose size must survive themes carry only plugin classes and are styled with two of them. In table cells they appear on hover/focus of `.bases-td`, as Obsidian's own cell icons do.

## Dependencies

- `obsidian`: `LinkValue`, `FuzzySuggestModal`, `renderMatches`, `getIcon`/`setIcon`, `Menu`, `Notice`, `TFile`, `metadataCache` (`getFirstLinkpathDest`, `fileToLinktext`, `getFileCache` for the `icon` property).
- [Schema](./schema.md) types and `RawFields`; [Membership](../concepts/membership.md) and `SchemaWriter` via `WidgetEnv`; `itemDom()` from [menu internals](./internals.md) for the dialog's color menu.

## Participates in

- [Widget render](../flows/widget-render.md)
- [Schema edit](../flows/schema-edit.md) (option create / recolor / rename / remove)

## Related

- [Hull widget](../concepts/hull-widget.md)
- [Value mismatch](../concepts/value-mismatch.md)
- [Add a field type](../guides/add-a-field-type.md)
