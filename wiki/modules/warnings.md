---
title: Warnings
description: "src/warnings: the in-memory warning registry, its sources, the list modal and the shared row renderer."
type: module
tags:
  - wiki
  - module
---
# Warnings

## Summary

`src/warnings/` keeps the plugin's current warnings in memory so the user can find them after the notice is gone (behaviour: [README](../../README.md#warnings)). The registry holds two kinds: **state** warnings, which a source re-reports on every run and which disappear by themselves, and **event** warnings, which record a failure and stay until dismissed. [Plugin core](./plugin-core.md) owns the registry, feeds the registry- and membership-derived entries and exposes the access points (status bar item, command, settings row); the [schema settings](./schema-settings.md) dialog shows the entries of its base.

## Responsibilities

- **Registry** ([WarningRegistry.ts](../../src/warnings/WarningRegistry.ts)): `WarningRegistry extends Events`; a `Warning` is `{ id, kind: "state" | "event", text, at, bases }`. `report(id, { text, bases })` upserts a state warning (an unchanged one is a no-op and keeps `at`), `resolve(id)` removes it, `replace(prefix, entries)` swaps every state warning whose id starts with `prefix:` for the given set (ids get the prefix; unchanged entries are kept, event warnings are never touched), `push({ text, bases })` adds an event warning with id `event:<n>`, `dismiss(id)` removes any entry. `list()` is newest first (ties keep the later report first), `forBase(path)` filters by `bases`, `count` is the size. Every change triggers `"changed"`.
- **Sources** ([sources.ts](../../src/warnings/sources.ts)): `schemaWarnings(registry.errors())` (one per base with parse errors, id = path) and `conflictWarnings(membership.conflicts())` (one per field name and set of bases, id = `name\0base\0base…`, text via `tn("warning.conflict", files)`), both called by `main.watchWarningSources()` through `replace("schema", …)` / `replace("conflict", …)`. Other sources report directly: `main` (`plugin:unsupported`, `plugin:typeTaken:<id>`), the relation widget (`relation:<source base>:<key>`, see [Widgets](./widgets.md)), and the event sources `schemaSettings.onSave` (`warning.saveFailed`) and the select widget (`warning.optionFailed`).
- **Row renderer** ([render.ts](../../src/warnings/render.ts)): `renderWarningRow(parent, warning, { openBase?, dismiss })` draws `.improved-bases-warning.is-state|is-event` with a kind icon (`lucide-alert-triangle` / `lucide-alert-circle`), the text, one link per base (`.improved-bases-warning-base`, base name without `.base`, `aria-label` "Open schema settings of …") when `openBase` is given, and for events a `×` button (`.improved-bases-warning-dismiss`).
- **Modal** ([WarningsModal.ts](../../src/warnings/WarningsModal.ts)): `new WarningsModal(app, registry, openBase).open()` lists `registry.list()` (or "No warnings"), re-renders on `"changed"` while open, and a base link closes the modal before opening that base's schema settings.
- **Texts** come from [i18n](./plugin-core.md) at report time (`warning.*`, `warnings.*`, `notice.seeWarnings`); the related notices keep their text and end in "(see warnings)".

## Public API / entry points

- `WarningRegistry`, `Warning`, `WarningInput`, `WarningKind`
- `schemaWarnings()`, `conflictWarnings()`
- `renderWarningRow()`, `WarningRowHandlers`
- `WarningsModal`

## Key files

- [WarningRegistry.ts](../../src/warnings/WarningRegistry.ts)
- [sources.ts](../../src/warnings/sources.ts)
- [render.ts](../../src/warnings/render.ts)
- [WarningsModal.ts](../../src/warnings/WarningsModal.ts)
- [styles.css](../../styles.css) — `.improved-bases-status*`, `.improved-bases-warning*`, `.improved-bases-warnings-modal`, `.improved-bases-dialog-warnings*`

## Dependencies

- `obsidian`: `Events`, `Modal`, `setIcon`
- [i18n](./plugin-core.md) (`t`, `tn`); `Conflict` from [Membership](../concepts/membership.md)

## Participates in

- [Plugin load and ready](../flows/plugin-load-and-ready.md) (state warnings follow registry and membership changes)
- [Schema edit](../flows/schema-edit.md) (event warnings after a failed note write)

## Related

- [Plugin core](./plugin-core.md)
- [Schema settings](./schema-settings.md)
- [Widgets](./widgets.md)
