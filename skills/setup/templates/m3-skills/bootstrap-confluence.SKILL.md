---
name: {{project_slug}}-bootstrap-confluence
description: One-shot bootstrap of the Confluence spec tree (Requirements / Decisions / Architecture / Obsolete) for {{project_display_name}}. Creates the four skeleton subpages under the project's engineering root page, records their IDs in the spec config, writes the sentinel, then refuses second runs. Use only when initializing the spec system, never for ongoing maintenance.
metadata:
  author: Big Emotion
  version: "1.0.0"
---

# {{project_display_name}} Bootstrap Confluence

One-shot creation of the canonical Confluence spec tree (`Requirements / Decisions / Architecture / Obsolete`) under the project's engineering root page. After publish, the skill writes a sentinel file (`docs/.confluence-bootstrap-complete`) and **refuses to run a second time**.

This skill publishes the four pages as **skeletons**: every REQ/DEC/ARCH section arrives through `/{{project_slug}}-spec` at status `Pending`. It is the entry point of the Confluence-as-source-of-truth system, **not** the ongoing maintenance loop — that belongs to `/{{project_slug}}-spec`.

## When to Activate

- User says: "bootstrap confluence", "initialise l'arbre de spec", "crée l'arbre engineering", "publie l'arbre Requirements/Decisions/Architecture".
- User invokes `/{{project_slug}}-bootstrap-confluence` (no arguments).
- Activation is **forbidden** if `docs/.confluence-bootstrap-complete` already exists — see Phase 0.

## Inputs

None. This skill takes no arguments. Everything it needs is in `docs/confluence-spec/config.json`.

## Preconditions

Verify all of the following before any Confluence write. If any fail, **do not modify anything** — report the blocker and exit.

1. **In the repo root** — `package.json` `.name` is `{{project_slug}}`. If not, stop.
2. **Clean working tree** — `git status --porcelain` must be empty. If dirty, stop and ask the user to commit or stash (Phase 5 commits the sentinel + config on a dedicated branch and must not sweep up unrelated changes).
3. **No prior bootstrap sentinel** — `docs/.confluence-bootstrap-complete` must NOT exist. If it does, read it, print its recorded timestamp + page IDs, and refuse. This skill is one-shot by contract.
4. **Config present and parseable** — `docs/confluence-spec/config.json` must exist and contain non-null `cloudId`, `siteUrl`, `spaceKey`, `engineeringRootPageId`. The four `*PageId` fields may be `null` (fresh config) or hold ids from a previous tree (deliberate re-init) — this skill overwrites them in Phase 4 either way. Do not hardcode these values inside this skill; always read them at runtime.
5. **Atlassian MCP reachable** — `mcp__atlassian__getAccessibleAtlassianResources` returns the configured `cloudId`. Otherwise the publish half is impossible — stop.
6. **No existing spec sub-tree** — `mcp__atlassian__getConfluencePageDescendants` on `engineeringRootPageId` must NOT contain a child whose title equals or ends with `Requirements`, `Decisions`, `Architecture`, or `Obsolete` (a prefixed tree uses the `{{project_display_name}} — <name>` convention — match the suffix, not the exact title). If any exists, refuse and tell the user to remove it manually (or reconcile the config by hand) — a half-built tree is a human decision, not something to merge into silently.

After all preconditions pass, **before doing anything else**, print verbatim the discipline phrase:

```
This is the one-shot bootstrap. After publish, spec intent lives on Confluence and flows from Confluence to code only. Ongoing changes go through /{{project_slug}}-spec.
```

## Required Atlassian MCP tools

Load these via `ToolSearch` at runtime (`select:mcp__atlassian__<name>,...`) before the first Confluence call:

- `getAccessibleAtlassianResources` — resolve `cloudId`
- `atlassianUserInfo` — identity sanity check
- `getConfluencePage` — verify the engineering root page exists
- `getConfluencePageDescendants` — Phase 0 guard (no existing sub-tree)
- `getConfluenceSpaces` — sanity check `spaceKey`
- `createConfluencePage` — Phase 3 publish

**Forbidden tools in this skill** (any use is a bug — abort immediately):

- `searchJiraIssuesUsingJql`, `getJiraIssue`, `createJiraIssue`, `editJiraIssue`, `transitionJiraIssue`, `addCommentToJiraIssue` — this skill never touches Jira.
- `updateConfluencePage` — the engineering root page belongs to the humans who wrote it; this skill only creates children, it never edits an existing page.
- `deleteConfluencePage` — bootstrap never deletes anything.
- Any write to a Confluence page outside the sub-tree rooted at `engineeringRootPageId`.

## Workflow

The workflow is 6 phases. **Phases are sequential**; do not parallelize.

### Phase 0 — Guard one-shot

