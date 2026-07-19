# M3 — Project skills: install procedure

Installs the five project-scoped Claude Code skills from the templates in
`templates/m3-skills/`. Each project gets the same five skills, renamed with its
own slug prefix:

| Template | Installed path |
| --- | --- |
| `m3-skills/release.SKILL.md` | `.claude/skills/{{project_slug}}-release/SKILL.md` |
| `m3-skills/audit.SKILL.md` | `.claude/skills/{{project_slug}}-audit/SKILL.md` |
| `m3-skills/spec.SKILL.md` | `.claude/skills/{{project_slug}}-spec/SKILL.md` |
| `m3-skills/ticket.SKILL.md` | `.claude/skills/{{project_slug}}-ticket/SKILL.md` |
| `m3-skills/bootstrap-confluence.SKILL.md` | `.claude/skills/{{project_slug}}-bootstrap-confluence/SKILL.md` |

## Prerequisites

- The interview parameter set is collected (see the main SKILL.md).
- **`{{project_slug}}` must equal the root `package.json` `.name`.** Every skill's
  repo-root precondition asserts `"name": "{{project_slug}}"`. A mismatch makes all
  five skills refuse to run — this exact bug shipped in a reference repo, where the
  release skill asserted a package name the repo did not use. Verify with
  `jq -r .name package.json` before rendering; if the package name and the desired
  skill prefix genuinely differ, align one of them first (prefer renaming the
  package if it is `private: true`).
- The `spec`, `ticket`, and `bootstrap-confluence` skills depend on M4 files
  (`docs/confluence-spec/config.json`, `docs/templates/jira-ticket-template.md`)
  and on `ferry.config.json` (M5). Install M3 anyway if those are pending, but
  tell the user which skills stay dormant until the dependency lands — each skill's
  preconditions will hold the line in the meantime.

## Install steps

1. **Render.** For each template: `mkdir -p .claude/skills/{{project_slug}}-<name>`
   and write the rendered content to `SKILL.md` inside it. Rendering means:
   - Replace every `{{param}}` with the interview value.
   - Resolve every `<!-- PROJECT-SPECIFIC: ... -->` marker: write the project's
     content following the marker's guidance, or delete the block after
     confirming with the user that it does not apply. **Never ship a marker
     verbatim** — a leftover marker is an install failure.
2. **Verify rendering.** `grep -rn '{{' .claude/skills/{{project_slug}}-*/` and
   `grep -rn 'PROJECT-SPECIFIC' .claude/skills/{{project_slug}}-*/` must both
   return nothing.
3. **Verify naming.** Each `SKILL.md` frontmatter `name:` must equal its directory
   name exactly — Claude Code matches skills by that name.
4. **Shadowing check (mandatory).** Run `ls ~/.claude/skills` and compare against
   the five installed names. **Personal skills override project skills on name
   collision** — a stale personal copy of `{{project_slug}}-release` would silently
   win over the freshly installed project skill. On any collision, warn the user
   and ask whether to delete the personal copy or rename the project slug; do not
   proceed as if the install were effective.
5. **Smoke-test triggers.** Ask the user to run `/{{project_slug}}-audit --quick`
   (read-only) once to confirm the skills resolve.

## Per-skill parameter table

Placeholders each template consumes (all registered in `templates/params.json`):

| Skill | Placeholders |
| --- | --- |
| release | `project_slug`, `project_display_name`, `github_org`, `github_repo`, `default_branch`, `integration_branch`, `deploy_workflow` |
| audit | `project_slug`, `project_display_name`, `default_branch`, `integration_branch`, `deploy_workflow` |
| spec | `project_slug`, `project_display_name`, `jira_project_key`, `jira_site_url` |
| ticket | `project_slug`, `project_display_name`, `github_org`, `github_repo`, `working_branch_prefix`, `jira_issue_type_id_subtask` |
| bootstrap-confluence | `project_slug`, `project_display_name`, `default_branch`, `integration_branch` |

## Per-skill adaptation notes

### release

- **Deploy-workflow coupling.** The skill's confirmation and post-push messages
  must state what `{{deploy_workflow}}` concretely does (deploy target, GitHub
  Release creation, conditional re-syncs) — the user confirms a push with full
  knowledge of its side effects. Read the workflow file while resolving the
  markers; do not guess.
