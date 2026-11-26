import { useSetAtom } from "jotai";

import { takeReturnPathAtom } from "./atoms";

/** The page to reopen now that the sign-in is over, if one was held. Asking for it forgets it. */
export const useTakeReturnPath = (): (() => string | undefined) => useSetAtom(takeReturnPathAtom);
