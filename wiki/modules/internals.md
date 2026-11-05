---
title: Internals
description: "src/internals: feature detection for undocumented Obsidian members, the getTypeInfo patch, the CLI base:query wrapper and menu internals."
type: module
tags:
  - wiki
  - module
---
# Internals

## Summary

`baseContextOf(app, el)` ([baseContext.ts](../../src/internals/baseContext.ts)) answers "which `.base` file backs the view that contains this element" for both the toolbar button and the widget render; it walks `workspace.iterateAllLeaves` for the containing leaf and reads `.internal-embed[src]` for embedded bases, returning null for code-block bases, the properties panel and the sidebar.

`src/internals/` is the quarantine zone for everything that touches undocumented Obsidian members. The rest of the plugin only sees typed interfaces returned by detectors that yield `null` on unexpected shapes. The architectural rationale is in [Obsidian internals](../architecture/obsidian-internals.md).

## Responsibilities

- **Detection** ([detect.ts](../../src/internals/detect.ts)): `getCliHandler(app, name)` (desktop only, guarded `app.cli.handlers.get`), `getMetadataTypeManager(app)` (requires `getTypeInfo`, `trigger`, and `registeredTypeWidgets.text.render`), plus the reduced interfaces `TypeWidget` (`type`, `icon?`, `name?`, `reservedKeys?`, `validate`, `render`), `TypeInfo`, `MetadataTypeManager` (now with optional `setType`), `CliHandler`. `assignedTypes(mtm)` lists `[name, type]` of globally typed properties from `assignedWidgets`; measured shape (Obsidian 1.14.4): lowercase key to `{ name, widget }`, empty on any other shape.
- **Type registry** ([typeRegistry.ts](../../src/internals/typeRegistry.ts)): `listPropertyTypes(mtm)` turns `registeredTypeWidgets` into `PropertyType[]` (`type`, localized `name` from the widget's `name` string or getter with the id as fallback, `icon` with `lucide-text` as fallback, `reserved` when the widget has `reservedKeys`, i.e. tags, aliases, file, folder, property; `validate` wraps the widget's check so a throw counts as valid); `nameOf(widget, fallback)` is exported for the patch's marker text; empty for a missing manager. `propertyTypeOf(types, id)` looks one up and returns a placeholder named `<id> (not registered)` otherwise. The schema dialog builds its type dropdown from this list, so labels follow Obsidian's language and types registered by other plugins appear automatically.
- **getTypeInfo patch** ([typeInfoPatch.ts](../../src/internals/typeInfoPatch.ts)): `installTypeInfoPatch(app, env, widgets)` wraps `metadataTypeManager.getTypeInfo` with `monkey-around`. For any property name in `membership.knownFieldNames()` it returns a cached [hull widget](../concepts/hull-widget.md) (cache key expected/inferred/name; `validate` is shape-based through `membership.shapesFor()`) as both `expected` and `inferred`. The hull's `render` resolves the field per `ctx.sourcePath` and dispatches to the relation widget, the select widget, the widget registered under the field's type id (`registeredTypeWidgets[type]`; an unregistered id falls back to the original widget; a non-empty value that widget's `validate` rejects renders with the original widget plus an info marker, see [Value mismatch](../concepts/value-mismatch.md)), or the original widget when the file is not a member. While a header `contextmenu` is being dispatched (`menuBase()`), for calls with `value === undefined` and fields the base has its own entry for, `menuInfo()` returns that entry's type widget (registered widget's `type`/`icon`/`name` on the hull, cached per hull and type for a stable identity) as both `expected` and `inferred`, so the native menu checks the base's type. Clicking that checked entry still makes Obsidian call `setType`, i.e. writes it as the global type for the whole vault. `refresh(fieldNames)` bumps the hull `generation` (new identity forces the table to rebuild cells) and triggers `changed` per name. It subscribes to membership `changed` and `targets-changed`, and refreshes all known names once on install so already-rendered native cells get replaced. `uninstall()` deactivates, closes overlays, removes listeners, unwraps, clears the cache and re-triggers so native widgets return.
- **Type registration** ([typeRegistration.ts](../../src/internals/typeRegistration.ts)): `registerPluginTypes(mtm, { select, relation })` writes the generic widgets into `registeredTypeWidgets` for every free id (ids taken by another plugin are returned in `skipped`, left untouched); `unregister()` deletes only entries still identical to our widget and triggers nothing (the caller refreshes). Key = type id, lowercase; the widget's `name` must be a function.
- **Header type change** ([headerTypeChange.ts](../../src/internals/headerTypeChange.ts)): `installHeaderTypeChange(mtm, { resolve, pluginTypes, hasBaseEntry, open })` listens in every document passed to `attach(doc)` (main window and popouts; `detach(doc)` on close; main.ts wires `window-open`/`window-close` and existing leaves) and remembers the base and view of a right-clicked column header (capture `contextmenu` on `.bases-thead .bases-td:not(.mod-implicit)`) and wraps `setType`: the original runs first, then `open(base, { name, type })` fires when the type is a registered plugin type or the base has its own entry for the field (lowercase key). `pending()` is the dialog context; `menuBase()` is the shorter checkmark window for the getTypeInfo patch. Returns null without `setType`. See decisions below.
- **CLI query** ([cliQuery.ts](../../src/internals/cliQuery.ts)): `cliQuery(app, basePath)` calls the `base:query` handler with `format: "paths"`, rejects on `Error:` output, and maps the paths to `TFile`s. `cliQueryAvailable()` is the capability check used by [BaseQuery](./query.md).
- **Toolbar button** ([toolbar.ts](../../src/internals/toolbar.ts)): `installSchemaButton(app, onOpen(basePath, viewName))` injects a "Schema" item into every `.bases-toolbar` outside a code-block base (`.block-language-base`), in tabs and embedded bases alike, using Obsidian's own item markup (`div.bases-toolbar-item` > `div.text-icon-button[role=button]` with `.text-button-icon` and `.text-button-label`) so native toolbar styles apply and no `<button>` styling leaks in (Enter and Space activate it); a toolbar that already holds the button is skipped, so a re-rendered toolbar gets it again. It does an initial sweep, then a `MutationObserver` on `document.body` checks every added node (embeds arrive wrapped in neutral containers) plus a `layout-change` sweep. `resolveBase(app, el)` returns `{ path, viewName }`: the owning `.base` (the leaf view's file for a Bases tab, or the `src` link of the surrounding `.internal-embed` resolved against the host note) and the active view name read from the view switcher label (`.bases-toolbar-views-menu .text-button-label`, null if absent); an unresolvable toolbar shows a `Notice` on click. The returned function disconnects the observer and removes all buttons.
- **Menu internals** ([menu.ts](../../src/internals/menu.ts)): `itemDom(item)` returns `MenuItem.dom` or null. The former `menuInternals()` (Menu.dom, key scope, Enter hook) is gone: the option picker is its own popover, not a `Menu`.

## Decisions

- **Header context is discarded on the next input.** Native menus (macOS default) put no `.menu` in the DOM and give the page neither Escape nor outside clicks ([SPIKE_FINDINGS](../../SPIKE_FINDINGS.md), "Native type menu"). So the context is cleared after the first `setType`, on `pointerdown` outside a `.menu` in any attached document, on `keydown` without an open DOM `.menu`, and on any `contextmenu` outside a header. Otherwise a later type change in the properties panel would be attributed to the base. Residual risk: a programmatic `setType` with no input in between.
- **Checkmark via `inferred`, only during the menu dispatch.** The column header menu checks `getTypeInfo(name, undefined).inferred.type`, not `expected`, while the cell's bubble listener builds the menu. The override window opens in the capture `contextmenu` listener and closes in a bubble listener on the document's window (a microtask would run too early for real events), with `setTimeout(0)` as fallback when propagation is stopped. It is not restricted to the right-clicked column: the cell holds only the display name (the property sits in Bases' internal `cellLookup`), so every field with a base entry is covered during that dispatch. Override widgets are cached so `inferred` keeps its identity and Bases does not rebuild cells.
- **`assignedWidgets` shape.** Read defensively (see Detection); main refreshes fields whose global type is a registered plugin id on enable and disable, because Obsidian built their widgets while the id was unknown or still registered.

## Public API / entry points

- `installTypeInfoPatch(app, env, { relation, select }, { menuBase? })` → `TypeInfoPatch { refresh, uninstall } | null`
- `getMetadataTypeManager(app)`, `getCliHandler(app, name)`
- `cliQuery(app, basePath)`, `cliQueryAvailable(app)`
- `registerPluginTypes(mtm, widgets)` → `{ registered, skipped, unregister }`; `installHeaderTypeChange(mtm, opts)` → `{ attach, detach, pending, menuBase, uninstall } | null`; `assignedTypes(mtm)`
- `itemDom(item)`
- `installSchemaButton(app, onOpen)` → uninstall function, `resolveBase(app, el)`

## Key files

- [detect.ts](../../src/internals/detect.ts)
- [typeInfoPatch.ts](../../src/internals/typeInfoPatch.ts)
- [cliQuery.ts](../../src/internals/cliQuery.ts)
- [typeRegistration.ts](../../src/internals/typeRegistration.ts)
- [headerTypeChange.ts](../../src/internals/headerTypeChange.ts)
- [menu.ts](../../src/internals/menu.ts)
- [toolbar.ts](../../src/internals/toolbar.ts)

## Dependencies

- `monkey-around` (`around`) for the composable wrapper.
- [Membership](../concepts/membership.md) via `WidgetEnv` (resolution + field-name set + change events).
- `obsidian` DOM helpers (`createEl`, `createSpan`, `instanceOf`), polyfilled in `test/setup.ts`.
- The two [widgets](./widgets.md), injected as `PluginWidgets` so the patch has no import of widget code.
- [Schema](./schema.md): `isRelation`/`isSelect` guards in the patch; [Schema settings](./schema-settings.md) consumes `listPropertyTypes()`/`propertyTypeOf()`.

## Participates in

- [Widget render](../flows/widget-render.md)
- [Schema edit](../flows/schema-edit.md) (refresh after membership `changed`)
- [Base query watch](../flows/base-query-watch.md) (CLI fallback)

## Related

- [Obsidian internals](../architecture/obsidian-internals.md)
- [Hull widget](../concepts/hull-widget.md)
- [Plugin core](./plugin-core.md) (install/uninstall via `enableWidgets` / `disableWidgets`)
- [Widgets](./widgets.md) (generic select/relation registered as property types)
