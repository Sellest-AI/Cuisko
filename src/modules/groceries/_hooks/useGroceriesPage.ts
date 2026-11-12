import { useGlobalSearchParams, usePathname } from "expo-router";

import { addToFromParam, sectionFromParam } from "../_model/model";

/**
 * Whether the groceries page is the one on screen, and what it was opened for: the section it leads
 * with, and where a food typed on it should go when the opener said so. Both `undefined` anywhere
 * else, and each one on the page when it was not asked for.
 *
 * `isOpen` is returned so callers ask this hook rather than test the pathname themselves: one
 * check, so "the bar adds food here" and "this page's params count" cannot drift apart.
 *
 * Global rather than local params because the reader is the navigation bar, which sits beside the
 * navigator and is not a route itself. The pathname check is exact, so a param another screen might
 * one day carry — a child route under `/groceries` included — is never read as this page's.
 */
export const useGroceriesPage = () => {
  const pathname = usePathname();
  const { section, addTo } = useGlobalSearchParams<{
    section?: string | string[];
    addTo?: string | string[];
  }>();

  if (pathname !== "/groceries") return { isOpen: false, openSection: undefined, addTo: undefined };

  return { isOpen: true, openSection: sectionFromParam(section), addTo: addToFromParam(addTo) };
};
