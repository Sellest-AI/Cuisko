/**
 * What marks a text as signed by an AI tool. AGENTS.md's Never table bans it in commits and in pull
 * requests: commitlint.config.js refuses the commit, scripts/github/_lib/pullRequest.mjs the PR.
 *
 * CommonJS because commitlint.config.js is: `require` and `import` both load it. No dependency,
 * since the PR check runs in CI with no install.
 */
const AI_ATTRIBUTION = [
  /noreply@anthropic\.com/i,
  /co-?authored-by:\s*claude/i,
  // The line a PR body ends with, with or without its emoji and its link.
  /generated with \[?claude code\b/i,
  // The link to the session, as a trailer or on its own.
  /claude\.ai\/code\/session/i,
];

/**
 * Every pattern the text matches, so an author who carries two fixes them once.
 *
 * @param {string} text
 * @returns {RegExp[]}
 */
const findAiAttribution = (text) => AI_ATTRIBUTION.filter((pattern) => pattern.test(text));

module.exports = { findAiAttribution };
