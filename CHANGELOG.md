# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-07-19

### Added

- The seven-module Big Emotion project standard, codified in `SPEC.md`: M1 CI quality gates, M2 Husky hooks, M3 project skills, M4 Atlassian wiring, M5 Ferry (router model), M6 branch & release model, M7 infrastructure & secrets (OVH VPS target, Azure variant, M365 mail, secrets doctrine with the hybrid coordinates model).
- The `/project-standard:setup` skill: interview → gap analysis → confirmed per-module install → verification, with per-module reference runbooks and fully parameterized templates (`{{placeholder}}` registry in `templates/params.json`, enforced by `scripts/check-templates.mjs`).
- Claude Code plugin packaging: the repo is its own marketplace (`big-emotion`), installable via `/plugin marketplace add big-emotion/project-standard`.
- Dogfood of the standard on this repo itself: adapted M1 CI (tests, template checker, manifest validation, gitleaks), M2 hooks, and the five self-rendered project skills (`project-standard-{release,audit,spec,ticket,bootstrap-confluence}`).
- First production-readiness audit (`docs/PRODUCTION-READINESS-AUDIT.md`): 8.1/10.
- Real-world validation of M1+M2 on `big-emotion/support-agent-chancellerie` (CHANSUP-87, PR #42).

[Unreleased]: https://github.com/big-emotion/project-standard/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/big-emotion/project-standard/releases/tag/v0.1.0
