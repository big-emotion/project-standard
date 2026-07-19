---
name: project-standard-release
description: Prepare and ship a Big Emotion Project Standard release. Bumps the semver version in the three synced manifests (package.json, .claude-plugin/plugin.json, .claude-plugin/marketplace.json), updates CHANGELOG.md (Keep a Changelog format, creates it if missing), creates an annotated git tag on main, then asks for explicit confirmation before pushing. Tag push triggers no workflow — this repo has no deploy; the GitHub Release is created directly by this skill. Use when the user says "release project-standard", "cut a release", "bump version", "tag a new version", or invokes /project-standard-release.
metadata:
  author: Big Emotion
  version: "1.0.0"
---

# Big Emotion Project Standard Release

Prepare a release locally (bump version, update CHANGELOG, create the commit and tag), then ask for explicit confirmation before pushing.

This skill writes to the local repo first. It only runs `git push` after the user explicitly confirms. Without confirmation, the commit + tag stay local.

**A release here has no deploy.** This repo is a Claude Code plugin: pushing the tag triggers **no workflow** — nothing builds, nothing ships to a server. Distribution is the git repo itself (`/plugin marketplace add big-emotion/project-standard`); the GitHub Release is created **directly by this skill** with `gh release create` after the push.

## When to Activate

- User says: "release project-standard", "cut a release", "bump version", "tag a new version", "ship a release".
- User invokes `/project-standard-release` (optionally with a bump level: `patch | minor | major | <explicit-version>`).

## Preconditions

Verify all of the following before any write. If any fail, **do not modify anything** — report the blocker and exit.

1. **In the repo root** — `package.json` has `"name": "@big-emotion/project-standard"` (the scoped npm name; the skill prefix stays `project-standard`). If not, stop and tell the user to `cd` to the right directory.
2. **Clean working tree** — `git status --porcelain` must be empty. If dirty, stop and ask the user to commit or stash.
3. **On `main` branch** — `git branch --show-current` must return `main`. If not, stop. This is a single-branch repo: `main` serves as both integration and release branch (deliberate M6 adaptation for a tooling/plugin repo — there is no `develop`).
4. **Up to date with `origin/main`** — run `git fetch origin` then `git rev-list --count main..origin/main`. If > 0, stop and tell the user to `git pull`.
5. **CI green on HEAD** — run:
   ```bash
   HEAD_SHA=$(git rev-parse HEAD)
   gh run list --repo big-emotion/project-standard \
     --commit "$HEAD_SHA" --workflow ci.yml \
     --limit 1 --json conclusion,status,url
   ```
   The latest run must have `conclusion: "success"` (`ci.yml` runs on pushes to `main`, so HEAD should have a run). If no run exists for HEAD, or the conclusion is not `success`, stop and provide the run URL so the user can investigate.
6. **Local gates green** — `npm test` and `npm run check:templates` must both exit 0. This is the repo's whole quality surface (unit tests on the checker + placeholder-registry validation); a release with a red checker would ship broken templates.
7. **Manifest versions in sync** — the three version carriers must already agree before the bump: `package.json` `.version`, `.claude-plugin/plugin.json` `.version`, and `.claude-plugin/marketplace.json` `.plugins[0].version`. If they disagree, stop and report the drift — fix it as a bug first; do not paper over it inside a release.

## Inputs

Argument is the bump level or explicit version:

- `patch` — `0.1.0 → 0.1.1`
- `minor` — `0.1.0 → 0.2.0`
- `major` — `0.1.0 → 1.0.0`
- `<explicit>` — e.g. `0.1.0-rc.1`, `1.0.0`

If no argument is provided, propose a bump based on commit messages since the last tag using the Conventional Commits heuristic:

- `feat!:` or body contains `BREAKING CHANGE` → major
- `feat:` → minor
- anything else (fix, refactor, perf, style, docs, ci, chore) → patch

Show the proposal and **ask the user to confirm or override** before proceeding.

## Workflow

### Step 1 — Determine current and target versions

- Read current version from the **root** `package.json` (`.version`) — the source of truth the two plugin manifests mirror (precondition 7 already verified they agree).
- Determine `previous_tag` = `git describe --tags --abbrev=0 2>/dev/null` (empty if no tag yet).
- Compute `next_version` from the bump level.
- Validate: `next_version` must be strictly greater than `current_version` (semver comparison). If not, stop and ask the user for an explicit higher version.

### Step 2 — Collect changes since last tag

Run:

```bash
git log --pretty=format:"%h %s" <previous_tag>..HEAD
# If no previous tag:
git log --pretty=format:"%h %s"
```

Group commits by Conventional Commit type:

| CHANGELOG section | Commit type prefixes |
| --- | --- |
| **Added** | `feat:`, `feat(...):` |
| **Changed** | `refactor:`, `perf:`, `style:` |
| **Fixed** | `fix:`, `fix(...):` |
| **Security** | `security:` |
| **Removed** | `revert:` or commits describing removal |

Filter out merge commits and `chore:`, `ci:`, `docs:`, `test:` entries (too noisy for a user-facing changelog) unless they carry noteworthy messages.

### Step 3 — Update or create `CHANGELOG.md`

