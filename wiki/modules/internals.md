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

`src/internals/` is the quarantine zone for everything that touches undocumented Obsidian members. The rest of the plugin only sees typed interfaces returned by detectors that yield `null` on unexpected shapes. The architectural rationale is in [Obsidian internals](../architecture/obsidian-internals.md).

## Responsibilities

- **Detection** ([detect.ts](../../src/internals/detect.ts)): `getCliHandler(app, name)` (desktop only, guarded `app.cli.handlers.get`), `getMetadataTypeManager(app)` (requires `getTypeInfo`, `trigger`, and `registeredTypeWidgets.text.render`), plus the reduced interfaces `TypeWidget`, `TypeInfo`, `MetadataTypeManager`, `CliHandler`.
- **getTypeInfo patch** ([typeInfoPatch.ts](../../src/internals/typeInfoPatch.ts)): `installTypeInfoPatch(app, env, widgets)` wraps `metadataTypeManager.getTypeInfo` with `monkey-around`. For any property name in `membership.knownFieldNames()` it returns a cached [hull widget](../concepts/hull-widget.md) (cache key expected/inferred/name; `validate` is shape-based through `membership.shapesFor()`) as both `expected` and `inferred`. The hull's `render` resolves the field per `ctx.sourcePath` and dispatches to the relation widget, the select widget, the native widget named by `NATIVE_WIDGET[type]` (`list` → `multitext`), or the original widget when the file is not a member. `refresh(fieldNames)` bumps the hull `generation` (new identity forces the table to rebuild cells) and triggers `changed` per name. It subscribes to membership `changed` and `targets-changed`, and refreshes all known names once on install so already-rendered native cells get replaced. `uninstall()` deactivates, closes overlays, removes listeners, unwraps, clears the cache and re-triggers so native widgets return.
- **CLI query** ([cliQuery.ts](../../src/internals/cliQuery.ts)): `cliQuery(app, basePath)` calls the `base:query` handler with `format: "paths"`, rejects on `Error:` output, and maps the paths to `TFile`s. `cliQueryAvailable()` is the capability check used by [BaseQuery](./query.md).
- **Toolbar button** ([toolbar.ts](../../src/internals/toolbar.ts)): `installSchemaButton(app, onOpen(basePath, viewName))` injects a "Schema" item into every `.bases-toolbar` outside a code-block base (`.block-language-base`), in tabs and embedded bases alike, using Obsidian's own item markup (`div.bases-toolbar-item` > `div.text-icon-button[role=button]` with `.text-button-icon` and `.text-button-label`) so native toolbar styles apply and no `<button>` styling leaks in (Enter and Space activate it); a toolbar that already holds the button is skipped, so a re-rendered toolbar gets it again. It does an initial sweep, then a `MutationObserver` on `document.body` checks every added node (embeds arrive wrapped in neutral containers) plus a `layout-change` sweep. `resolveBase(app, el)` returns `{ path, viewName }`: the owning `.base` (the leaf view's file for a Bases tab, or the `src` link of the surrounding `.internal-embed` resolved against the host note) and the active view name read from the view switcher label (`.bases-toolbar-views-menu .text-button-label`, null if absent); an unresolvable toolbar shows a `Notice` on click. The returned function disconnects the observer and removes all buttons.
- **Menu internals** ([menu.ts](../../src/internals/menu.ts)): `itemDom(item)` and `menuInternals(menu)` expose `Menu.dom` and an `onEnter(fn)` hook that registers an Enter handler on the menu's key scope and moves it to the front so it runs before the menu's own handler.

## Public API / entry points

- `installTypeInfoPatch(app, env, { relation, select })` → `TypeInfoPatch { refresh, uninstall } | null`
- `getMetadataTypeManager(app)`, `getCliHandler(app, name)`
- `cliQuery(app, basePath)`, `cliQueryAvailable(app)`
- `menuInternals(menu)`, `itemDom(item)`
- `installSchemaButton(app, onOpen)` → uninstall function, `resolveBase(app, el)`

## Key files

- [detect.ts](../../src/internals/detect.ts)
- [typeInfoPatch.ts](../../src/internals/typeInfoPatch.ts)
- [cliQuery.ts](../../src/internals/cliQuery.ts)
- [menu.ts](../../src/internals/menu.ts)
- [toolbar.ts](../../src/internals/toolbar.ts)

## Dependencies

- `monkey-around` (`around`) for the composable wrapper.
- [Membership](../concepts/membership.md) via `WidgetEnv` (resolution + field-name set + change events).
- `obsidian` DOM helpers (`createEl`, `createSpan`, `instanceOf`), polyfilled in `test/setup.ts`.
- The two [widgets](./widgets.md), injected as `PluginWidgets` so the patch has no import of widget code.

## Participates in

- [Widget render](../flows/widget-render.md)
- [Schema edit](../flows/schema-edit.md) (refresh after membership `changed`)
- [Base query watch](../flows/base-query-watch.md) (CLI fallback)

## Related

- [Obsidian internals](../architecture/obsidian-internals.md)
- [Hull widget](../concepts/hull-widget.md)
- [Plugin core](./plugin-core.md) (install/uninstall via `applyWidgetsEnabled`)
