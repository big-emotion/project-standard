---
name: {{project_slug}}-spec
description: Spec maintainer for {{project_display_name}}. Reads Confluence (Requirements / Decisions / Architecture) as the source of truth, helps you investigate a problem, structures the reflection, and produces drafts — Pending REQ/DEC/ARCH sections on Confluence + matching Jira tickets in {{jira_project_key}} with the project template. Append-only on Confluence, Pending only. Use when you face a bug, want to add a feature, or need to refine an idea.
metadata:
  author: Big Emotion
  version: "1.0.0"
---

# {{project_display_name}} Spec

Maintain the {{project_display_name}} spec tree on Confluence. Given a free-text problem (bug, feature, refinement idea), read Confluence (`Requirements / Decisions / Architecture`) as the canonical source of truth, structure the reflection, propose `Pending` REQ/DEC/ARCH sections plus matching Jira tickets in `{{jira_project_key}}`, then — after explicit confirmation — publish Confluence first, Jira second, and close the link loop both ways.

This skill is **append-only on Confluence** and only writes new sections at status `Pending`. Humans transition `Pending → Implemented → Approved` through the Confluence UI. The skill never touches the Status macro of an existing section, never edits the body of a non-`Pending` section, and never deletes an ID.

## When to Activate

- User invokes `/{{project_slug}}-spec <description>` (explicit command).
- User writes a natural-language prompt that signals a spec-level reflection:
  - `bug : …` / `bug:` / "il y a un bug" / "the … is broken"
  - `j'aimerais ajouter …` / "je voudrais ajouter" / "we should add"
  - `feature idea …` / "feature idea" / "what if we"
  - `comment résoudre …` / "comment fixer" / "how do we handle"
  - Any free-text describing a problem, gap, or improvement that lacks a Jira ticket and that may touch a REQ/DEC/ARCH.
- Do **not** activate when:
  - The user pastes a Jira ticket URL or key — that path belongs to `{{project_slug}}-ticket`.
  - The user asks to flip a Status macro on an existing section (`Pending → Implemented`, etc.) — that is a Confluence-UI-only operation, refuse and direct them there.
  - The user asks to bootstrap or repopulate the spec tree — that is `/{{project_slug}}-bootstrap-confluence` and runs only once.

If the trigger is ambiguous (the description could be either a pure code question or a spec change), default to activating: the worst case is the user replies with anything other than an affirmative token at Step 6 and nothing is written.

## Inputs

A single free-text argument: a description of the change. The description can be a bug report, a feature idea, an architectural concern, or an open question. The skill turns it into structured REQ/DEC/ARCH drafts plus Jira tickets.

If the argument is empty, ask for the description before doing anything else (this is a clarification gate, not a safety blocker).

## Preconditions (safety blockers — stop and report if any fail)

1. **Bootstrap sentinel exists** — `docs/.confluence-bootstrap-complete` must be present. If absent, **stop and tell the user**: Confluence has not been bootstrapped yet — run `/{{project_slug}}-bootstrap-confluence` first.
2. **Config readable** — `docs/confluence-spec/config.json` must be present and parseable, with non-null values for `cloudId`, `siteUrl`, `spaceKey`, `engineeringRootPageId`, `requirementsPageId`, `decisionsPageId`, `architecturePageId`, `obsoletePageId`, `jiraProjectKey`, and `jiraIssueTypeIds.{Epic,Story,Task,Bug}`. Any null in the four `*PageId` fields means the bootstrap publish step was incomplete — stop.
3. **Atlassian MCP reachable** — `getAccessibleAtlassianResources` returns at least one site, and the site whose ID matches `cloudId` is in the list. If not, stop — both halves of the workflow are impossible.
4. **Atlassian identity resolvable** — `atlassianUserInfo` succeeds. Used to attribute the drafts to the current user.
5. **Jira project visible** — `getVisibleJiraProjects` includes a project whose key is `jiraProjectKey` (`{{jira_project_key}}`). If not, the user lacks access — stop.
6. **Template available** — `docs/templates/jira-ticket-template.md` exists. If absent, stop — the Jira tickets cannot be filled.

