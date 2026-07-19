#!/usr/bin/env node
// Validates that every {{placeholder}} in the template tree is declared in
// params.json, so the setup skill's interview always covers what templates need.
// Not placeholders: GitHub Actions expressions (${{ ... }} — leading $, spaces,
// dots) and Jira smart values ({{issue.key}} — dots). Both fail the
// ^[a-z][a-z0-9_]*$ shape, and a leading $ is rejected explicitly.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const templatesRoot =
  process.argv[2] ??
  join(dirname(fileURLToPath(import.meta.url)), "..", "skills", "setup", "templates");

const params = JSON.parse(readFileSync(join(templatesRoot, "params.json"), "utf8"));
const declared = new Set(Object.keys(params).filter((k) => k !== "$comment"));

const PLACEHOLDER = /\{\{([a-z][a-z0-9_]*)\}\}/g;

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    if (statSync(abs).isDirectory()) yield* walk(abs);
    else if (entry !== "params.json") yield abs;
  }
}

const undeclaredUses = [];
const used = new Set();

for (const file of walk(templatesRoot)) {
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    for (const match of line.matchAll(PLACEHOLDER)) {
      if (line[match.index - 1] === "$") continue;
      const name = match[1];
      used.add(name);
      if (!declared.has(name)) {
        undeclaredUses.push(`${relative(templatesRoot, file)}:${i + 1} {{${name}}}`);
      }
    }
  });
}

if (undeclaredUses.length > 0) {
  console.error("Undeclared placeholders (add them to params.json or fix the template):");
  for (const use of undeclaredUses) console.error(`  ${use}`);
  process.exit(1);
}

const unused = [...declared].filter((name) => !used.has(name));
if (unused.length > 0) {
  console.log(`Declared but unused params (informational): ${unused.join(", ")}`);
}
console.log(`OK — ${used.size} distinct placeholders, all declared.`);
