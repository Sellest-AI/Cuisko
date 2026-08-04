/**
 * Commit message rules — Conventional Commits.
 *
 * The format is `type(scope): subject`, and the reason to use the standard rather than something
 * bespoke is leverage: changelog generators, release tooling and GitHub's auto-generated release
 * notes all parse it for free. A house style would cost the same keystrokes and buy none of that.
 *
 * Enforced by the `commit-msg` hook, so this is a real rule and not a guideline. Merge and revert
 * commits are ignored by commitlint's own defaults.
 */
module.exports = {
  extends: ["@commitlint/config-conventional"],

  rules: {
    /**
     * Deliberately smaller than the Angular default set.
     *
     * No `hotfix` — a hotfix and a fix are the same change; what differs is the process around
     * it, which is why `hotfix/` is a BRANCH prefix. A type that forces a judgement call with no
     * downstream consequence is the kind of rule that decays.
     *
     * No `style` — Prettier settles formatting, so the type has nothing left to describe.
     *
     * `refactor` vs `chore` is the one distinction worth keeping: `refactor` changed production
     * code without changing behaviour, `chore` did not touch production code at all. When you are
     * bisecting a regression, `refactor` commits are suspects and `chore` commits usually are not.
     */
    "type-enum": [
      2,
      "always",
      ["feat", "fix", "refactor", "perf", "docs", "test", "chore", "ci", "revert"],
    ],

    // 72 keeps `git log --oneline` readable in a terminal; the default 100 does not.
    "header-max-length": [2, "always", 72],

    // Imperative mood, lowercase: "add scaling", never "Added scaling."
    "subject-case": [2, "never", ["sentence-case", "start-case", "pascal-case", "upper-case"]],
    "subject-full-stop": [2, "never", "."],

    // The body is where "why" goes. Wrap it so it stays readable in a terminal.
    "body-max-line-length": [2, "always", 100],
  },
};
