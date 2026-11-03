export const getImageMessageType = "nailoong:get-image";

// The content script never names a URL. It asks for a numbered slot and the
// worker decides what to fetch, so a hostile page cannot steer the request.
export interface GetImageRequest {
  readonly type: typeof getImageMessageType;
  readonly slot: number;
}

export type GetImageResponse =
  | {
      readonly ok: true;
      readonly slot: number;
      readonly dataUrl: string;
    }
  | {
      readonly ok: false;
      readonly slot: number;
      readonly error: string;
    };

const maxSlot = 10_000;

// Raster formats only. SVG is deliberately absent: it can carry script, and no
// image from the search results needs it.
const rasterImageContentTypePattern = /^image\/(?:jpeg|jpg|png|gif|webp|avif|bmp)$/i;
const rasterDataUrlPattern = /^data:image\/(?:jpeg|jpg|png|gif|webp|avif|bmp);base64,[a-z0-9+/]+={0,2}$/i;

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return value !== null && typeof value === "object";
};

export const isRasterImageContentType = (value: string): boolean => {
  return rasterImageContentTypePattern.test(value);
};

export const isRasterDataUrl = (value: string): boolean => {
  return rasterDataUrlPattern.test(value);
};

export const createGetImageRequest = (slot: number): GetImageRequest => {
  return {
    type: getImageMessageType,
    slot
  };
};

export const isGetImageRequest = (value: unknown): value is GetImageRequest => {
  return (
    isRecord(value) &&
    value.type === getImageMessageType &&
    typeof value.slot === "number" &&
    Number.isInteger(value.slot) &&
    value.slot >= 0 &&
    value.slot <= maxSlot
  );
};

export const isGetImageResponse = (value: unknown): value is GetImageResponse => {
  if (!isRecord(value) || typeof value.ok !== "boolean" || typeof value.slot !== "number") {
    return false;
  }

  if (!Number.isInteger(value.slot) || value.slot < 0 || value.slot > maxSlot) {
    return false;
  }

  if (value.ok) {
    return typeof value.dataUrl === "string" && rasterDataUrlPattern.test(value.dataUrl);
  }

  return typeof value.error === "string";
};
