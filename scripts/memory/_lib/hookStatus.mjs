/**
 * The status line of the dream's commit (spec §9.1 U9): the last line the pre-commit printed. The
 * script shows that one line and keeps the full output for a refused commit.
 */

const ANSI = /\x1b\[[0-9;]*[A-Za-z]/g;

/**
 * Reads the hook's output as it comes, in chunks cut anywhere. `state()` is `{ last }`: the last
 * line that is not blank, without colour codes.
 */
export const createLastLine = () => {
  let partial = "";
  let last = "";
  const read = (line) => {
    const plain = line.replace(ANSI, "").trim();
    if (plain !== "") last = plain;
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
    state: () => ({ last }),
  };
};

/** The status line: `Verifying · <last line>`, or `Verifying` before any line. */
export const formatHookStatus = ({ last }) => (last === "" ? "Verifying" : `Verifying · ${last}`);
