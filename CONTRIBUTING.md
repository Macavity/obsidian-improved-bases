# Contributing

Thanks for your interest in contributing. This document describes how to report issues, propose changes, and get a local development environment running.

## Reporting issues

- Search [existing issues](../../issues) before opening a new one.
- For bugs, include: Obsidian version, plugin version, operating system, reproduction steps, and what you expected vs. what happened. Screenshots or a short screen recording help.
- For feature requests, describe the use case and the problem the feature would solve, not just the proposed solution.

## Development setup

Requirements:

- [Node.js](https://nodejs.org/) (LTS recommended)
- [pnpm](https://pnpm.io/). This repo pins a specific version via `packageManager` in `package.json`.

```bash
pnpm install
pnpm dev      # watch mode build
pnpm build    # production build
pnpm lint     # check code style
pnpm lint:fix # auto-fix where possible
```

Build artifacts (`main.js`, `manifest.json`, `styles.css`) are produced in `dist/`; `manifest.json` and `styles.css` are copied there from the repo root (also on change during `pnpm dev`).

## Testing

- Unit: `pnpm test` (vitest + happy-dom, `obsidian` mocked in `test/__mocks__/obsidian.ts`). `pnpm check` = typecheck + lint + test + quality.
- Integration: `pnpm smoke` runs against the versioned vault `test-vault/`, never against a working vault. All CLI calls go through `scripts/lib/cli.mjs`, which always passes `vault="test-vault"` and aborts unless that vault is registered at the main checkout's `test-vault` (override with `IMPROVED_BASES_TEST_VAULT`). Git worktrees share that vault: `vault:reset` mirrors the worktree's fixtures into it and `vault:link-test` points the plugin symlink at the worktree's `dist/`, so Obsidian always loads the checkout that last ran `smoke`, `perf` or `vault:link-test`.

Test vault setup (once):

1. `pnpm vault:link-test` creates the symlink `test-vault/.obsidian/plugins/improved-bases` -> `dist/` (a symlink, not a Finder alias).
2. `pnpm vault:open`, confirm "Open folder as vault" in Obsidian, turn off Restricted mode and make sure `improved-bases` is enabled.
3. `pnpm dev` in one terminal; `pnpm reload` after each rebuild.

`pnpm perf` generates 2000 notes and 10 schema bases in `test-vault/_perf/`, prints `membership.ready` and table render times and resets the vault; it fails if `ready` exceeds 3 s. CLI calls time out after 30 s; keep the test-vault window visible while running `pnpm perf` or `pnpm smoke`, otherwise Chromium throttling causes timeouts. If Obsidian hangs, run `obsidian vault="test-vault" reload` and `pnpm vault:reset`.

`pnpm vault:reset` restores `test-vault/` to `HEAD`, removes untracked files and, from a worktree, mirrors the result into the registered vault (the plugin symlink, themes, `workspace*.json`, cache and `.trash` stay). Change fixtures only in a commit.

Themes: `pnpm themes:smoke` checks the select cells and the schema dialog in the default theme and in every theme listed in `scripts/themes.json`, light and dark, and saves screenshots (path printed at the end). Themes are downloaded into `test-vault/.obsidian/themes/` on first use and are not versioned. `pnpm vault:theme <label|default>` switches manually. Run it for any change to `styles.css`.

## Code quality

[Fallow](https://fallow.tools) measures dead code, duplication and complexity; the policy lives in `.fallowrc.json`.

- `pnpm quality` analyzes the whole repo and must pass before you open a PR. The repo is kept clean: no unused exports, no duplicates, no function above the default thresholds (cyclomatic 20, cognitive 15, CRAP 30).
- `pnpm quality:audit` checks only the files you changed against `main` and fails on findings your change introduces. CI runs the same audit on every PR and posts a summary comment; pushes to `main` run the full analysis.
- In Claude Code, `.claude/hooks/fallow-gate.sh` runs the audit before every `git commit`/`git push` and blocks on a `fail` verdict (needs `jq`).
- Handle findings in this order: fix the code; model an intentional exception in `.fallowrc.json` (`entry`, `usedClassMembers`, `ignoreDependencies`); only as a last resort suppress one line with `// fallow-ignore-next-line <issue> -- reason`. Never raise thresholds to hide a hotspot.

## Pull requests

- Open an issue first for anything non-trivial so we can agree on direction before you spend time on it.
- Keep PRs focused. One concern per PR is easier to review.
- Run `pnpm check` and `pnpm build` before submitting; CI will run these too.
- Follow the existing code style. Use **"properties"** (not "frontmatter") when referring to YAML metadata. **"Markdown"** is always capitalized.
- Update the README if you change user-facing behavior.

## Code style

- TypeScript strict mode, no `any` unless unavoidable.
- Prefer Obsidian's API (`Vault`, `MetadataCache`, `Workspace`) over Node `fs` for vault access.
- No network requests from the plugin runtime.

## Releases

Maintainers cut releases by bumping the version in `manifest.json`, `package.json`, and `versions.json`, committing, then tagging and pushing the tag. The release workflow builds and attaches `main.js`, `manifest.json`, and `styles.css` from `dist/` with build provenance attestation.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
