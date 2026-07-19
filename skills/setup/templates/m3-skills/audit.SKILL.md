---
name: {{project_slug}}-audit
description: Production-readiness audit for {{project_display_name}} (this repo). Read-only multi-domain scored assessment that answers four questions — is the project ready for production, is its domain-critical surface healthy, what is the security posture, and is the score close to 8–9/10. Use when the user asks "is it ready", "audit the project", "production-readiness check", or invokes /{{project_slug}}-audit.
metadata:
  author: Big Emotion
  version: "1.0.0"
---

# {{project_display_name}} Audit

Read-only audit of the project defined in this repo. Produces a scored, evidence-based report and refreshes `docs/PRODUCTION-READINESS-AUDIT.md`.

This skill **never** modifies source, never bumps versions, never tags, never pushes, never deploys, never writes to external services. It only reads, runs the repo's own gates, and writes the audit doc. Fixing anything it finds is deferred to normal ticketed work or `/{{project_slug}}-release`.

<!-- PROJECT-SPECIFIC: footprint disclosure — list any local artifacts the full
     audit produces (e.g. a gitignored eval report, a refreshed node_modules from
     a frozen-lockfile install) so a clean working tree in git terms stays the
     explicit contract. Delete if the audit leaves no footprint. -->

## When to Activate

- User asks: "is the project production-ready", "is it ready to ship", "audit {{project_slug}}", "score the project".
- User asks specifically about security posture, compliance, or overall score.
- User invokes `/{{project_slug}}-audit`.

## Preconditions

Run from the repo root (`package.json` with `"name": "{{project_slug}}"`). If not, stop and tell the user to `cd` into the repo.

## Inputs

Optional argument: `--quick` — skip the long/costly gates (full test suite, production build, any gate that hits a paid external API). Rely instead on the most recent CI run (`gh run list --workflow ci.yml`) and the newest local artifacts, and mark any domain scored from stale data as such.

Default: full audit.

## Workflow

### Step 1 — Snapshot the repo state

Run in parallel via Bash:

- `git status --porcelain` — a dirty tree is auditable but must be reported.
- `git log --oneline -15` — recent cadence.
- `git tag --sort=-creatordate | head -5` — no tags yet is expected pre-launch; say so explicitly.
- `jq '{name, version, private, packageManager, scripts}' package.json` — version, scripts, package manager.
- `ls .github/workflows/` — workflow surface.
- `ls docs/` — structural map.

