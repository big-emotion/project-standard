---
name: setup
description: Install and configure the Big Emotion project standard on a new or existing repo — CI quality gates, Husky hooks, the four project skills, Atlassian wiring (Jira board + Confluence spec tree), Ferry, and the infrastructure module (OVH VPS deploy, Azure variant, M365 mail, secrets doctrine). Use when starting a new Big Emotion project, bringing an existing repo up to standard, checking a repo's compliance, or setting up deploy/mail/secrets ("setup this project", "install the standard", "gap analysis", "is this repo up to standard", "deploy this on the VPS").
metadata:
  author: Big Emotion
  version: 0.1.0
---

# Big Emotion Project Setup

Every Big Emotion project ships the same toolset. This skill installs it, module by module, on any repo — or audits an existing repo against it. The full rationale lives in `${CLAUDE_PLUGIN_ROOT}/SPEC.md`.

| Module | What | Reference |
|---|---|---|
| M1 | CI quality gates (gitleaks, lint, typecheck, format, test, build) | `references/m1-ci.md` |
| M2 | Husky hooks (pre-commit → lint-staged, commit-msg → commitlint) | `references/m2-hooks.md` |
| M3 | Project skills `<slug>-{release,audit,spec,ticket,bootstrap-confluence}` | `references/m3-skills.md` |
| M4 | Atlassian wiring (Jira board, Confluence spec tree, config) | `references/m4-atlassian.md` |
| M5 | Ferry (router model, claude-code path) | `references/m5-ferry.md` |
| M6 | Branch & release model (develop/main, tag `v*` → deploy) | `references/m6-branch-release.md` |
| M7 | Infrastructure & secrets (OVH VPS + Traefik, Azure variant, M365 mail, secrets doctrine) | `references/m7-infra.md` |

Reference paths above are relative to `${CLAUDE_PLUGIN_ROOT}/skills/setup/`. Templates live in `${CLAUDE_PLUGIN_ROOT}/skills/setup/templates/`; the placeholder registry is `templates/params.json`.

## Operating rules

