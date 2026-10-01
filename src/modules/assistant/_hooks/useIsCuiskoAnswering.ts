import { useAtomValue } from "jotai";

import { isAnsweringAtom } from "./atoms";

/**
 * Whether Cuisko is on a turn — thinking about a question, or still writing its answer.
 *
 * For the navigation bar, which reopens the microphone once a spoken question has been answered.
 * Always `false` while the assistant screen is not mounted: it is the screen that works the turn out.
 */
export const useIsCuiskoAnswering = () => useAtomValue(isAnsweringAtom);
