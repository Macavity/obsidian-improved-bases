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

`ImprovedBasesPlugin` in [main.ts](../../src/main.ts) is the composition root: it wires the [schema](./schema.md), [query](./query.md), membership, patch, [widgets](./widgets.md) and [schema settings](schema-settings.md) together and owns their lifetimes through `this.register(...)`. [settings.ts](../../src/settings.ts) holds the user setting and the settings tab.

## Responsibilities

- Construct `BaseQuery`, `SchemaRegistry`, `Membership`, `SchemaWriter` and the shared `WidgetEnv` (`{ membership, query, writer, app, overlays }`) in `onload()`.
- Decide `widgetsSupported` via `getMetadataTypeManager()` and show one `Notice` per load when unsupported (`notifyUnsupported()` is idempotent via `notified`).
- `applyWidgetsEnabled()`: `enableWidgets()` or `disableWidgets()` according to `settings.widgetsEnabled && widgetsSupported`; called on load and from the settings toggle. Enable order: `registerPluginTypes` (one `Notice` per id taken by another plugin, once per plugin instance) → [getTypeInfo patch](../concepts/hull-widget.md) (with `menuBase` for the header-menu checkmark) → `installHeaderTypeChange` (opens schema settings via the handle `registerSchemaSettings` returns; attached to the main document and every popout document, kept in sync via `workspace.on('window-open'/'window-close')`) → `refreshAssigned()` (`trigger('changed')` for fields whose global type is a registered plugin id). Disable reverses it; unregistered types make those fields render as text, values kept. A failed patch unregisters the types again and flips `widgetsSupported`.
- Register the schema settings entry points (`registerSchemaSettings()`: command, file menu item, toolbar button) and the settings tab; start the registry scan on `workspace.onLayoutReady`.
- Persist settings via `loadData()` / `saveData()`; `mergeSettings()` is a defensive merge that ignores unknown keys and wrongly typed values; the settings tab also writes through it (`setControlValue()`).

## Public API / entry points

- `onload()` — see [Plugin load and ready](../flows/plugin-load-and-ready.md).
- `applyWidgetsEnabled()` — runtime toggle; also flips `widgetsSupported` to `false` if `installTypeInfoPatch()` returns `null`.
- Public fields `query`, `registry`, `membership`, `writer` are read by the smoke and perf scripts through `app.plugins.plugins['improved-bases']` (see [Tooling](./tooling.md)).
- `ImprovedBasesSettingTab.getSettingDefinitions()` uses the declarative settings API (Obsidian 1.13+): a toggle `widgetsEnabled` (disabled when unsupported). `setControlValue()` saves and re-applies the toggle.

## Key files

- [main.ts](../../src/main.ts) — `ImprovedBasesPlugin`, `applyWidgetsEnabled()`, `notifyUnsupported()`.
- [settings.ts](../../src/settings.ts) — `ImprovedBasesSettings`, `DEFAULT_SETTINGS`, `mergeSettings()`, `ImprovedBasesSettingTab`.
- [i18n/index.ts](../../src/i18n/index.ts) — `t(key, params)` and `tn(key, count, params)`: every user-visible string of the plugin, resolved against Obsidian's `getLanguage()` (exact code, then its base such as `zh` for `zh-TW`, then English). [i18n/en.ts](../../src/i18n/en.ts) is the typed source of truth (`TranslationKey`); [i18n/de.ts](../../src/i18n/de.ts) must satisfy `Locale`. Placeholders are `{name}`; a `_one`/`_other` key pair is picked by `tn()`. Log output, schema keys, type ids and parse diagnostics stay English. `test/i18n.test.ts` checks key parity and placeholders, `test/i18nLiterals.test.ts` fails on a UI literal outside `src/i18n/`.
- [manifest.json](../../manifest.json) — id `improved-bases`, `minAppVersion` 1.14.4, `isDesktopOnly: false`.

## Dependencies

- Every other `src/` module (it is the only module allowed to import all of them).
- `obsidian`: `Plugin`, `Notice`, `PluginSettingTab`, `SettingDefinitionItem`, `getLanguage`.

## Participates in

- [Plugin load and ready](../flows/plugin-load-and-ready.md)

## Related

- [Layers](../architecture/layers.md)
- [Obsidian internals](../architecture/obsidian-internals.md)
