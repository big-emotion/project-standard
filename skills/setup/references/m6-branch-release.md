# M6 — Branch & release model

Two long-lived branches, releases by annotated tag. This module underpins the
others: M1's CI triggers, M5's Ferry config, and M3's release skill all
reference these branches — install M6 first.

## The branch model

| Branch | Role | Rules |
| --- | --- | --- |
| `default_branch` (usually `main`) | Production / release line | Protected. Receives only release PRs from the integration branch. Every release is an **annotated tag `v*`** on it; the tag push triggers `deploy-production.yml`. |
| `integration_branch` (usually `develop`) | Integration | **Every PR targets it** — humans and Ferry alike. Repo variable `FERRY_INTEGRATION_BRANCH` must equal it, and `ferry.config.json` `git.base_branch`/`target_branch` are rendered from it. |
| `feat/*`, `fix/*` | Human working branches | Branch off the integration branch; the `working_branch_prefix` interview value picks the primary prefix. Conventional-commit discipline applies (M2). |
| `ferry/<TICKET-KEY>` | **Reserved for Ferry** | The Developer agent creates them; the Reviewer/Iterator/Merger resolve PRs from them. Never use `ferry/` for human branches — it collides with agent branch resolution and the reconciler's expectations. |

Flow: work lands on the integration branch through PRs; a release is the
integration branch merged into the default branch (release PR), then tagged.
Nothing deploys from a branch — only from a `v*` tag.

## Release flow

1. **`<slug>-release` skill (M3)** — run from the default branch with a clean
   tree, up to date with origin, CI green on HEAD. It bumps the semver version
   in `package.json`, updates `CHANGELOG.md` (Keep a Changelog), commits,
   creates the **annotated tag `vX.Y.Z`**, and pushes only after an explicit
   confirmation.
2. **Tag push → `deploy-production.yml`**
   (template: `templates/m6-release/deploy-production.yml`):
   - **Ancestry guard** — the job refuses tags pointing at commits not on the
     default branch. This is the compensating control where tag rulesets are
     unavailable (plan-dependent) and matters because Ferry agents push with a
     PAT, which *does* trigger tag workflows.
   - **Build + validation** — install with a frozen lockfile, run the build
     (mirror the M1 gates) so a bad tag fails in CI, not in production.
   - **`# PROJECT-SPECIFIC: deploy steps`** — the project's own mechanism.
     Live shapes: Docker-over-SSH to a VPS (support-agent-chancellerie) and
     Azure App Service (sitewebgrandechancellerie). Always end with a smoke
     check against the production URL.
   - **GitHub Release** — `softprops/action-gh-release` with
     `generate_release_notes: true`, gated on a successful deploy (`needs:`)
     so a failed deploy never gets a release page. Smoke checks stay soft
     (`continue-on-error`, never a `needs:` of the release job).

### Template adaptation

The template ships in pnpm form. For npm repos: delete the
`pnpm/action-setup` step, set `cache: npm` on `setup-node`, and replace
`pnpm install --frozen-lockfile` / `pnpm build` with `npm ci` / `npm run
build`. For split-toolchain repos (npm root + pnpm subdir), scope the install
and build to the directory that produces the deployable artefact — see the
support-agent repo's workflow for the worked example (root npm scripts +
`portal/` pnpm build inside Docker).

Third-party actions are SHA-pinned (`softprops/action-gh-release@<sha> # v3`);
official `actions/*` stay on major tags. Refresh pins on the same 1–2 month
cadence as the Ferry pins (M5 § Gotchas).

## Repo settings checklist

```
[ ] Integration branch created and set as the target of open PRs
[ ] Repo variable FERRY_INTEGRATION_BRANCH = <integration branch>
[ ] Branch protection — integration branch:
    [ ] Require a pull request before merging
    [ ] Require status checks to pass (the M1 ci.yml jobs)
    [ ] NO required approvals — the Ferry Merger merges on the ferry:approved
        label, which is NOT a GitHub review; "Require approvals" blocks it
        (status-checks-only is the full-automation path — see
        references/m5-ferry.md § Branch protection)
[ ] Branch protection — default branch:
    [ ] Require a pull request before merging (human approvals fine here —
        Ferry never targets this branch)
    [ ] Require status checks to pass
    [ ] Block direct pushes (releases arrive as PRs + tags only)
[ ] Tag protection for v* (ruleset: restrict who can create v* tags)
    — on plans without tag rulesets, the workflow's ancestry guard is the
      fallback; keep it either way (defense in depth)
[ ] deploy-production.yml rendered, PROJECT-SPECIFIC deploy section filled,
    pushed to the default branch
[ ] `production` GitHub environment created if the deploy uses
    environment-scoped secrets/variables
```

Verification: after installing, tag a throwaway prerelease (e.g.
`v0.0.1-rc.0`) on the default branch, confirm the workflow runs the guard +
build and creates a (prerelease) GitHub Release, then delete the tag and
release. On an existing repo with real releases, skip the dry run and verify
via the last release instead.
