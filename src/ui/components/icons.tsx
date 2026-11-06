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

export type { LucideIcon as IconComponent } from "lucide-react-native";

export {
  ArrowRight, LoaderCircle, Check, CircleDashed, ChevronDown, ChevronUp, ArrowLeftRight,
  CalendarPlus, Camera, Mic, ForkKnife, Plus, ListPlus, Store, X, ArrowLeft, Sparkles, Minus,
  CircleAlert, CircleCheck, Ellipsis, EllipsisVertical, SlidersHorizontal, Search, Trash2, Heart,
  Share2, FileText, ListOrdered, Play, Pause, SkipBack, SkipForward, DatabaseX, Image, Lightbulb,
  Pencil, Globe, Lock, LogOut, HousePlus, House, ShoppingCart, SendHorizontal, ChefHat,
  ShoppingBasket, Undo2, Book, Mail, WifiOff, Clipboard
} from "lucide";
export {
  ArrowRight as ArrowRightIcon, Check as CheckIcon,
  CircleDashed as CircleDashedIcon, ArrowLeftRight as ArrowLeftRightIcon, CalendarPlusIcon,
  Eye as EyeIcon, Star as StarIcon, ForkKnife as ForkKnifeIcon, Plus as PlusIcon,
  Store as StoreIcon, ReceiptText as ReceiptTextIcon, Sparkles as SparklesIcon, Sun as SunIcon,
  Moon as MoonIcon, Calendar as CalendarIcon, CircleAlert as CircleAlertIcon,
  CircleCheck as CircleCheckIcon, CircleMinus as CircleMinusIcon, ThumbsUp as ThumbsUpIcon,
  Smile as SmileIcon, Heart as HeartIcon, Share2 as Share2Icon, SquarePen as SquarePenIcon,
  Image as ImageIcon, ShoppingCartIcon, ClockAlertIcon, SendHorizontalIcon, LockIcon, FlameIcon,
  BugOffIcon, ExternalLinkIcon
} from "lucide-react-native";

export { GoogleLogo, AppleLogo, InstagramTile, TikTokTile, WebTile } from "./icons.logos";

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
