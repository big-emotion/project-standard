# M1 — CI quality gates: install reference

Templates: `templates/m1-ci/`. Reference implementation: `the website repo` `.github/workflows/ci.yml` (the full version with every website-specific gate — useful when a project wants to graduate into the optional extensions below).

## File map

| Template | Installs to | Notes |
|---|---|---|
| `m1-ci/ci.yml` | `.github/workflows/ci.yml` | Render placeholders (`integration_branch`, `default_branch`, `node_version`) |
| `m1-ci/gitleaks.toml` | `.gitleaks.toml` (repo root) | Renamed on install (templates carry no leading dot) |
| `m1-ci/claude.yml` | `.github/workflows/claude.yml` | Needs the `CLAUDE_CODE_OAUTH_TOKEN` repo secret |
| `m1-ci/approve-agent-ci.yml` | `.github/workflows/approve-agent-ci.yml` | Needs the `CI_APPROVAL_TOKEN` repo secret |

Secrets to set:

- `CLAUDE_CODE_OAUTH_TOKEN` — Claude Code OAuth token for the interactive `@claude` workflow. Shared with Ferry (M5) when installed.
- `CI_APPROVAL_TOKEN` — fine-grained PAT (`actions: write`) **from a write-access user**, not a bot. `approve-agent-ci.yml` falls back to `github.token`, but a rerun issued with the workflow token is attributed to `github-actions[bot]` and may re-trip the very approval gate it lifts; the workflow fails loud in that case.

Workflows must exist on the default branch before they fire on PRs — install M1 via a PR to `{{default_branch}}` (or push directly on a fresh repo) before relying on the gates.

## package.json scripts the workflow expects

`ci.yml` calls five scripts. Add them with these reference forms (pnpm-form; see the npm adaptation below):

```jsonc
{
  "scripts": {
    // --cache-strategy content is load-bearing for the CI linter cache — see
    // "Caching idioms". Adjust the lint targets (src scripts) to the repo layout.
    "lint": "eslint --cache --cache-strategy content --cache-location node_modules/.cache/eslint/ src scripts",
    "typecheck": "tsc --noEmit",
    "format": "prettier --write .",
    "format:check": "prettier --check --cache --cache-strategy content .",
    // Pick the project's runner: dependency-free repos use node --test,
    // vitest repos use "vitest run".
    "test": "node --test 'src/**/*.test.mjs' 'scripts/**/*.test.mjs'",
    "build": "next build"
  }
}
```

Also standard in `package.json`: `"engines": { "node": "{{node_version}}.x" }` and `"packageManager": "{{package_manager_version}}"` — the CI's `corepack enable` step resolves pnpm from that field, so CI and local installs always agree.

### When a check does not apply

Prune the workflow step **and** skip the script — never stub a script with `exit 0` or leave a step red. A vacuously green required check is worse than no check, because branch protection and the Ferry merger read it as a real pass.

- **No TypeScript** (plain-JS / .mjs repo): delete the `pnpm typecheck` step and the `typecheck` script. Keep `lint` (ESLint lints .mjs fine) and `format:check`.
- **Nothing to build** (scripts-only or docs repo): delete the `pnpm build` step and script.
- **No tests yet**: keep the step and let `node --test` run an empty glob only if the runner tolerates it — otherwise delete the step and re-add it with the first test. Do not fake it.
- The `gitleaks` job always applies. There is no repo without secrets risk.

## Caching idioms (why the workflow looks the way it does)

Three idioms, all kept from the reference repo:

1. **Concurrency group + cancel-in-progress.** `group: ci-${{ github.ref }}` with `cancel-in-progress: true` cancels the superseded run when a PR is force-pushed or gets a quick follow-up commit — one live run per ref, no queue of stale gates.

2. **Frozen-lockfile install + pnpm store cache.** `pnpm install --frozen-lockfile` guarantees CI installs exactly the lockfile (an out-of-date lockfile fails instead of silently resolving). `actions/setup-node` with `cache: "pnpm"` caches the pnpm content-addressable store between runs; `corepack enable` must run **before** setup-node's cache resolution so `pnpm store path` is answerable.

