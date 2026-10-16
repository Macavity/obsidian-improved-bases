# Improved Bases

Typed relations and colored select options for [Obsidian](https://obsidian.md) Bases, defined per base.

Requires Obsidian 1.14.4 or newer. Desktop is tested; mobile is being verified.

## What it does

- **Relations:** a field links to entries of another base. The value is stored as a regular wikilink, so graph, backlinks, hover previews and rename updates keep working. The picker only offers entries of the target base.
- **Select fields:** options with colors, picked, created, renamed, recolored and deleted from one popover in the field.
- Field definitions live in the `.base` file itself. A field can mean something different in each base; notes outside a schema base keep Obsidian's global property types. The plugin never writes to `types.json`.
- Sorting, grouping and filtering stay native.

## Where it works

| Surface | Behavior |
|---|---|
| Bases table view | relation and select widgets |
| Properties panel of a note | relation and select widgets |
| Sidebar "File properties" | relation and select widgets |
| Bases cards and list views | native and unchanged: read-only, relations show as normal links, selects without color |

Limits:

- Undo (Cmd/Ctrl+Z) works only for edits in the properties panel. The native table has no undo for property edits.
- There are no context menu entries on properties, only commands (below).
- At startup the table briefly shows native widgets before the plugin widgets replace them.
- If a note belongs to several schema bases that define the same field, the base you are looking at wins (in its table or embed). Elsewhere (properties panel, sidebar, code-block bases) the first base by path wins. The field then shows an info icon whose tooltip names the bases and their definitions; a warning is also logged to the console. The schema settings dialog points this out under the field as well ("Also defined in Meetings.base as text; 1 note is in both bases.") but never blocks saving: a field may be defined differently per base, only a note in both bases makes it a conflict. Select options, colors and icons do not count as a difference; new options are written into the base whose definition is shown.
- Designed for a low double-digit number of schema bases (see Performance below).
- With the window in the background, the plugin may take seconds to become ready after being enabled (Obsidian throttles hidden windows).

## Schema format

Add an `improved-bases:` key to a `.base` file, or edit it with the schema settings dialog (see [Schema settings](#schema-settings)).

```yaml
improved-bases:
  icon: 👤
  fields:
    Team:
      type: relation
      base: Referenzen/Teams/Teams.base
      multiple: true
    Lead:
      type: relation
      base: Mitarbeiter.base
      view: Leads
    Role:
      type: select
      multiple: false
      options:
        Developer: blue
        "Product Owner": orange
    Notes:
      type: text
filters: ...
views: ...
```

- `type`: `relation`, `select`, or one of Obsidian's property type ids (`text`, `multitext`, `number`, `checkbox`, `date`, `datetime`, or a type registered by another plugin). Such a native type overrides Obsidian's type for notes of this base: the registered widget of that type is used regardless of `types.json`. The dialog writes the override when you pick a native type other than the one Obsidian detected, and removes the entry when you pick the detected type again. An id that is not registered in the running Obsidian renders natively and is listed in the dialog as "<id> (not registered)". A stored value the override type rejects (e.g. `Aktiv` under `number`) is kept: it shows with Obsidian's own widget and an info icon ("\"Aktiv\" is not a valid Number; shown as Text until edited"). Empty values use the override widget.
- `multiple` (default `false`): `false` stores a string (`"[[X]]"` or `Value`), `true` stores a YAML list.
- `options`: maps each value to a color: `red`, `orange`, `yellow`, `green`, `lime`, `cyan`, `blue`, `violet`, `pink`, `brown`, `grey`, `black`, `white`. Map order is display order. Unknown values show grey.
- `base`: vault path of the target base. It needs no schema itself.
- `view` (optional, relations only): the name of a view of the target base. The relation then offers only the entries of that view, in its sort order, with the view's filters, sort and limit applied. Without `view` all entries of the base are offered. Renaming the view in Obsidian breaks the link: the picker does not open until `view` is updated (or chosen again in the schema settings).
- `icon` (optional, top level of the section): the default entry icon of this base. Every relation that targets this base shows it next to the entries whose note has no `icon` property of its own, so a base looks the same wherever it is referenced. A base may carry only an icon. Default `📄`.
- Field names are the property names. Obsidian and Bases treat `Team` and `team` as one property, so the plugin resolves field names that way too; writes to notes (renames) always use the exact key.
- A note belongs to a schema base when it is in the result of that base (its filters apply), regardless of folder.

A link outside the target base or a select value that is not an option is kept and shown with a marker. A value in the other storage shape (a list where `multiple: false`, a single value where `multiple: true`) is a normal value: it is shown like any other and only rewritten into the schema shape when you edit it, as Obsidian does after you change a property type.

### Selects

A select shows its values as colored pills; a value without an option is grey ("Not in options") and never dropped. Clicking the field (or Enter / Space) opens a popover below it: the active values on top (× removes one), a filter box, and all options with their color pill. Click an option to pick it: a single select replaces the value and closes, with `multiple` it toggles and stays open. Typing a name that is no option offers `Create "name"`, which adds the option to the schema with the next color of the palette. The pencil on an option row opens an editor: rename, delete, and a color grid. Renaming rewrites the value in all notes of the base (refused if the name exists or the base members are still loading). Deleting asks "Remove from notes" or "Only remove from schema" when notes use the value, and does not ask otherwise.

### Relations

A relation shows its entries as plain links, each with an icon: the `icon` property of the linked note (an emoji, as written by icon plugins) if it has one, else the target base's `icon`, else `📄`. Entries sit side by side on one line; what does not fit is cut off at the edge. Clicking the field beside the entries opens a picker over all entries of the target base (or of its `view`, if set) with a filter box: active entries come first with a checked box, the rest below. Clicking a row toggles it and keeps the picker open; every toggle is saved immediately. With `multiple: false` the rows act like radio buttons, and unchecking the active one clears the field. With a `view` that no longer exists in the target base, a notice appears and the picker does not open. Values outside the view (or the base) stay as they are and are marked as not in the target. Clicking an entry opens the linked note as usual (hover for a preview); the field is also focusable and opens the picker with Enter or Space.

## Schema settings

A dialog edits all fields of a base without touching YAML. Open it via:

- the **Schema** button in the Bases toolbar, also inside embedded bases,
- **Schema settings** in the tab menu, the more-options menu or the file explorer context menu of a `.base` file,
- the command "Open schema settings".

The dialog lists every field the base knows as a table: the columns of all views, the `properties:` keys and the property keys of the member notes. Rows follow the order of the current view (the one the dialog was opened from), the rest is alphabetical; the search box filters them by name. Each row edits the field name and type inline. The type dropdown offers every property type Obsidian has registered (Text, List, Number, Checkbox, Date, Date & time, and types added by other plugins), labelled in Obsidian's language, plus Relation and Select. Types bound to fixed property names (Tags, Aliases, …) are not offered. A field without a plugin entry shows Obsidian's detected type (a type that cannot be chosen, such as Tags, is listed as its own entry). Picking another native type overrides Obsidian's type for this base and the details column says "Type override"; picking the detected type again, or switching back from Relation or Select to it, deletes the plugin entry. Picking a native type that existing member values do not fit shows a warning under the field ("5 notes have a Status that is not a valid Number; they keep their value and show as Text"); saving stays possible and the values are not converted. Relation and select rows expand into a detail panel: the target base and, for a relation, its view (a select listing the target's views, "All entries" by default), the options of a select with their colors, and "Allow multiple". Under the options, a select lists the values the member notes already hold for that field ("In notes:", most frequent first with counts, at most 12); click one to make it an option, or "Add all (n)". New options get cycling colors. Switching a list-type property (List, Tags, Aliases) to Select or Relation turns on "Allow multiple". This is how an existing property becomes a select without retyping its values. "Default entry icon" in the header sets the base's own `icon` (an emoji; use the system emoji picker, ⌃⌘Space on macOS, Win+. on Windows), shown for its entries in every relation that targets it. The footer lists pending renames and removals. Save writes all changes at once in one write to the base file; a base without a schema becomes a schema base on first save.

**Add field** appends the property to the `order` of a view. With more than one view, "Add new fields to" picks it; it is preselected with the view the dialog was opened from (the first view when opened from a command or menu).

**Remove field** asks "Remove 'X' and its value from N notes?" first (and says so when filters or formulas reference the field). On save the property is deleted from all notes of the base (matching `X` and `x` alike, as Obsidian does) and from the base itself (`order` of all views, `properties:`, `summaries`, `sort`, `groupBy`). It is refused while the base members are still unknown (right after startup).

Renaming a field also renames that property in all notes of the base (notes are processed one by one; only notes whose frontmatter has the exact old key are touched) and in the base file (`order`, `properties:`, `summaries`, `sort`, `groupBy`). A note that already has both keys is skipped. A notice reports how many notes were renamed, skipped or failed. A rename is refused while the base members are still unknown. Filters and formulas are not rewritten: if they reference the old name, the dialog shows a hint and the notice says "Filters or formulas still reference 'X', update them manually". Renaming or removing a select option in the dialog is applied on Save: the value is migrated in all member notes in one pass per note (a removed value is cleared or dropped from the list; for a removal "Only remove from schema" leaves the notes alone). Notes skipped because of a field-rename conflict are not migrated.

If the `improved-bases:` section of a base is invalid, the dialog shows the parse error and offers "Reset schema" (with a confirmation step), which replaces the section with an empty schema.

## Commands

| Command | ID | Available |
|---|---|---|
| Open schema settings | `improved-bases:open-schema-settings` | on an active `.base` file |

## Settings

- **Enable widgets:** turns the plugin widgets on or off without disabling the plugin. Off means everything renders natively.

## Unsupported Obsidian versions

The plugin patches an undocumented Obsidian API (`metadataTypeManager.getTypeInfo`) and reads Bases results through an internal view and `app.cli`. These can change without notice. If the expected internals are missing, the plugin shows one notice per load, installs no patch (everything stays native) and keeps the schema commands working. Your data is plain YAML and is never converted.

On disable or unload the patch is removed completely and all views are native again.

## Performance

Measured with `pnpm perf` (2000 notes, 10 schema bases): ready in 370 ms, first table render in 113 ms with a visible window. A hidden window is throttled and can be orders of magnitude slower. Details in `SPIKE_FINDINGS.md`, section "Performance".

## Development

Requires [Node.js](https://nodejs.org/) (LTS) and [pnpm](https://pnpm.io/).

```bash
pnpm install
pnpm dev      # watch build
pnpm build    # production build
pnpm lint
pnpm check    # typecheck + lint + unit tests
```

Test vault (`test-vault/`, versioned fixtures; requires the [Obsidian CLI](https://obsidian.md/help/cli)):

```bash
pnpm vault:link-test  # link the registered test-vault's plugin dir to this checkout's dist/ (works from worktrees)
pnpm vault:open   # one-time: confirm the dialog in Obsidian, enable community plugins
pnpm dev          # watch build, then `pnpm reload` after changes
pnpm smoke        # reset vault, build, reload, run CLI checks
pnpm perf         # 2000 notes + 10 schema bases, prints timings
```

To try the plugin in one of your own vaults, run `pnpm build` and then `pnpm vault:link`: it lists the vaults registered in Obsidian and copies the build output `dist/` into the one you pick (`pnpm vault:link "My Vault"` skips the prompt). It copies rather than symlinks so Obsidian Sync picks the plugin up; rerun it after each build. Then enable it under Settings → Community plugins.

See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## Credits

Scaffolded from [obsidian-sample-plugin-plus](https://github.com/davidvkimball/obsidian-sample-plugin-plus) by David V. Kimball.

## License

[MIT](LICENSE)
