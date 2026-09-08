
type PartialImage = {
  url: string,
  width: number,
  height: number,
  size: number,
}

export type ImageDoc = {
  _id: string,
  url: string,
  width: number,
  height: number,
  hasAlpha: boolean,
  mimeType: string,
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
}

export type ImageWithObjectsDoc = ImageDoc & {
  objects: {
    _id: string,
    baseImageId: string,
    imageId: string,
    x: number,
    y: number,
  }[];
}
