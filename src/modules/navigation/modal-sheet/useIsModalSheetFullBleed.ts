import { useAtomValue } from "jotai";

import { sheetSizeAtom } from "./state";

/**
 * Whether the open modal starts at the sheet's top edge (`useMeasuredModalSheet`'s `isFullBleed`):
 * the layout then draws no grabber, no top border and no fade.
 *
 * Read from the screen's own declaration rather than from the path, so it holds while the sheet
 * animates out: the path has moved on by then, and the frame would change shape mid-dismiss.
 */
export const useIsModalSheetFullBleed = (): boolean => {
  const size = useAtomValue(sheetSizeAtom);
  return size?.kind === "measured" && size.isFullBleed;
};
