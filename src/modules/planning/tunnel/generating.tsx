import { useAtom } from "jotai";
import { useEffect, useRef, useState } from "react";

import cuiskoCooking from "assets/videos/cuisko-cooking";
import { LoadingScreen } from "@ui/loading-screen";
import { useTranslations } from "translations";

import { shuffleSeedAtom } from "../_hooks/atoms";
import { usePlanDraft } from "../_hooks/usePlanDraft";
import { useTunnel } from "./_hooks/useTunnel";

/** The jokes that roll by while the week is drafted, in order. */
const STEPS = [
  "Tunnel.Generating.step_cellar",
  "Tunnel.Generating.step_cheese",
  "Tunnel.Generating.step_leftovers",
  "Tunnel.Generating.step_vegetables",
  "Tunnel.Generating.step_dates",
  "Tunnel.Generating.step_pasta",
  "Tunnel.Generating.step_tasting",
  "Tunnel.Generating.step_plating",
] as const;

/** One pass through the jokes. */
const PASS_MS = 12_000;

/** The shortest the screen stays up, however fast the draft comes back. */
const MIN_WAIT_MS = 6_000;

/** How long the full bar is held before the tunnel moves on. Long enough to watch it get there. */
const FINISH_MS = 800;

/**
 * The wait while the week is drafted.
 *
 * The query reports no progress, so the steps on screen are theatre and loop until the week lands.
 * The screen still holds for {@link MIN_WAIT_MS} when the draft comes back sooner, so a fast answer
 * reads as a week put together rather than a screen that flashed past.
 */
export const TunnelGenerating = () => {
  const t = useTranslations("Planning");
  const { next, setMeals, commitPreferences } = useTunnel();
  const [hasWaited, setHasWaited] = useState(false);

  /**
   * Rolled once per run, so the reactive draft cannot reshuffle itself — see `usePlanDraft`.
   *
   * In an atom as well as in state, because the two answer different questions. The roll is this
   * mount's and the draft uses it from the first frame; the atom is where `commit` reads it from two
   * screens later, so the plan can record which shuffle produced this week. Published in an effect
   * rather than during render — writing a shared atom mid-render updates the other components
   * subscribed to it while React is still rendering this one.
   *
   * Read back rather than only written, so any remount inside the same run regenerates the week it
   * already showed instead of drawing a new one. Coming back off the review step is no longer one
   * of those — `next` leaves here with `replace`, so this screen is off the stack — but the seed
   * outlives the mount either way, and a seed that is only written is a seed the next mount ignores.
   * `resetTunnelAtom` empties it, which is what makes the NEXT run a different week.
   */
  const [storedSeed, setSeed] = useAtom(shuffleSeedAtom);
  const [rolled] = useState(Math.random);
  const seed = storedSeed ?? rolled;

  useEffect(() => {
    if (storedSeed === null) setSeed(rolled);
  }, [storedSeed, rolled, setSeed]);

  const { meals, isGenerating } = usePlanDraft({ seed });
  const isDone = hasWaited && !isGenerating;

  useEffect(() => {
    const timer = setTimeout(() => setHasWaited(true), MIN_WAIT_MS);

    return () => clearTimeout(timer);
  }, []);

  /**
   * Everything the finished wait triggers, behind a ref so that only the wait can trigger it.
   *
   * `commitPreferences` closes over the planning seed, and the two writes it makes invalidate the very
   * query that seed is read from — so an effect depending on it directly re-runs the moment its own
   * round trip lands. That regenerates the week under a user already looking at it, and re-arms the
   * advance below: by then `next` reads a `stepRef` pointing at review, and the tunnel walks itself
   * one screen further. Same failure `stepRef` exists to stop (see `useTunnel`), reached through the
   * dependency array instead of through `next`.
   *
   * A ref rather than a `useCallback` with fewer deps: the effect wants the freshest values, it just
   * must never treat their arrival as a reason to run twice.
   */
  const finish = useRef(() => { });

  useEffect(() => {
    finish.current = () => {
      setMeals(meals);

      /**
       * Where the run leaves something behind: the caller's own constraints and the household's
       * kitchen and plan defaults, written once, here, rather than per step — a tunnel abandoned
       * halfway has asserted nothing.
       *
       * **It moves inside `commit` when that exists**, which is one round trip and atomic with the
       * plan. The draft does not read these rows — the run's constraints go up as arguments — so
       * writing them here cannot re-run the query that produced the week.
       */
      commitPreferences();
    };
  }, [setMeals, meals, commitPreferences]);

  /**
   * Runs exactly once, when the wait is served and the week has landed: `isDone` only turns true
   * once (the flag never resets, and a draft that has arrived never goes back to pending) and `next`
   * is referentially stable by construction.
   */
  useEffect(() => {
    if (!isDone) return;

    finish.current();

    /** A beat on the full bar, so the week is seen landing rather than skipped past. */
    const timer = setTimeout(next, FINISH_MS);

    return () => clearTimeout(timer);
  }, [isDone, next]);

  return (
    <LoadingScreen
      animation={cuiskoCooking}
      steps={STEPS.map((key) => t(key))}
      durationMs={PASS_MS}
      footer={t("Tunnel.Generating.footer")}
      // The tunnel chrome paints the ground, and animates it between steps.
      showBackground={false}
      fadeInOut
      finished={isDone}
    />
  );
};
