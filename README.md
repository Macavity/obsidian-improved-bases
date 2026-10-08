# Improved Bases

Notion-like database editing for [Obsidian](https://obsidian.md) Bases.

> **Status:** early development, not yet released.

## Planned features

- **Relations:** a field links to entries of another base and is stored as a regular wikilink, so graph, backlinks, hover previews and rename updates keep working.
- **Select fields:** options with colors.
- Both work in the native Bases views (table, cards, list) and in the native properties panel of a note. Sorting, grouping and filtering stay native.
- Field definitions live in the `.base` file itself. A field can mean something different in each base; notes outside a schema base keep Obsidian's global property types.

## Development

Requires [Node.js](https://nodejs.org/) (LTS) and [pnpm](https://pnpm.io/).

```bash
pnpm install
pnpm dev      # watch build
pnpm build    # production build
pnpm lint
```

Test vault (`test-vault/`, versioned fixtures; requires the [Obsidian CLI](https://obsidian.md/help/cli)):

```bash
pnpm vault:link   # symlink plugin into test-vault/.obsidian/plugins/improved-bases
pnpm vault:open   # one-time: confirm the dialog in Obsidian, enable community plugins
pnpm dev          # watch build, then `pnpm reload` after changes
pnpm smoke        # reset vault, build, reload, run CLI checks
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## Credits

Scaffolded from [obsidian-sample-plugin-plus](https://github.com/davidvkimball/obsidian-sample-plugin-plus) by David V. Kimball.

## License

[MIT](LICENSE)
