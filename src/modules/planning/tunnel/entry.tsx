import { useSetAtom } from "jotai";
import { useLayoutEffect, type ComponentType } from "react";

import { resetTunnelAtom } from "../_hooks/atoms";
import { TUNNEL_STEPS, type TunnelStep } from "./_hooks/useTunnel";
import { TunnelAllergies } from "./allergies";
import { TunnelDiet } from "./diet";
import { TunnelFocus } from "./focus";
import { TunnelGenerating } from "./generating";
import { TunnelGroceries } from "./groceries";
import { TunnelMood } from "./mood";
import { TunnelReview } from "./review";
import { TunnelTime } from "./time";
import { TunnelUtensils } from "./utensils";
import { TunnelWeek } from "./week";

/**
 * Every step's screen, keyed by the step so a new one cannot join `TUNNEL_STEPS` without saying
 * what the root draws when it comes first.
 */
const _SCREENS: Record<TunnelStep, ComponentType> = {
  time: TunnelTime,
  week: TunnelWeek,
  diet: TunnelDiet,
  allergies: TunnelAllergies,
  mood: TunnelMood,
  focus: TunnelFocus,
  utensils: TunnelUtensils,
  generating: TunnelGenerating,
  review: TunnelReview,
  groceries: TunnelGroceries,
};

/** Never empty: the list is a constant, and the tunnel has no way in without a first step. */
const FirstStep = _SCREENS[TUNNEL_STEPS[0]!];

/**
 * The tunnel's one way in: `/planning/new`, which starts a run and draws the first step in place.
 *
 * Every link into the tunnel points here rather than at a step, so reordering `TUNNEL_STEPS` is an
 * edit to that list alone — the first step used to be spelled out in seven files across four
 * modules, and moving it meant finding every one of them. `routeFor` sends the first step back
 * here, so `useTunnel` reads this path as step one.
 *
 * Drawn here rather than redirected to: this route used to render nothing and `replace` to the
 * first step, and the stack animates a replace, so every entry slid an empty screen away.
 *
 * The reset lives here for the same reason it always has. It used to sit on whichever screen
 * happened to be first, which a reorder silently broke: left on a later step, it wiped the answers
 * given before it. Entering the tunnel is what starts a run, so that is where the last run's
 * leftovers go — the atoms outlive the tunnel, and a second run would otherwise open on the
 * previous week's meals.
 *
 * A layout effect, not a passive one: the step is drawn in the same commit now, and a passive
 * reset would land after the first paint, showing the last run's answers for a frame.
 */
export const TunnelEntry = () => {
  const resetTunnel = useSetAtom(resetTunnelAtom);

  useLayoutEffect(() => {
    resetTunnel();
  }, [resetTunnel]);

  return <FirstStep />;
};