- **Pre-tag gates.** If the project has release-order dependencies (ancestor
  commits that must be on the release branch, external schema/content sync that
  must precede the deploy), add them as numbered preconditions / a Step 4.5 with
  exact commands, plus matching failure-mode rows. Reference examples: the
  website repo runs `node scripts/check-release-ancestors.mjs` and a production
  CMS schema push before tagging.
- If the deploy workflow creates the GitHub Release itself, keep the "do not run
  `gh release create` manually" instruction; otherwise delete it.

### audit

- **The domains rubric is the heart of the adaptation.** The template ships six
  generic domains (security posture, secrets hygiene, CI, Ferry pipeline, deploy
  coherence, docs & runbooks). Add 2–4 project-type domains with concrete,
  checkable criteria — file paths, commands, thresholds:
  - Public website: RGPD / privacy, RGAA / accessibility, Performance & Core Web
    Vitals, Architecture & i18n.
  - Hosted AI agent: System prompt & compliance, Knowledge base, Evals,
    token-backend security.
  - Renumber to keep the table contiguous; target 8–10 domains total.
- Phrase the second canonical question for the project (legal compliance for a
  public site; KB freshness for an AI agent) — it is the question a stakeholder
  actually asks.
- Disclose the audit's local footprint (gitignored reports, refreshed
  node_modules) or delete that marker.
- Optional extension worth considering for web projects: a hardcoded-values scan
  (magic numbers in runtime logic — cache TTLs, timeouts, truncation lengths)
  feeding a penalty into the architecture domain. The website repo's audit skill
  has a complete Step 3.5 to copy from.

### spec

- Usually needs no adaptation beyond rendering: all runtime coordinates come from
  `docs/confluence-spec/config.json`. The one marker (neighbouring-skills
  section) matters only when the project has an orthogonal skill whose coupling
  rule fires downstream (e.g. a design-frame skill): state what context a draft
  Story must carry for it.
- The skill identifies Confluence pages by the `*PageId` values, never by title —
  this is what makes shared spaces (two spec trees in one space) safe. Do not
  "simplify" that away.

### ticket

- **Never hardcode branches or columns.** The skill reads `base_branch`,
  `target_branch`, and `review_column` from `ferry.config.json` at runtime. If a
  rendered copy ever contains a literal branch or column name in those roles, the
  render is wrong.
- The two refinement/implementation markers (Step 3 refinement rules, Step 6
  toolchain constraints, Step 7 gate commands) must be filled from the project's
  CLAUDE.md — they encode the domain-coupling rules that order sub-tasks
  (data-model-first, design-source coupling, compliance boundaries) and the exact
  quality-gate commands. A ticket skill with an empty Step 7 is unsafe: it would
  open PRs unverified.
- Branch prefix: `fix/` for Bugs, `{{working_branch_prefix}}` otherwise; the
  `ferry/` namespace (from `ferry.config.json`) is reserved for Ferry-run
  branches and must stay untouched by local runs.

### bootstrap-confluence

- Decide the page-title convention at install time: bare titles (`Requirements`,
  …) in a dedicated Confluence space, `{{project_display_name}} — ` prefix in a
  shared space (Confluence enforces per-space title uniqueness). Keep the four
  titles consistent and matching what M4's config expects.
- The skill is one-shot by contract: it refuses to run when
  `docs/.confluence-bootstrap-complete` exists. When installing on a repo whose
  tree was already bootstrapped, install the skill anyway (it documents the
  contract) — its Phase 0 guard will abort every run, which is the designed
  behavior.

## Relationship between the five skills

`bootstrap-confluence` runs once and writes the sentinel → `spec` requires the
sentinel and drafts Pending REQ/DEC/ARCH + tickets (gated, Confluence-first) →
`ticket` implements one ticket end-to-end (full-auto, worktree-isolated) →
`release` ships from `{{default_branch}}` by annotated tag → `audit` scores the
whole thing read-only at any point. Keep this split when adapting: drafting is
gated, implementation is full-auto, releasing requires explicit confirmation,
auditing never writes.
