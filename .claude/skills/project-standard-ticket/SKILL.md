---
name: project-standard-ticket
description: End-to-end local automation for a single Jira ticket on the Big Emotion Project Standard repo. Paste a Jira ticket URL (or key) and the skill self-assigns the ticket, reads it, refines it, creates the Jira sub-tasks, branches off the integration branch in an isolated git worktree, implements the work in parallel via sub-agents, opens the pull request, then moves the ticket to the review column and comments the PR link. Runs fully automatically with no confirmation gates. Use when the user pastes a Jira ticket link, says "prends ce ticket", "implémente ce ticket Jira", "traite ce ticket", or invokes /project-standard-ticket.
metadata:
  author: Big Emotion
  version: "1.0.0"
---

# Big Emotion Project Standard Ticket

> **M4 wiring pending for this repo** — preconditions below will fail-fast until a Jira project + Confluence space are bootstrapped (run `/project-standard:setup` module M4, then `project-standard-bootstrap-confluence`). This repo also has no `ferry.config.json` yet (M5), which precondition 5 requires.

Take a single Jira ticket from link to merged-ready PR, locally and unattended.

This is the **local, interactive, on-demand** counterpart to Ferry (which runs the same lifecycle async/cloud via Jira Automation). It does not call Ferry; it does the work directly on the developer's machine. To avoid divergence with Ferry, **the base branch, the PR target branch, and the review column are read from `ferry.config.json` at runtime** — never hard-coded. The one deliberate divergence is the working-branch prefix: the config's `working_branch_prefix` names the namespace Ferry's automation owns (typically `ferry/`), so local runs stay out of it and use the human-style prefixes of the repo history instead (`feat/`, `fix/` — Step 5).

## Operating mode — FULL AUTO

The user chose **no confirmation gates**. The skill runs the entire chain — assign → read → refine → sub-tasks → branch → implement → PR → Jira transition + comment — without stopping to ask.

"Full auto" removes *confirmation* prompts. It does **not** remove *safety blockers*: a small set of hard preconditions where proceeding would corrupt shared state or produce a broken PR. On a safety blocker the skill **stops and reports** — it does not guess or force through. These are listed under Preconditions and are non-negotiable.

## When to Activate

- User pastes a Jira ticket URL (e.g. `https://<org>.atlassian.net/browse/KEY-123`) or a bare issue key.
- User says: "prends ce ticket", "implémente / traite ce ticket Jira", "fais ce ticket".
- User invokes `/project-standard-ticket <jira-url-or-key>`.

## Inputs

A single argument: the Jira ticket URL or issue key.

- Accept `.../browse/KEY-123`, `...selectedIssue=KEY-123`, `...?...&issueKey=KEY-123`, or a bare `KEY-123`.
- Extract the issue key with the regex `[A-Z][A-Z0-9]+-\d+`. If zero or more than one distinct key is found, **stop** and ask the user for the exact key (ambiguous input is a safety blocker, not a design choice).

## Preconditions (safety blockers — stop and report if any fail)

1. **Repo root** — `package.json` `.name` is `@big-emotion/project-standard` (the scoped npm name; the skill prefix stays `project-standard`). If not, stop and tell the user to `cd` in.
2. **Atlassian MCP reachable** — `mcp__atlassian__getAccessibleAtlassianResources` returns at least one site. Resolve and keep `cloudId` (the Jira site id) for every subsequent Jira call. If it fails, stop — the Jira half of the workflow is impossible.
3. **gh authenticated** — `gh auth status` succeeds for `big-emotion/project-standard`.
4. **Base branch fetchable** — `git fetch origin` succeeds and `origin/<base_branch>` exists. Implementation runs in a dedicated worktree (Step 5), so the user's main checkout is never touched and need not be clean — but the worktree must be cut from a real remote base branch.
5. **`ferry.config.json` present and parseable** — it is the single source of truth for the base/target branches + column names. If missing/invalid, stop.

Load these once from `ferry.config.json`:

- `base_branch` = `.git.base_branch` (branch to cut from)
- `target_branch` = `.git.target_branch` (PR base)
- `review_column` = `.workflow.agents.developer.auto_transition` (Jira column to move the ticket into after the PR)

Never substitute literals for these — if `ferry.config.json` changes, the skill must follow. (For this single-branch repo both branch values are expected to resolve to `main` — a deliberate M6 adaptation for a tooling/plugin repo — but the config stays the authority.)

## Workflow

### Step 1 — Resolve ticket and Jira identity

- `cloudId` from `getAccessibleAtlassianResources`.
- `getJiraIssue(cloudId, issueIdOrKey=KEY-123)` — fetch summary, description, issue type, status, acceptance criteria, attachments, existing sub-tasks, comments.
- `atlassianUserInfo` → own `accountId` (the assignee).

