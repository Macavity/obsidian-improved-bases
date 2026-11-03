---
name: release
description: Use when cutting a new release of this plugin — picking the next version, checking the code is release-ready, bumping, tagging and publishing through GitHub. Triggers on "release", "cut a release", "publish a new version", "bump the version", "tag 0.x.y", "what version should the next release be", "is this ready to release". Löst auch auf Deutsch aus - "Release machen", "neue Version veröffentlichen", "Version hochziehen", "welche Version", "können wir releasen".
---

# Release

The GitHub workflow `.github/workflows/release.yml` builds, attests and publishes on a tag push. This skill covers everything before that push and the check afterwards. Background on the mechanism: `.claude/skills/obsidian-ops/references/versioning-releases.md`.

Three facts drive every step. Never work around them.

1. **The release notes are the tagged commit's message.** The workflow takes `git log -1 --format=%B`. A bump commit that says only "Bump version to X" ships an empty release (0.1.0 did).
2. **The tag equals `manifest.json`'s `version`, no `v` prefix.** The workflow titles the release from the manifest.
3. **`versions.json` gets a new key only when `minAppVersion` changed.** `version-bump.mjs` enforces this. A release whose newest key is older than the version is correct, not a bug. Do not add keys by hand.

## 1. Preconditions

Run all of these; a failed one stops the release until fixed.

```bash
git fetch origin
git switch main && git pull --ff-only
git status --short            # must be empty
gh pr list --state open       # releases wait for nothing that should be in them
git log --oneline $(git describe --tags --abbrev=0)..HEAD
```

- Release only from `main`, never from a feature branch. The community directory reads `manifest.json` from the head of the default branch.
- Dirty working tree or a checked-out feature branch: those changes are not part of the release. Ask the user whether to commit them on their branch, stash them, or leave them out, before switching to `main`. Never carry uncommitted changes into the bump commit.
- Compare against `origin/main`, not a stale local view. "The branch is ahead of main" after a merged PR means the local `main` is old.
- Zero commits since the last tag → nothing to release. Say so and stop.

## 2. Pick the version

Base the proposal on **user-visible change**, not commit subjects. Read the diff of `src/`, `styles.css`, `manifest.json` and `README.md` since the last tag:

```bash
LAST=$(git describe --tags --abbrev=0)
git diff --stat "$LAST"..HEAD -- src styles.css manifest.json README.md
git diff "$LAST"..HEAD -- manifest.json README.md
```

Pre-1.0 rules for this plugin:

| Change since last tag | Bump |
| --- | --- |
| Removes or renames a setting, property type, command, or changes stored data | **minor** (state the break in the notes) |
| Any new feature or new user-facing behaviour | **minor** |
| Only fixes, docs, tooling, refactors | **patch** |
| `minAppVersion` raised | at least **minor**; `versions.json` gets a new key automatically |

Present the version with the two or three changes that justify it, and wait for the user's confirmation. Never bump before that.

## 3. Gate

All of it, every release, no matter how small the diff. CI ran on the PR, but the merge commit on `main` is a different tree.

```bash
pnpm install --frozen-lockfile
pnpm check                    # typecheck + lint + test (coverage) + fallow
pnpm build
```

Then the automated section of `.claude/skills/obsidian-ops/references/release-readiness.md`: files at root, manifest consistent (`package.json` and `manifest.json` versions equal after the bump), no stray console output, README disclosures. Report each item as pass or fail with a concrete fix. The interactive section (platform and mobile testing) is a question to the user, answered by them, not assumed.

A gate failure is fixed on `main` in its own commit before the bump, or the release is called off. Never bump on top of a red gate.

## 4. Draft the release notes

Write them for a plugin user, from the diff you read in step 2. Group as `### Breaking` (only if present), `### Features`, `### Fixes`; one line per item, present tense, no commit hashes, no internal names (spikes, review fixes, wiki stamps, tooling). No version heading: the commit subject carries it and the workflow titles the release from the tag. This format wins over the "Summarize for Release" layout in `obsidian-ops/references/summarize-commands.md`.

Show the notes to the user together with the version. They become the commit body verbatim.

## 5. Bump, commit, tag

Only after the user confirmed version and notes.

```bash
pnpm version <patch|minor> --no-git-tag-version
```

This writes `package.json` and `manifest.json` and stages `manifest.json` and `versions.json` only. `package.json` stays unstaged, so add it explicitly:

```bash
git add package.json manifest.json versions.json
git diff --cached              # exactly the version lines, nothing else
```

Commit with the notes as the body. Subject line `Release <version>`; the body is the markdown from step 4:

```bash
git commit -F- <<'MSG'
Release 0.2.0

### Features
- ...

### Fixes
- ...
MSG
git tag 0.2.0
```

Check `git show --stat HEAD` and `git tag --points-at HEAD` before pushing.

The bump commit touches no code, so the wiki refresh rule from `CLAUDE.md` does not apply to it. If the wiki is stale from earlier work, that is a separate commit before the bump.

## 6. Push and publish

Pushing the tag is the outward, irreversible step. Ask once more, naming the version; proceed on an explicit yes only.

Two separate commands, in this order, with a short pause in between. A combined push can drop the workflow trigger.

```bash
git push origin main
```

```bash
git push origin 0.2.0
```

Then verify, do not assume:

```bash
gh run list --workflow=release.yml -L 1
gh run watch                   # until the run completes
gh release view 0.2.0          # title = version, assets main.js, manifest.json, styles.css, body = notes
```

Workflow did not fire: follow "Pushing tags so the workflow actually fires" in `versioning-releases.md` (`gh workflow run release.yml --ref main` is the recovery path). Never create the release by hand in the UI as a first resort; that skips the build attestation.

Report the release URL and the asset list to the user.

## Rationalizations that end releases badly

- "Tiny change, skip `pnpm check`." The gate runs on every release. Say out loud if you skip it, and only on the user's instruction.
- "The commit subject is enough for the notes." It becomes the public release body. Write the notes.
- "I'll push main and the tag together to save a step." Dropped workflow, release without attestation.
- "versions.json's newest key is stale, I'll fix it." It is correct unless `minAppVersion` changed.
- "The PR branch has everything, I'll tag here." Tags live on `main`.
- "The user said release, that covers the push." Version and notes are confirmed first; the tag push is confirmed separately.
- "CI was green on the PR." The merge commit is a different tree; run the gate on `main`.

Red-flag phrases: "should be fine", "I'll just", "basically the same as the PR", "no need to wait for the run".
