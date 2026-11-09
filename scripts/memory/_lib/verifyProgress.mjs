/**
 * How far the pre-commit's `pnpm verify` is, read from its output (spec §9.1 U9). The commit of a
 * dream runs the whole verify, and its full output buried the result: the script now shows one
 * line, the steps finished out of the steps `verify` runs and the last line printed, and keeps
 * the full output for a refused commit.
 *
 * The steps come from the `verify` script in package.json, so a step added there is counted with
 * no change here. A step ends on the line pnpm prints for it (`. lint: Done`); the tests end on
 * vitest's `Test Files` line, since `pnpm test` runs alone and prints no `Done`.
 */

const ANSI = /\x1b\[[0-9;]*[A-Za-z]/g;

/** The names of the scripts `verify` runs, in order: `pnpm run "/<regex>/"` expands to every script it matches. */
export const verifySteps = (scripts = {}) => {
  const verify = scripts.verify;
  if (typeof verify !== "string") return [];
  return verify.split("&&").flatMap((part) => {
    const pattern = /^pnpm run "\/(.+)\/"$/.exec(part.trim());
    if (pattern !== null) {
      const matches = new RegExp(pattern[1]);
      return Object.keys(scripts).filter((name) => matches.test(name));
    }
    const single = /^pnpm (?:run )?([\w:-]+)$/.exec(part.trim());
    return single === null ? [] : [single[1]];
  });
};

/** The step a line of verify output ends, or null. */
const _endedStep = (line) => {
  const done = /^\. ([\w:-]+): Done$/.exec(line);
  if (done !== null) return done[1];
  return /^\s*Test Files\s/.test(line) ? "test" : null;
};

/**
 * Reads verify output as it comes, in chunks cut anywhere. `state()` is `{ done, total, last }`:
 * the steps finished, the steps there are, and the last line that is not blank.
 */
export const createVerifyProgress = (steps) => {
  const ended = new Set();
  let partial = "";
  let last = "";
  const read = (line) => {
    const plain = line.replace(ANSI, "").trimEnd();
    if (plain.trim() === "") return;
    last = plain.trim();
    const step = _endedStep(plain);
    if (step !== null && steps.includes(step)) ended.add(step);
  };
  return {
    push: (chunk) => {
      const lines = (partial + chunk).split(/\r?\n|\r/);
      partial = lines.pop() ?? "";
      for (const line of lines) read(line);
    },
    end: () => {
      read(partial);
      partial = "";
    },
    state: () => ({ done: ended.size, total: steps.length, last }),
  };
};

/** The status line: `Verifying 2/5 · <last line>`, without the counter when no step is known. */
export const formatProgress = ({ done, total, last }) => {
  const counter = total > 0 ? `Verifying ${done}/${total}` : "Verifying";
  return last === "" ? counter : `${counter} · ${last}`;
};
