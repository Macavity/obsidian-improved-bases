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

To test in a vault, link the repo into `<vault>/.obsidian/plugins/improved-bases/` (a symlink, not a Finder alias) and enable the plugin.

See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## Credits

Scaffolded from [obsidian-sample-plugin-plus](https://github.com/davidvkimball/obsidian-sample-plugin-plus) by David V. Kimball.

## License

[MIT](LICENSE)