On a safety blocker: **stop and report**. Do not guess, do not skip a precondition, do not write anything.

## Workflow

The full chain is **read → investigate → dedupe → choose granularity → draft → preview → confirm → write Confluence → write Jira → close link → report**. Steps 1–5 are pure reads + in-memory drafts and write nothing. Step 6 is the single hard gate. Steps 7–9 are the only writes the skill ever performs; they happen in strict order (Confluence first, Jira second, back-link last) so that any mid-chain failure leaves recoverable state. Step 10 is the report. Each step below restates its preconditions inline so the reader does not have to scroll.

### Step 1 — Read config

- Load `docs/confluence-spec/config.json`. Extract every field listed in precondition 2.
- Verify `docs/.confluence-bootstrap-complete` exists. If missing, stop.
- Read `docs/templates/jira-ticket-template.md` into memory so it can be applied per-ticket in Step 5.
- Resolve `cloudId` via `getAccessibleAtlassianResources` and cross-check it matches the config; resolve own `accountId` via `atlassianUserInfo` (informational — this skill does not self-assign anything).

### Step 2 — Investigate

- Read the user's description. **Ask ONE clarification question if and only if** the shape of the change is genuinely ambiguous — e.g. you cannot tell whether it is a bug (existing REQ broken) or a feature (new REQ needed). Otherwise, **state your assumptions explicitly and proceed**.
- Fetch the engineering root and its descendants:
  - `getConfluencePage(cloudId, pageId=engineeringRootPageId)` → confirm the tree shape.
  - `getConfluencePageDescendants(cloudId, parentId=engineeringRootPageId)` → list the four canonical subpages (Requirements / Decisions / Architecture / Obsolete, possibly carrying the project's title prefix). Identify them by the `*PageId` values from `config.json`, **never by title** — a shared Confluence space may host another project's spec tree whose pages own similar titles.
  - For each of `requirementsPageId`, `decisionsPageId`, `architecturePageId`: `getConfluencePage` (full body) to retrieve the existing REQ/DEC/ARCH sections and their IDs.
- Walk the impact graph `REQ ← DEC ← ARCH`: if a candidate change touches an ARCH, list every DEC that references it; if it touches a DEC, list every REQ that depends on it. Propagation goes **upward** from ARCH to DEC to REQ. Surface the propagated impact in the preview.
  - Detection is text-based: an ARCH is "referenced" by a DEC if the DEC body contains its ID (`ARCH-007`); a DEC is referenced by a REQ the same way. Use `searchConfluenceUsingCql` scoped to the engineering root with `text ~ "<ID>"` if a full body scan is impractical.
  - Worked example: a request to introduce server-side caching that proposes `NEW ARCH-008 (HTTP cache layer)` and `NEW DEC-019 (cache strategy = stale-while-revalidate)` is propagated as: ARCH-008 has no ancestor (it's new); DEC-019 references ARCH-008; any REQ whose statement names latency or freshness gets flagged for review even if untouched, so the human reviewer can decide whether a `RETIRE` or `EDIT` is in order.
- Note any section you would propose to `RETIRE` and record its current Status — only `Pending` sections may be edited; non-`Pending` sections can only be marked for retirement via a successor (see Safeguards).

### Step 3 — Search for duplicates

- `searchConfluenceUsingCql` against `space = "<spaceKey>" AND ancestor = <engineeringRootPageId> AND text ~ "<id>"` for each candidate ID, to confirm no REQ/DEC/ARCH ID being proposed is already in use anywhere in the tree.
- `searchJiraIssuesUsingJql` against `project = <jiraProjectKey> AND statusCategory != Done AND text ~ "<id>"` for each candidate REQ/DEC/ARCH ID, to confirm no open ticket already covers the same scope.
- If a duplicate is found, **fold the draft into the existing artifact** (point at it in the preview, do not create a parallel ID) and tell the user.
- Additionally, before allocating a new ID in Step 5, run one CQL query per type (`REQ`, `DEC`, `ARCH`) to confirm the **highest** existing suffix. This double-check is the only safeguard against a stale local view of the engineering root (Step 2's body fetch could miss a section added by another writer between Step 2 and Step 5).
- The dedupe step is purely informational — it never mutates Confluence or Jira. If the user wants to override a duplicate (e.g. the existing artifact is genuinely orthogonal despite a text match), they say so at Step 6 and the skill proceeds with the new ID; the override is logged in the Step 10 report.

### Step 4 — Granularity decision

Decide the Jira shape from the **shape of the Confluence change**, not the code size. Use this table verbatim:

| Confluence change | Jira artifact |
| --- | --- |
| ≥2 REQ touched OR new ARCH + ≥2 DEC | Epic + Stories |
| 1 REQ touched (NEW or EDIT) ± ≤1 DEC | Story |
| Correction of a failing test against an existing REQ, no spec change | Task or Bug |
| Editorial-only Jira refinement (no REQ/DEC/ARCH change) | no ticket — reference the existing one |

Pick exactly one row. When `Epic + Stories` applies, the Epic is the parent and each touched REQ gets one Story child. Tasks and Bugs are leaf tickets with no parent unless they belong to an Epic from the same session.

Rules of thumb to disambiguate:

- A purely cosmetic copy or wording change with no REQ touched → `Editorial-only Jira refinement` → no new ticket and no Confluence write; point at the existing ticket (if any) in the Step 6 preview and Step 10 report. Commenting on that ticket stays a human action — this skill never writes to existing tickets.
- A bug that proves an **existing** REQ is wrong (the spec is correct, the code is wrong) → `Task or Bug`. Do **not** edit the REQ.
- A bug that proves an **existing** REQ is misleading (the code matches the spec but the spec is wrong) → `Story` with an `EDIT statement` on the REQ.
- A new behaviour that did not exist in any previous spec → `Story` with a `NEW` REQ.
- A new behaviour that requires a structural change (new runtime surface, new module boundary, new shared infra) → `Epic + Stories` with a `NEW` ARCH and ≥1 `NEW` DEC explaining the choice.

When in doubt, choose the **lighter** artifact (Story over Epic, Task over Story) — humans can split it later via Confluence UI + Jira, but the skill never auto-merges.

### Step 5 — Draft everything

For each REQ/DEC/ARCH section to write:

1. **Allocate the next monotonic ID** by reading the existing IDs from Confluence (Step 2). For each type, find the maximum suffix `N` already published (e.g. `REQ-042`) and allocate `N+1` (`REQ-043`). Never reuse an ID. Never renumber an already-published ID.
2. Compose the section body with this canonical shape:
   - **REQ-NNN — \<statement\>**
     - `Statement:` modal verb preserved verbatim (`must` / `must not` / `should`).
     - `GWT:` one or more Given / When / Then blocks.
     - `Status: Pending` (Confluence Status macro, colour grey).
     - `Links → Jira:` block (filled in Step 9).
   - **DEC-NNN — \<context\>**
     - `Context / Decision / Alternatives / Tradeoffs / Requirements satisfied`.
     - `Supersedes: <ID>` if it retires an older decision.
     - `Status: Pending`.
   - **ARCH-NNN — \<summary\>**
     - `Summary / Source files (expected) / Tests anchoring this contract`.
     - `Status: Pending`.

For each Jira ticket to create:

1. Apply `docs/templates/jira-ticket-template.md`, filling the conditional sections by issue type (Bug includes Reproduction + Expected vs Actual; Story includes User Story).
2. The **Confluence impact** section is load-bearing — use the exact format:
   ```
   • REQ-042 — EDIT statement
     Current:  "<verbatim>"
     Proposed: "<new>"
     GWT changes: …
   • DEC-018 — NEW
     Context / Decision / Alternatives / Tradeoffs / Requirements satisfied
   • ARCH-007 — EDIT body
     Summary change / Source files (expected) / Tests anchoring this contract
   ```
   Allowed verbs are exactly `NEW`, `EDIT`, `RETIRE` — nothing else.
3. Include a placeholder for the Confluence anchor URL (filled at create time in Step 8 using `<siteUrl>/wiki/spaces/<spaceKey>/pages/<pageId>#<anchor>`).
4. The ticket title is concise and business-readable; it carries the primary touched ID in parentheses (e.g. `Search: keep filters across page reloads (REQ-042)`).

### Step 6 — Preview + approval gate (HARD)

Print all drafts. The preview block must contain:

```
Spec drafts ready for review.

Confluence sections (Pending) — N total
  • REQ-043 — Statement: "<…>" / GWT: <…>
  • DEC-019 — Context: <…> / Decision: <…> / Supersedes: <ID if any>
  • ARCH-008 — Summary: <…>
  …

Jira tickets — M total (issue type from granularity table)
  • [Story] <business-readable title> (REQ-042)
      Confluence impact:
        • REQ-042 — EDIT statement / Current: "<…>" / Proposed: "<…>" / GWT changes: …
      Body preview: <first 5 lines>
  …

Impact propagation
  • ARCH-005 (proposed EDIT) is referenced by DEC-011, DEC-014 → review their alignment
  • REQ-042 (proposed RETIRE) → propose successor REQ-043 with Supersedes: REQ-042

Reply `create` / `go` / `ok` / `oui` / `valide` / `yes` to publish.
Anything else aborts. Silence aborts.
```

Wait for explicit confirmation. Affirmative tokens (case-insensitive): `create`, `go`, `ok`, `oui`, `valide`, `yes`. Anything else — including silence, partial answers, "let me check first", "tomorrow" — aborts. Implicit confirmation from a prior turn in the session does **not** count; the confirmation must arrive in response to the preview block above.

### Step 7 — Confluence first

For each Pending section to publish, in deterministic order (Requirements → Decisions → Architecture, then Obsolete entries last):

1. `getConfluencePage(cloudId, pageId=<requirements|decisions|architecture>PageId, expand=body.storage,version)` — capture the current `version.number`.
2. `updateConfluencePage(cloudId, pageId, version=<current+1>, body=<current body + new section appended>)` — append the new section to the existing body. Never overwrite, never reorder existing content.
3. On `409` / version-mismatch error: re-fetch the page, **re-allocate the ID** (a competing writer may have taken `REQ-043` between read and write), reassemble the body, retry **once**. On a second mismatch, abort and surface the error verbatim — do not loop.

If a section is a `RETIRE`-successor, the predecessor is **not** edited here. The Obsolete page handles the predecessor as a separate appended entry in the same Step 7 pass (under the `Obsolete` subtree). The Status macro of the predecessor stays untouched — humans flip it via Confluence UI after the new spec is approved.

### Step 8 — Then Jira

After all Confluence writes succeed (`Confluence-first` rule):

1. If the granularity is `Epic + Stories`, `createJiraIssue` the Epic first using `jiraIssueTypeIds.Epic`. Capture its key.
2. Create Stories next, each carrying `customfield_<epic_link>` or `parent.key = <epic_key>` per the project's epic-link convention (the value comes from the template's frontmatter or from the issue type's create metadata if unknown).
3. Create Tasks and Bugs last as leaf tickets.
4. Every ticket body includes a clickable Confluence heading-anchor URL of the form `<siteUrl>/wiki/spaces/<spaceKey>/pages/<pageId>#<anchor>` for **each** touched REQ/DEC/ARCH. The anchor is the section heading in Confluence's URL-slug form.

If a ticket creation fails mid-sequence, **stop and report** the partial state (which tickets exist, which Confluence sections exist) so the user can reconcile manually. Do not retry blindly. An orphan Confluence section is recoverable (humans can attach a ticket later via UI); an orphan Jira ticket is harder to clean up, which is why Confluence comes first.

### Step 9 — Close the loop

For each Confluence section touched in Step 7, re-`updateConfluencePage` (version+1) to append the created Jira key inside its `Links → Jira:` block:

```
Links → Jira: {{jira_project_key}}-1234, {{jira_project_key}}-1235
```

Use the same version-mismatch retry policy as Step 7 (one retry max, then abort verbatim). This closes the bidirectional link: section knows its ticket, ticket already knows its section from Step 8.

### Step 10 — Return

End-of-turn report:

```
Spec maintainer published.

Confluence (Pending):
  • REQ-043 → <siteUrl>/wiki/spaces/<spaceKey>/pages/<requirementsPageId>#REQ-043-<slug>
  • DEC-019 → <siteUrl>/wiki/spaces/<spaceKey>/pages/<decisionsPageId>#DEC-019-<slug>
  …

Jira (new tickets):
  • {{jira_project_key}}-1234 [Story] <business-readable title> (REQ-042)
      → {{jira_site_url}}/browse/{{jira_project_key}}-1234
      Touched: REQ-042 (EDIT), DEC-019 (NEW)
  …

Notes:
  • <any assumption made during Step 2>
  • <any RETIRE successor proposed>
  • <any duplicate detected and folded>
```

Print Confluence URLs (heading anchors), Jira keys with browse URLs, and a per-ticket recap of touched REQ/DEC/ARCH IDs.

## Safeguards

- Append-only on Confluence. `Pending` only — never touch the Status macro of an existing section.
- Never modify the body of a non-`Pending` section.
- Never remove or delete an ID.
- Never write outside the engineering root subtree (page ID from `config.json`).
- Confluence-first, then Jira. An orphan Confluence section is recoverable; an orphan Jira ticket is not.
- No invention: if a REQ statement is unclear, leave a `TODO: clarify with <stakeholder>` block and ask.
- ID stability: never renumber an already-published ID. On local conflict, renumber locally; never on canonical.
- No silent retries: surface every failure verbatim except the bounded version-mismatch retry (one attempt only).
- Never create without explicit confirmation in the same session (no implicit confirmation from prior turns).
- If a new decision supersedes an old one: explicitly propose `RETIRE` on the old section + move to the `Obsolete` page + new successor REQ/DEC/ARCH with field `Supersedes: <ID>`. No silent edits.

## Concurrency model

The skill is single-writer per invocation but the canonical Confluence pages can change between two consecutive reads, because other writers (humans editing in the UI, the bootstrap skill on a one-shot replay attempt, or another instance of this skill in a parallel session) may write concurrently. Two mechanisms handle this:

1. **ID re-allocation on Step 5 / 7** — the highest suffix is re-checked at Step 5 against Confluence (not just against the in-memory Step 2 snapshot). On a Step 7 version-mismatch, the section's draft is re-keyed to the next free suffix before the retry.
2. **Bounded retry** — version-mismatch retries are capped at **one** attempt per page write. A second mismatch is a hard abort and is surfaced verbatim. This refuses the pathological "two writers ping-pong" scenario rather than looping silently.

Confluence-first ordering (Steps 7 → 8 → 9) guarantees that a partial failure leaves recoverable state: Confluence sections without Jira tickets can be attached manually; Jira tickets without Confluence sections cannot easily be retro-fitted. Steps 7 and 9 are functionally the same call (`updateConfluencePage`), so the back-link in Step 9 inherits the same retry policy.

## Required Atlassian MCP tools

Allowed (read + scoped writes):

- `getAccessibleAtlassianResources`
- `atlassianUserInfo`
- `getConfluencePage`
- `getConfluencePageDescendants`
- `searchConfluenceUsingCql`
- `searchJiraIssuesUsingJql`
- `getJiraIssue`
- `getVisibleJiraProjects`
- `updateConfluencePage`
- `createJiraIssue`

Forbidden:

- `editJiraIssue` — this skill never touches existing tickets.
- `createConfluenceFooterComment` — Confluence comments are not the spec channel.
- `createConfluenceInlineComment` — same reason.
- Any write outside the engineering root subtree resolved from `engineeringRootPageId`.
- Any operation that flips a Status macro on an existing section (`Pending → Implemented`, etc.) — humans only, via Confluence UI.

## Failure Modes — Stop Without Modifying

| Condition | Action |
| --- | --- |
| `docs/.confluence-bootstrap-complete` missing | Stop. Tell user to run `/{{project_slug}}-bootstrap-confluence` first. |
| `docs/confluence-spec/config.json` missing or has null `*PageId` | Stop. Report which fields are missing. |
| `docs/templates/jira-ticket-template.md` missing | Stop. The Jira tickets cannot be filled without the template. |
| Atlassian MCP unreachable / wrong `cloudId` | Stop. Surface the error verbatim. |
| Jira project `{{jira_project_key}}` not visible to the current user | Stop. The user lacks access. |
| Duplicate REQ/DEC/ARCH ID detected | Fold draft into the existing artifact and tell the user. Do not parallel-allocate. |
| Open Jira ticket already covers the same IDs | Fold the work into that ticket (comment on it in the preview) — do not create a duplicate. |
| User does not reply with an affirmative token at Step 6 | Stop. Nothing is written. |
| Confluence `updateConfluencePage` returns version-mismatch twice in a row | Stop and report verbatim. The user reconciles by hand. |
| `createJiraIssue` fails mid-sequence in Step 8 | Stop. Report which tickets exist and which Confluence sections exist. |
| User asks to flip a Status macro on an existing section | Refuse. Direct the user to the Confluence UI. |
| User asks to delete an ID | Refuse. Propose `RETIRE` + successor instead. |

## Out of Scope

- An alignment agent that classifies each diff as `aligned / advance / drift`. Future milestone.
- A mirror `specs/SPEC.md` regenerated from Confluence. Future milestone.
- A hard CI gate that fails a PR on drift. Future milestone.
- Multi-project Jira routing. This skill only targets the project whose key is in `config.json` (`{{jira_project_key}}`).
- Bulk creation. The skill processes one user description per invocation; if the user wants three independent specs, they invoke the skill three times.
- Renumbering of already-published IDs. IDs are append-only and monotonic.
- Editing existing Jira tickets. That belongs to `{{project_slug}}-ticket` (for tickets it owns end-to-end) or to the human via the Jira UI.
- Editing the body of non-`Pending` Confluence sections. The skill's whole append-only contract depends on this.
- Generating implementation code. Once Jira tickets exist, the implementation path is `/{{project_slug}}-ticket <key>`, not this skill.
- Pushing to git, opening pull requests, transitioning Jira tickets. Those are downstream of this skill — they belong to `{{project_slug}}-ticket`.

## Relationship to neighbouring skills

- `{{project_slug}}-bootstrap-confluence` runs **once** before this skill is ever invoked. It writes the sentinel `docs/.confluence-bootstrap-complete` that this skill checks at Step 1. If the sentinel is missing, this skill aborts and points back.
- `{{project_slug}}-ticket` runs **after** this skill. Given a Jira key created in Step 8, it self-assigns, refines, branches, implements, opens the PR, and transitions the ticket to review. The two skills are intentionally split: spec drafting (this skill, gated) versus implementation (next skill, full-auto).

<!-- PROJECT-SPECIFIC: if the project has orthogonal skills the drafts should
     anticipate (e.g. a design-frame skill whose coupling rule fires downstream
     in the ticket skill), note here what context a draft Story must carry —
     such as a design-source URL — for the downstream skill to pick it up. -->
