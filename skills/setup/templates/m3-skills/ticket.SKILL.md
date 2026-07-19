---
name: {{project_slug}}-ticket
description: End-to-end local automation for a single Jira ticket on the {{project_display_name}} repo. Paste a Jira ticket URL (or key) and the skill self-assigns the ticket, reads it, refines it, creates the Jira sub-tasks, branches off the integration branch in an isolated git worktree, implements the work in parallel via sub-agents, opens the pull request, then moves the ticket to the review column and comments the PR link. Runs fully automatically with no confirmation gates. Use when the user pastes a Jira ticket link, says "prends ce ticket", "implémente ce ticket Jira", "traite ce ticket", or invokes /{{project_slug}}-ticket.
metadata:
  author: Big Emotion
  version: "1.0.0"
---

# {{project_display_name}} Ticket

Take a single Jira ticket from link to merged-ready PR, locally and unattended.

This is the **local, interactive, on-demand** counterpart to Ferry (which runs the same lifecycle async/cloud via Jira Automation). It does not call Ferry; it does the work directly on the developer's machine. To avoid divergence with Ferry, **the base branch, the PR target branch, and the review column are read from `ferry.config.json` at runtime** — never hard-coded. The one deliberate divergence is the working-branch prefix: the config's `working_branch_prefix` names the namespace Ferry's automation owns (typically `ferry/`), so local runs stay out of it and use the human-style prefixes of the repo history instead (`{{working_branch_prefix}}`, `fix/` — Step 5).

## Operating mode — FULL AUTO

The user chose **no confirmation gates**. The skill runs the entire chain — assign → read → refine → sub-tasks → branch → implement → PR → Jira transition + comment — without stopping to ask.

"Full auto" removes *confirmation* prompts. It does **not** remove *safety blockers*: a small set of hard preconditions where proceeding would corrupt shared state or produce a broken PR. On a safety blocker the skill **stops and reports** — it does not guess or force through. These are listed under Preconditions and are non-negotiable.

## When to Activate

- User pastes a Jira ticket URL (e.g. `https://<org>.atlassian.net/browse/KEY-123`) or a bare issue key.
- User says: "prends ce ticket", "implémente / traite ce ticket Jira", "fais ce ticket".
- User invokes `/{{project_slug}}-ticket <jira-url-or-key>`.

## Inputs

A single argument: the Jira ticket URL or issue key.

- Accept `.../browse/KEY-123`, `...selectedIssue=KEY-123`, `...?...&issueKey=KEY-123`, or a bare `KEY-123`.
- Extract the issue key with the regex `[A-Z][A-Z0-9]+-\d+`. If zero or more than one distinct key is found, **stop** and ask the user for the exact key (ambiguous input is a safety blocker, not a design choice).

## Preconditions (safety blockers — stop and report if any fail)

1. **Repo root** — `package.json` `.name` is `{{project_slug}}`. If not, stop and tell the user to `cd` in.
2. **Atlassian MCP reachable** — `mcp__atlassian__getAccessibleAtlassianResources` returns at least one site. Resolve and keep `cloudId` (the Jira site id) for every subsequent Jira call. If it fails, stop — the Jira half of the workflow is impossible.
3. **gh authenticated** — `gh auth status` succeeds for `{{github_org}}/{{github_repo}}`.
4. **Base branch fetchable** — `git fetch origin` succeeds and `origin/<base_branch>` exists. Implementation runs in a dedicated worktree (Step 5), so the user's main checkout is never touched and need not be clean — but the worktree must be cut from a real remote base branch.
5. **`ferry.config.json` present and parseable** — it is the single source of truth for the base/target branches + column names. If missing/invalid, stop.

Load these once from `ferry.config.json`:

- `base_branch` = `.git.base_branch` (branch to cut from)
- `target_branch` = `.git.target_branch` (PR base)
- `review_column` = `.workflow.agents.developer.auto_transition` (Jira column to move the ticket into after the PR)

Never substitute literals for these — if `ferry.config.json` changes, the skill must follow.

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

<!-- PROJECT-SPECIFIC: the project's mandatory refinement rules, sourced from its
     CLAUDE.md. These are the domain-coupling rules that order sub-tasks and stop
     silent scope drift. Reference-repo examples:
     - a runtime-map rule (state which runtime each piece of work lands in, and
       which artifacts are generated and must be changed via their exporter);
     - a data-model-first rule (if the ticket touches an editorial surface,
       enumerate the required content types/slices; every missing one becomes the
       FIRST sub-task and all UI/data sub-tasks depend on it);
     - a design-source coupling rule (UI work requires the design URL; a stale or
       missing frame spec becomes a blocking sub-task; the spec wins over the
       ticket on conflict);
     - a compliance-boundary rule (if the ticket would broaden a scoped surface
       that is a legal/platform boundary, flag it and keep the sub-task wording
       scoped — never silently widen).
     Write each rule with its trigger, its consequence on sub-task ordering, and
     its N/A escape hatch. Delete this block only if the project truly has none. -->

- Write the refined breakdown back to Jira as a comment on the ticket (`addCommentToJiraIssue`) so the refinement is visible to the team — concise: intent, assumptions, sub-task list with any dependency ordering called out.

