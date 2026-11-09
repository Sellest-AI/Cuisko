/**
 * The dream's steps as the owner sees them (spec §9.1 U5). An agent step runs for minutes with
 * nothing printed, which reads as a hang: the running step stays on the status line, with the
 * agents it has finished out of the ones it starts, and a step that ends is printed once, `✓` with
 * its duration, or `✗` when it failed.
 *
 * `status` is the terminal's status line (`null` clears it), `out` prints a line, `clock` gives
 * milliseconds.
 */

const _seconds = (ms) => `${Math.round(ms / 1000)}s`;

export const createSteps = ({ status = () => {}, out, clock = Date.now }) => {
  let current = null;
  const show = () => status(current.total > 1 ? `${current.message} · ${current.done}/${current.total}` : current.message);
  const close = (mark) => {
    if (current === null) return;
    status(null);
    out(`${mark} ${current.message} (${_seconds(clock() - current.start)})`);
    current = null;
  };
  return {
    /** Ends the running step, if any, and starts `message`, which runs `total` agents. */
    step: (message, total = 1) => {
      close("✓");
      current = { message, total, done: 0, start: clock() };
      show();
    },
    /** One agent of the running step finished. */
    finished: () => {
      if (current === null) return;
      current.done += 1;
      show();
    },
    /** The running step succeeded. */
    end: () => close("✓"),
    /** The running step failed. */
    fail: () => close("✗"),
  };
};
