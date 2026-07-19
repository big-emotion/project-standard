# M2 — Husky local hooks: install reference

Templates: `templates/m2-hooks/`. Reference implementation: `ANSUT-DSIS/sitewebgrandechancellerie` (`.husky/`, `commitlint.config.mjs`, `lint-staged.config.mjs`).

## File map

| Template | Installs to | Notes |
|---|---|---|
| `m2-hooks/pre-commit` | `.husky/pre-commit` | Husky v9: plain shell line, no shebang / `husky.sh` header |
| `m2-hooks/commit-msg` | `.husky/commit-msg` | idem |
| `m2-hooks/commitlint.config.mjs` | `commitlint.config.mjs` | Type-enum is the Big Emotion standard — do not trim it |
| `m2-hooks/lint-staged.config.mjs` | `lint-staged.config.mjs` | Generic rows only; projects append their own |
| `m2-hooks/prettierrc.json` | `.prettierrc.json` | Renamed on install (templates carry no leading dot) |
| `m2-hooks/editorconfig` | `.editorconfig` | idem |

## Install procedure (pnpm form)

1. Dev dependencies (root `package.json` — see the split-toolchain section for why root):

   ```sh
   pnpm add -D husky lint-staged @commitlint/cli @commitlint/config-conventional prettier
   ```

   ESLint must already be present (M1 installs it with the `lint` script); the `*.{ts,tsx}` lint-staged row calls it.

2. Wire Husky's activation into every install:

   ```jsonc
   { "scripts": { "prepare": "husky" } }
   ```

   `prepare` runs on `pnpm install` and sets `core.hooksPath` to `.husky/`. No `husky init` needed when copying the template hooks — `init` would scaffold a default `pre-commit` you would immediately overwrite.

3. Copy the four config files and the two hook files per the file map. Hook files must be executable (`chmod +x .husky/pre-commit .husky/commit-msg`).

4. Run `pnpm install` once (triggers `prepare`), then verify both hooks fire:

   ```sh
   git commit --allow-empty -m "bad message"        # commit-msg must REJECT
   git commit --allow-empty -m "chore: verify hooks" # must pass
   ```

   Drop the verification commit afterwards (`git reset --hard HEAD~1`) or keep it as the install commit.

## npm adaptation

Hooks run whatever the root toolchain provides:

| pnpm form | npm form |
|---|---|
| `pnpm add -D …` | `npm install -D …` |
| `.husky/pre-commit`: `pnpm exec lint-staged` | `npx lint-staged` |
| `.husky/commit-msg`: `pnpm exec commitlint --edit "$1"` | `npx commitlint --edit "$1"` |

Everything else (configs, prepare script) is identical.

## Split-toolchain repos (npm root + pnpm subdir)

Some repos have two toolchains — e.g. `big-emotion/support-agent-chancellerie`: dependency-free npm root (agent config, scripts, evals) plus a pnpm Next.js app in `portal/`. Git hooks always execute **from the repo root**, so:

- Husky, lint-staged, commitlint, prettier and the `prepare` script live in the **root** `package.json`, managed by the **root** package manager. With an npm root, the hooks take the npm form (`npx lint-staged`, `npx commitlint --edit "$1"`).
- The subdir keeps its own ESLint/Prettier installs and configs. lint-staged rows targeting subdir files must execute inside the subdir with `-C`, so the subdir's tool versions and configs apply — not the root's:

  ```js
  export default {
    // Root surface: dependency-free npm root has prettier only.
    "*.{md,json,mjs}": ["prettier --write"],
    // portal/ is a pnpm toolchain with its own ESLint/Prettier; -C runs the
    // command from portal/ so its node_modules and flat config resolve. Safe
    // regardless of cwd because lint-staged appends absolute file paths.
    "portal/**/*.{ts,tsx}": [
      "pnpm -C portal exec eslint --fix",
      "pnpm -C portal exec prettier --write",
    ],
    "portal/**/*.{css,json}": ["pnpm -C portal exec prettier --write"],
  };
  ```

- One `commitlint.config.mjs`, one `.editorconfig`, at the root — commit messages and editor defaults are repo-wide, not per-toolchain. `.prettierrc.json` may exist per toolchain if the subdir's formatting must diverge; default to a single root file.

## Ferry / AI-agent commits must pass commitlint

Ferry agents (M5) commit on these repos from GitHub runners. The workflow's install step runs `prepare`, so the `commit-msg` hook fires for agent commits exactly as it does locally — and the M1 required checks gate the same PRs. Therefore:

- Agent commit messages must satisfy `@commitlint/config-conventional` plus the type-enum in `commitlint.config.mjs` (`build chore ci docs feat fix perf refactor release revert style test`). The upstream Ferry prompts already mandate conventional commits; when installing M2 on a Ferry repo, read `prompts/<agent>.claude-code.md` (or the `.local.md` overlays) and confirm no override weakens that instruction.
- Never "fix" a rejected agent commit by adding `--no-verify` to the agent prompt or disabling the hook in CI — fix the message format. The hook is the same compliance surface humans get.
- The `release` type exists in the enum precisely for the `<slug>-release` skill's version-bump commits (M3); keep it even on repos without a release skill yet.
