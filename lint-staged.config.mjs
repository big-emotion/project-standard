// Dependency-free repo: staged gates mirror the CI checks. node --check and
// JSON.parse take one file per call, hence the function rows.
export default {
  "**/*.mjs": (files) => files.map((f) => `node --check ${f}`),
  "**/*.json": (files) =>
    files.map((f) => `node -e "JSON.parse(require('fs').readFileSync('${f}','utf8'))"`),
};