### Step 2 — Self-assign

- `editJiraIssue(cloudId, KEY-123, fields={ assignee: { accountId: <own> } })`.
- If the ticket is already assigned to someone else, still assign to self (the user explicitly wants to take the ticket) but note the previous assignee in the final report.

### Step 3 — Read & refine

- Summarise the ticket's intent, scope, and acceptance criteria.
- **Surface assumptions explicitly** in the refinement (per the core operating behaviors): any ambiguous requirement gets a stated assumption rather than a silent guess.

Mandatory refinement rules for this repo (the templates are the product — these rules order sub-tasks and stop silent scope drift):

- **Registry-first rule.** Trigger: the ticket adds, renames, or removes a `template placeholder` under `skills/setup/templates/`. Consequence: the `skills/setup/templates/params.json` registry change is the FIRST sub-task; every template sub-task depends on it (`npm run check:templates` fails on any placeholder not declared there). N/A when the ticket touches no template.
- **Marker-preservation rule.** Trigger: any sub-task edits a template that carries adaptation comment blocks (the `<!-- PROJECT-… -->` markers in the m3-skills templates). Consequence: the sub-task wording must state that markers are deliberate product content — they are resolved at install time on target repos, never inside `skills/setup/templates/`. A sub-task whose acceptance criterion would remove or fill a marker in a template is re-scoped or rejected. N/A for non-template work.
- **Spec/reference coupling rule.** Trigger: the ticket changes what a module (M1–M7) installs or how. Consequence: updating the module's section in `SPEC.md`/README and its `skills/setup/references/m<N>-*.md` file is an explicit sub-task in the same PR — doc drift between templates and references is a known audit finding. N/A for pure bug fixes that change no installed behavior.
- **Secrets-doctrine boundary rule.** Trigger: the ticket would add infra coordinates, example credentials, or provider identifiers anywhere. Consequence: secret **values** are forbidden everywhere; real Big Emotion coordinates go only in `skills/setup/references/m7-bigemotion-internal.md`; templates get `placeholders` instead. Flag the ticket and keep sub-task wording scoped — never silently widen. N/A when no coordinates are involved.

- Write the refined breakdown back to Jira as a comment on the ticket (`addCommentToJiraIssue`) so the refinement is visible to the team — concise: intent, assumptions, sub-task list with any dependency ordering called out.

### Step 4 — Create sub-tasks in Jira

