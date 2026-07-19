# M5 — Ferry (router model, claude-code path)

Ferry (`@big-emotion/ferry`) turns Jira column moves into autonomous agent runs
on GitHub Actions: Refiner → Developer → Reviewer → Iterator → Merger. The Big
Emotion standard is the **router model** (one `ferry-router.yml` + one
any-column Jira rule) on the **claude-code execution path**
(`anthropics/claude-code-action`, subscription auth). Pin the `ferry_version`
interview value (v1.1.2 at the time of writing) everywhere a version appears.

Upstream docs are authoritative for procedures:
<https://github.com/big-emotion/ferry> (docs/INSTALL.md, docs/CONFIGURATION.md).
This reference layers the Big Emotion hardening on top. The live reference
implementation is `big-emotion/support-agent-chancellerie`.

## Prerequisites

- **Jira Cloud** Standard or Premium (outbound web requests required), with the
  M4 board in place — the five pipeline columns exist and the **Story** issue
  type (plus Task/Bug/Spike if used) is enabled.
- **Dedicated `ferry` Jira user** (interview: `ferry_jira_account`) — the
  hardened automation rule conditions on it, and its credentials back the
  `FERRY_JIRA_*` secrets.
- **GitHub App** installed on the target repo with `contents: write`,
  `pull-requests: write`, `issues: write`. Have the App ID and the
  private-key PEM file ready — the wizard's first step prompts for both. (The
  App is used by `ferry-doctor` to validate the install; agent workflows run
  on the workflow token / `FERRY_CHECKOUT_TOKEN`.)
- **Node >= 20** locally, `gh` CLI authenticated against the target repo.
- **Claude Pro/Max subscription** — run `claude setup-token` to obtain the
  `CLAUDE_CODE_OAUTH_TOKEN` value before starting.
- M6 in place: the integration branch exists (Ferry PRs target it).

## Install

### 1. Pre-place the standard config, then run the wizard

Render `templates/m5-ferry/ferry.config.json` and `templates/m5-ferry/ferry.local.yml`
into the repo root **first**: when a `ferry.config.*` already exists, the
wizard respects it and skips config generation (no `--overwrite`).

```bash
npx -p @big-emotion/ferry ferry-init
```

The wizard collects the Jira URL, credentials, column status names, and
provider selection, then:

- writes `.github/workflows/ferry-router.yml` (claude-code path detected from
  `execution_path` in the config);
- writes `ferry-jira-automation-setup.md` (rule walkthrough) and
  `ferry-jira-automation-rules.beta.json` into the repo root;
- sets the base secrets via `gh secret set` (masked input): `FERRY_APP_ID`,
  `FERRY_PRIVATE_KEY`, `FERRY_JIRA_BASE_URL`, `FERRY_JIRA_EMAIL`,
  `FERRY_JIRA_API_TOKEN`, plus the provider credential.

**Claude-code path credential rule (ADR-0006 §6):** `CLAUDE_CODE_OAUTH_TOKEN`
is **mandatory**; `ANTHROPIC_API_KEY` is **forbidden** on this path (it belongs
to the bundled-script path only). If the wizard set `ANTHROPIC_API_KEY`, delete
it and set the OAuth token instead:

```bash
gh secret delete ANTHROPIC_API_KEY
gh secret set CLAUDE_CODE_OAUTH_TOKEN --body "<token from `claude setup-token`>"
```

### 2. Audit issue + variable

Ferry appends a one-line journal entry to a dedicated GitHub Issue after every
agent run (deduplication + reconciliation both depend on it):

```bash
gh issue create \
  --title "Ferry Audit Log (#1)" \
  --body "Do not close. Ferry writes audit comments here." \
  --label ferry --label "ferry:audit-log:active"
gh variable set FERRY_AUDIT_ISSUE --body "<issue-number>"
```

### 3. Workflow default permissions = write

```bash
gh api -X PUT /repos/<org>/<repo>/actions/permissions/workflow \
  -f default_workflow_permissions=write \
  -F can_approve_pull_request_reviews=true
```

(UI: Settings → Actions → General → Workflow permissions → Read and write.)

### 4. Required scheduled workflows

Two maintenance workflows are **required** (upstream "Operations setup"). The
support-agent repo currently lacks them — that is a gap in the reference
implementation, not a licence to skip them:

```bash
# Stale-ticket reconciler — every 30 min
curl -fsSL "https://raw.githubusercontent.com/big-emotion/ferry/<ferry_version>/examples/consumer-setup/workflows/ferry-reconcile.yml" \
  -o ".github/workflows/ferry-reconcile.yml"
# Daily cost check — 06:00 UTC
curl -fsSL "https://raw.githubusercontent.com/big-emotion/ferry/<ferry_version>/examples/consumer-setup/workflows/ferry-cost-daily.yml" \
  -o ".github/workflows/ferry-cost-daily.yml"
```

Commit both. Note: on the claude-code path the EUR figures the cost workflow
reads are best-effort `0` (subscription billing) — it still governs any
script-path spend and keeps the audit issue rotating.

### 5. Push everything to the default branch

`repository_dispatch` only fires workflows that exist on the **default
branch**. Commit and push `ferry-router.yml`, `ferry-reconcile.yml`,
`ferry-cost-daily.yml`, `ferry.config.json`, `ferry.local.yml`, and the
automation reference docs before creating the Jira rule — until then the rule
does nothing, silently.

### 6. The Jira rule (hardened, single, any-column)

Create **one** rule from `templates/m5-ferry/jira-automation-rule.md` (rendered
into the repo as the project's rule doc). Summary: trigger "Field value
changed" on Status + Assignee; two conditions — **assignee = the `ferry`
user** AND **status in the five pipeline columns**; action = POST to
`https://api.github.com/repos/<org>/<repo>/dispatches` with the v1
`ferry-transition` envelope (including `to_status`). Mark the `Authorization`
header secret.

Create it **in the Jira UI**. The generated
`ferry-jira-automation-rules.beta.json` can be imported via Automation → ⋮ →
Import rules, but that feature is beta and breaks across Jira Cloud releases —
treat the JSON as reference only. It also lacks the two hardening conditions,
which you would add by hand anyway.

### 7. Board columns must match the config exactly

Ferry matches status names **verbatim** against `workflow.agents.*` — a board
column named `TO MERGE` will never trigger the Merger configured for
`To Merge`. Preferred fix: rename the board statuses to the canonical five
(`Refinement`, `In Development`, `In Review`, `Changes Requested`,
`To Merge`). The alternative — editing `ferry.config.json` *and* the Jira
rule's status condition to the board's names — is two more places to get
wrong. `ferry-doctor` validates every configured column against the Jira
project; re-run it after any rename.

## Secrets (complete table)

| Secret | Purpose | Needed on |
| --- | --- | --- |
| `FERRY_APP_ID` | GitHub App numeric id (install validation via `ferry-doctor`) | all paths |
| `FERRY_PRIVATE_KEY` | GitHub App private-key PEM | all paths |
| `FERRY_JIRA_BASE_URL` | `https://<site>.atlassian.net` | all agents |
| `FERRY_JIRA_EMAIL` | Atlassian account email (the dedicated `ferry` user) | all agents |
| `FERRY_JIRA_API_TOKEN` | Atlassian API token for that account | all agents |
| `CLAUDE_CODE_OAUTH_TOKEN` | Auth for `claude-code-action` (`claude setup-token`, Pro/Max) | **claude-code path — mandatory** |
| `ANTHROPIC_API_KEY` | Provider key for the bundled-script agent loop | script path only — **forbidden on claude-code** (ADR-0006 §6) |
| `FERRY_CHECKOUT_TOKEN` | PAT/App token for checkout → agent pushes re-trigger CI (a `github-actions[bot]` push suppresses `pull_request` events) | claude-code path — strongly recommended |
| `FERRY_REVIEW_TRANSITION_ID` | Optional pin: transition into In Review (Developer/Iterator) — auto-resolved from status names when unset | optional, all paths |
| `FERRY_ITER_TRANSITION_ID` | Optional pin: transition into Changes Requested (Reviewer) | optional, all paths |
| `FERRY_APPROVE_TRANSITION_ID` | Optional pin: Reviewer on-approval transition | optional, all paths |
| `FERRY_MERGE_DONE_TRANSITION_ID` | Optional pin: post-merge move | script path only (the claude-code Merger name-matches "Done"/"Closed" itself) |
| `CI_APPROVAL_TOKEN` | PAT used by M1's `approve-agent-ci.yml` to approve bot-gated CI runs on agent PRs | cross-module (M1), needed once Ferry opens PRs |

## Variables (complete table)

| Variable | Required | Value | Purpose |
| --- | --- | --- | --- |
| `FERRY_AUDIT_ISSUE` | yes | audit issue number | journal / dedup / reconciler anchor |
| `FERRY_INTEGRATION_BRANCH` | yes (standard) | the integration branch (usually `develop`) | branch the Refiner/Developer check out; Ferry defaults to `main` without it |
| `FERRY_RUNNER` | no | **JSON-encoded**: `"ubuntu-latest"` (with quotes) or `["self-hosted","Linux","X64"]` | runner label — goes through `fromJSON()` in `runs-on`; a bare unquoted string breaks every job |
| `FERRY_REFINER_MODEL` / `FERRY_DEV_MODEL` / `FERRY_REVIEW_MODEL` / `FERRY_ITER_MODEL` / `FERRY_MERGER_MODEL` | no | model id | per-role model override; unset = the pinned router template's fallback default |
| `FERRY_PRE_AGENT_COMMAND` | no | e.g. `pnpm install --frozen-lockfile` | dependency bootstrap after checkout, before the agent — lets it run the repo's local gates |
| `FERRY_EXTRA_CLAUDE_ARGS` | no | extra `claude_args` | additional `--mcp-config` blocks — **but** GitHub does not interpolate `secrets.*` inside variables, so any MCP config carrying a key must live inline in the workflow instead (see Gotchas → protected divergences) |
| `FERRY_MERGE_STRATEGY` | no | `squash` (default) / `merge` / `rebase` | not wired into the stub — add an `env:` mapping on the merge job to use it |

## Branch protection on the integration branch

The Reviewer sets the **`ferry:approved` label — it is not a GitHub PR review
approval**. Any "Require approvals: N" rule therefore blocks the Merger's
`gh pr merge`. Options (upstream table, condensed):

| Option | When |
| --- | --- |
| **Status-checks-only** — require a PR + passing required checks, no required approvals | **Big Emotion standard**: full automation; the M1 gates are the bar |
| Bypass exemption for the Ferry App/token in the ruleset bypass list | keep human-approval rules, exempt Ferry |
| Don't enable the Merger — humans merge `ferry:approved` PRs | team keeps its own merge process |
| GitHub auto-merge armed per PR, human approval still required | human checkpoint before every merge |

Branch protection on the target branch is a **required** consumer setting on
the claude-code path — the `--disallowedTools` deny-list (`gh pr merge` denied
for all roles except the Merger, `gh pr close` for all) is client-side; the
server-side gate is yours. See `references/m6-branch-release.md` for the full
two-branch checklist.

## CI-gating model (Big Emotion convention)

`ferry.local.yml` ships `review.ciGate: disabled` — **only the Merger gates on
CI**. Rationale: the upstream reviewer ci-gate skips reviews silently while CI
is pending or the PR is not yet open, and on red CI bounces tickets to Changes
Requested un-reviewed, ping-ponging the pipeline. Instead:

- Developer and Iterator drive CI best-effort (bounded loop), transition
  regardless, and surface the true state via the **`ci-green` / `ci-failing`
  PR labels** (create both labels in the repo — the prompts apply, never
  create, them);
- the Reviewer reviews unconditionally and reads the label;
- the Merger re-validates green CI before merging — the single hard gate.

The `ci-green`/`ci-failing` labels are a Big Emotion convention (not upstream)
— document them in the repo and keep them if you touch the prompts.

## Prompt customization

Resolution order per agent (`ferry-cc-prompt`): **`.local.md` overlay always
applies** (appended last, Ferry >= v0.18.1) **> full override
`prompts/<agent>.claude-code.md` > bundled default**. The standard is the
additive overlay (SPEC D2) — see
`templates/m5-ferry/prompts-local-overlay-example.md` for the file map, the
placeholder-token rules (`TICKET_KEY`, `RUN_ID`, transition ids), and a
ready-to-adapt Developer overlay. Full overrides freeze the upstream contract
at copy time; `ferry-doctor` (check 19) warns on them. The two existing repos
predate v0.18.1 and still use full overrides — do not copy that pattern into
new projects.

## Validate

```bash
npx -p @big-emotion/ferry ferry-doctor
```

Must report no FAIL lines (secrets, App access, audit issue, column names,
prompt overrides). Then smoke-test the loop end to end: create a Jira
**Story**, assign the `ferry` user, move it to **Refinement** → a
"Ferry — Router" run appears within seconds. Approve the sub-tasks, move to
**In Development** → draft PR on `ferry/<KEY>`, auto-transition to In Review →
Reviewer verdict (To Merge or Changes Requested) → Merger squash-merges from
the merge column.

## Gotchas

1. **`ferry-init` / `ferry-update` regenerate `ferry-router.yml` and wipe
   every inline edit.** Only what `ferry.local.yml` declares —
   `review.ciGate` and `global.runner` — survives a regeneration. Everything
   else (extra MCP wiring in `extra_claude_args`, tool-install steps like
   `uv`, `env:` blocks backing reviewer verification recipes) is silently
   dropped. Convention: mark each such edit with a
   `LOCAL DIVERGENCE (protected)` comment **and** keep a numbered re-apply
   list in the router's header comment (the support-agent repo's
   `ferry-router.yml` header is the model). Re-apply the list after **every**
   version bump, then diff against git history to confirm nothing was lost.
   Why inline at all: `secrets.*` does not interpolate inside repo variables,
   so key-bearing MCP configs cannot move to `FERRY_EXTRA_CLAUDE_ARGS`.
