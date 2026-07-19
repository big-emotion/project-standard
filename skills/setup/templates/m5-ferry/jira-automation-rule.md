# Jira Automation — "Ferry — transition (any column)" (hardened router rule)

Ferry's router model needs exactly **one** Jira Automation rule. It fires on
relevant issue changes and sends the target status to GitHub; the router
workflow maps the status to the right agent via `ferry.config`
(`workflow.agents.*.trigger_column`) and no-ops on statuses Ferry does not own
— so renaming or adding board columns never requires touching Jira again.

This is the **hardened Big Emotion variant** of the upstream any-column rule:
two conditions make the pipeline opt-in per ticket and stop stray dispatches.

## Prerequisites

- `.github/workflows/ferry-router.yml` is committed and pushed to the
  **default branch** of `{{github_org}}/{{github_repo}}`. `repository_dispatch`
  only triggers workflows that exist on the default branch — the rule silently
  does nothing until the router is there.
- A GitHub fine-grained Personal Access Token (PAT) with **Contents: write**
  on `{{github_org}}/{{github_repo}}`, or a GitHub App installation token.
  It goes in the `Authorization` header below.
- Jira Automation enabled on the project (all Jira Cloud tiers).
- The dedicated `ferry` Jira user exists ({{ferry_jira_account}}) — see
  references/m4-atlassian.md.

## Create the rule

Jira project → **Project settings** → **Automation** → **Create rule**, then
build Trigger → Conditions → Action as below. **Save** and **Enable**.

### Trigger — Field value changed: Status, Assignee

Use the **"Field value changed"** trigger watching **Status** and **Assignee**,
with no from/to filter. It fires on every column move, and *also* when the
`ferry` user is assigned to a ticket already sitting in a pipeline column — so
assigning `ferry` is enough to kick the matching agent, no column wiggle
needed.

> Minimum viable variant (upstream default): "Issue transitioned" with **From
> status** and **To status** left empty. It loses the assign-in-place trigger;
> prefer the hardened form.

### Conditions — both must pass (Big Emotion hardening)

Add two **Issue fields condition** blocks, in this order:

1. **Assignee equals** the dedicated ferry user (`{{ferry_jira_account}}`).
   The pipeline is opt-in per ticket: a human-assigned ticket moving across
   the board never triggers an agent.
2. **Status is one of**: `Refinement`, `In Development`, `In Review`,
   `Changes Requested`, `To Merge`.
   The router would no-op on unmapped statuses anyway, but each stray dispatch
   burns a workflow run and pollutes the Actions list — filter at the source.

> The five names must match the board columns and
> `ferry.config.json` `workflow.agents.*.trigger_column` **exactly** (Ferry
> matches status names verbatim). If your merge column is named
> `Ready to Merge`, change it here *and* in `ferry.config.json`.

### Action — Send web request

- **URL:** `https://api.github.com/repos/{{github_org}}/{{github_repo}}/dispatches`
- **HTTP method:** `POST`
- **Web request body:** Custom data

Headers — add all four; toggle the lock icon on `Authorization` to mark it
secret (keeps the token out of Jira's audit log):

| Name                   | Value                         | Secret? |
| ---------------------- | ----------------------------- | ------- |
| `Accept`               | `application/vnd.github+json` | No      |
| `Authorization`        | `Bearer YOUR_GITHUB_PAT`      | **Yes** |
| `X-GitHub-Api-Version` | `2022-11-28`                  | No      |
| `Content-Type`         | `application/json`            | No      |

Custom body (the Ferry v1 envelope — the double-brace values are Jira smart
values, resolved by Jira at send time; paste as-is):

```json
{
  "event_type": "ferry-transition",
  "client_payload": {
    "version": "v1",
    "event_id": "{{issue.key}}-{{issue.id}}",
    "ticket_key": "{{issue.key}}",
    "phase": "transition",
    "source": "jira-column",
    "ts": "{{now.jiraDate}}",
    "issue_type": "{{issue.issuetype.name}}",
    "to_status": "{{issue.status.name}}"
  }
}
```

`{{issue.status.name}}` resolves to the destination column on a status change,
and to the current column on an assignee change — both are exactly what the
router's role resolution needs.

## Note on the Merger

Moving a ticket into the merge column (`workflow.agents.merger.trigger_column`)
is an **explicit merge order**: the router maps it to the Merger like any other
agent (ADR-0005 rev. 2). The Reviewer-emitted `ferry-merge` dispatch on
approval also works and needs no Jira rule.

## Security notes

- Mark the `Authorization` header **secret** (lock icon) — non-negotiable.
- Rotate the PAT if it is ever exposed; scope it to this one repository.
- This file is safe to commit: it only ever contains the `YOUR_GITHUB_PAT`
  placeholder, never a real token.

## Verify

Assign the `ferry` user to a test issue and move it into any pipeline column,
then check:

1. Jira: Project settings → Automation → the rule → **Audit log** — one
   successful execution, web request `204`.
2. GitHub: the Actions tab of `{{github_org}}/{{github_repo}}` — a
   "Ferry — Router" run appears within seconds, named
   `ferry-transition · <KEY> → <STATUS>`.
