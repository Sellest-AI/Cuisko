import { useAtomValue } from "jotai";

import { useNow } from "@ui/hooks/useNow";

import { importCountdownOf, type ImportCountdown } from "../_model/importCountdown";

import { importsInFlightAtom } from "./atoms";

export type ImportCard = { key: string; url: string; countdown: ImportCountdown };

/**
 * The imports still running, newest first, each with the time left on its announcement: a reel's
 * minutes, or the 30 s of a web page added from the chat.
 *
 * Drawn in the grid ahead of the cook's recipes, so a reel they shared and closed the sheet on is
 * visibly on its way. An entry leaves the moment its import settles (`startImport`): on success the
 * recipe takes its place through the list query; on failure it simply goes, since the reason is the
 * sheet's or the chat card's to tell, and either may be long closed. Except a `lost` import, whose
 * connection dropped (the cook left the app): its card stays until its time is up, so a recipe the
 * server finished meanwhile can sit beside it until then.
 *
 * The clock ticks once a second, and only while something is importing. Between a start and the
 * next tick it can be older than the import itself, so it is read no earlier than the start.
 *
 * @limitation Memory only, like the atom: after a restart the cards are gone while the server keeps
 * importing, and the recipe still lands in the grid when it is done.
 */
export const useImportsInFlight = (): ImportCard[] => {
  const inFlight = useAtomValue(importsInFlightAtom);
  const now = useNow(inFlight.size > 0);

  return [...inFlight]
    .sort(([, a], [, b]) => b.startedAt - a.startedAt)
    .map(([key, { url, startedAt, expectedMs }]) => ({
      key,
      url,
      countdown: importCountdownOf(startedAt, Math.max(now, startedAt), expectedMs),
    }));
};