2. **SHA-pin the Ferry action refs** rather than the floating tag, and
   refresh the pin every 1–2 months (or Dependabot for Actions):

   ```bash
   SHA=$(gh api repos/big-emotion/ferry/git/refs/tags/<ferry_version> --jq '.object.sha')
   sed -i.bak "s|@<ferry_version>|@${SHA}|g" .github/workflows/ferry-*.yml && rm .github/workflows/*.bak
   ```

3. **`ferry-cc-prompt` substitutes five tokens, nothing else** —
   `TICKET_KEY`, `RUN_ID`, `REVIEW_TRANSITION_ID`, `APPROVE_TRANSITION_ID`,
   `CHANGES_TRANSITION_ID`. Unrecognised tokens stay literal in the prompt.
   Never invent one; have the agent resolve dynamic values at run time.
4. **Commitlint compatibility (M2 interlock).** Ferry agents commit and their
   messages must pass the repo's conventional-commit gate: verify the resolved
   prompts instruct Conventional Commits with M2's type-enum (the bundled +
   standard overlay do), and that the Merger's squash message inherits a
   conventional PR title. Husky hooks don't run in Actions — the CI-side
   check and review are the net.
5. **Workflows must exist on the default branch before the rule fires** — a
   perfectly configured Jira rule against a repo whose router only lives on a
   feature branch produces 204 responses and zero workflow runs. Push first.
