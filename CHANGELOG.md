# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.1] - 2026-07-21

### Added

- MIT `LICENSE`, declared in `package.json` — the repo was public and installable as a plugin but carried no licence, so nobody could legally reuse it. Matches Ferry, the other public Big Emotion tool. (#3)

### Security

- Removed every infrastructure coordinate and client identity from the repo **and from its published git history**: VPS host/IP/SSH port, provider account handle, cloud resource and OIDC identity names, sending mailbox, both reference-repo slugs, and the Jira project key. The repo is public, so this material — though it contained no secret values — was readable by anyone. Verified with gitleaks over the full history plus per-pattern sweeps across every commit.

### Removed

- `skills/setup/references/m7-bigemotion-internal.md`, the single internal coordinates file. Operators now supply M7 coordinates at interview time from a private source outside this repo; the setup skill ships no defaults for them.

### Changed

- **SPEC `D9` supersedes `D7`**: the "hybrid coordinates model" (parameterized module + one isolated internal file) is replaced by a no-coordinates model. A coordinate committed here is a leak even when it is not a secret.
- The two reference implementations are named by role — "the website repo", "the support-agent repo" — instead of by org/repo slug, keeping every runbook's technical substance intact.
- The audit skill's "M7 isolation" check became a shape-based coordinates sweep: it now looks for coordinates *anywhere* in the tree rather than confirming they sit in one file.
- `templates/params.json` examples no longer carry a real Atlassian tenant, Jira key or sending domain.

## [0.1.0] - 2026-07-19

### Added

- The seven-module Big Emotion project standard, codified in `SPEC.md`: M1 CI quality gates, M2 Husky hooks, M3 project skills, M4 Atlassian wiring, M5 Ferry (router model), M6 branch & release model, M7 infrastructure & secrets (OVH VPS target, Azure variant, M365 mail, secrets doctrine with the hybrid coordinates model).
- The `/project-standard:setup` skill: interview → gap analysis → confirmed per-module install → verification, with per-module reference runbooks and fully parameterized templates (`{{placeholder}}` registry in `templates/params.json`, enforced by `scripts/check-templates.mjs`).
- Claude Code plugin packaging: the repo is its own marketplace (`big-emotion`), installable via `/plugin marketplace add big-emotion/project-standard`.
- Dogfood of the standard on this repo itself: adapted M1 CI (tests, template checker, manifest validation, gitleaks), M2 hooks, and the five self-rendered project skills (`project-standard-{release,audit,spec,ticket,bootstrap-confluence}`).
- First production-readiness audit (`docs/PRODUCTION-READINESS-AUDIT.md`): 8.1/10.
- Real-world validation of M1+M2 on a live consumer repo: green PR, hooks active, one pre-existing lint bug caught.

[Unreleased]: https://github.com/big-emotion/project-standard/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/big-emotion/project-standard/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/big-emotion/project-standard/releases/tag/v0.1.0