- For each refined item, `createJiraIssue(cloudId, fields={ project, parent: { key: KEY-123 }, issuetype: { name: "Sub-task" }, summary, description })`.
  - Resolve the correct sub-task issue type name via `getJiraProjectIssueTypesMetadata` if `"Sub-task"` is not valid for the project (some Jira projects name it `Subtask`; the project's sub-task issue type id is read at runtime from `docs/confluence-spec/config.json` → `jiraIssueTypeIds`, populated when M4 is wired — never hardcode it).
- **Order matters**: if a sub-task produces something the others consume, create it first and state in its description that dependent sub-tasks cannot start until it is done.
- Collect the created sub-task keys; they drive the implementation plan and the PR checklist.

### Step 5 — Create an isolated worktree off the base branch

All implementation happens in a **dedicated git worktree**, never in the user's main checkout. This keeps the user's working directory and current branch untouched for the entire full-auto run, and is what makes precondition 4 a non-blocker on a dirty main tree.

- `git fetch origin`.
- Branch name: `<prefix>/<key-lower>-<slug>` where:
  - `prefix` = `fix` if issue type is Bug, else `feat` (the repo's human working prefix `feat/` without its trailing slash). Deliberately NOT the config's `working_branch_prefix` namespace when that one is reserved for Ferry-run branches (typically `ferry/`).
  - `key-lower` = the issue key lowercased.
  - `slug` = kebab-cased, ASCII, ≤ 5 words from the summary.
- Worktree path: a sibling of the repo root — `<repo-parent>/project-standard-worktrees/<key-lower>-<slug>` (outside the repo so framework tooling never scans it; the dir-name segment drops the `<prefix>/` so no nested directory is created).
- Create branch + worktree in one step, cutting from the **remote** base branch (not local, to avoid stale state):
  `git worktree add -b <branch> <worktree-path> origin/<base_branch>`
- **Every subsequent step — implement, verify, commit, push, open PR — runs with the worktree as the working directory.** Pass it as `cwd` to Bash calls and as the repo path in every sub-agent brief. Never run implementation commands in the main checkout.

### Step 6 — Implement (parallel sub-agents)

Follow TDD and KISS (user `CLAUDE.md`): tests before code, simplest design that satisfies acceptance criteria, surgical scope — touch only what the ticket requires.

Dependency-aware execution:

1. **Respect the project's toolchain constraints.** This repo is a single npm toolchain: dependency-free ESM `.mjs` scripts on Node ≥ 20 (`node --test`, native modules only — do not add runtime dependencies). There is no build step. Template content under `skills/setup/templates/` keeps its `placeholder tokens` — never bake rendered values into a template. The rendered skills under `.claude/skills/project-standard-*/` are **outputs** of the m3 templates: when a change affects both, change the template first, then re-render the project copy, so the two never drift silently. Registry-first sub-tasks (params.json) run FIRST and alone.
2. **Independent sub-tasks run in parallel** via the `Agent` tool (`general-purpose`, or `test-engineer` for test-heavy slices). Always parallelise when sub-tasks have no dependency between them — launch the independent sub-agents in a single message so they run concurrently. Each sub-agent gets a self-contained brief: the worktree path as its working directory, the sub-task summary, acceptance criteria, relevant file paths, the TDD + KISS + mobile-first constraints, and the instruction to write tests first. All sub-agents share the one worktree (they implement different sub-tasks of the same branch), so do not give them separate worktree isolation.
3. **Mobile-first** (user `CLAUDE.md`): any UI work is designed and verified at 320–430 px first, then ≥768 px, then ≥1200 px.

### Step 7 — Verify (safety blocker if it fails)

Before any PR, the project's quality gates must pass on the branch. Run both, from the worktree root:

```bash
npm test
npm run check:templates
```

Both must exit 0. Run both even when the ticket seems to touch only one side — a template edit can break the checker's registry invariant, and a script edit can break the tests. These two commands are the repo's whole gate surface (they are exactly what `ci.yml`'s `checks` job runs, plus CI's manifest-parse step — if the ticket touched `.claude-plugin/*.json`, also confirm both manifests still parse with `node -e "JSON.parse(...)"`).

If a check fails, iterate on the implementation to fix the **root cause** (do not disable checks, do not `--no-verify`). If it is genuinely unrecoverable, **stop and report** — never open a broken PR. A broken PR on a shared branch is exactly the shared-state corruption full-auto must still refuse.

### Step 8 — Commit & push

- Commit per sub-task (or logically grouped), Conventional Commits, message references the Jira key (e.g. `feat(scope): add retry on 5xx (KEY-123)`).
- **Never add `Co-Authored-By` trailers** (user `CLAUDE.md`).
- Commit messages, code comments, PR body — **English** (user `CLAUDE.md`), even when product copy is French.
- `git push -u origin <branch>`.

### Step 9 — Open the pull request

```bash
gh pr create --repo big-emotion/project-standard \
  --base <target_branch> --head <branch> \
  --title "<type>(<scope>): <summary> (KEY-123)" \
  --body "$(cat <<'EOF'
## Summary
<1-3 bullets — what and why>

Jira: <full ticket URL>

## Sub-tasks
- [x] <sub-task KEY-1 summary>
- [x] <sub-task KEY-2 summary>
...

## Test plan
- [ ] <how to verify each acceptance criterion>

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Capture the PR URL from the command output.

When the PR touches `skills/setup/templates/`, add a **Template impact** section to the body: which placeholders were added/removed (and the matching `params.json` registry change), and whether the rendered `.claude/skills/project-standard-*` copies were re-rendered or are unaffected.

### Step 10 — Transition Jira to review + comment

- `getTransitionsForJiraIssue(cloudId, KEY-123)` → find the transition whose target status name equals `review_column` (from `ferry.config.json`). Match on the transition's target status name, not the transition's own name.
- `transitionJiraIssue(cloudId, KEY-123, transition=<id>)`.
- `addCommentToJiraIssue(cloudId, KEY-123, "PR ready for review: <PR URL>")`.
- If no transition leads to `review_column` (workflow misconfigured or wrong current status), do not invent one — leave the ticket where it is, still post the PR-link comment, and flag the missing transition in the final report.

### Step 11 — Report

End-of-turn summary (one or two sentences): the ticket key, the branch, the worktree path (kept for follow-up — remove with `git worktree remove <path>` once the PR is merged), the PR URL, the Jira status it now sits in, and any flagged anomalies (previous assignee overridden, missing transition, assumptions made during refinement).

## Failure handling

- Safety blockers (Preconditions, Step 7 verification, ambiguous issue key) → **stop and report**, leave shared state untouched.
- Recoverable implementation failures → iterate to root cause within the implementation loop.
- Never disable quality gates, never `--no-verify`, never force-push, never open a knowingly-broken PR.
- If a Jira write fails mid-chain (e.g. sub-task creation), report exactly what was created vs. not so the user can reconcile manually — do not retry blindly in a loop.

## Cleanup

If any temporary files are created (e.g. `.playwright-mcp/` during browser verification), delete them immediately after use (user `CLAUDE.md`).