Use [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format. `CHANGELOG.md` lives at the repo root; if it does not exist, create it with this skeleton before editing:

```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]
```

Then:

- Move any items under `[Unreleased]` into the new `[<next_version>] - <YYYY-MM-DD>` section.
- Append the grouped commits from Step 2 under the appropriate subsections (deduplicate; skip sections with no entries).
- Keep an empty `[Unreleased]` section at the top for the next cycle.
- Maintain the link references at the bottom of the file:
  - `[Unreleased]` → `https://github.com/big-emotion/project-standard/compare/v<next_version>...HEAD`
  - Add `[<next_version>]` → `https://github.com/big-emotion/project-standard/releases/tag/v<next_version>` (first release) or `.../compare/v<previous>...v<next_version>` (subsequent releases).

Use today's date (`date -u +%Y-%m-%d`) for the release date.

### Step 4 — Bump the version in the three synced manifests

Set `<next_version>` in **all three** files — they must never diverge (the plugin marketplace reads the manifests, npm tooling reads `package.json`):

1. `package.json` — `.version`
2. `.claude-plugin/plugin.json` — `.version`
3. `.claude-plugin/marketplace.json` — `.plugins[0].version`

Use the Edit tool for each (targeted field update — do not reformat the files, preserve indentation and field order).

### Step 5 — Commit and tag (local only)

Stage exactly the four files changed:

```bash
git add CHANGELOG.md package.json .claude-plugin/plugin.json .claude-plugin/marketplace.json
```

(Do not `git add -A` — do not pick up unrelated dirty paths.)

Commit with the message:

```
release: v<next_version>
```

One-line subject only. No body unless there are breaking changes — then add a `BREAKING CHANGE:` paragraph in the body.

**No `Co-Authored-By` trailer.**

Then create an annotated tag:

```bash
git tag -a v<next_version> -m "Big Emotion Project Standard v<next_version>"
```

### Step 6 — Report and ask for push confirmation

Print a summary:

```
project-standard v<next_version> prepared locally.

Files changed:
  - package.json                      (version: <current_version> → <next_version>)
  - .claude-plugin/plugin.json        (version: <current_version> → <next_version>)
  - .claude-plugin/marketplace.json   (plugins[0].version: <current_version> → <next_version>)
  - CHANGELOG.md                      (new section [<next_version>] - <today>)

Commit:  <short-sha>  release: v<next_version>
Tag:     v<next_version> (annotated, local only)

Ready to push `main` + `v<next_version>` to origin?
Pushing triggers NO workflow — this repo has no deploy.
After the push, this skill creates the GitHub Release itself:
  gh release create v<next_version> --generate-notes

Reply `yes` / `push` / `go` / `oui` / `ok` to proceed.
Anything else → keeps commit + tag local only.
```

**Wait for explicit confirmation.** Do not push without it.

- Affirmative tokens (case-insensitive): `yes`, `y`, `push`, `ship`, `go`, `oui`, `ok`.
- Anything else (including silence, "let me check first", partial answers) → treat as stop. Skip Step 7.

### Step 7 — Push and create the GitHub Release (only after confirmation)

Run in order, as separate commands:

```bash
git push origin main
git push origin v<next_version>
```

**Not** `--follow-tags`. Separate commands so a tag-push failure doesn't leave `main` pushed ambiguously. If `git push origin main` fails (e.g. non-fast-forward, branch protection), stop immediately — do not push the tag.

After both pushes succeed, create the GitHub Release directly (no workflow does this — it is this skill's job):

```bash
gh release create v<next_version> --repo big-emotion/project-standard --generate-notes
```

Then print:

```
Pushed.
  - origin/main now at <short-sha>
  - tag v<next_version> published

No workflow was triggered by the tag push (this repo has no deploy).
GitHub Release created:
  https://github.com/big-emotion/project-standard/releases/tag/v<next_version>

Plugin consumers pick the new version up from the repo via the marketplace.
```

If `gh release create` fails after the pushes succeeded, report it and instruct the user to re-run that single command manually — do **not** delete or re-push the tag.

### Step 8 — Verification checklist

- [ ] `package.json`, `.claude-plugin/plugin.json`, and `.claude-plugin/marketplace.json` (`plugins[0].version`) all carry the new version, matching the tag.
- [ ] `CHANGELOG.md` has a `[<next_version>]` section dated today.
- [ ] Exactly one commit was created. Exactly one annotated tag was created.
- [ ] If user confirmed: both `main` and `v<next_version>` are pushed to origin, and the GitHub Release exists.
- [ ] If user did not confirm: commit + tag remain local only, no `git push` was executed, no GitHub Release was created.

## Failure Modes — Stop Without Modifying

| Condition | Action |
| --- | --- |
| Not in the project-standard repo root | Stop. Tell user to `cd` to the right directory. |
| Working tree dirty | Stop. Ask user to commit or stash. |
| Not on `main` branch | Stop. Report current branch. |
| Behind `origin/main` | Stop. Tell user to `git pull`. |
| CI not green on HEAD | Stop. Print the run URL for investigation. |
| `npm test` or `npm run check:templates` fails | Stop. A red checker means broken templates would ship. |
| The three manifest versions disagree before the bump | Stop. Report the drift; it is a bug to fix, not to release over. |
| Target version ≤ current version | Stop. Ask for an explicit higher version. |
| `git push origin main` fails | Stop. Do not push the tag. |
| `gh release create` fails after the pushes | Report. Instruct manual re-run of that one command; never delete or re-push the tag. |

## Out of Scope

- npm publish (package is `private: true`).
- Any deploy — no deploy workflow exists; distribution is the git tag + the Claude Code plugin marketplace reading this repo.
- Bumping any manifest other than the three version carriers listed in Step 4.
- Audit/scoring of release readiness (preconditions above are sufficient; run `/project-standard-audit` separately).
- Pushing without explicit user confirmation in Step 6.
