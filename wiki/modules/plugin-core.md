---
title: Plugin core
description: main.ts (composition root and lifecycle) and settings.ts (declarative settings tab).
type: module
tags:
  - wiki
  - module
---
# Plugin core

## Summary

`ImprovedBasesPlugin` in [main.ts](../../src/main.ts) is the composition root: it wires the [schema](./schema.md), [query](./query.md), membership, patch, [widgets](./widgets.md) and [commands](./commands.md) together and owns their lifetimes through `this.register(...)`. [settings.ts](../../src/settings.ts) holds the two user settings and the settings tab.

## Responsibilities

- Construct `BaseQuery`, `SchemaRegistry`, `Membership`, `SchemaWriter` and the shared `WidgetEnv` (`{ membership, writer, app, overlays }`) in `onload()`.
- Decide `widgetsSupported` via `getMetadataTypeManager()` and show one `Notice` per load when unsupported (`notifyUnsupported()` is idempotent via `notified`).
- `applyWidgetsEnabled()`: install or uninstall the [getTypeInfo patch](../concepts/hull-widget.md) according to `settings.widgetsEnabled && widgetsSupported`. Called on load and from the settings toggle.
- Register the three commands and the settings tab; start the registry scan on `workspace.onLayoutReady`.
- Persist settings via `loadData()` / `saveData()`; `mergeSettings()` is a defensive merge that ignores unknown keys and wrongly typed values; the settings tab also writes through it (`setControlValue()`).

## Public API / entry points

- `onload()` — see [Plugin load and ready](../flows/plugin-load-and-ready.md).
- `applyWidgetsEnabled()` — runtime toggle; also flips `widgetsSupported` to `false` if `installTypeInfoPatch()` returns `null`.
- Public fields `query`, `registry`, `membership`, `writer` are read by the smoke and perf scripts through `app.plugins.plugins['improved-bases']` (see [Tooling](./tooling.md)).
- `ImprovedBasesSettingTab.getSettingDefinitions()` uses the declarative settings API (Obsidian 1.13+): a toggle `widgetsEnabled` (disabled when unsupported) and a text field `importFolder` (default `Optionen`). `setControlValue()` saves and re-applies the toggle.

## Key files

- [main.ts](../../src/main.ts) — `ImprovedBasesPlugin`, `applyWidgetsEnabled()`, `notifyUnsupported()`.
- [settings.ts](../../src/settings.ts) — `ImprovedBasesSettings`, `DEFAULT_SETTINGS`, `mergeSettings()`, `ImprovedBasesSettingTab`.
- [manifest.json](../../manifest.json) — id `improved-bases`, `minAppVersion` 1.14.4, `isDesktopOnly: false`.

## Dependencies

- Every other `src/` module (it is the only module allowed to import all of them).
- `obsidian`: `Plugin`, `Notice`, `PluginSettingTab`, `SettingDefinitionItem`.

## Participates in

- [Plugin load and ready](../flows/plugin-load-and-ready.md)

## Related

- [Layers](../architecture/layers.md)
- [Obsidian internals](../architecture/obsidian-internals.md)
