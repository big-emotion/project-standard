# Big Emotion Project Standard

The toolset and configuration every Big Emotion project ships with — codified as a Claude Code plugin whose `setup` skill installs, configures, and audits it on any repo.

## The standard

| Module | What |
|---|---|
| M1 | **CI quality gates** — gitleaks secret scan, lint, typecheck, format check, tests, build on every PR |
| M2 | **Local hooks** — Husky: pre-commit → lint-staged, commit-msg → commitlint (Conventional Commits) |
| M3 | **Project skills** — `<slug>-release`, `<slug>-audit`, `<slug>-spec`, `<slug>-ticket`, `<slug>-bootstrap-confluence` |
| M4 | **Atlassian wiring** — Jira board (pipeline columns + `ferry` user), Confluence spec tree (REQ/DEC/ARCH) |
| M5 | **Ferry** — Jira → AI-agent automation ([@big-emotion/ferry](https://github.com/big-emotion/ferry)), router model, claude-code path |
| M6 | **Branch & release model** — `develop` integration, protected `main`, release by tag `v*` → deploy |
| M7 | **Infrastructure & secrets** — OVH VPS (Docker + shared Traefik) as templated deploy target, Azure App Service as documented variant, M365 transactional SMTP + OVH DNS, secrets doctrine (names and locations, never values) |

Full rationale and decisions: [SPEC.md](SPEC.md). The standard is distilled from two live production repos — a Next.js client website (source of M1–M3) and an AI support agent (source of M5, M7).

**No secret values, and no coordinates either.** This repo documents where secrets live and what they are called; values stay in GitHub secrets, VPS `.env` files, and provider portals, tied to each operator's own accounts. Being public, it also carries no infrastructure *coordinates* — no hostnames, IPs, account handles, resource names or client identities. Every deploy target is a `{{placeholder}}` the setup interview fills in from your own environment.

## Install

```
/plugin marketplace add big-emotion/project-standard
/plugin install project-standard@big-emotion
```

## Use

In any repo (new or existing):

```
/project-standard:setup
```

The skill interviews you, runs a read-only gap analysis (missing / present / drifted per module), presents an install plan, and only writes after one explicit confirmation. Re-running on a compliant repo is a no-op audit.

## Repo layout

- `skills/setup/SKILL.md` — the orchestrating skill
- `skills/setup/references/m*.md` — per-module install/adaptation runbooks
- `skills/setup/templates/` — all standard files with `{{placeholder}}` tokens; `params.json` is the placeholder registry
- `scripts/check-templates.mjs` — CI gate: every placeholder used in templates must be declared in `params.json`

## Develop

Node ≥ 20, dependency-free.

```
npm test              # node:test suite
npm run check:templates
```