<!-- PROJECT-SPECIFIC: add cheap structural checks for the project's own critical
     files (e.g. "the agent config must parse as JSON", "every ops script passes
     node --check", "the content-model directory matches the generated types"). -->

### Step 2 — Read the existing audit (if present)

Read `docs/PRODUCTION-READINESS-AUDIT.md` if it exists. This skill **updates** that file in place, preserving its scoring rubric and section ordering. If absent, create it with the canonical structure:

1. Scope and method
2. The four canonical questions — answered explicitly
3. Overall score (X.X / 10) — one-line verdict
4. Score per domain (table, one row per rubric domain)
5. Strengths
6. Gaps and risks (per domain, with `file:line` evidence)
7. Compliance posture — dedicated section <!-- PROJECT-SPECIFIC: name the project's compliance surface (e.g. RGPD + RGAA for a public French site; platform terms + data-retention posture for a hosted AI agent) -->
8. Security posture — dedicated section
9. Prioritized action list (15 max, each tied to a Jira ticket where one exists)
10. Conclusion

### Step 3 — Gather evidence

Long gates (skip with `--quick`):

- Run the repo's full quality gates — typecheck, lint, tests, production build — with the project's own commands (read them from `package.json` scripts / CLAUDE.md; never invent commands).
<!-- PROJECT-SPECIFIC: list the exact long-gate commands and their known
     footguns (e.g. "install with a frozen lockfile first — a stale node_modules
     after a merged PR is a known local false-negative", "the eval suite hits a
     paid API and its verdicts are advisory, never authoritative without human
     adjudication"). -->

Always (cheap, read-only):

- `gh run list --limit 10 --json workflowName,status,conclusion,headBranch,createdAt` — recent CI health on `{{integration_branch}}` and `{{default_branch}}` (best-effort; note if `gh` unauthenticated).
- `git ls-files | grep -iE '\.env'` — must return only `.env.example` files.
- `git grep -nE '(sk_[A-Za-z0-9]{16,}|ghp_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|re_[A-Za-z0-9]{20,}|whsec_[A-Za-z0-9]{10,})'` — must return nothing on tracked files.
- `git grep -nE "uses:\s+[^/\s]+/[^@\s]+@(main|master|v[0-9]+|latest)" .github/workflows/` — third-party Actions should be pinned by SHA.
- `grep -n 'LOCAL DIVERGENCE' .github/workflows/ferry-router.yml` — the protected Ferry divergences must be intact; fewer markers than documented means a `ferry-init` bump wiped them.
- `git grep -nE "TODO|FIXME|XXX|HACK" -- ':!node_modules' | wc -l` — code-debt heuristic.

<!-- PROJECT-SPECIFIC: add the project's own cheap evidence commands — identifier
     coherence greps (an id hardcoded in several places must be identical
     everywhere), freshness comparisons (newest generated artifact vs the last
     change to its source), config-parse checks, and any optional read-only live
     check that needs a credential (mark it N/A when the credential is absent). -->

### Step 4 — Score the domains

Use this rubric (1–10 each, equal weight). Severity buckets: **P0** blocks production with real users, **P1** must land before GA, **P2** nice to have.

| # | Domain | What to look for |
| --- | --- | --- |
| 1 | Security posture | Secret-touching code isolated from public bundles; auth flows gated and revocable; input validation on every external surface; rate limiting real (not dev-only in-memory unless single-instance prod is the documented choice); security headers where the project serves HTTP. |
| 2 | Secrets hygiene | `.gitignore` covers `.env` variants (not just the literal `.env`) via repo rules, not the auditor's global excludes; full-history scan clean; workflow credentials only via `${{ secrets.* }}`; a repo-wide secret scanner in CI (agents push autonomously — its absence is a standing P1). |
| 3 | CI | Recent runs green on `{{integration_branch}}`; branch-protection reality stated honestly (advisory CI is a finding, not a footnote); SHA-pinning consistent across workflows; reproducible installs (pinned package manager, `packageManager` field, frozen lockfile); scheduled jobs and dependabot presence. |
| 4 | Ferry pipeline | Protected `LOCAL DIVERGENCE` markers intact in `ferry-router.yml`; `ferry.config` valid and its trigger columns match the live Jira board; action pins and ferry version consistent with what CLAUDE.md states; superseded automation docs carry a SUPERSEDED banner. |
| 5 | Deploy coherence | The deploy workflow ({{deploy_workflow}}) matches the branch/tag model (tags from `{{default_branch}}` deploy prod; `{{integration_branch}}` never does); environment identifiers coherent across docs and workflows; a recovery runbook entry exists for a mid-deploy failure. |
| 6 | Docs & runbooks | The declared operational source of truth is not older than the last operational change by > 7 days; every command a doc names exists in `package.json`; runbook entries exist for key rotation, rollback, and incident response; named owners for recurring loops (a literal `(owner)` placeholder is a finding); English-docs rule respected. |

<!-- PROJECT-SPECIFIC: append the project-type domains that make this audit
     meaningful — typically 2 to 4 more rows. Examples from reference repos:
     a public website added "RGPD / privacy", "RGAA / accessibility",
     "Performance & Core Web Vitals", and "Architecture & i18n"; an AI support
     agent added "System prompt & compliance", "Knowledge base", "Evals", and
     "Portal security". Each row needs concrete, checkable criteria — file paths,
     commands, thresholds — not aspirations. Renumber so the table stays
     contiguous, and keep 8–10 domains total. -->

Compute overall score = mean of the domain scores, rounded to one decimal.

When two domains surface the same defect, pick **one canonical severity** for it before scoring, count it fully in the most causal domain, and reference it from the others — otherwise the same gap multi-penalizes the mean and the domains' relative order stops meaning anything.

### Step 5 — Answer the four canonical questions

Always open the report with explicit answers:

1. **Is the project ready for production?** Yes / No / Conditional, plus the 1–3 blockers. A promise the system makes to users that nothing delivers is not production-ready no matter the other scores.
2. **Is the domain-critical surface healthy?** <!-- PROJECT-SPECIFIC: phrase the project's own second question — e.g. "Is the public site legally compliant (RGPD + RGAA)?" for a website; "Is the knowledge base up to date?" for an AI agent — and list the evidence walk that answers it. -->
3. **What is the security posture?** One short paragraph + bullets: isolation of secrets, auth flow, rate-limiting reality, secrets hygiene, supply chain (pinning, dependabot, scanners), branch-protection reality.
4. **Is the score close to 8–9/10?** Quote the computed score, compare to target, list the top 3 gaps that would close the distance.

### Step 6 — Write the report

Update `docs/PRODUCTION-READINESS-AUDIT.md` in place (create if absent). Bump the `Date:` field to today. English, per the repo's docs-language rule.

Then output a concise summary to the user (≤ 25 lines): the four answers + the computed score + the top 3 actions. The full detail lives in the file.

### Step 7 — Verification

Before reporting done:

- [ ] All domain scores justified by at least one piece of evidence (command output, `file:line`).
- [ ] The four canonical questions are answered explicitly in section 2 of the report.
- [ ] No score is invented — if a check could not run (`--quick`, missing key, unauthenticated `gh`), mark it `N/A` and explain.
- [ ] Cross-domain defects were harmonized to one canonical severity before the mean was computed.
- [ ] `docs/PRODUCTION-READINESS-AUDIT.md` was updated (or created) and its Date field reflects today.
- [ ] `git status --porcelain` shows **only** `docs/PRODUCTION-READINESS-AUDIT.md` changed (plus any disclosed gitignored artifacts).

## Output Format

User-facing summary (printed at end):

```
{{project_display_name}} Audit — <YYYY-MM-DD>
Score: X.X / 10 (target 8–9)

1. Production-ready? <verdict + 1-line reason>
2. <domain-critical question>? <verdict + 1-line reason>
3. Security posture? <one line>
4. Distance to 8–9? <top 3 actions>

Full report: docs/PRODUCTION-READINESS-AUDIT.md
```

## Out of Scope

- Fixing any gap found. The audit only **reports**; releases go through `/{{project_slug}}-release`.
- Any write against external services (deploy targets, CMS, AI platforms, messaging APIs).
- Live end-to-end measurement (Lighthouse-style runs, live calls) — domains score on configuration, budgets, and recorded evidence, not live probes.

<!-- PROJECT-SPECIFIC: name the neighbouring systems whose audit belongs to
     another repo's audit skill, so scope creep has a written boundary. -->
