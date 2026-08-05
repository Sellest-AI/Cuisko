import { LoaderCircle } from "lucide";
import { MorphIcon, type MorphIconProps } from "morphicons/react-native";
import Animated from "react-native-reanimated";
import { useSpin } from "@ui/hooks/useSpin";

/**
 * Icons are DATA here, not components.
 *
 * morphicons interpolates between two `[tag, attrs]` path lists, so every icon it renders has
 * to arrive as `IconInput` — a lucide-style node, or a raw `d` string. The vanilla `lucide`
 * package exports exactly that shape; `lucide-react` (DOM) and `lucide-react-native` export
 * components instead, and are not interchangeable here.
 *
 * Component-only packs such as phosphor cannot be used at all, and not merely because the
 * export is a function: phosphor draws filled silhouettes on a 256×256 grid, while MorphIcon
 * renders `fill="none" stroke={color}` into a fixed `0 0 24 24` viewBox. Two icons can only
 * morph into one another if they are stroke-based and share a coordinate space.
 */
export type { IconInput as Icon } from "morphicons/react-native";

export { ArrowRight, LoaderCircle } from "lucide";
export { ArrowRight as ArrowRightIcon } from "lucide-react-native";

/** The renderer, re-exported so nothing outside this file has to know about morphicons. */
export { MorphIcon } from "morphicons/react-native";

/**
 * Standalone spinner, for the places that are not a button.
 *
 * Inside a button, prefer handing `LoaderCircle` to that button's own `MorphIcon`: the icon
 * then *morphs* into the ring rather than being swapped out, and the spin is this same hook.
 */
export const Loader = (props: Omit<MorphIconProps, "icon" | "from" | "to">) => {
  const style = useSpin(true);

  return (
    <Animated.View style={style}>
      <MorphIcon {...props} icon={LoaderCircle} />
    </Animated.View>
  );
};
