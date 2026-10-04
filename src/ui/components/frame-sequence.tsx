import { type ImageContentFit } from "expo-image";
import { useEffect, useMemo, useRef, useState } from "react";
import { type ImageStyle, type StyleProp } from "react-native";

import { Image } from "@ui/image";

/**
 * The shape `scripts/videos/bundle-frames.ts` generates into `assets/videos/<name>/index.ts`.
 * A source is `number | string` for the reason assets/images.d.ts gives.
 */
export type Sequence = {
  fps: number;
  /** Ticks in one loop, at `fps`. */
  length: number;
  /** Width over height of every frame. Applied by default, so a caller sets one side and gets the other. */
  aspectRatio: number;
  /** Each image and the ticks it holds, `from` to `to` inclusive. A still stretch is one image. */
  frames: readonly { source: number | string; from: number; to: number }[];
};

type Props = {
  /** A generated sequence, imported by the caller: `import cooking from "assets/videos/cuisko-cooking"`. */
  sequence: Sequence;
  /** Paused holds the current frame. */
  playing?: boolean;
  /** Plays once and holds the last frame when false. */
  loop?: boolean;
  /**
   * Shows fewer frames than the sequence holds, at the same speed: 12 on a 24 fps sequence shows
   * every other tick, and a loop still lasts as long. Capped at the sequence's own rate.
   */
  fps?: number;
  contentFit?: ImageContentFit;
  style?: StyleProp<ImageStyle>;
};

/**
 * Plays a numbered run of transparent frames, the way a video would but with real alpha on every
 * platform, which a video with an alpha channel does not have.
 *
 * The frame shown comes from the clock, not from a counter: a slow device skips frames rather than
 * slowing the animation down, so a ten-second loop lasts ten seconds everywhere.
 */
export const FrameSequence = ({ sequence, playing = true, loop = true, fps, contentFit = "contain", style }: Props) => {
  const { length: count, frames } = sequence;
  const displayFps = Math.min(fps ?? sequence.fps, sequence.fps);
  /** Tick to image, so the clock looks a frame up instead of searching the ranges 24 times a second. */
  const sources = useMemo(
    () => frames.flatMap(({ source, from, to }) => Array.from({ length: to - from + 1 }, () => source)),
    [frames],
  );
  const [index, setIndex] = useState(0);
  /** Written by the clock, read when play resumes, so a pause picks up where it stopped instead of at 0. */
  const indexRef = useRef(0);

  useEffect(() => {
    if (!playing || count < 2) return;

    const tickMs = 1000 / sequence.fps;
    /** Ticks per frame shown: 2 at 12 fps on a 24 fps sequence. */
    const ticksPerFrame = sequence.fps / displayFps;
    const startedAt = performance.now() - indexRef.current * tickMs;
    let request = 0;

    const tick = (now: number) => {
      const shown = Math.floor(((now - startedAt) * displayFps) / 1000);
      const elapsed = Math.floor(shown * ticksPerFrame);
      const next = loop ? elapsed % count : Math.min(elapsed, count - 1);
      indexRef.current = next;
      // Same value bails out of the render, so ticking faster than the frame rate costs nothing, and a held
      // image does not even reach expo-image: its source is the same module, so nothing reloads.
      setIndex(next);
      if (!loop && next === count - 1) return;
      request = requestAnimationFrame(tick);
    };

    request = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(request);
  }, [playing, loop, sequence.fps, displayFps, count]);

  return (
    <Image
      source={sources[index]}
      // First, so a caller's own `aspectRatio` or fixed height still wins.
      style={[{ aspectRatio: sequence.aspectRatio }, style]}
      contentFit={contentFit}
      // A fade between frames would blend each into the next; the swap has to be instant.
      transition={false}
      // Every frame is drawn once per loop, so the in-memory cache is the one that pays off.
      cachePolicy="memory"
      priority="high"
    />
  );
};