6. **`FERRY_RUNNER` is JSON.** `ubuntu-latest` (unquoted) breaks every job at
   the `fromJSON()` expression; the value must be `"ubuntu-latest"` including
   the quotes, or a JSON array.
7. **Claude-code path invariants are prompt-enforced, not code-enforced**
   (idempotency, audit line, rare transitions) — accepted by design; the
   compensating controls are branch protection, the deny-lists, and the M1
   gates. Budget labels (`ferry:budget/*`) and `ferry:spend-cap` do not fire
   on this path.

## Install checklist

```
[ ] ferry.config.json + ferry.local.yml rendered at repo root
[ ] ferry-init run; ferry-router.yml generated
[ ] CLAUDE_CODE_OAUTH_TOKEN set; ANTHROPIC_API_KEY absent
[ ] Audit issue created + FERRY_AUDIT_ISSUE set
[ ] Workflow permissions = read/write + can-approve-PR
[ ] ferry-reconcile.yml + ferry-cost-daily.yml added (required)
[ ] FERRY_INTEGRATION_BRANCH set; FERRY_CHECKOUT_TOKEN set
[ ] All workflows + config pushed to the default branch
[ ] Board columns match ferry.config exactly
[ ] Hardened any-column Jira rule created and enabled
[ ] ci-green / ci-failing labels exist
[ ] Branch protection: status-checks-only on the integration branch
[ ] ferry-doctor green; smoke Story completed the full loop
```
