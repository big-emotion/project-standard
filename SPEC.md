# Big Emotion Project Standard — Specification

Status: **Draft for review** · Author: Claude (session 2026-07-19) · Owner: jnk

## 1. Goal

Every Big Emotion project ships with the same toolset and configuration — quality gates, local hooks, four project skills, Atlassian wiring, Ferry. Today that standard exists only as two live implementations. This spec codifies it and defines **one Claude Code skill** that guides installing/configuring it on any repo, new or existing.

Reference implementations — two live private repos, referred to throughout by role
(this repo is public and names neither):

- **The website repo** — a client-facing Next.js site on Azure. Reference for **CI, Husky, and the skill family** (but legacy Ferry: 5 per-role workflows @v0.17.0, per-column Jira rules).
- **The support-agent repo** — an AI support agent with a split npm/pnpm toolchain on the VPS. Reference for **router-model Ferry** (v1.1.x) and for skills already de-coupled from website concerns.

The standard takes the best of both: website repo's quality gates + skill ergonomics, support-agent repo's Ferry wiring.

## 2. The Standard — seven modules

Modules are independently adoptable. The skill runs a gap analysis and installs only what's missing.

### M1 — CI quality gates (`.github/workflows/`)

Core `ci.yml` (required on every PR; `pull_request` only — no `push` duplication):

| Check | Tool | Notes |
|---|---|---|
| Secret scan | gitleaks (Docker, `.gitleaks.toml` with `useDefault=true` + per-project allowlist) | separate job |
| Lint | ESLint flat config (+ framework preset) | cached |
| Typecheck | `tsc --noEmit` (strict, `noUncheckedIndexedAccess`) | TS projects |
| Format | Prettier `--check` (`.prettierrc.json`: semi, doubleQuote, 2-space, trailingComma all, printWidth 100) | cached |
| Tests | project test runner (`node --test` / vitest) | |
| Build | framework build | |

Idioms: `concurrency: ci-${{ github.ref }}` + cancel-in-progress; frozen-lockfile installs; per-job store caching. Heavy gates (e2e, Lighthouse, Storybook/Chromatic) are **optional extensions**, enforced only on `develop → main` PRs or via label — not part of the core standard.

Also standard: `claude.yml` (interactive `@claude` via `claude-code-action`) and `approve-agent-ci.yml` (approves bot-gated CI runs for agent PRs, needs `CI_APPROVAL_TOKEN` PAT).

No stylelint, no `npm audit` job — dependency pinning via package-manager `overrides`; secrets via gitleaks. (Matches reference; revisit later if needed.)

### M2 — Local hooks (Husky v9)

- `prepare: husky` script; `.husky/pre-commit` → `lint-staged`; `.husky/commit-msg` → `commitlint --edit`.
- `commitlint.config.mjs`: `@commitlint/config-conventional` + type-enum `build, chore, ci, docs, feat, fix, perf, refactor, release, revert, style, test`.
- `lint-staged.config.mjs` generic rows: `*.{ts,tsx}` → eslint --fix + prettier; `*.{css,md,json,mjs}` → prettier. Project-specific rows added per project.
- `.editorconfig` (utf-8, lf, 2-space, final newline).
- **Constraint:** must support split-toolchain repos (e.g. the support-agent repo: npm root + pnpm app subdirectory) — hooks templated per package manager and directory layout.
- **Constraint:** Ferry agents commit on these repos — their commit messages must pass commitlint (conventional format is already in the agent prompts; the skill verifies this).

### M3 — Project skills (`.claude/skills/<slug>-*`)

Five skills, project-scoped, prefix `<slug>-`:

| Skill | Purpose | Key parameterization |
|---|---|---|
| `<slug>-release` | semver bump + Keep-a-Changelog + annotated tag `v*` + confirmed push → triggers deploy-production | repo, package name, deploy workflow, compare-URL base |
| `<slug>-audit` | read-only multi-domain production-readiness score → `docs/PRODUCTION-READINESS-AUDIT.md` | domains rubric per project type, workflows, branches |
| `<slug>-spec` | append-only Confluence REQ/DEC/ARCH maintainer + Jira tickets (Pending-only, Confluence-first) | `docs/confluence-spec/config.json` |
| `<slug>-ticket` | full-auto single-ticket lifecycle: refine → worktree → implement → PR → In Review | reads `ferry.config.json` for branches/columns (never hardcodes) |
| `<slug>-bootstrap-confluence` | one-shot spec-tree creation (4 subpages) + config ids + sentinel; refuses second runs | space/root page |

Template base: **support-agent versions** (already website-agnostic) with website-repo improvements folded in. Known reference bugs fixed in templates: release skill package-name mismatch; `docs/.confluence-bootstrap-complete` sentinel required by spec skill.

Supporting files: `docs/templates/jira-ticket-template.md` (Story/Bug GWT skeleton, Confluence-impact grammar) and `docs/confluence-spec/config.json` (schema below).

