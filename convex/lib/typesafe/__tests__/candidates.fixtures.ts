import { MODEL } from "../ask";

/**
 * The System One models every TypeSafe manual test asks side by side, the pinned one first.
 *
 * Trying a model is one line here and one `pnpm test:manual` run: each manual test runs once per
 * model, passing or failing on its own, then prints `ranking` below. Moving `MODEL` in `ask.ts` is
 * still a deliberate change made after reading that table. A model OpenRouter cannot serve on
 * `/systemone` fails its own test and ranks last as failed.
 */
export const CANDIDATES: readonly string[] = [
  MODEL,
  // "typesafe/jev-1.13",
  "baseten/mammoth-1:free",
  // "liquid/d1-ultra",
  // "respan/span-02",
];

/** One model's run of one manual test. */
export type Scored = {
  model: string;
  /** Fixture titles it got right, against all of them. */
  right: number;
  total: number;
  /** The probability of each right link, and the most any wrong option drew per fixture. */
  rightLinks: number[];
  wrong: number[];
  /** What it got wrong, as the test words it (`egg → none`). */
  misses: string[];
  /** Why the model answered nothing, when it did not. */
  failed?: string;
};

const _range = (values: number[]) =>
  values.length === 0
    ? "-"
    : `${Math.min(...values).toFixed(2)}–${Math.max(...values).toFixed(2)}`;

/**
 * The gap between the least sure right link and the most probable wrong option. A floor is
 * defensible only inside it, so a wide gap is what lets a model change without moving the floor.
 */
const _gap = ({ rightLinks, wrong }: Scored) =>
  rightLinks.length ? Math.min(...rightLinks) - Math.max(0, ...wrong) : -1;

/**
 * Models ranked by fixtures right, then by gap: no model gets every fixture, so the count leads,
 * and between two equal counts the one whose floor has more room wins.
 */
export const ranking = (scores: Scored[]) =>
  [...scores]
    .sort((a, b) => (a.failed ? 1 : 0) - (b.failed ? 1 : 0) || b.right - a.right || _gap(b) - _gap(a))
    .map((score, index) =>
      score.failed
        ? `  -  ${score.model.padEnd(28)} failed: ${score.failed.split("\n")[0]?.slice(0, 80)}`
        : `  ${index + 1}  ${score.model.padEnd(28)} ${`${score.right}/${score.total}`.padEnd(6)} ` +
        `right ${_range(score.rightLinks).padEnd(10)} wrong ${_range(score.wrong).padEnd(10)} ` +
        `gap ${_gap(score).toFixed(2).padEnd(6)}` +
        (score.misses.length ? ` missed ${score.misses.join(", ")}` : ""),
    )
    .join("\n");
