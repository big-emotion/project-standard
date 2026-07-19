export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    // The standard Big Emotion whitelist; `release` covers version-cutting commits.
    "type-enum": [
      2,
      "always",
      [
        "build",
        "chore",
        "ci",
        "docs",
        "feat",
        "fix",
        "perf",
        "refactor",
        "release",
        "revert",
        "style",
        "test",
      ],
    ],
  },
};
