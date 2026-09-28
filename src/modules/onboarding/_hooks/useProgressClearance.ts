import { useSafeAreaInsets } from "@ui/safe-area-view";
import { theme } from "theme";

/** Above the progress, and below it before the page's first line. */
export const PROGRESS_MARGIN = theme.spacing[16];
/** `StepProgress`'s track. */
const PROGRESS_HEIGHT = 5;

/**
 * How far down a step's page starts so its first line clears the progress, which floats over the
 * page rather than taking a band of it: the page scrolls up under it, and a step that wants to fill
 * the screen (the cooking session's photo) simply leaves this out.
 */
export const useProgressClearance = () => useSafeAreaInsets().top + PROGRESS_MARGIN * 2 + PROGRESS_HEIGHT;
