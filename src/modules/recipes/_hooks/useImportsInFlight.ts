import { useAtomValue } from "jotai";
import { useEffect, useState } from "react";

import { importCountdownOf, type ImportCountdown } from "../_model/importCountdown";

import { importsInFlightAtom } from "./atoms";

export type ImportCard = { key: string; url: string; countdown: ImportCountdown };

/**
 * The video imports still running, newest first, each with the time left on its announcement.
 *
 * Drawn in the grid ahead of the cook's recipes, so a reel they shared and closed the sheet on is
 * visibly on its way. An entry leaves the moment its import settles (`useImportSharedLink`): on
 * success the recipe takes its place through the list query; on failure it simply goes, since the
 * reason is the sheet's to tell, and that sheet may be long closed. Except a `lost` import, whose
 * connection dropped (the cook left the app): its card stays until the announced minutes are up,
 * so a recipe the server finished meanwhile can sit beside it until then.
 *
 * The clock ticks once a second, and only while something is importing. Between a share and the
 * next tick it can be older than the import itself, so it is read no earlier than the start.
 *
 * @limitation Memory only, like the atom: after a restart the cards are gone while the server keeps
 * importing, and the recipe still lands in the grid when it is done.
 */
export const useImportsInFlight = (): ImportCard[] => {
  const inFlight = useAtomValue(importsInFlightAtom);
  const [now, setNow] = useState(Date.now);

  const isImporting = inFlight.size > 0;
  useEffect(() => {
    if (!isImporting) return;

    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [isImporting]);

  return [...inFlight]
    .sort(([, a], [, b]) => b.startedAt - a.startedAt)
    .map(([key, { url, startedAt }]) => ({ key, url, countdown: importCountdownOf(startedAt, Math.max(now, startedAt)) }));
};
