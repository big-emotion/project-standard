# Ferry prompt customization — the `.local.md` additive overlay

Per SPEC decision **D2**, the standard way to customize a Ferry agent's
behaviour on the claude-code path is an **additive local overlay** —
`prompts/<agent>.claude-code.local.md` — never a full override. The overlay is
appended to Ferry's bundled prompt by `ferry-cc-prompt` at run time, so the
upstream prompt contract (no-merge rule, the single allowed transition, the
fingerprinted `[ferry:<role>:RUN_ID]` audit comment, bounded CI loops,
only-the-Merger-gates-CI) keeps flowing into the repo on every Ferry release.

## Files and resolution

| Overlay file                           | Extends the bundled prompt for |
| -------------------------------------- | ------------------------------ |
| `prompts/refiner.claude-code.local.md` | Refiner                        |
| `prompts/dev.claude-code.local.md`     | Developer                      |
| `prompts/review.claude-code.local.md`  | Reviewer                       |
| `prompts/iterate.claude-code.local.md` | Iterator                       |

Resolution (`ferry-cc-prompt`, Ferry >= v0.18.1): the base prompt is the full
override `prompts/<agent>.claude-code.md` when one exists, else Ferry's
bundled default — and the `.local.md` overlay is **always** appended on top,
in both cases. Full overrides are a last resort (they freeze the whole
contract at copy time and stop tracking upstream changes); `ferry-doctor`
check 19 warns on them. The router-model Merger resolves
`prompts/merge.claude-code.*` through the same mechanism (observed in the
reference repo; not yet listed in the upstream table).

To confirm what a run used, search the job log for
`ferry-cc-prompt: <agent> prompt resolved (source: override|local-overlay|bundled)`.

## Placeholder-token rules

- `ferry-cc-prompt` substitutes **only** these bare uppercase tokens:
  `TICKET_KEY` and `RUN_ID` (all agents); `REVIEW_TRANSITION_ID` (developer,
  iterator); `APPROVE_TRANSITION_ID` and `CHANGES_TRANSITION_ID` (reviewer).
  You may use them in an overlay — they are substituted there too.
- **An unrecognised token is left literal.** Never invent a new token and
  expect it to be filled: write the literal value, or instruct the agent to
  resolve it at run time (e.g. via the Jira MCP `get_transitions`).
- When maintaining a full override (exceptional), keep those tokens intact —
  deleting them breaks the transition and audit wiring.

## Overlay rules

- **Additive only.** State project facts and constraints; never restate or
  contradict the bundled contract — restating drifts, contradicting weakens
  Ferry's guarantees.
- **Keep it small.** An overlay is repo context, not a workflow rewrite.
- Overlays survive `ferry-init` / `ferry-update` untouched (they are consumer
  files, not generated ones).

## Example — `prompts/dev.claude-code.local.md`

The content below is a realistic Developer overlay for a Big Emotion repo.
Copy it to `prompts/dev.claude-code.local.md`, then replace every
`PROJECT-SPECIFIC` block with the repo's real conventions.

```markdown
## Project-specific guidance — {{project_display_name}}

Repository: `{{github_org}}/{{github_repo}}`. These rules extend (never
replace) your standard Ferry contract.

### Branch and PR conventions

- Every PR targets `{{integration_branch}}`; `{{default_branch}}` is
  release-only and tag-protected. Never open a PR against
  `{{default_branch}}`.
- Commit messages must pass commitlint: Conventional Commits
  (`feat(scope): subject`, `fix(scope): subject`, imperative, <= 72 chars),
  types limited to build, chore, ci, docs, feat, fix, perf, refactor,
  release, revert, style, test. No Co-Authored-By trailers.

### Toolchain

<!-- PROJECT-SPECIFIC: real install/test/build commands for this repo.
     Example (pnpm single-toolchain):
- Install: `pnpm install --frozen-lockfile`
- Quality gates before pushing: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
     Split-toolchain repos: state each root and its package manager explicitly
     ("root is npm dependency-free; portal/ is pnpm — run `pnpm -C portal ...`"). -->

### Domain constraints

<!-- PROJECT-SPECIFIC: the load-bearing repo rules an agent must not discover
     the hard way. Examples from the reference repos:
- "Anything under agent/ or knowledge/ only reaches production via the release
  flow — never run the sync from a PR branch or CI."
- "Generated files (*.generated.*) are never hand-edited — change the exporter." -->

### Off-limits

- Never modify `prompts/`, `.github/`, `.ferry/`, or lockfiles unless the
  ticket explicitly requires it.
<!-- PROJECT-SPECIFIC: add repo-specific protected paths. -->
```
