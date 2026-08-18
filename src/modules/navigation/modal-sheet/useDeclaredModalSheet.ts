import { useSetAtom } from "jotai";
import { useEffect } from "react";

import { sheetSizeAtom } from "./state";

/** For a screen whose content is taller than any sheet: it names the fraction it wants outright. */
export const useDeclaredModalSheet = (ratio: number) => {
  const setSize = useSetAtom(sheetSizeAtom);

  useEffect(() => {
    setSize({ kind: "declared", ratio });

    return () => setSize(null);
  }, [ratio, setSize]);
};
