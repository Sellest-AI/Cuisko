import { Image as ExpoImage, ImageProps as ExpoImageProps } from "expo-image";
import { ComponentRef, forwardRef } from "react";

/** Long enough to read as a fade rather than a pop, short enough not to feel like latency. */
const TRANSITION_MS = 300;

export const prefetch = ExpoImage.prefetch;

/** `true` and an absent value both mean the default fade; `false` means none; a number is its own. */
const _transitionMs = (transition: ImageProps["transition"]) => {
  if (transition === false) return 0;
  if (transition === true || transition === undefined) return TRANSITION_MS;
  return transition;
};

/**
 * `expo-image` with the two defaults every call site in this app wants: a disk-backed cache, and a
 * fade in. Passing the whole `image` object instead of a bare `source` also hands it the thumbnail
 * to hold while the full size decodes, which is what stops a card from flashing empty on scroll.
 */
export const Image = forwardRef<ComponentRef<typeof ExpoImage>, ImageProps>(
  ({ image, transition, placeholder, cachePolicy, ...props }, ref) => (
    <ExpoImage
      {...props}
      ref={ref}
      placeholder={placeholder ?? image?.sizes?.thumbnail?.url}
      transition={_transitionMs(transition)}
      cachePolicy={cachePolicy ?? "memory-disk"}
    />
  ),
);

Image.displayName = "Image";

export type ImageProps = ExpoImageProps & {
  image?: ImageObject;
  transition?: number | boolean;
}

type ImageSize = {
  width: number;
  height: number;
  url: string;
  hasAlpha?: boolean;
}

export type ImageObject = ImageSize & {
  sizes?: {
    thumbnail: ImageSize;
    small: ImageSize;
    medium: ImageSize;
    large: ImageSize;
    original: ImageSize;
  }
}