3. **ESLint + Prettier content-strategy caches.** Both tools cache per-file results, but their default `metadata` strategy keys on mtime — useless in CI, where a fresh checkout gives every file a new mtime. `--cache-strategy content` keys on file content instead, so the restored cache actually hits. The `actions/cache` key hashes the lockfile + both linter configs because the tools' own caches invalidate on file changes but **not** on a plugin/version or rule-config bump; the `github.sha` suffix makes every run save a fresh entry, and the `restore-keys` prefix falls back to the most recent cache for the same config.

Framework-specific variant (not in the core template): Next.js repos add an `actions/cache` step for `.next/cache` keyed on the lockfile + `github.sha`, restored before `pnpm build`. `.next/cache` is content-hashed by Next, so a stale entry is ignored, never mis-served. See the "Restore Next.js build cache" step in the reference repo's `ci.yml`.

Pinning policy (as practiced by the reference): third-party actions and Docker images are pinned to an immutable SHA/digest (`claude-code-action@1dc994ee…`, the gitleaks image digest); GitHub-official actions (`actions/checkout`, `actions/setup-node`, `actions/cache`) ride major tags. Refresh pins 1–2 times monthly.

## npm adaptation

Templates ship in pnpm form. On an npm repo:

| pnpm form | npm form |
|---|---|
| `corepack enable` step | delete (npm ships with Node) |
| `cache: "pnpm"` | `cache: "npm"` |
| `pnpm install --frozen-lockfile` | `npm ci` |
| `pnpm lint` / `pnpm test` / … | `npm run lint` / `npm test` / … |
| `hashFiles('pnpm-lock.yaml', …)` | `hashFiles('package-lock.json', …)` |

## Optional extensions (not core — install per project)

Enforced only on `{{integration_branch}} → {{default_branch}}` PRs or via an opt-in label — never as universal per-PR gates. All have working implementations in the reference repo:

- **E2e job** (Playwright against the production build): a `needs: build` job downloading the standalone bundle artifact, gated `if: github.base_ref == '{{default_branch}}' || contains(github.event.pull_request.labels.*.name, 'test:e2e')`. Requires adding `labeled` to `on.pull_request.types` so applying the label (re)triggers the workflow. The reference deliberately does **not** skip the code-quality jobs on label events: a job skipped via `if:` reports a neutral check, which branch protection's latest-status logic and the Ferry merger's `gh pr checks` would misread. See the `e2e` job in the reference `ci.yml` and its DEC-102/ARCH-025 notes.
- **Lighthouse / performance budgets**: reference `perf.yml` + `docs/decisions/0009-cwv-budgets.md` (bundle-size ceiling enforced by a post-build script).
- **Storybook / Chromatic**: reference `storybook.yml` — visual-regression surface, integration→default only.
- **Self-hosted runner tiering**: the reference routes blocking gates to a `fast` runner label and non-gating jobs (agent workflows, informational checks) to a `slow` tier — `docs/decisions/0023-self-hosted-runner-tiering.md`. The template uses `ubuntu-latest`; adopt tiering only when a project brings its own runners.
- **Project-specific check scripts** (`lint:tokens`, `check:routes`, Prismic drift checks, …): stay project-local, appended as extra `- run:` steps after `format:check`.

## Branch protection (recommendation)

On both `{{integration_branch}}` and `{{default_branch}}`:

- Required status checks: `CI / gitleaks` and `CI / build` (plus any adopted extension on the `{{default_branch}}` path only).
- **Status-checks-only on the integration path** — do not enable "require approvals" there: Ferry's `ferry:approved` label is not a GitHub review, so a required-approvals rule blocks the Ferry Merger (see M5).
- Keep `{{default_branch}}` release-protected per M6 (tag-driven deploys).
