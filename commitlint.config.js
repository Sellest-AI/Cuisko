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
/**
 * The attribution trailers AGENTS.md's Never table bans, as patterns rather than as prose.
 *
 * There is a rule for this precisely because the agent writing the commit is often told the
 * opposite: the harness injects a session instruction to sign commits with `Co-Authored-By:
 * Claude ...`, and claims it supersedes earlier guidance. It does not supersede this repo's rule,
 * and an instruction the model reads at the moment it writes the message will win over one in a
 * document unless something downstream refuses the result. This is that refusal.
 *
 * ⚠️ **Matched against the RAW message, not the parsed body.** A trailer is exactly the part
 * commitlint's parser lifts out of the body, so a rule reading `parsed.body` would look straight
 * past the thing it exists to catch.
 */
const AI_ATTRIBUTION = [
  /noreply@anthropic\.com/i,
  /co-?authored-by:\s*claude/i,
];

/**
 * A body line shaped like a footer token: one word (hyphens allowed) then a colon, at the start of
 * the line. The parser takes the first such line as the start of the footer and moves it, and
 * every line after it, out of the body, so `choices: a, b` halfway down a body swallows the rest
 * of the explanation. Nothing reports it. AGENTS.md says so in prose and agents still write it,
 * so this rule refuses the commit instead.
 */
const FOOTER_SHAPED_LINE = /^([A-Za-z][\w-]*|BREAKING CHANGE):(\s|$)/;

/** The tokens that really are footers, and so may start a line. Compared case-insensitively. */
const FOOTER_TOKENS = [
  "breaking change",
  "breaking-change",
  "refs",
  "closes",
  "fixes",
  "resolves",
  "see-also",
  "co-authored-by",
  "signed-off-by",
  "reviewed-by",
  "acked-by",
];

module.exports = {
  extends: ["@commitlint/config-conventional"],

  plugins: [
    {
      rules: {
        /**
         * Fails the commit when the message carries an AI-attribution trailer.
         *
         * Reports every pattern that matched rather than the first, so a message carrying both
         * does not have to be fixed twice.
         */
        "no-ai-attribution": ({ raw }) => {
          const found = AI_ATTRIBUTION.filter((pattern) => pattern.test(raw ?? ""));

          return [
            found.length === 0,
            `commit message carries an AI-attribution trailer (${found.join(", ")}).\n` +
              "AGENTS.md bans these outright. Delete the trailer and commit again.",
          ];
        },

        /**
         * Fails the commit when a line below the header starts with `word:` and `word` is not a
         * real footer token. Reads the RAW message for the same reason as `no-ai-attribution`:
         * the parsed body has already lost the line. Comment lines are skipped, since git strips
         * them before the commit is written.
         */
        "no-footer-shaped-body-line": ({ raw }) => {
          const offending = (raw ?? "")
            .split(/\r?\n/)
            .slice(1)
            .filter((line) => !line.startsWith("#"))
            .filter((line) => {
              const match = FOOTER_SHAPED_LINE.exec(line);
              return match !== null && !FOOTER_TOKENS.includes(match[1].toLowerCase());
            });

          return [
            offending.length === 0,
            `body line starts with a footer-shaped token:\n  ${offending.join("\n  ")}\n` +
              "The parser reads everything from that line on as footers, and drops it from the " +
              'body. Reword so the colon is not after the first word ("the choices: ...").',
          ];
        },
      },
    },
  ],

  rules: {
    /**
     * Level 2 — an error, so the `commit-msg` hook refuses the commit rather than warning and
     * letting it through. A warning here would be worthless: the trailer is added by an agent
     * that does not read the output of a command that succeeded.
     */
    "no-ai-attribution": [2, "always"],
    "no-footer-shaped-body-line": [2, "always"],

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