### Step 4 — Create sub-tasks in Jira

- For each refined item, `createJiraIssue(cloudId, fields={ project, parent: { key: KEY-123 }, issuetype: { name: "Sub-task" }, summary, description })`.
  - Resolve the correct sub-task issue type name via `getJiraProjectIssueTypesMetadata` if `"Sub-task"` is not valid for the project (some Jira projects name it `Subtask`; the project's sub-task issue type id is `{{jira_issue_type_id_subtask}}` per `docs/confluence-spec/config.json`).
- **Order matters**: if a sub-task produces something the others consume, create it first and state in its description that dependent sub-tasks cannot start until it is done.
- Collect the created sub-task keys; they drive the implementation plan and the PR checklist.

### Step 5 — Create an isolated worktree off the base branch

All implementation happens in a **dedicated git worktree**, never in the user's main checkout. This keeps the user's working directory and current branch untouched for the entire full-auto run, and is what makes precondition 4 a non-blocker on a dirty main tree.

- `git fetch origin`.
- Branch name: `<prefix>/<key-lower>-<slug>` where:
  - `prefix` = `fix` if issue type is Bug, else the human working prefix (`{{working_branch_prefix}}` without its trailing slash). Deliberately NOT the config's `working_branch_prefix` namespace when that one is reserved for Ferry-run branches (typically `ferry/`).
  - `key-lower` = the issue key lowercased.
  - `slug` = kebab-cased, ASCII, ≤ 5 words from the summary.
- Worktree path: a sibling of the repo root — `<repo-parent>/{{github_repo}}-worktrees/<key-lower>-<slug>` (outside the repo so framework tooling never scans it; the dir-name segment drops the `<prefix>/` so no nested directory is created).
- Create branch + worktree in one step, cutting from the **remote** base branch (not local, to avoid stale state):
  `git worktree add -b <branch> <worktree-path> origin/<base_branch>`
- **Every subsequent step — implement, verify, commit, push, open PR — runs with the worktree as the working directory.** Pass it as `cwd` to Bash calls and as the repo path in every sub-agent brief. Never run implementation commands in the main checkout.

### Step 6 — Implement (parallel sub-agents)

Follow TDD and KISS (user `CLAUDE.md`): tests before code, simplest design that satisfies acceptance criteria, surgical scope — touch only what the ticket requires.

Dependency-aware execution:

1. **Respect the project's toolchain constraints** (project `CLAUDE.md`).
   <!-- PROJECT-SPECIFIC: spell the constraints out — e.g. a split-toolchain repo
        (npm at the root, pnpm in a sub-app: every sub-app command is
        `pnpm -C <dir> …`, never mix them), an unfamiliar framework version whose
        docs must be read before writing code, a runtime boundary that must not
        move (secrets never in an edge bundle), or blocking dependency sub-tasks
        (data modeling, frame refresh) that run FIRST and alone. -->
2. **Independent sub-tasks run in parallel** via the `Agent` tool (`general-purpose`, or `test-engineer` for test-heavy slices). Always parallelise when sub-tasks have no dependency between them — launch the independent sub-agents in a single message so they run concurrently. Each sub-agent gets a self-contained brief: the worktree path as its working directory, the sub-task summary, acceptance criteria, relevant file paths, the TDD + KISS + mobile-first constraints, and the instruction to write tests first. All sub-agents share the one worktree (they implement different sub-tasks of the same branch), so do not give them separate worktree isolation.
3. **Mobile-first** (user `CLAUDE.md`): any UI work is designed and verified at 320–430 px first, then ≥768 px, then ≥1200 px.

### Step 7 — Verify (safety blocker if it fails)

Before any PR, the project's quality gates must pass on the branch.

<!-- PROJECT-SPECIFIC: the exact gate commands, from package.json scripts /
     CLAUDE.md — e.g. `pnpm typecheck && pnpm lint && pnpm test && pnpm build`,
     or `pnpm -C <sub-app> verify` plus lint. Run the full set even when the
     ticket seems not to touch a given area — cross-toolchain breakage is cheap
     to catch here. Note any artifact that ships through a separate manual
     command (e.g. an agent/KB re-sync needing an API key): the PR body must say
     so instead of running it. -->

If a check fails, iterate on the implementation to fix the **root cause** (do not disable checks, do not `--no-verify`). If it is genuinely unrecoverable, **stop and report** — never open a broken PR. A broken PR on a shared branch is exactly the shared-state corruption full-auto must still refuse.

### Step 8 — Commit & push

- Commit per sub-task (or logically grouped), Conventional Commits, message references the Jira key (e.g. `feat(scope): add retry on 5xx (KEY-123)`).
- **Never add `Co-Authored-By` trailers** (user `CLAUDE.md`).
- Commit messages, code comments, PR body — **English** (user `CLAUDE.md`), even when product copy is French.
- `git push -u origin <branch>`.

### Step 9 — Open the pull request

```bash
gh pr create --repo {{github_org}}/{{github_repo}} \
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

<!-- PROJECT-SPECIFIC: extra PR-body sections the project requires (e.g. a
     "Visual parity" section carrying the design-drift report when a UI rule
     fired, or a note that a config change ships via a manual sync command). -->

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
