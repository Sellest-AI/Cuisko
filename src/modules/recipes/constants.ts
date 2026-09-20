import { theme } from "theme";

/**
 * What a recipe is drawn under while it has no cover: generation is still running, both renders
 * failed, or the recipe predates generated covers. Every surface that draws a recipe card shares
 * it — the grid, the recipe page, the home shelf, the bar's suggestions — so a recipe does not
 * look like two different dishes on the way from one to the other.
 */
export const COVER_PLACEHOLDER = require("assets/placeholders/recipe-placeholder.webp");

/** The gutter every recipe screen sits in, and that its edge-to-edge rows pad their content by. */
export const SCREEN_PADDING = theme.spacing[16];

/** How far the content pulls up over the parallax header, so its rounded top overlaps the image. */
export const CONTENT_NEGATIVE_SPACE = 24;

/** The gap between the columns of an ingredient grid — the grid itself lays out on the same value. */
export const COLUMN_GAP = theme.spacing[8];

/**
 * How wide one column of an ingredient grid is on a screen this wide.
 *
 * Shared, because two screens draw that grid — the ingredients tab and one cooking step — and a
 * card that changed width between them would read as a different card.
 */
export const columnWidth = (screenWidth: number, columns: number) =>
  ((screenWidth - SCREEN_PADDING * 2 - COLUMN_GAP * (columns - 1)) / columns) - 1;