1. Check `docs/.confluence-bootstrap-complete`. If present, read it (it is small JSON), print its `timestamp` and recorded page IDs, and **abort with the message**: "Bootstrap already completed at <ts>. This skill is one-shot. Use /{{project_slug}}-spec for ongoing changes."
2. Run `git status --porcelain`. If non-empty, abort: "Working tree dirty — commit or stash first."
3. Read `docs/confluence-spec/config.json`. Load `cloudId`, `siteUrl`, `spaceKey`, `engineeringRootPageId`. If any are null/missing, abort.
4. `getConfluencePage(cloudId, pageId=engineeringRootPageId)` — confirm the root page exists (the project's engineering root page in the configured space). If 404, abort.
5. `getConfluencePageDescendants(cloudId, pageId=engineeringRootPageId)` — scan children titles. If any child's title equals or ends with `Requirements`, `Decisions`, `Architecture`, or `Obsolete`, abort.
6. Print the discipline phrase verbatim (see Preconditions).

### Phase 1 — Compose the four skeleton bodies (in memory)

Each page opens with one sentence stating its contract. No REQ/DEC/ARCH sections are published at bootstrap — the tree starts empty and `/{{project_slug}}-spec` appends the first `Pending` sections later.

Page titles carry the `{{project_display_name}} — ` prefix when the Confluence space is shared with another project's spec tree: Confluence enforces per-space title uniqueness, so a bare-titled create (`Requirements`, `Decisions`, …) would be rejected if another tree owns those titles. In a dedicated space the bare titles are acceptable — decide once at install time and keep the four titles consistent.

- **{{project_display_name}} — Requirements** — "This page holds the canonical REQ-NNN requirements of {{project_display_name}}. Sections are appended by /{{project_slug}}-spec at status Pending; humans transition them via the Status macro."
- **{{project_display_name}} — Decisions** — "This page holds the canonical DEC-NNN decisions of {{project_display_name}}. Sections are appended by /{{project_slug}}-spec at status Pending; humans transition them via the Status macro."
- **{{project_display_name}} — Architecture** — "This page holds the canonical ARCH-NNN architecture contracts of {{project_display_name}}. Sections are appended by /{{project_slug}}-spec at status Pending; humans transition them via the Status macro."
- **{{project_display_name}} — Obsolete** — "This page lists intents that have been retired. They are kept for historical context; the current state lives in Requirements / Decisions / Architecture."

**No Status macros at bootstrap.** There is no content to mark. `Pending` is exclusively produced by `/{{project_slug}}-spec`; `Obsolete` entries appear only when a RETIRE is published. If you find yourself about to render a Status macro here, you have made a category error — stop.

### Phase 2 — Approval gate (HARD)

1. Print the four page titles and their full skeleton bodies, plus the parent page (`engineeringRootPageId` and its title as fetched in Phase 0).
2. Print the **exact** confirmation instruction verbatim:

   ```
   To proceed with the Confluence publish, reply with this exact phrase on a line by itself, case-sensitive, no leading or trailing punctuation:

   bootstrap publish approved

   Any other reply — including "yes", "ok", "go", silence, partial answers, or the phrase with different punctuation/case — will abort. Nothing will be sent to Confluence and no sentinel will be written.
   ```

3. Wait for the user reply.
4. Compare verbatim: `reply.strip() == "bootstrap publish approved"` (exact case, exact whitespace-stripped match, no other tokens before or after).
5. Any mismatch → **abort**. Do not proceed to Phase 3. Do not write the sentinel.

### Phase 3 — Publish to Confluence

Create the four pages **sequentially** as children of the engineering root, capturing each returned page ID:

1. `createConfluencePage(cloudId, spaceKey, parentId=engineeringRootPageId, title="{{project_display_name}} — Requirements", body=<skeleton>)` → `requirementsPageId`
2. Same for `{{project_display_name}} — Decisions` → `decisionsPageId`
3. Same for `{{project_display_name}} — Architecture` → `architecturePageId`
4. Same for `{{project_display_name}} — Obsolete` → `obsoletePageId`

If any `createConfluencePage` call fails:

- Do **not** retry blindly. Report what was created vs. not, list the captured page IDs so far, and stop. The user reconciles manually. Do not update the config, do not write the sentinel in a partial state.

### Phase 4 — Update `docs/confluence-spec/config.json`

Persist the new page IDs so `/{{project_slug}}-spec` can find them. Use the Edit tool to set exactly these four fields:

- `requirementsPageId` = captured value
- `decisionsPageId` = captured value
- `architecturePageId` = captured value
- `obsoletePageId` = captured value

Do **not** touch any other field. Preserve the file's existing indentation and field order (user `CLAUDE.md` JSON rule).

### Phase 5 — Lockout

1. Write `docs/.confluence-bootstrap-complete` as JSON:

   ```json
   {
     "timestamp": "<UTC ISO 8601, e.g. 2026-01-01T10:42:11Z>",
     "requirementsPageId": "<id>",
     "decisionsPageId": "<id>",
     "architecturePageId": "<id>",
     "obsoletePageId": "<id>"
   }
   ```

2. Stage exactly the changed files (no `git add -A`):

   ```bash
   git add docs/.confluence-bootstrap-complete docs/confluence-spec/config.json
   ```

3. Create a new branch and commit (do NOT commit on `{{integration_branch}}` or `{{default_branch}}`):

   ```bash
   git checkout -b bootstrap/confluence-spec-init
   git commit -m "chore(confluence): bootstrap {{project_slug}} spec tree (one-shot)"
   ```

   No `Co-Authored-By` trailer (user rule).

4. **Do NOT push.** Print the final report:

   ```
   Bootstrap complete (local).

   Branch:    bootstrap/confluence-spec-init  (not pushed)
   Sentinel:  docs/.confluence-bootstrap-complete
   Confluence tree (under the engineering root page):
     - Requirements:  <siteUrl>/wiki/spaces/<spaceKey>/pages/<requirementsPageId>
     - Decisions:     <siteUrl>/wiki/spaces/<spaceKey>/pages/<decisionsPageId>
     - Architecture:  <siteUrl>/wiki/spaces/<spaceKey>/pages/<architecturePageId>
     - Obsolete:      <siteUrl>/wiki/spaces/<spaceKey>/pages/<obsoletePageId>

   Inspect the branch and the Confluence pages. When satisfied, push manually:
     git push -u origin bootstrap/confluence-spec-init

   From now on, spec intent flows from Confluence to code only. Use /{{project_slug}}-spec for ongoing changes.
   ```

## Failure Modes — Stop Without Modifying

| Condition | Action |
| --- | --- |
| `docs/.confluence-bootstrap-complete` already exists | Abort. Print stored timestamp + page IDs. |
| Working tree dirty | Abort. Ask user to commit or stash. |
| `docs/confluence-spec/config.json` missing or has null `cloudId` / `siteUrl` / `spaceKey` / `engineeringRootPageId` | Abort. Report which fields are missing. |
| Engineering root page (`engineeringRootPageId`) not found | Abort. The parent page must exist in the configured space. |
| Atlassian MCP unreachable | Abort. The publish half is impossible. |
| Engineering root already has a child whose title equals or ends with `Requirements` / `Decisions` / `Architecture` / `Obsolete` | Abort. Manual cleanup or manual config reconciliation required. |
| User reply at Phase 2 is not the exact phrase `bootstrap publish approved` | Abort. No Confluence write, no sentinel. |
| Any `createConfluencePage` call fails mid-Phase 3 | Stop. Report what was created vs. not. Do not update config. Do not write sentinel. Do not commit. |
| Phase 4 Edit on `config.json` would touch a field other than the four `*PageId` keys | Stop. Re-derive the patch. |
| Any attempt to use a Forbidden tool (Jira write, updateConfluencePage, deleteConfluencePage, write outside the sub-tree) | Stop. This is a bug, not a recoverable state. |

## Out of Scope

The following are **not** this skill's job. Do not attempt them, even if asked mid-run — redirect the user instead.

- `Pending` sections of any kind. Bootstrap publishes empty skeletons only. `Pending` is the exclusive output of `/{{project_slug}}-spec`.
- Migrating existing repo docs into the tree. If the team later wants them speced, each one goes through `/{{project_slug}}-spec` as a reviewed draft — never as a bulk import.
- Ongoing maintenance of the Confluence tree (adding new REQs, updating DECs as code evolves). That belongs to `/{{project_slug}}-spec`.
- Any Jira write — assigning tickets, creating issues, transitioning. This skill never touches Jira.
- Pushing the bootstrap commit to origin. The user pushes manually after inspection.
- Editing the engineering root page body. The skill only creates children under it.

## Safeguards

- **Create-only on Confluence**: this skill only creates pages. It never modifies, never deletes — not even the root page's body.
- **No Status macros**: the only legitimate bootstrap output is four skeleton pages with no macros. `Pending` belongs to `/{{project_slug}}-spec`.
- **No retry beyond reporting**: if a Confluence write fails, stop and report — the user reconciles. There is no version-mismatch retry because this skill never updates a page.
- **No writes outside the sub-tree**: every `createConfluencePage` call must have `parentId = engineeringRootPageId`.
- **No Jira surface**: the skill must not import or load any Jira MCP tool. If you find yourself about to call one, you are in the wrong skill.
- **One-shot is one-shot**: after Phase 5 writes the sentinel, any future invocation aborts in Phase 0. Removing the sentinel manually is a deliberate act with consequences — the skill assumes the user understands them and does not gate on it further.
