import type { ComponentProps } from "react";

import type { Badge } from "@ui/badge";
import {
  CheckIcon,
  CircleAlertIcon,
  CircleDashedIcon,
  CircleMinusIcon,
  ThumbsUpIcon,
  type IconComponent,
} from "@ui/icons";

import type { MealStatus } from "../_model/model";

/**
 * How each state of a plate is drawn: the icon beside it, the key that names it, and the pill it
 * sits in.
 *
 * A `Record` rather than a ternary chain so the compiler names the state nobody handled — every
 * `MealStatus` has to appear here, including `empty`, which a fallthrough silently mislabelled.
 *
 * Shared rather than owned by the list row, because the swap sheet draws the same three states on
 * its tiles: a second table would be free to disagree about what "shopping-needed" looks like.
 * Not in `_model/` — that folder holds no icon and imports no component.
 */
export const MEAL_STATUS = {
  cooked: { icon: CheckIcon, key: "Status.cooked", badge: "subtle" },
  /** Neutral on purpose: a plate nobody cooked is a fact of the week, never a miss (PRODUCT.md, anti-goal 4). */
  skipped: { icon: CircleMinusIcon, key: "Status.skipped", badge: "neutral" },
  ready: { icon: ThumbsUpIcon, key: "Status.ready", badge: "success" },
  "shopping-needed": { icon: CircleAlertIcon, key: "Status.shopping_needed", badge: "warning" },
  empty: { icon: CircleDashedIcon, key: "Status.empty", badge: "neutral" },
} as const satisfies Record<
  MealStatus,
  { icon: IconComponent; key: string; badge: ComponentProps<typeof Badge>["variant"] }
>;
