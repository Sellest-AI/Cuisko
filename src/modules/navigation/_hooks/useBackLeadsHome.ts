import { useNavigationContainerRef, usePathname } from "expo-router";

/**
 * The slice of a React Navigation state this reads: which route is focused, and what each route
 * nests.
 */
type NavigationTree = {
  index?: number;
  routes: readonly { name: string; state?: NavigationTree }[];
};

/**
 * Expo Router wraps the app's own navigator in a route of this name. Not exported by the package
 * (`INTERNAL_SLOT_NAME` in its `constants`), so it is spelled out here.
 */
const ROOT_SLOT = "__root";

/** The route the root layout mounts at `/`. */
const HOME_ROUTE = "index";

/** A nested state can leave `index` out; React Navigation then focuses its last route. */
const _focusedIndex = (state: NavigationTree) => state.index ?? state.routes.length - 1;

/** Whether `back()` would be absorbed by this navigator or one nested in its focused route. */
const _canPop = (state: NavigationTree): boolean => {
  const index = _focusedIndex(state);
  const nested = state.routes[index]?.state;
  return index > 0 || (nested !== undefined && _canPop(nested));
};

/**
 * Whether the bar's back button lands on the home page: the route behind the focused one in the
 * app's root stack is home, or there is nothing behind it and the button dismisses to `/`. The bar
 * then draws a house instead of an arrow, because an arrow reads as "one page back" and a cook it
 * takes home instead is lost.
 *
 * A back that a nested navigator absorbs pops inside that navigator and never reaches home.
 *
 * Read from the container rather than `useRootNavigationState`: that hook climbs from a screen to
 * the `__root` slot, and the bar is not in a screen, it sits beside the navigator. The container
 * ref is not reactive, so `usePathname` is what re-renders this: every navigation that could change
 * the page behind also changes the path.
 */
export const useBackLeadsHome = () => {
  usePathname();
  const container = useNavigationContainerRef();
  const root: NavigationTree | undefined = container.isReady() ? container.getRootState() : undefined;

  if (!root) return true;
  const slot = root.routes[_focusedIndex(root)];
  const stack = slot?.name === ROOT_SLOT ? slot.state : root;
  if (!stack) return true;

  const index = _focusedIndex(stack);
  const nested = stack.routes[index]?.state;
  if (nested && _canPop(nested)) return false;

  return index <= 0 || stack.routes[index - 1]?.name === HOME_ROUTE;
};
