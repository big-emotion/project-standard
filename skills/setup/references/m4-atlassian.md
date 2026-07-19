# M4 — Atlassian wiring: guided setup

Wires the repo to its Jira project and Confluence spec tree. Two kinds of steps:
**manual-guided** (Jira project and board creation — the Atlassian MCP cannot
create projects or boards, only issues and pages) and **automated** (id discovery
via MCP, Confluence tree creation via the project's bootstrap skill).

Deliverables:

- A Jira team-managed project with the pipeline board.
- A dedicated `ferry` Jira user (hardened automation condition for M5).
- `docs/confluence-spec/config.json` (rendered from
  `templates/m4-atlassian/confluence-spec-config.json`).
- `docs/templates/jira-ticket-template.md` (rendered from
  `templates/m4-atlassian/jira-ticket-template.md`).
- The Confluence spec tree, created once by `/{{project_slug}}-bootstrap-confluence`,
  locked by the sentinel `docs/.confluence-bootstrap-complete`.

## Step 1 — Jira project and board (manual, guided)

Guide the user through the Jira UI; verify each item afterwards via MCP.

1. **Create a team-managed project** on `{{jira_site_url}}` with key
   `{{jira_project_key}}`. Team-managed keeps the workflow editable by the team
   without a Jira admin.
2. **Board columns — create exactly this pipeline**, in order:

   ```
   Refinement / In Development / In Review / Changes Requested / To Merge / Done
   ```

   - Column names must match `ferry.config` `trigger_column` values **character
     for character** — Ferry's router resolves the agent role from the destination
     status name. If the team prefers "Ready to Merge" over "To Merge", that is
     fine, but the same string must go into `ferry.config` (M5); decide once here
     and record it.
   - Each column needs a matching status; in team-managed projects creating the
     column creates the status.
3. **Issue types**: ensure Epic, Story, Task, Bug, and Sub-task (sometimes named
   `Subtask`) exist for the project. Team-managed defaults usually cover this.
4. **Verification (MCP)**: `getVisibleJiraProjects` must list the project;
   `getTransitionsForJiraIssue` on a throwaway issue can confirm the workflow
   allows the pipeline transitions (optional; the Ferry smoke test in M5 covers
   it end-to-end).

## Step 2 — Dedicated ferry Jira user (convention)

Big Emotion convention: Ferry acts in Jira as a **dedicated user**, never as a
teammate's personal account.

- Create (or reuse) the Jira user recorded as `{{ferry_jira_account}}` and grant
  it access to project `{{jira_project_key}}`.
- Why it is load-bearing: the hardened Jira automation rule (M5) fires only when
  the moved ticket is **assigned to the ferry user** AND lands in a pipeline
  column. Assignment to `ferry` is thus the human act that opts a ticket into
  automation — without the dedicated user, every drag on the board would trigger
  agents.
- The user's email + API token also feed the M5 secrets
  (`FERRY_JIRA_EMAIL` / `FERRY_JIRA_API_TOKEN`).
- Resolve and note its accountId now: `lookupJiraAccountId` with the ferry user's
  display name or email.

## Step 3 — Discover ids via Atlassian MCP (automated)

Fill the interview parameters that only Atlassian knows:

1. `getAccessibleAtlassianResources` → `atlassian_cloud_id` (the site's cloudId;
   `jira_site_url` is its URL).
2. `getVisibleJiraProjects` (search by `{{jira_project_key}}`) →
   `jira_project_id` (numeric).
3. `getJiraProjectIssueTypesMetadata(cloudId, projectIdOrKey)` → the five
   issue-type ids: `jira_issue_type_id_epic`, `_story`, `_task`, `_bug`,
   `_subtask`. Match on issue-type **name** case-insensitively and accept
   `Subtask` for `Sub-task` — ids differ per project even on the same site, so
   never copy them from another repo.
4. `getConfluenceSpaces` → `confluence_space_key` + `confluence_space_id` for the
   chosen space (Step 4).

## Step 4 — Confluence space and root page

1. **Choose the space.** A dedicated space per project is simplest. Sharing a
   space with another project's spec tree is supported, with one consequence:
   **title collisions**. Confluence enforces per-space title uniqueness, so in a
   shared space the four tree pages must carry the
   `{{project_display_name}} — ` title prefix (e.g. `{{project_display_name}} —
   Requirements`); in a dedicated space, bare titles are fine. Decide the
   convention now — the bootstrap skill and the spec skill both honor it, and the
   spec skill always identifies pages by id, never by title, precisely so shared
   spaces stay safe.
2. **Create the engineering root page** (manually or via `createConfluencePage`):
   the page the spec tree hangs under, e.g. a project landing page. Record its id
   as `confluence_root_page_id`.
3. `engineeringTreePageId` in the config: the parent page of the four tree pages.
   In the standard layout the tree hangs **directly under the engineering root**,
   so the template defaults it to the same id as `engineeringRootPageId`. Only
   change it if the team inserts a dedicated intermediate page (one reference
   repo does: root = space landing page, tree = an "Engineering" child page) — in
   that case create that page and put its id here, and use it as the bootstrap
   parent.

## Step 5 — Place the repo files

1. Render `templates/m4-atlassian/confluence-spec-config.json` →
   `docs/confluence-spec/config.json`.
   - On a **fresh install** (no Confluence tree yet), the four subpage ids are
     unknown: replace each quoted `{{confluence_*_page_id}}` token with a literal
     `null` (unquoted). The bootstrap skill fills them in its Phase 4.
   - When **wiring an existing tree** (re-install, repo migration), render the
     real ids instead and also recreate the sentinel if it is missing — see
     Step 6.
   - 2-space indentation, field order as in the template. Downstream skills edit
     this file surgically and rely on stable order.
2. Render `templates/m4-atlassian/jira-ticket-template.md` →
   `docs/templates/jira-ticket-template.md`, resolving its `PROJECT-SPECIFIC`
   markers (domain example title, measurable outcomes). Keep the Story/Bug
   conditional blocks, the GWT skeleton, and the Confluence-impact section with
   its exact `NEW / EDIT / RETIRE` verb grammar intact — the spec skill treats
   that section as load-bearing and machine-parsed.

## Step 6 — Bootstrap the Confluence tree (one shot)

1. Preconditions: config.json placed with non-null `cloudId` / `siteUrl` /
   `spaceKey` / `engineeringRootPageId`; clean working tree; M3's
   `{{project_slug}}-bootstrap-confluence` skill installed.
2. Run `/{{project_slug}}-bootstrap-confluence`. It previews the four skeleton
   pages, demands the exact confirmation phrase `bootstrap publish approved`,
   creates Requirements / Decisions / Architecture / Obsolete under the root,
   writes the four ids back into `config.json`, writes the sentinel
   `docs/.confluence-bootstrap-complete`, and commits both on a dedicated
   `bootstrap/confluence-spec-init` branch (not pushed — the user inspects and
   pushes).
3. **The sentinel is the lock.** While it exists, the bootstrap skill refuses to
   run and the spec skill agrees to run. If the repo already has a live tree but
   no sentinel (e.g. files were pruned during a migration), do not re-run
   bootstrap — recreate the sentinel by hand from the live page ids:

   ```json
   {
     "timestamp": "<UTC ISO 8601>",
     "requirementsPageId": "<id>",
     "decisionsPageId": "<id>",
     "architecturePageId": "<id>",
     "obsoletePageId": "<id>"
   }
   ```

## Step 7 — Verification checklist

- [ ] Board columns match the recorded pipeline strings exactly (they feed
      `ferry.config` in M5).
- [ ] Ferry Jira user exists, has project access, and its accountId is recorded.
- [ ] `docs/confluence-spec/config.json` parses; `jq` shows no leftover `{{`
      tokens; ids verified against MCP output, not copied from another repo.
- [ ] `docs/templates/jira-ticket-template.md` present, Confluence-impact grammar
      intact.
- [ ] Bootstrap ran once: sentinel present, four `*PageId` fields non-null, the
      four pages visible under the engineering root.
- [ ] `/{{project_slug}}-spec` passes its preconditions (dry invocation with a
      trivial description, abort at the preview gate — nothing is written without
      the affirmative token).
