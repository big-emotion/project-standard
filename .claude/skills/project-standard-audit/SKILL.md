---
name: project-standard-audit
description: Production-readiness audit for Big Emotion Project Standard (this repo). Read-only multi-domain scored assessment that answers four questions — is the plugin ready to install on real repos, is the template surface healthy, what is the security posture, and is the score close to 8–9/10. Use when the user asks "is it ready", "audit the project", "production-readiness check", or invokes /project-standard-audit.
metadata:
  author: Big Emotion
  version: "1.0.0"
---

# Big Emotion Project Standard Audit

Read-only audit of the project defined in this repo. Produces a scored, evidence-based report and refreshes `docs/PRODUCTION-READINESS-AUDIT.md`.

This skill **never** modifies source, never bumps versions, never tags, never pushes, never deploys, never writes to external services. It only reads, runs the repo's own gates, and writes the audit doc. Fixing anything it finds is deferred to normal ticketed work or `/project-standard-release`.

**Footprint disclosure**: the full audit runs `npm ci` (refreshes `node_modules` from the lockfile), `npm test`, and `npm run check:templates` — none of which touch tracked files. The only tracked-file change the audit produces is `docs/PRODUCTION-READINESS-AUDIT.md` (the `docs/` directory is created on first run).

## When to Activate

- User asks: "is the plugin production-ready", "is it ready to ship", "audit project-standard", "score the project".
- User asks specifically about security posture, template coherence, or overall score.
- User invokes `/project-standard-audit`.

## Preconditions

Run from the repo root (`package.json` with `"name": "@big-emotion/project-standard"` — the scoped npm name). If not, stop and tell the user to `cd` into the repo.

## Inputs

Optional argument: `--quick` — skip the long/costly gates (test suite, template checker via a fresh `npm ci`). Rely instead on the most recent CI run (`gh run list --workflow ci.yml`) and the newest local artifacts, and mark any domain scored from stale data as such.

Default: full audit.

## Workflow

### Step 1 — Snapshot the repo state

Run in parallel via Bash:

- `git status --porcelain` — a dirty tree is auditable but must be reported.
- `git log --oneline -15` — recent cadence.
- `git tag --sort=-creatordate | head -5` — no tags yet is expected pre-launch; say so explicitly.
- `jq '{name, version, private, packageManager, scripts}' package.json` — version, scripts, package manager.
- `ls .github/workflows/` — workflow surface.
- `ls skills/setup/templates/ skills/setup/references/` — the product's structural map (this repo has no `docs/` until the first audit writes it).

Cheap structural checks for this repo's critical files:

- `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json` must parse as JSON.
- `skills/setup/templates/params.json` must parse as JSON.
- Every `scripts/*.mjs` passes `node --check`.
- `skills/setup/SKILL.md` exists with valid frontmatter (the plugin's entry-point skill).

### Step 2 — Read the existing audit (if present)

Read `docs/PRODUCTION-READINESS-AUDIT.md` if it exists. This skill **updates** that file in place, preserving its scoring rubric and section ordering. If absent, create it with the canonical structure:

1. Scope and method
2. The four canonical questions — answered explicitly
3. Overall score (X.X / 10) — one-line verdict
4. Score per domain (table, one row per rubric domain)
5. Strengths
6. Gaps and risks (per domain, with `file:line` evidence)
7. Compliance posture — dedicated section. For this repo the compliance surface is the **secrets doctrine**: docs and templates carry secret names, locations, and acquisition steps — never values; real Big Emotion infra coordinates live only in `skills/setup/references/m7-bigemotion-internal.md`, deletable in one gesture if the repo goes public.
8. Security posture — dedicated section
9. Prioritized action list (15 max, each tied to a Jira ticket where one exists)
10. Conclusion

### Step 3 — Gather evidence

Long gates (skip with `--quick`):

- Run the repo's full quality gates with its own commands — `npm ci` first (frozen-lockfile install; a stale `node_modules` after a merged PR is a known local false-negative), then `npm test` and `npm run check:templates`. There is **no production build** — this is a plugin repo with nothing to compile; do not invent a build gate.

Always (cheap, read-only):

- `gh run list --limit 10 --json workflowName,status,conclusion,headBranch,createdAt` — recent CI health on `main` (single-branch repo: `main` is both integration and release branch, a deliberate M6 adaptation for a tooling/plugin repo; best-effort — note if `gh` unauthenticated).
- `git ls-files | grep -iE '\.env'` — must return only `.env.example` / `env.template` files (the m7 template ships one).
- `git grep -nE '(sk_[A-Za-z0-9]{16,}|ghp_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|re_[A-Za-z0-9]{20,}|whsec_[A-Za-z0-9]{10,})'` — must return nothing on tracked files.
- `git grep -nE "uses:\s+[^/\s]+/[^@\s]+@(main|master|v[0-9]+|latest)" .github/workflows/` — third-party Actions should be pinned by SHA.
- Three-file version sync: `jq -r .version package.json`, `jq -r .version .claude-plugin/plugin.json`, `jq -r '.plugins[0].version' .claude-plugin/marketplace.json` — all three must be identical.
- `grep -rnE '\{\{' .claude/skills/project-standard-*/` — must return nothing: the rendered project skills are placeholder-free by contract.
- `grep -rln 'PROJECT-''SPECIFIC' skills/setup/templates/` — must be **non-empty** (the pattern is split in two shell strings so this rendered skill itself stays clean of the marker string): the adaptation markers are product content inside the templates; their absence means someone resolved them in place, which is template corruption.
- Reference completeness: for each `skills/setup/templates/m<N>-*` directory, a matching `skills/setup/references/m<N>-*.md` exists.
- M7 isolation: read `skills/setup/references/m7-bigemotion-internal.md`, pick its distinctive coordinates (hostnames, IPs, app names), and `git grep` each one excluding that file — every hit outside it violates the single-internal-file rule. Do not hardcode the coordinates in this skill; derive them from the file at audit time.
- `git grep -nE "TODO|FIXME|XXX|HACK" -- ':!node_modules' | wc -l` — code-debt heuristic.

### Step 4 — Score the domains

Use this rubric (1–10 each, equal weight), adapted to a plugin/templates repo. Severity buckets: **P0** blocks installing the standard on a real repo, **P1** must land before the plugin is promoted to the team, **P2** nice to have.

| # | Domain | What to look for |
| --- | --- | --- |
| 1 | Template integrity | `npm run check:templates` green; every placeholder used under `skills/setup/templates/` is declared in `templates/params.json` (checker enforces) and declared-but-unused params are investigated, not ignored; the adaptation markers (the `<!-- PROJECT-… -->` comment blocks) are intact in the m3-skills templates — they are the product, never resolved in place; each module directory (m1-ci … m7-infra) present and internally consistent. |
| 2 | CI gates + hooks | `ci.yml` runs both jobs — `gitleaks` (Docker image pinned by digest, `.gitleaks.toml` config) and `checks` (`npm test`, `npm run check:templates`, manifest JSON parse); concurrency group with cancel-in-progress; actions SHA-pinned; Husky live on this repo itself: `prepare: husky` script, `.husky/pre-commit` → lint-staged, `.husky/commit-msg` → commitlint, with `commitlint.config.mjs` + `lint-staged.config.mjs` at the root. |
| 3 | Plugin packaging | `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json` parse; plugin name `project-standard` consistent across both; versions in sync across `package.json` / `plugin.json` / `marketplace.json` `plugins[0]`; skills discoverable under `skills/` (`skills/setup/SKILL.md` frontmatter valid); README install commands match the marketplace and plugin names. |
| 4 | Docs accuracy | SPEC.md and README module tables (M1–M7) match the actual tree under `skills/setup/templates/`; every module has its reference file under `skills/setup/references/`; every command a doc names exists in `package.json` scripts; English-docs rule respected. |
| 5 | Secrets hygiene | `.gitleaks.toml` present (default rules + per-repo allowlist) and the gitleaks job wired in `ci.yml`; zero secret values anywhere (Step 3 pattern grep; full-history awareness); real infra coordinates appear only in `skills/setup/references/m7-bigemotion-internal.md` (Step 3 isolation grep returns nothing outside it); `.gitignore` covers `.env` variants. |
| 6 | Project-skills coverage | The rendered set `.claude/skills/project-standard-{release,audit,spec,ticket,bootstrap-confluence}/SKILL.md` is complete; each frontmatter `name:` equals its directory name; no unresolved placeholder and no unresolved adaptation marker in rendered skills (Step 3 greps); no shadowing collision in `~/.claude/skills` (a personal skill with the same name silently wins). |
| 7 | Release readiness | `CHANGELOG.md` exists in Keep a Changelog format with an `[Unreleased]` section; three-file version sync (Step 3); annotated `v*` tags match released versions and each pushed tag has a GitHub Release (`gh release list` — this repo's releases are created by the release skill, no workflow); `/project-standard-release` preconditions are runnable (gh auth, `ci.yml` green on `main`). |

Compute overall score = mean of the domain scores, rounded to one decimal.

When two domains surface the same defect, pick **one canonical severity** for it before scoring, count it fully in the most causal domain, and reference it from the others — otherwise the same gap multi-penalizes the mean and the domains' relative order stops meaning anything.

### Step 5 — Answer the four canonical questions

Always open the report with explicit answers:

1. **Is the plugin ready to install on real repos?** Yes / No / Conditional, plus the 1–3 blockers. A module the README promises that the templates do not actually install is not production-ready no matter the other scores.
2. **Is the template surface healthy?** Do the templates pass the checker, is the placeholder registry coherent, are the adaptation markers intact, and does the documented standard (SPEC.md M1–M7) match what the templates actually install? Evidence walk: `check:templates` output, params-registry coherence, module-tree vs README/SPEC comparison, marker greps.
3. **What is the security posture?** One short paragraph + bullets: secrets doctrine respected (names never values), m7 internal-file isolation, gitleaks config + CI job, supply chain (SHA pinning), branch-protection reality on `main`.
4. **Is the score close to 8–9/10?** Quote the computed score, compare to target, list the top 3 gaps that would close the distance.

### Step 6 — Write the report

Update `docs/PRODUCTION-READINESS-AUDIT.md` in place (create it, and `docs/`, if absent). Bump the `Date:` field to today. English, per the repo's docs-language rule.

Then output a concise summary to the user (≤ 25 lines): the four answers + the computed score + the top 3 actions. The full detail lives in the file.

### Step 7 — Verification

Before reporting done:

- [ ] All domain scores justified by at least one piece of evidence (command output, `file:line`).
- [ ] The four canonical questions are answered explicitly in section 2 of the report.
- [ ] No score is invented — if a check could not run (`--quick`, unauthenticated `gh`), mark it `N/A` and explain.
- [ ] Cross-domain defects were harmonized to one canonical severity before the mean was computed.
- [ ] `docs/PRODUCTION-READINESS-AUDIT.md` was updated (or created) and its Date field reflects today.
- [ ] `git status --porcelain` shows **only** `docs/PRODUCTION-READINESS-AUDIT.md` changed (plus the disclosed `node_modules` refresh, which is gitignored).

## Output Format

User-facing summary (printed at end):

```
Big Emotion Project Standard Audit — <YYYY-MM-DD>
Score: X.X / 10 (target 8–9)

1. Ready to install on real repos? <verdict + 1-line reason>
2. Template surface healthy? <verdict + 1-line reason>
3. Security posture? <one line>
4. Distance to 8–9? <top 3 actions>

Full report: docs/PRODUCTION-READINESS-AUDIT.md
```

## Out of Scope

- Fixing any gap found. The audit only **reports**; releases go through `/project-standard-release`.
- Any write against external services (GitHub releases, Atlassian, deploy targets).
- Live end-to-end measurement (installing the plugin on a scratch repo and running the setup skill) — domains score on configuration, checker output, and recorded evidence, not live installs.
- Auditing the repos the standard is installed on (e.g. `sitewebgrandechancellerie`, `support-agent-chancellerie`) — each consumer repo has its own `<slug>-audit` skill; this audit scores only the plugin repo itself.
