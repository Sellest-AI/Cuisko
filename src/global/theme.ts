/**
 * Design tokens. The single source for colour, spacing and type.
 *
 * Imported as `theme` (a tsconfig path), and reachable from `src/ui/**` — it is one of the few
 * things that layer may import, because it carries no domain and no data access (ADR 0002).
 *
 * Two tiers, and the split is the point:
 *
 * 1. `PALETTE` — raw hues. **Not exported.** A component cannot reach a colour that has no
 *    semantic name; the fix for a missing shade is to name a role here, never to widen the export.
 * 2. `theme.colors` — roles. Colours only: no widths, no radii. Component recipes ("a primary
 *    button is primary.base + primary.foreground") live in the component, so this file never has
 *    to know what a button is.
 *
 * Brand and feedback are separate names even where they share a hue today. `primary` is orange,
 * `secondary` is green — and green is *also* how the app signals success, so `success` aliases
 * `secondary`. Two names, one source: the day success stops being brand-green, that alias becomes
 * its own triple and nothing else moves.
 *
 * A dark scheme is a second object of this exact shape swapped in at tier 2 — no component
 * changes. That is the whole reason primitives stay private.
 */

// ── Tier 1: primitives ───────────────────────────────────────────────────────────────────────

const PALETTE = {
  white: "#FFFFFF",
  black: "#000000",
  neutral: {
    0: "#FFFCFA",
    100: "#FAF2ED",
    200: "#EDE0D5",
    500: "#9C8A7C",
    900: "#1C0E03",
  },
  primary: {
    50: "#FFFFFF",
    100: "#FFD0B3",
    300: "#FF9C5E",
    500: "#FF6B0F",
  },
  secondary: {
    50: "#F7FFF9",
    100: "#BAE8BB",
    300: "#70CF71",
    500: "#37A637",
  },
  danger: {
    100: "#FFCFCF",
    300: "#FF7D7D",
    500: "#DE0D0D",
  },
} as const;

/** Translucent tokens are derived, not retyped — so restyling a hue carries its glass surfaces. */
const _withAlpha = (hex: `#${string}`, alpha: number) => {
  const int = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(int >> 16) & 255}, ${(int >> 8) & 255}, ${int & 255}, ${alpha})`;
};

// ── Tier 2: semantic roles ───────────────────────────────────────────────────────────────────

/**
 * A tone is a hue with everything needed to render on it: `base` for the filled surface,
 * `subtle` for the tinted variant, `foreground` for whatever sits on top of `base`.
 */
const TONES = {
  primary: {
    base: PALETTE.primary[500],
    elevated: PALETTE.primary[300],
    subtle: PALETTE.primary[100],
    foreground: PALETTE.primary[50],
  },
  secondary: {
    base: PALETTE.secondary[500],
    elevated: PALETTE.secondary[300],
    subtle: PALETTE.secondary[100],
    foreground: PALETTE.secondary[50],
  },
  danger: {
    base: PALETTE.danger[500],
    elevated: PALETTE.danger[300],
    subtle: PALETTE.danger[100],
    foreground: PALETTE.white,
  },
  /** The dark chrome tone — circular back buttons and anything else filled with neutral. */
  neutral: {
    base: PALETTE.neutral[900],
    muted: PALETTE.neutral[500],
    elevated: PALETTE.neutral[200],
    subtle: PALETTE.neutral[100],
    foreground: PALETTE.neutral[0],
  },
} as const;

const Texts = {
  h4: {
    fontSize: 20,
    lineHeight: 22,
    letterSpacing: -0.4,
    fontWeight: 600,
  },
  lg: {
    fontSize: 16,
    lineHeight: 19.2,
    letterSpacing: -0.32,
    fontWeight: 600
  },
  base: {
    fontSize: 15,
    lineHeight: 16.8,
    letterSpacing: -0.28,
    fontWeight: 400
  },
  sm: {
    fontSize: 11,
    lineHeight: 13.2,
    letterSpacing: -0.22,
    fontWeight: 500
  }
} as const;

export const theme = {
  colors: {
    white: PALETTE.white,
    black: PALETTE.black,
    background: PALETTE.neutral[0],
    foreground: PALETTE.neutral[900],
    /** Secondary ink: labels, captions, placeholders. */
    muted: PALETTE.neutral[500],

    ...TONES,
    /** Green carries both jobs today. Split this into its own tone the day it stops. */
    success: TONES.secondary,

    surface: {
      /** Frosted card sitting above the page. */
      elevated: _withAlpha(PALETTE.neutral[0], 0.7),
      elevatedSubtle: _withAlpha(PALETTE.neutral[0], 0.3),
      input: PALETTE.neutral[100],
    },
    border: {
      /** Hairline on translucent surfaces; reads as a highlight, not a line. */
      default: _withAlpha(PALETTE.white, 0.22),
      medium: _withAlpha(PALETTE.neutral[200], 0.14),
    },
  },
  spacing: { "2xs": 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24 },
  radius: { xs: 6, md: 20, lg: 24, full: 999 },
  font: Texts,
} as const;

export type Theme = typeof theme;

export const colors = theme.colors;
