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
- If a note belongs to several schema bases that define the same field, the first base by path wins and a warning is logged to the console.
- Designed for a low double-digit number of schema bases (see Performance below).

## Schema format

Add an `improved-bases:` key to a `.base` file, or run the command "Activate as schema base" and then "Configure field".

```yaml
improved-bases:
  fields:
    Team:
      type: relation
      base: Referenzen/Teams/Teams.base
      multiple: true
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

- `type`: `relation`, `select`, or a native type passed through (`text`, `list`, `number`, `checkbox`, `date`, `datetime`). A native type means the native widget of that type is used for notes of this base, regardless of `types.json`.
- `multiple` (default `false`): `false` stores a string (`"[[X]]"` or `Value`), `true` stores a YAML list.
- `options`: maps each value to a color: `red`, `orange`, `yellow`, `green`, `lime`, `cyan`, `blue`, `violet`, `pink`, `brown`, `grey`, `black`, `white`. Map order is display order. Unknown values show grey.
- `base`: vault path of the target base. It needs no schema itself.
- Field names are the property names; case is ignored as in Obsidian.
- A note belongs to a schema base when it is in the result of that base (its filters apply), regardless of folder.

Values that do not fit the schema (a link outside the target base, a list where `multiple: false`) are kept, shown with a marker, and only rewritten into the schema format when you edit them.

## Commands

| Command | ID | Available |
|---|---|---|
| Activate as schema base | `improved-bases:activate-schema-base` | on a `.base` file without schema |
| Configure field | `improved-bases:configure-field` | on a schema base, or on a note that belongs to one |
| Import option notes | `improved-bases:import-option-notes` | on a schema base |

**Import option notes** reads notes from the import folder (setting, default `Optionen`) named `<Column> - <Value>.md`, e.g. `Role - Developer.md`. The `Farbe` property of the note sets the color (one of the colors above, otherwise grey). The column becomes a select field with these options; the first note wins on duplicates. Existing option colors are kept; note files are never changed.

## Settings

- **Enable widgets:** turns the plugin widgets on or off without disabling the plugin. Off means everything renders natively.
- **Import folder:** folder with the option notes (default `Optionen`).

## Unsupported Obsidian versions

The plugin patches an undocumented Obsidian API (`metadataTypeManager.getTypeInfo`) and reads Bases results through an internal view and `app.cli`. These can change without notice. If the expected internals are missing, the plugin shows one notice per load, installs no patch (everything stays native) and keeps the schema commands working. Your data is plain YAML and is never converted.

On disable or unload the patch is removed completely and all views are native again.

## Performance

Measured with `pnpm perf` (2000 notes, 10 schema bases): see `SPIKE_FINDINGS.md`, section "Performance".

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
pnpm vault:link   # symlink plugin into test-vault/.obsidian/plugins/improved-bases
pnpm vault:open   # one-time: confirm the dialog in Obsidian, enable community plugins
pnpm dev          # watch build, then `pnpm reload` after changes
pnpm smoke        # reset vault, build, reload, run CLI checks
pnpm perf         # 2000 notes + 10 schema bases, prints timings
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## Credits

Scaffolded from [obsidian-sample-plugin-plus](https://github.com/davidvkimball/obsidian-sample-plugin-plus) by David V. Kimball.

## License

[MIT](LICENSE)
