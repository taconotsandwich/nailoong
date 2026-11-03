import { type GetImageRequest, type GetImageResponse, isGetImageRequest, isRasterImageContentType } from "./messages";
import { searchRandomPage } from "./search-images";

// The search result pool. Refilled from a random query and page whenever it runs
// low, so the extension keeps working without a pinned URL list.
const imagePool: string[] = [];
const poolCursor = { value: 0 };

const dataUrlCache = new Map<string, string>();
const pendingResponses = new Map<string, Promise<GetImageResponse>>();

// A service worker holding many full-size images as base64 will get evicted or
// blow up memory, so oversized payloads are served but never retained.
const maxCachedDataUrlLength = 4 * 1024 * 1024;
const maxCacheEntries = 60;
const minPoolSize = 8;
const maxFallbackAttempts = 8;
const fetchTimeoutMs = 15_000;

let refillPromise: Promise<void> | null = null;

const arrayBufferToBase64 = (arrayBuffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(arrayBuffer);
  const chunkSize = 0x8000;
  let binary = "";

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
};

const makeFailure = (request: GetImageRequest, error: string): GetImageResponse => {
  return {
    ok: false,
    slot: request.slot,
    error
  };
};

const rememberDataUrl = (url: string, dataUrl: string): void => {
  if (dataUrl.length > maxCachedDataUrlLength) {
    return;
  }

  if (dataUrlCache.size >= maxCacheEntries) {
    const oldestKey = dataUrlCache.keys().next();

    if (!oldestKey.done) {
      dataUrlCache.delete(oldestKey.value);
    }
  }

  dataUrlCache.set(url, dataUrl);
};

const refillPool = async (): Promise<void> => {
  const results = await searchRandomPage();

  for (const url of results) {
    if (!imagePool.includes(url)) {
      imagePool.push(url);
    }
  }
};

// Only one refill runs at a time, and callers await the same promise.
const ensurePool = async (): Promise<void> => {
  if (imagePool.length >= minPoolSize) {
    return;
  }

  if (refillPromise === null) {
    refillPromise = refillPool().finally(() => {
      refillPromise = null;
    });
  }

  await refillPromise;
};

const fetchAsDataUrl = async (url: string): Promise<string | null> => {
  const cached = dataUrlCache.get(url);

  if (cached !== undefined) {
    return cached;
  }

  try {
    const response = await fetch(url, {
      cache: "force-cache",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      signal: AbortSignal.timeout(fetchTimeoutMs)
    });

    if (!response.ok) {
      return null;
    }

    const contentTypeHeader = response.headers.get("content-type") ?? "image/jpeg";
    const contentType = contentTypeHeader.split(";")[0]?.trim() ?? "image/jpeg";

    if (!isRasterImageContentType(contentType)) {
      return null;
    }

    const dataUrl = `data:${contentType};base64,${arrayBufferToBase64(await response.arrayBuffer())}`;
    rememberDataUrl(url, dataUrl);
    return dataUrl;
  } catch {
    return null;
  }
};

// Walk forward through the pool until something loads, so one dead CDN URL
// degrades to a different image instead of a broken image on the page.
const fetchWithFallback = async (request: GetImageRequest): Promise<GetImageResponse> => {
  await ensurePool();

  const poolSize = imagePool.length;

  if (poolSize === 0) {
    return makeFailure(request, "Image search returned no usable results");
  }

  const start = poolCursor.value % poolSize;
  poolCursor.value += 1;

  for (let attempt = 0; attempt < Math.min(maxFallbackAttempts, poolSize); attempt += 1) {
    const url = imagePool[(start + attempt) % poolSize];

    if (url === undefined) {
      continue;
    }

    const dataUrl = await fetchAsDataUrl(url);

    if (dataUrl !== null) {
      return {
        ok: true,
        slot: request.slot,
        dataUrl
      };
    }
  }

  return makeFailure(request, "No image from the search results could be loaded");
};

const getImageResponse = (request: GetImageRequest): Promise<GetImageResponse> => {
  // Slots are a stable handle: the same slot in the same page keeps the same
  // image, while different slots spread across the pool.
  const key = String(request.slot);
  const pendingResponse = pendingResponses.get(key);

  if (pendingResponse !== undefined) {
    return pendingResponse;
  }

  const response = fetchWithFallback(request).finally(() => {
    pendingResponses.delete(key);
  });

  pendingResponses.set(key, response);
  return response;
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Only this extension may ask for images. Anything else is not a caller we
  // ever intend to serve, regardless of what the message looks like.
  if (sender.id !== chrome.runtime.id) {
    return false;
  }

  if (!isGetImageRequest(message)) {
    return false;
  }

  getImageResponse(message).then(sendResponse);
  return true;
});
