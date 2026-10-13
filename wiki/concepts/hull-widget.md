---
title: Hull widget
description: The wrapper widget the getTypeInfo patch returns for schema field names; it defers the plugin-vs-native decision to render time.
type: concept
tags:
  - wiki
  - concept
---
# Hull widget

## Definition

A **hull** is a synthetic `TypeWidget` built by `makeHull()` in [typeInfoPatch.ts](../../src/internals/typeInfoPatch.ts). The patched `getTypeInfo` returns it as both `expected` and `inferred` for any property name in `membership.knownFieldNames()`. It looks like the original `expected` widget (`type`, `icon`, `name`), validates by value shape (`validateShape()`: `membership.shapesFor(name)` allows a string list and/or string for relation/select fields, `null` is fine; otherwise it falls back to `info.expected.validate`, because Obsidian passes `validate` no file context), and its `render(el, value, ctx)` decides per `ctx.sourcePath`: plugin widget, native widget of the schema's native type (only when that widget validates the value or the value is empty; otherwise the original widget plus a [mismatch](./value-mismatch.md) marker), or the original widget (`expected` if it validates the value, else `inferred`).

Hulls are cached per `(expected, inferred, lowercase field name)` and per **generation**. `refresh()` increments the generation, so the next `getTypeInfo` returns a new object; the Bases table only rebuilds a cell when the `inferred` identity changes, which is what makes the refresh visible.

## Why it matters

`getTypeInfo(name, value)` has no file context, but the plugin's whole point is per-base behavior. The hull moves the decision to the one call that does carry the file (`render` with `ctx.sourcePath`) while leaving Obsidian's own type inference untouched for non-members. Because the hull falls back to the original widget on `null` resolution or on any exception, a broken widget or a missing schema never leaves a cell empty.

## Where it lives

- `makeHull()`, `hullFor()`, `renderPlugin()` in [typeInfoPatch.ts](../../src/internals/typeInfoPatch.ts).
- Shapes `TypeWidget` / `TypeInfo` in [detect.ts](../../src/internals/detect.ts).
- Installed from `applyWidgetsEnabled()` in [main.ts](../../src/main.ts); removed by `uninstall()` which also re-triggers `changed` so Obsidian rebuilds native widgets.

## Related

- [Widget render](../flows/widget-render.md)
- [Membership](./membership.md)
- [Internals](../modules/internals.md)
- [Obsidian internals](../architecture/obsidian-internals.md)
