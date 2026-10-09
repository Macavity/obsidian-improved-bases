---
title: Add a field type
description: "Where to touch the code to introduce a new schema field type (or extend an existing one) end to end: types, parser, patch dispatch, widget, commands, tests."
type: guide
tags:
  - wiki
  - guide
---
# Add a field type

## Goal

Introduce a new `type:` value in the `improved-bases.fields` schema with its own widget, so that it parses, renders for members, can be configured in the schema settings dialog, and is covered by unit tests.

## Steps

1. **Types**: add the interface and extend the `FieldSchema` union in [types.ts](../../src/schema/types.ts). If it needs new constants (like `COLORS`), put them there.
2. **Parser**: add a branch in `parseField()` in [parse.ts](../../src/schema/parse.ts). Push a descriptive error and return `null` on invalid input; remember that any error rejects the whole [schema base](../concepts/schema-base.md). Add cases to `test/parse.test.ts`.
3. **Widget**: create `src/widgets/<Name>Widget.ts` exporting a `PluginWidget<YourField>` ([types.ts](../../src/widgets/types.ts)). Draw into `el`, commit with `ctx.onChange()` in the storage shape you define, handle a [value mismatch](../concepts/value-mismatch.md) without dropping data, wrap `render()` in a `try/catch` with a plain-text fallback, and register any modal or menu with `env.overlays`. Put pure helpers into [values.ts](../../src/widgets/values.ts) and test them.
4. **Dispatch**: extend `PluginWidgets` and `renderPlugin()` in [typeInfoPatch.ts](../../src/internals/typeInfoPatch.ts), then pass the widget in `applyWidgetsEnabled()` in [main.ts](../../src/main.ts).
5. **Command**: add the type to `TYPES`, `draftsToMutation()`, `validateDrafts()` in [schemaDraft.ts](../../src/commands/schemaDraft.ts) and the row editor in [SchemaSettingsModal.ts](../../src/commands/SchemaSettingsModal.ts) so users can create it without editing YAML. Extend `test/schemaDraft.test.ts`.
6. **Membership**: only needed if the type references another base (like `relation`); then add it to the `wanted` set in `Membership.sync()` and to `isRelationTarget()` in [Membership.ts](../../src/schema/Membership.ts).
7. **Styles**: add classes to [styles.css](../../styles.css) following the `improved-bases-*` prefix.
8. **Docs**: update the schema format table in the [README](../../README.md#schema-format), then run `pnpm check` and `pnpm smoke` ([Run tests and smoke checks](./run-tests-and-smoke.md)).

## Relevant code

- [Schema module](../modules/schema.md), [Widgets module](../modules/widgets.md), [Internals module](../modules/internals.md), [Commands module](../modules/commands.md)
- Flow it plugs into: [Widget render](../flows/widget-render.md)

## Gotchas

- `ctx.key` is lowercase from the table and original-case from the panel; always go through `membership.resolve()` rather than comparing names yourself.
- Never write to note files from a widget; `ctx.onChange()` is the only property write path. Schema writes go through `SchemaWriter.update()` with a pure mutation.
- Use `Object.defineProperty` / `findOwnKey()` when writing user-supplied keys into plain objects ([keys.ts](../../src/schema/keys.ts)); the lint and tests guard against prototype pollution.
- The widget sees the schema snapshot it was rendered with; a schema write only reaches it after the next patch refresh, so keep a local copy if you need optimistic UI (see `SelectWidget`).

## Related

- [Field schema](../concepts/field-schema.md)
- [Schema edit flow](../flows/schema-edit.md)
