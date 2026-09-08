import { getClosestAspectRatio } from "@shared/dimensions";

type PartialImage = {
  url: string,
  width: number,
  height: number,
  size: number,
}

type MainImage = PartialImage & { sizes?: PartialImage[] }
type Image<T extends MainImage> = T;

export const sanitizeImage = <T extends MainImage>(image: Image<T>): SanitizedImage<T> => {
  const sizes = (image.sizes ?? []).sort((a, b) => b.size - a.size).map((s) => ({ ...s, dimension: Math.max(s.width, s.height) }));
  const sanitizeSize = ({ url, width, height, size }: { url: string, width: number, height: number, size: number }) => ({ url, width, height, size });

  const large = sizes.find((s) => s.dimension <= 1024 && s.dimension > 600) ?? image;
  const medium = sizes.find((s) => s.dimension <= 600 && s.dimension > 400) ?? large;
  const small = sizes.find((s) => s.dimension <= 400 && s.dimension > 200) ?? medium;
  const thumbnail = sizes.find((s) => s.dimension <= 200) ?? small;

  return {
    ...image,
    _sizes: image.sizes as typeof image["sizes"],
    aspectRatio: getClosestAspectRatio(image.width, image.height),
    sizes: {
      thumbnail: sanitizeSize(thumbnail),
      small: sanitizeSize(small),
      medium: sanitizeSize(medium),
      large: sanitizeSize(large),
      original: sanitizeSize(image),
    }
  }
}

export type SanitizedImage<T extends MainImage> =
  Omit<T, "sizes"> & {
    _sizes: T["sizes"];
    aspectRatio: {
      actual: string,
      closest: string
    };
    sizes: {
      thumbnail: PartialImage;
      small: PartialImage;
      medium: PartialImage;
      large: PartialImage;
      original: PartialImage;
    };
  };