### M4 — Atlassian wiring

- **Jira**: team-managed project, board with pipeline columns `Refinement / In Development / In Review / Changes Requested / To Merge (or Ready to Merge) / Done`. Dedicated `ferry` Jira user (hardened automation condition).
- **Confluence**: spec tree root page + 4 subpages (Requirements / Decisions / Architecture / Obsolete), per-space title prefix if titles collide.
- `docs/confluence-spec/config.json` schema: `cloudId, siteUrl, spaceKey, spaceId, engineeringRootPageId, engineeringTreePageId, requirementsPageId, decisionsPageId, architecturePageId, obsoletePageId, jiraProjectKey, jiraProjectId, jiraIssueTypeIds{Epic,Story,Task,Bug,Sub-task}`.
- The skill **guides** Jira project/board creation (manual steps — boards can't be created via MCP) and **automates** Confluence page creation via `<slug>-bootstrap-confluence` + issue-type-id discovery via Atlassian MCP.

### M5 — Ferry (router model, claude-code path)

Install procedure (from `big-emotion/ferry` docs, v1.1.x):

1. `npx -p @big-emotion/ferry ferry-init` → writes `ferry-router.yml`, minimal `ferry.config.yaml` (repo may use `.json`), Jira-rule walkthrough docs, sets 6 secrets.
2. Audit issue + `FERRY_AUDIT_ISSUE` variable; workflow default-permissions write.
3. Required scheduled workflows: `ferry-reconcile.yml` (30 min) + `ferry-cost-daily.yml`.
4. Jira rule **"Ferry — transition (any column)"**: Issue-transitioned (From/To empty) → `repository_dispatch` `ferry-transition` with the v1 envelope. **Hardened variant (Big Emotion convention):** conditions `assignee = ferry user` AND status in pipeline columns.
5. `ferry.config`: `git.base_branch/target_branch = develop`, `working_branch_prefix`, `workflow.agents.*.trigger_column` matching board exactly, `execution_path: claude-code`.
6. Secrets: `FERRY_JIRA_BASE_URL/EMAIL/API_TOKEN`, `CLAUDE_CODE_OAUTH_TOKEN` (never `ANTHROPIC_API_KEY` on this path), `FERRY_APP_ID`+`FERRY_PRIVATE_KEY`, optional transition-id pins, `FERRY_CHECKOUT_TOKEN`/`CI_APPROVAL_TOKEN`. Vars: `FERRY_AUDIT_ISSUE`, `FERRY_INTEGRATION_BRANCH`, optional model/runner overrides (`FERRY_RUNNER` is JSON-encoded).
7. Branch protection: status-checks-only on the integration path (`ferry:approved` label is not a GitHub review; "require approvals" blocks the Merger).
8. Prompt overrides: **prefer additive `prompts/<agent>.claude-code.local.md` overlays** over full overrides (survive `ferry-update`); full overrides only when the whole contract must change, preserving placeholder tokens + the shared contract (one fingerprinted audit comment, no-merge rule, single transition, bounded CI loops, only Merger gates CI).
9. Validate with `ferry-doctor`; smoke-test a Story through Refinement.
10. **Gotchas encoded in the skill:** `ferry-init`/`ferry-update` wipe inline workflow divergences (only `ferry.local.yml` `review.ciGate` + `global.runner` survive) — keep a documented re-apply list; workflows must exist on the default branch before rules fire; SHA-pin and refresh 1–2 monthly.

### M6 — Branch & release model

`develop` = integration (Ferry PRs target it, `FERRY_INTEGRATION_BRANCH=develop`); `main` = protected, release by annotated tag `v*`; tag push triggers `deploy-production.yml` (deploy target per project) + GitHub Release. Working branches `feat/`/`fix/`; `ferry/` reserved for Ferry.

### M7 — Infrastructure & secrets (added 2026-07-19)

The standard's deploy targets and the doctrine for handling credentials:

- **OVH VPS (templated default)**: one Docker container per app behind the shared host-level Traefik (routes by `Host(...)`, ACME resolver, external `proxy` network). Deploy via the per-repo GitHub `production` environment — `DEPLOY_HOST/USER/PORT/KNOWN_HOSTS` as variables (readable, copyable between repos), `DEPLOY_SSH_KEY` as a secret (write-only, human-entered). Fires on `v*` tag from `deploy-production.yml`. Templates: compose file with Traefik labels, `env.template`, Next-standalone Dockerfile variant.
- **Azure App Service (documented variant, no templates)**: the website model — staging + production apps, slots, OIDC federated credentials (no publish-profile secrets), standalone bundle assembly. Reference points to the website repo's runbooks.
- **Transactional mail**: Microsoft 365 tenant SMTP (`smtp.office365.com:587` STARTTLS; Authenticated SMTP + app password prereq; Graph `sendMail` fallback) — no third-party ESP. OVH manages DNS zones/domains; MX/SPF stay pointed at M365.
- **Secrets doctrine**: three storage tiers (GitHub secrets/environments · VPS `.env` filled in place by a human · provider portals). Docs and templates carry secret **names, locations, and acquisition steps — never values**. Credentials are personal per operator; nothing is shared through a repo. gitleaks (M1) is the enforcement layer, including on this plugin repo itself.
- **No-coordinates model**: every M7 template and reference is fully parameterized, and this repo holds no infrastructure coordinates at all — no hostnames, IPs, SSH ports, account handles, resource names or client identities. Operators supply their own at interview time from a private source outside this repo.

## 3. The setup skill

- **Name**: `big-emotion-setup` (working title).
- **Home**: dedicated repo (name TBD below) containing `skills/big-emotion-setup/SKILL.md`, `templates/` (all M1–M6 files with `{{placeholder}}` tokens), `references/` (per-module deep guidance the SKILL.md links to, keeping SKILL.md small).
- **Flow**: (1) interview — collect the parameter set; (2) **gap analysis** — detect per module: missing / present / drifted from standard; (3) plan — per-module install plan, confirmation gate before writes; (4) install — render templates, run wizards (`ferry-init`), guide manual Atlassian steps; (5) **verify** — run hooks once, trigger CI, `ferry-doctor`, checklist output.
- **Parameter set** (single interview, reused everywhere): project slug · GitHub org/repo · package manager (+ split-toolchain layout) · default/integration branches · Jira site/key/board columns · Confluence space · deploy target · framework (Next/none) · which modules to install.
- KISS: the skill is guidance + templates; no runtime beyond what Claude Code executes. TDD where testable: template placeholder-completeness check, rendered-file lint (a tiny dependency-free Node script in the repo, run by its own CI).

## 4. Decisions

Taken (flag if you disagree):
- **D1** Ferry standard = router model + claude-code path (upstream-recommended; support-agent repo proves it).
- **D2** Prompt customization standard = `.local.md` additive overlays (diverges from both existing repos, which use full overrides — they predate v0.18.1).
- **D3** Core CI = gitleaks + lint + typecheck + format + test + build; heavy gates optional per project.
- **D4** Skill templates base on support-agent skill variants (website-agnostic), not the website ones.

For the user:
- **D5** Repo name: proposal `big-emotion/project-standard`. → Decided: `big-emotion/project-standard`.
- **D6** Distribution: Claude Code **plugin marketplace** repo (team installs via `/plugin marketplace add big-emotion/project-standard`) vs plain repo the skill is copied from. Proposal: plugin. → Decided: plugin.
- **D7** (2026-07-19, **superseded by D9**) M7 coordinates model: **hybrid** — parameterized module + one internal coordinates file, zero secret values anywhere in the repo.
- **D8** (2026-07-19) Azure is a **documented variant**, not a templated target; the OVH VPS pattern is the templated default. Mail scope: M365 SMTP + OVH DNS/domains.
- **D9** (2026-07-21) The repo is **public**, superseding D7's hybrid model. No infrastructure coordinates live here in any form: the internal coordinates file is deleted, and the two reference implementations are named by role ("the website repo", "the support-agent repo") rather than by org/repo slug. Operators keep coordinates in a private location outside this repo and supply them at interview time. Rationale: D7's single-file isolation kept the blast radius small but still published real coordinates to anyone who cloned the repo, and a public repo makes the file's own signpost ("delete this if public") a pointer rather than a safeguard.

## 5. Out of scope

- MCP server (revisit only if the skill proves insufficient).
- Website-specific gates (design tokens, Figma frames, Prismic checks, RGAA routes) — they stay project-local, listed as "extension examples" in references.
- Auto-creating Jira projects/boards (guided manual steps; MCP handles issues/pages only).
- Migrating the website repo to the router model (separate initiative).

## 6. Acceptance criteria

1. **Given** a fresh empty repo, **when** the skill runs with all modules selected, **then** it produces a repo passing its own CI with working hooks, five renamed skills, spec config, Ferry validated by `ferry-doctor` (Atlassian steps completed by guided human), and a checklist of manual steps done/remaining.
2. **Given** the support-agent repo, **when** the skill runs gap analysis, **then** it reports: M1 partial (ci.yml lacks lint/format/typecheck/gitleaks), M2 missing, M3/M4/M5/M6 present — and installing M1+M2 yields green CI + working hooks without touching the present modules.
3. **Given** a repo with the standard installed, **when** the skill re-runs, **then** it is idempotent (reports "compliant", changes nothing without explicit ask).

## 7. Risks & mitigations

- `ferry-init` regenerating over local divergences → skill maintains a per-repo "protected divergences" doc + re-apply checklist.
- Personal-skill shadowing (`~/.claude/skills` overrides project skills on name collision) → skill checks for collisions during install and warns.
- Split-toolchain repos breaking naive lint-staged assumptions → package-manager/layout parameters in the interview, template variants.
- Commitlint rejecting agent commits → verify Ferry prompts emit conventional commits during M5 install.
