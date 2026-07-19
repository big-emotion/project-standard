---
type: Story
project: {{jira_project_key}}
parent_epic: ""
assignee: ""
---

# Title

<!-- Concise, business-readable. One short sentence that names the outcome, not the implementation.
     Avoid jargon and ticket IDs here. -->
<!-- PROJECT-SPECIFIC: add one example title in the project's domain language,
     e.g. "Escalate unanswered editor questions by email with the transcript". -->

## User story

<!-- if: type == "Story" -->

As a <role>
I want <capability>
so that <business outcome>.

<!-- /if -->

## Business value

<!-- One short paragraph: why this matters to the project's users or stakeholders.
     Tie it back to a measurable outcome whenever possible. -->
<!-- PROJECT-SPECIFIC: name the project's own measurable outcomes here so authors
     anchor to them — e.g. editorial throughput and RGAA score for a public
     website; editor autonomy, escalation rate, and eval accuracy for an AI
     support agent. -->

## Scope

### In

<!-- Bullet list of what IS included in this ticket. -->

### Out

<!-- Bullet list of what is explicitly NOT included (deferred, separate ticket, etc.). -->

## Reproduction steps

<!-- if: type == "Bug" -->

1. <step one>
2. <step two>
3. <step three>
   <!-- /if -->

## Expected vs Actual behavior

<!-- if: type == "Bug" -->

### Expected

<expected behavior>

### Actual

<actual behavior>
<!-- /if -->

## Acceptance criteria (Given-When-Then)

<!-- Required whenever the ticket creates or edits a REQ.
     One GWT block per REQ touched. Use the `Given … When … Then …` skeleton below. -->

```
Given <context>
When <action>
Then <observable outcome>
```

## Confluence impact (load-bearing)

<!-- MANDATORY. List every REQ / DEC / ARCH touched by this ticket with one of the
     three allowed verbs: NEW, EDIT, RETIRE. No other verb (REMOVE, UPDATE, ADD, …)
     is accepted.

     The bullet character is `•`. Indentation under each bullet is two spaces. -->

• REQ-042 — EDIT statement
  Current: "<verbatim current statement>"
  Proposed: "<new statement>"
  GWT changes: <which GWT blocks change, and how>

• DEC-018 — NEW
  Context: <why this decision is being recorded now>
  Decision: <the decision itself, one sentence>
  Alternatives: <options considered, briefly>
  Tradeoffs: <what we accept by choosing this option>
  Requirements satisfied: <REQ-xxx, REQ-yyy>

• ARCH-007 — EDIT body
  Summary change: <one-line diff of the architecture contract>
  Source files (expected): <paths that should anchor this contract>
  Tests anchoring this contract: <test files / spec ids>

## Dependencies

<!-- Optional. Other tickets, PRs, Confluence pages, or external blockers. Keep it brief. -->

## Assumptions / open questions

<!-- Optional. Anything you assumed while writing the ticket, or questions that
     need a product / design / lead decision before implementation can start. -->
