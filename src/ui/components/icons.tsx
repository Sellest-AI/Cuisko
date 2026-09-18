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
  CalendarPlus, Eye, Star, Bell, Camera, Mic, ForkKnife, Plus, ListPlus, Store, ReceiptText,
  BadgePercent, X, ArrowLeft, Sparkles, Sun, Moon, Minus, Calendar, CircleAlert, CircleCheck,
  ThumbsUp, EllipsisVertical, SlidersHorizontal, Smile, Search, Trash2, MessageCircleWarning, Heart, Share2, SquarePen,
  FileText, ListOrdered, Play, Pause, SkipBack, SkipForward, Info, DatabaseX, Image, Lightbulb, Pencil, Globe, Lock
} from "lucide";
export {
  ArrowRight as ArrowRightIcon, Check as CheckIcon, CircleDashed as CircleDashedIcon,
  ArrowLeftRight as ArrowLeftRightIcon, CalendarPlus as CalendarPlusIcon, Eye as EyeIcon,
  Star as StarIcon, Bell as BellIcon, Camera as CameraIcon, Mic as MicIcon, ForkKnife as ForkKnifeIcon,
  Plus as PlusIcon, ListPlus as ListPlusIcon, Store as StoreIcon, ReceiptText as ReceiptTextIcon,
  BadgePercent as BadgePercentIcon, X as XIcon, ArrowLeft as ArrowLeftIcon, Sparkles as SparklesIcon,
  Sun as SunIcon, Moon as MoonIcon, Minus as MinusIcon, Calendar as CalendarIcon,
  CircleAlert as CircleAlertIcon, CircleCheck as CircleCheckIcon, ThumbsUp as ThumbsUpIcon,
  EllipsisVertical as EllipsisVerticalIcon, SlidersHorizontal as SlidersHorizontalIcon,
  Smile as SmileIcon, Search as SearchIcon, Trash2 as Trash2Icon, MessageCircleWarning as MessageCircleWarningIcon,
  Heart as HeartIcon, Share2 as Share2Icon, SquarePen as SquarePenIcon, FileText as FileTextIcon, ListOrdered as ListOrderedIcon,
  Play as PlayIcon, Pause as PauseIcon, SkipBack as SkipBackIcon, SkipForward as SkipForwardIcon,
  DatabaseX as DatabaseXIcon, Info as InfoIcon, Image as ImageIcon, LightbulbIcon, PencilIcon, GlobeIcon
} from "lucide-react-native";

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
