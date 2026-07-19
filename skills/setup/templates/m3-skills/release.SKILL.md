---
name: {{project_slug}}-release
description: Prepare and ship a {{project_display_name}} production release. Bumps the semver version of the root package.json, updates CHANGELOG.md (Keep a Changelog format, creates it if missing), creates an annotated git tag on {{default_branch}}, then asks for explicit confirmation before pushing. Tag push triggers {{deploy_workflow}}. Use when the user says "release {{project_slug}}", "cut a release", "bump version", "tag a new version", or invokes /{{project_slug}}-release.
metadata:
  author: Big Emotion
  version: "1.0.0"
---

# {{project_display_name}} Release

Prepare a release locally (bump version, update CHANGELOG, create the commit and tag), then ask for explicit confirmation before pushing.

This skill writes to the local repo first. It only runs `git push` after the user explicitly confirms. Without confirmation, the commit + tag stay local.

## When to Activate

- User says: "release {{project_slug}}", "cut a release", "bump version", "tag a new version", "ship a release".
- User invokes `/{{project_slug}}-release` (optionally with a bump level: `patch | minor | major | <explicit-version>`).

## Preconditions

Verify all of the following before any write. If any fail, **do not modify anything** — report the blocker and exit.

1. **In the repo root** — `package.json` has `"name": "{{project_slug}}"`. If not, stop and tell the user to `cd` to the right directory.
2. **Clean working tree** — `git status --porcelain` must be empty. If dirty, stop and ask the user to commit or stash.
3. **On `{{default_branch}}` branch** — `git branch --show-current` must return `{{default_branch}}`. If not, stop. Releases ship from `{{default_branch}}` only; feature work lands on `{{integration_branch}}` first (Ferry branch model).
4. **Up to date with `origin/{{default_branch}}`** — run `git fetch origin` then `git rev-list --count {{default_branch}}..origin/{{default_branch}}`. If > 0, stop and tell the user to `git pull`.
5. **CI green on HEAD** — run:
   ```bash
   HEAD_SHA=$(git rev-parse HEAD)
   gh run list --repo {{github_org}}/{{github_repo}} \
     --commit "$HEAD_SHA" --workflow ci.yml \
     --limit 1 --json conclusion,status,url
   ```
   The latest run must have `conclusion: "success"`. If no run exists for HEAD, or the conclusion is not `success`, stop and provide the run URL so the user can investigate.

<!-- PROJECT-SPECIFIC: additional release preconditions, if the project defines them.
     Examples from reference repos: a required-ancestor check (a script that verifies
     dependent commits — e.g. data-model or feature registrations — have been promoted
     to the release branch before tagging), or a schema/content-model sync gate that
     must be green before the deploy. Add each as a numbered precondition with the
     exact command and its pass criterion. Delete this block if none apply. -->

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

- Read current version from the **root** `package.json` (`.version`). The root file is the single version source — in split-toolchain repos, sub-package manifests are never bumped.
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
  - `[Unreleased]` → `https://github.com/{{github_org}}/{{github_repo}}/compare/v<next_version>...HEAD`
  - Add `[<next_version>]` → `https://github.com/{{github_org}}/{{github_repo}}/releases/tag/v<next_version>` (first release) or `.../compare/v<previous>...v<next_version>` (subsequent releases).

Use today's date (`date -u +%Y-%m-%d`) for the release date.

### Step 4 — Update `package.json`

Set `.version` of the **root** `package.json` to `<next_version>` using the Edit tool (targeted field update — do not reformat the file).

<!-- PROJECT-SPECIFIC: pre-tag sync steps, if the release must push state to an
     external system BEFORE the deploy (e.g. a CMS schema push to the production
     content repository, a knowledge-base re-export). Insert them here as
     "Step 4.5 — <name>" with: the change-detection command (diff since
     <previous_tag> on the relevant paths), the sync command with the production
     credentials it needs and where those live, and the rule that a failed sync
     stops the release before tagging. Delete this block if none apply. -->

### Step 5 — Commit and tag (local only)

Stage exactly the two files changed:

