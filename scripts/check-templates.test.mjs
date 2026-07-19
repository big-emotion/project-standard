import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const CHECKER = join(dirname(fileURLToPath(import.meta.url)), "check-templates.mjs");

function makeFixture({ params, files }) {
  const root = mkdtempSync(join(tmpdir(), "check-templates-"));
  writeFileSync(join(root, "params.json"), JSON.stringify(params));
  for (const [relPath, content] of Object.entries(files)) {
    const abs = join(root, relPath);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  return root;
}

function runChecker(root) {
  try {
    const stdout = execFileSync(process.execPath, [CHECKER, root], { encoding: "utf8" });
    return { code: 0, output: stdout };
  } catch (err) {
    return { code: err.status, output: `${err.stdout}${err.stderr}` };
  }
}

test("passes when every placeholder is declared in params.json", () => {
  const root = makeFixture({
    params: { $comment: "x", project_slug: "desc", github_org: "desc" },
    files: { "m1-ci/ci.yml": "name: {{project_slug}} CI\norg: {{github_org}}\n" },
  });
  const { code } = runChecker(root);
  rmSync(root, { recursive: true, force: true });
  assert.equal(code, 0);
});

test("fails and names the file on an undeclared placeholder", () => {
  const root = makeFixture({
    params: { project_slug: "desc" },
    files: { "m2-hooks/commitlint.config.mjs": "// {{unknown_param}}\n" },
  });
  const { code, output } = runChecker(root);
  rmSync(root, { recursive: true, force: true });
  assert.equal(code, 1);
  assert.match(output, /unknown_param/);
  assert.match(output, /commitlint\.config\.mjs/);
});

test("ignores GitHub Actions expressions and Jira smart values", () => {
  const root = makeFixture({
    params: { project_slug: "desc" },
    files: {
      "m1-ci/ci.yml": "group: ci-${{ github.ref }}\nslug: {{project_slug}}\n",
      "m5-ferry/jira-rule.md": 'body: {"key":"{{issue.key}}","ts":"{{now.jiraDate}}"}\n',
    },
  });
  const { code } = runChecker(root);
  rmSync(root, { recursive: true, force: true });
  assert.equal(code, 0);
});

test("reports declared-but-unused params without failing", () => {
  const root = makeFixture({
    params: { project_slug: "desc", never_used: "desc" },
    files: { "m1-ci/ci.yml": "slug: {{project_slug}}\n" },
  });
  const { code, output } = runChecker(root);
  rmSync(root, { recursive: true, force: true });
  assert.equal(code, 0);
  assert.match(output, /never_used/);
});
