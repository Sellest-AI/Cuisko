/**
 * Design tokens. The single source for colour and spacing.
 *
 * Imported as `theme` (a tsconfig path), and reachable from `src/ui/**` — it is one of the few
 * things that layer may import, because it carries no domain and no data access (ADR 0002).
 */
export const theme = {
  colors: {
    background: "#faf7f2",
    surface: "#ffffff",
    text: "#1c1a17",
    textMuted: "#6b6560",
    border: "#e5ded4",
    primary: "#c2410c",
    primaryText: "#ffffff",
    danger: "#b91c1c",
  },
  spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 },
  radius: { sm: 6, md: 10, lg: 16 },
  font: { sm: 13, md: 15, lg: 20, xl: 28 },
} as const;

export type Theme = typeof theme;
