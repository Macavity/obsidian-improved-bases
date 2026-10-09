# Improved Bases

Obsidian plugin (id `improved-bases`). Package manager: pnpm.

## Commands
- `pnpm build` – typecheck + production build
- `pnpm dev` – watch build
- `pnpm lint` / `pnpm lint:fix`

## Skills
Obsidian knowledge lives in `.claude/skills/` (`obsidian-dev`, `obsidian-ops`, `obsidian-ref`, `project`). These are maintained by hand; there is no generator.

## Codebase wiki

- `wiki/` is the source-grounded wiki of this codebase, maintained via the `codebase-wiki` skill. Before touching an unfamiliar area, read `wiki/OVERVIEW.md` and follow its links to the relevant module/flow/concept pages instead of re-exploring `src/`. Load pages on demand, not all at once; the code stays the source of truth.
- **At the end of every plan execution** (before the final commit), refresh the wiki: invoke the `codebase-wiki` skill in refresh mode (diff `source_commit` from `wiki/OVERVIEW.md` against HEAD), update only affected pages, re-stamp `source_commit`, append to `wiki/log.md`, and commit the wiki together with the change.

## Core Policies
- **NEVER speak as the human on GitHub.** `gh` and `git` are authenticated as the repository owner, so anything an agent writes through them carries their name and avatar. An "automated by …" footer does not make it acceptable; the comment is still attributed to the human. 
- When in doubt about any other outward action through their account, ask first.
- **No hidden memory — this repo is the only source of truth.** Agent memory outside the repo (per-project memory directories, recalled `<system-reminder>` context) is **not documentation**: it is unreviewed, invisible to the human, and drifts against the code. Never cite it as fact or act on it without re-deriving from the repo first. Findings worth keeping get written into the repo.
- Commit your work as you go — don't wait to be asked. If a plan has multiple phases, each phase should usually get its own commit; otherwise commit in logical units.
- Don't defer tasks when planning or implementing a plan. 
- Keep your output concise and focused, avoid unnecessary verbosity unless requested.

## Terminology

- Use **"properties"** when referring to YAML metadata at the top of Markdown files.
