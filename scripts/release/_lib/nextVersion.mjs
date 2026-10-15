/**
 * The version a release should carry, read from the Conventional Commits it contains.
 *
 * Only a store build moves the version: an over-the-air update keeps the one baked into the
 * installed app. So this runs when a build is cut, over every commit since the last `v*` tag.
 *
 * A release with nothing but `chore` and `docs` still gets a patch: it exists because the native
 * side changed, and two different binaries must never share a version.
 */

const BUMPS = ["patch", "minor", "major"];

/** `type(scope)!: subject`: the `!` marks a breaking change, as a footer does. */
const HEADER = /^(\w+)(\([^)]*\))?(!)?:/;
const BREAKING_FOOTER = /^BREAKING[ -]CHANGE:/m;

/** The bump one commit message asks for. */
const _bumpOf = (message) => {
  const header = HEADER.exec(message.trim());
  if (header?.[3] || BREAKING_FOOTER.test(message)) return "major";
  if (header?.[1] === "feat") return "minor";
  return "patch";
};

/**
 * @param {string} current  the version in package.json, `major.minor.patch`
 * @param {string[]} messages  full commit messages since the last release
 * @param {"patch" | "minor" | "major"} [forced]  a human's choice, which wins over the commits
 * @returns {string}
 */
export const nextVersion = (current, messages, forced) => {
  const parts = /^(\d+)\.(\d+)\.(\d+)$/.exec(current);
  if (!parts) throw new Error(`"${current}" is not a major.minor.patch version`);
  if (forced !== undefined && !BUMPS.includes(forced)) {
    throw new Error(`"${forced}" is not one of ${BUMPS.join(", ")}`);
  }
  const [major, minor, patch] = parts.slice(1).map(Number);

  let bump = forced ?? messages.map(_bumpOf).reduce((a, b) => (BUMPS.indexOf(b) > BUMPS.indexOf(a) ? b : a), "patch");

  // Before 1.0 a breaking change is ordinary, and reaching 1.0.0 is a decision, never a side
  // effect of a `feat!:` on a schema change. Only an explicit `major` crosses it.
  if (bump === "major" && major === 0 && forced === undefined) bump = "minor";

  if (bump === "major") return `${major + 1}.0.0`;
  if (bump === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
};
