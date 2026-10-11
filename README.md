# Improved Bases

Typed relations and colored select options for [Obsidian](https://obsidian.md) Bases, defined per base.

Requires Obsidian 1.14.4 or newer. Desktop is tested; mobile is being verified.

## What it does

- **Relations:** a field links to entries of another base. The value is stored as a regular wikilink, so graph, backlinks, hover previews and rename updates keep working. The picker only offers entries of the target base.
- **Select fields:** options with colors, editable in place; new options can be created from the picker.
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
  fields:
    Team:
      type: relation
      base: Referenzen/Teams/Teams.base
      multiple: true
      icon: 👥
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

- `type`: `relation`, `select`, or a native type passed through (`text`, `list`, `number`, `checkbox`, `date`, `datetime`). A native type means the native widget of that type is used for notes of this base, regardless of `types.json`. The dialog never creates native entries and keeps hand-written ones unchanged; pinning a native type is hand-edit only.
- `multiple` (default `false`): `false` stores a string (`"[[X]]"` or `Value`), `true` stores a YAML list.
- `options`: maps each value to a color: `red`, `orange`, `yellow`, `green`, `lime`, `cyan`, `blue`, `violet`, `pink`, `brown`, `grey`, `black`, `white`. Map order is display order. Unknown values show grey.
- `base`: vault path of the target base. It needs no schema itself.
- `icon` (optional, relations only): emoji shown next to each entry whose note has no `icon` property of its own. Default `📄`.
- Field names are the property names. Obsidian and Bases treat `Team` and `team` as one property, so the plugin resolves field names that way too; writes to notes (renames) always use the exact key.
- A note belongs to a schema base when it is in the result of that base (its filters apply), regardless of folder.

Values that do not fit the schema (a link outside the target base, a list where `multiple: false`) are kept, shown with a marker, and only rewritten into the schema format when you edit them.

### Relations

A relation shows its entries as plain links, each with an icon: the `icon` property of the linked note (an emoji, as written by icon plugins) if it has one, else the field's `icon`, else `📄`. Entries sit side by side on one line; what does not fit is cut off at the edge. Clicking the field beside the entries opens a picker over all entries of the target base with a filter box: active entries come first with a checked box, the rest below. Clicking a row toggles it and keeps the picker open; every toggle is saved immediately. With `multiple: false` the rows act like radio buttons, and unchecking the active one clears the field. Clicking an entry opens the linked note as usual (hover for a preview); the field is also focusable and opens the picker with Enter or Space.

## Schema settings

A dialog edits all fields of a base without touching YAML. Open it via:

- the **Schema** button in the Bases toolbar, also inside embedded bases,
- **Schema settings** in the tab menu, the more-options menu or the file explorer context menu of a `.base` file,
- the command "Open schema settings".

The dialog lists every field the base knows: the columns of all views, the `properties:` keys and the property keys of the member notes. Rows follow the order of the current view (the one the dialog was opened from), the rest is alphabetical. A field without a plugin entry is native and shows Obsidian's detected type in the type dropdown (`native (text)`, ...). The other choices are `relation` and `select`; switching a field back to native deletes its plugin entry. The dialog edits field name, type, `multiple`, the target base and the entry icon of a relation (an emoji; use the system emoji picker, ⌃⌘Space on macOS, Win+. on Windows), and the options of a select with their colors. Save writes all changes at once in one write to the base file; a base without a schema becomes a schema base on first save.

**Add field** appends the property to the `order` of a view. With more than one view, "Add new fields to" picks it; it is preselected with the view the dialog was opened from (the first view when opened from a command or menu).

**Remove field** asks "Remove 'X' and its value from N notes?" first (and says so when filters or formulas reference the field). On save the property is deleted from all notes of the base (matching `X` and `x` alike, as Obsidian does) and from the base itself (`order` of all views, `properties:`, `summaries`, `sort`, `groupBy`). It is refused while the base members are still unknown (right after startup).

Renaming a field also renames that property in all notes of the base (notes are processed one by one; only notes whose frontmatter has the exact old key are touched) and in the base file (`order`, `properties:`, `summaries`, `sort`, `groupBy`). A note that already has both keys is skipped. A notice reports how many notes were renamed, skipped or failed. A rename is refused while the base members are still unknown. Filters and formulas are not rewritten: if they reference the old name, the dialog shows a hint and the notice says "Filters or formulas still reference 'X', update them manually". Renaming a select option does not change note values; notes keep the old value and show it as off-schema.

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
pnpm vault:link-test  # link the registered test-vault's plugin dir to this checkout (works from worktrees)
pnpm vault:open   # one-time: confirm the dialog in Obsidian, enable community plugins
pnpm dev          # watch build, then `pnpm reload` after changes
pnpm smoke        # reset vault, build, reload, run CLI checks
pnpm perf         # 2000 notes + 10 schema bases, prints timings
```

To try the plugin in one of your own vaults, run `pnpm build` and then `pnpm vault:link`: it lists the vaults registered in Obsidian and links the plugin into the one you pick (`pnpm vault:link "My Vault"` skips the prompt). Then enable it under Settings → Community plugins.

See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## Credits

Scaffolded from [obsidian-sample-plugin-plus](https://github.com/davidvkimball/obsidian-sample-plugin-plus) by David V. Kimball.

## License

[MIT](LICENSE)