```bash
git add CHANGELOG.md package.json
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
git tag -a v<next_version> -m "{{project_slug}} v<next_version>"
```

### Step 6 — Report and ask for push confirmation

Print a summary:

```
{{project_slug}} v<next_version> prepared locally.

Files changed:
  - package.json        (version: <current_version> → <next_version>)
  - CHANGELOG.md        (new section [<next_version>] - <today>)

Commit:  <short-sha>  release: v<next_version>
Tag:     v<next_version> (annotated, local only)

Ready to push `{{default_branch}}` + `v<next_version>` to origin?
This will trigger {{deploy_workflow}}.

Reply `yes` / `push` / `go` / `oui` / `ok` to proceed.
Anything else → keeps commit + tag local only.
```

<!-- PROJECT-SPECIFIC: extend the confirmation message with what the deploy
     workflow concretely does (deploy target, side effects such as an agent/KB
     re-sync or a GitHub Release), so the user confirms with full knowledge. -->

**Wait for explicit confirmation.** Do not push without it.

- Affirmative tokens (case-insensitive): `yes`, `y`, `push`, `ship`, `go`, `oui`, `ok`.
- Anything else (including silence, "let me check first", partial answers) → treat as stop. Skip Step 7.

### Step 7 — Push (only after confirmation)

Run in order, as separate commands:

```bash
git push origin {{default_branch}}
git push origin v<next_version>
```

**Not** `--follow-tags`. Separate commands so a tag-push failure doesn't leave `{{default_branch}}` pushed ambiguously. If `git push origin {{default_branch}}` fails (e.g. non-fast-forward, branch protection), stop immediately — do not push the tag.

After both succeed, print:

```
Pushed.
  - origin/{{default_branch}} now at <short-sha>
  - tag v<next_version> published

{{deploy_workflow}} has been triggered.

Watch it at:
  https://github.com/{{github_org}}/{{github_repo}}/actions/workflows/{{deploy_workflow}}
```

<!-- PROJECT-SPECIFIC: list the deploy workflow's steps in the post-push message
     (build, deploy target, GitHub Release creation, deployment annotations,
     conditional re-syncs). If the workflow creates the GitHub Release itself,
     state that `gh release create` must NOT be run manually. -->

### Step 8 — Verification checklist

- [ ] Version in the root `package.json` matches the new tag.
- [ ] `CHANGELOG.md` has a `[<next_version>]` section dated today.
- [ ] Exactly one commit was created. Exactly one annotated tag was created.
- [ ] If user confirmed: both `{{default_branch}}` and `v<next_version>` are pushed to origin.
- [ ] If user did not confirm: commit + tag remain local only, no `git push` was executed.

## Failure Modes — Stop Without Modifying

| Condition | Action |
| --- | --- |
| Not in the {{project_slug}} repo root | Stop. Tell user to `cd` to the right directory. |
| Working tree dirty | Stop. Ask user to commit or stash. |
| Not on `{{default_branch}}` branch | Stop. Report current branch. |
| Behind `origin/{{default_branch}}` | Stop. Tell user to `git pull`. |
| CI not green on HEAD | Stop. Print the run URL for investigation. |
| Target version ≤ current version | Stop. Ask for an explicit higher version. |
| `git push origin {{default_branch}}` fails | Stop. Do not push the tag. |

<!-- PROJECT-SPECIFIC: add one failure-mode row per project-specific precondition
     or pre-tag sync step declared above. -->

## Out of Scope

- npm publish (package is `private: true`).
- The build + deploy mechanics themselves (handled by {{deploy_workflow}} — not this skill).
- Bumping sub-package manifests (the root `package.json` is the only version source).
- Audit/scoring of release readiness (preconditions above are sufficient; run `/{{project_slug}}-audit` separately).
- Pushing without explicit user confirmation in Step 6.

<!-- PROJECT-SPECIFIC: add out-of-scope lines the team must not be tempted into
     (e.g. "GitHub Release creation — automated by the deploy workflow",
     "staging deploys — triggered by pushes to the integration branch, never by tags"). -->