- **Never write before the plan is confirmed.** Steps 1–3 are read-only; a single explicit confirmation covers the whole install plan.
- **Idempotent.** On a compliant repo, report "compliant" and change nothing. Never overwrite a project's existing customization of a module without flagging it as drift and asking.
- **Modules are independent.** Install only what the user selected; missing prerequisites between modules (M5 needs M4's board; M3's spec skill needs M4's config) are declared in the plan, not silently added.
- **Everything written is in English** (code, comments, docs). User-facing trigger phrases inside skills may stay French.
- **Adapt, don't force.** Templates ship in pnpm/TypeScript form; adapt commands to the interview answers (package manager, toolchain layout, no-TS repos) per each module's reference doc.
- **Secret names, never values.** The skill documents where every secret lives, what it is called, and how to obtain it — it never writes, echoes, or stores a secret value (not in rendered files, not in conversation output, not in this plugin). Values are entered by a human directly at their destination (GitHub secret, VPS `.env`, provider portal). **This plugin is public and ships no infrastructure coordinates** — no hostnames, IPs, SSH ports, account handles or resource names. Collect them from the user at interview time and never write them back into the plugin.

## Step 1 — Interview

Read `templates/params.json` — it is the authoritative parameter list. Collect only what the selected modules need; propose defaults detected from the repo (package.json name → `project_slug`, `git remote` → org/repo, existing branches → branch model). For Atlassian ids, prefer discovery via Atlassian MCP over asking (see `references/m4-atlassian.md`).

Ask which modules to install when the user hasn't said; default to all seven for a new project. M7's coordinates (VPS host, SSH port and user, app hostname, deploy path, mail sender) ship with no defaults by design — ask for them, or let the user point you at their own private ops notes outside this repo.

## Step 2 — Gap analysis (read-only)

For each selected module, classify **missing / present / drifted** with evidence:

- **M1**: `.github/workflows/ci.yml` exists? Contains the core gates (secret scan, lint, typecheck, format, test, build)? Partial = drifted, list absent gates.
- **M2**: `.husky/` with pre-commit + commit-msg? `commitlint.config.*`, `lint-staged.config.*`, `prepare: husky` script?
- **M3**: `.claude/skills/<slug>-{release,audit,spec,ticket,bootstrap-confluence}/`? Also check `~/.claude/skills/` for name collisions — personal skills shadow project skills (warn, recommend deleting stale personal copies).
- **M4**: `docs/confluence-spec/config.json` complete? `docs/.confluence-bootstrap-complete` sentinel? `docs/templates/jira-ticket-template.md`? Jira board reachable via MCP with the five pipeline columns?
- **M5**: `ferry.config.json|yaml` + `.github/workflows/ferry-router.yml` (router model — five per-role `ferry-*.yml` workflows = drifted: legacy model, flag for migration but do not auto-migrate) + `ferry-reconcile.yml` + `ferry-cost-daily.yml`? Secrets/vars present (`gh secret list`, `gh variable list`)?
- **M6**: integration branch exists, default branch protected, `deploy-production.yml` triggered on tag `v*`?
- **M7**: deploy artifacts present (`Dockerfile`, `deploy/docker-compose.yml`, `deploy/env.template` — or Azure deploy workflows)? GitHub `production` environment with the `DEPLOY_*` variables + `DEPLOY_SSH_KEY` secret (`gh api repos/{owner}/{repo}/environments`)? Transactional mail wired per the M365 pattern where the app sends email?

Output one table: module · status · evidence · what install would do.

## Step 3 — Plan + confirmation

Per-module install plan (files to write, wizards to run, manual steps the user must do in Jira/Confluence UIs, settings to change via `gh`). State what will NOT be touched. Wait for one explicit go.

## Step 4 — Install

Work module by module in order M6 → M1 → M2 → M4 → M3 → M5 → M7 (branch model first — CI triggers reference branches; Ferry needs board, branches, and CI; infra last — its deploy workflow slots into M6's release flow). For each module follow its reference doc; render templates by replacing `{{param}}` tokens with interview values; `# PROJECT-SPECIFIC:` / `<!-- PROJECT-SPECIFIC: -->` markers in templates show where the project adds its own content — surface them to the user, never delete silently.

Manual Atlassian/GitHub-settings steps: guide the user through them interactively and verify each via MCP or `gh` before moving on.

## Step 5 — Verify

- M2: make a scratch commit exercising the hooks (then reset) — both hooks must fire; a bad message must be rejected.
- M1: push a branch or open a draft PR to see the gates run, or `gh workflow run` where applicable.
- M3: each installed skill's preconditions pass (dry read-only run).
- M4: MCP reads of config ids succeed; sentinel present after bootstrap.
- M5: `npx -p @big-emotion/ferry ferry-doctor`; then a smoke Story through Refinement.
- Output a final checklist: done / remaining-manual / deferred.

## Failure modes

- **Repo already has a conflicting tool** (e.g. lefthook, commitizen): stop, present the conflict, never replace without an explicit decision.
- **Legacy Ferry (five per-role workflows) detected**: report as drift with a migration pointer (`references/m5-ferry.md`); migration is its own task, not part of install.
- **Atlassian MCP unavailable**: M4/M3-spec install degrades to fully manual guidance; say so up front.
- **User lacks org/repo admin rights** (secrets, branch protection): emit the exact `gh` commands + settings paths for someone who has them, and mark those steps remaining.

## Out of scope

Auto-creating Jira projects/boards (guided manual steps only) · migrating legacy-Ferry repos · website-specific gates (design tokens, Figma parity, Prismic checks — see the optional-extensions catalog in `references/m1-ci.md`) · anything requiring credentials the user hasn't provided.
