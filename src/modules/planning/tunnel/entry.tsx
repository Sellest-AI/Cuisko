import { useSetAtom } from "jotai";
import { router } from "expo-router";
import { useEffect } from "react";

import { resetTunnelAtom } from "../_hooks/atoms";
import { routeFor, TUNNEL_STEPS } from "./_hooks/useTunnel";

/**
 * The tunnel's one way in: `/planning/new`, which starts a run and hands over to the first step.
 *
 * Every link into the tunnel points here rather than at a step, so reordering `TUNNEL_STEPS` is an
 * edit to that list alone — the first step used to be spelled out in seven files across four
 * modules, and moving it meant finding every one of them.
 *
 * The reset lives here for the same reason. It used to sit on whichever screen happened to be
 * first, which a reorder silently broke: left on a later step, it wiped the answers given before
 * it. Entering the tunnel is what starts a run, so that is where the last run's leftovers go — the
 * atoms outlive the tunnel, and a second run would otherwise open on the previous week's meals.
 *
 * `replace`, not `push`: this route has nothing to show, so going back from the first step leaves
 * the tunnel rather than landing here and being bounced forward again.
 */
export const TunnelEntry = () => {
  const resetTunnel = useSetAtom(resetTunnelAtom);

  useEffect(() => {
    resetTunnel();
    router.replace(routeFor(TUNNEL_STEPS[0]));
  }, [resetTunnel]);

  return null;
};
