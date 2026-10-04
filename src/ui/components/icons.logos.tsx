import Svg, { Circle, Defs, G, LinearGradient, Path, RadialGradient, Rect, Stop } from "react-native-svg";

import { theme } from "theme";

/**
 * Third-party brand marks, drawn as filled SVG.
 *
 * These cannot live in `icons.tsx`, and not by preference: that file exports morphicons
 * `IconInput` — stroke path data rendered `fill="none"` into a fixed `0 0 24 24` box. A brand mark
 * is a filled silhouette, so passed through that pipeline it would draw as a hairline outline.
 *
 * The marks are monochrome on purpose, tinted by `color`; the app tiles further down are not.
 * Paths are Simple Icons (CC0) on a 24-unit grid.
 */
export type BrandLogoProps = { size?: number; color?: string };

const DEFAULT_SIZE = 20;

const GOOGLE_PATH =
  "M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 " +
  "0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 " +
  "16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 " +
  "2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z";

const APPLE_PATH =
  "M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 " +
  "9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 " +
  "2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013" +
  "-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156" +
  "-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 " +
  "1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701";

const Mark = ({ d, size = DEFAULT_SIZE, color = theme.colors.foreground }: BrandLogoProps & { d: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d={d} fill={color} />
  </Svg>
);

export const GoogleLogo = (props: BrandLogoProps) => <Mark d={GOOGLE_PATH} {...props} />;
export const AppleLogo = (props: BrandLogoProps) => <Mark d={APPLE_PATH} {...props} />;

/**
 * App tiles: a brand's own colours on its rounded square, the way a share sheet shows where a link
 * came from. Unlike the marks above they are NOT tinted, because a tile in the wrong colour is no
 * longer recognisable as the app it stands for.
 *
 * Drawn on a 24-unit grid with the iOS-ish corner (≈22% of the side). The TikTok note is Simple
 * Icons (CC0), drawn three times (cyan, red, white) for the brand's offset glitch; the Instagram
 * camera and the globe are primitives.
 */
export type BrandTileProps = { size?: number };

const TILE_RADIUS = 5.4;

const TIKTOK_PATH =
  "M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03" +
  "c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79" +
  "-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71" +
  "-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96" +
  "-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82" +
  " 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01" +
  "-8.05.02-12.07z";

export const InstagramTile = ({ size = 48 }: BrandTileProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Defs>
      <RadialGradient id="instagram" cx="0.25" cy="1.05" r="1.25">
        <Stop offset="0" stopColor="#FFD45C" />
        <Stop offset="0.25" stopColor="#FF8A3D" />
        <Stop offset="0.5" stopColor="#F5426C" />
        <Stop offset="0.75" stopColor="#C837AB" />
        <Stop offset="1" stopColor="#6A4BE0" />
      </RadialGradient>
    </Defs>
    <Rect width={24} height={24} rx={TILE_RADIUS} fill="url(#instagram)" />
    <Rect x={5.5} y={5.5} width={13} height={13} rx={3.8} fill="none" stroke="#FFFFFF" strokeWidth={1.6} />
    <Circle cx={12} cy={12} r={3.1} fill="none" stroke="#FFFFFF" strokeWidth={1.6} />
    <Circle cx={15.9} cy={8.1} r={0.95} fill="#FFFFFF" />
  </Svg>
);

export const TikTokTile = ({ size = 48 }: BrandTileProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Rect width={24} height={24} rx={TILE_RADIUS} fill="#000000" />
    <G transform="translate(5.6 5.4) scale(0.54)">
      <Path d={TIKTOK_PATH} fill="#25F4EE" transform="translate(-0.9 -0.6)" />
      <Path d={TIKTOK_PATH} fill="#FE2C55" transform="translate(0.9 0.6)" />
      <Path d={TIKTOK_PATH} fill="#FFFFFF" />
    </G>
  </Svg>
);

export const WebTile = ({ size = 48 }: BrandTileProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Defs>
      <LinearGradient id="web" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor="#1EC8F5" />
        <Stop offset="1" stopColor="#0A7CDB" />
      </LinearGradient>
    </Defs>
    <Rect width={24} height={24} rx={TILE_RADIUS} fill="url(#web)" />
    <G fill="none" stroke="#FFFFFF" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={12} cy={12} r={6.5} />
      <Path d="M12 5.5a9.4 9.4 0 0 0 0 13 9.4 9.4 0 0 0 0-13" />
      <Path d="M5.5 12h13" />
    </G>
  </Svg>
);
