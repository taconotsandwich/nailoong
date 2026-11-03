// Image URLs are discovered at runtime from Bing image search instead of being
// pinned in the source. A pinned list rots: the CDN URLs behind it are not
// permanent, and every dead entry is a broken image on a user's page.

export const searchQueries = [
  "nailoong",
  "奶龍",
  "nailoong dinosaur",
  "奶龙 卡通",
  "nailoong wallpaper",
  "奶龍 桌布"
] as const;

const searchEndpoint = "https://www.bing.com/images/async";
const resultsPerPage = 35;
const maxSearchPages = 3;

// Bing serves a ~9KB stub with a single result when the request does not look
// like a browser, so the header is required for the endpoint to be useful.
const browserUserAgent =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// Only Bing's own thumbnail CDN is ever fetched. Anything else a search result
// points at is dropped, so an unexpected or tampered response cannot steer the
// extension at an arbitrary host.
const allowedImageUrlPattern = /^https:\/\/ts[1-4]\.mm\.bing\.net\/th\?id=[A-Za-z0-9_.~-]+&pid=[0-9.]+$/;

export const isAllowedImageUrl = (value: string): boolean => {
  return allowedImageUrlPattern.test(value);
};

const decodeHtmlEntities = (value: string): string => {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
};

export const parseSearchResults = (html: string): string[] => {
  const urls: string[] = [];
  const seen = new Set<string>();

  // Bing returns each thumbnail as an HTML-escaped JSON fragment:
  //   turl&quot;:&quot;https://ts1.mm.bing.net/th?id=OIP...&amp;pid=15.1&quot;
  // The unescaped shape is accepted too, in case the response format changes.
  const patterns = [/turl&quot;:&quot;(.*?)&quot;/g, /turl"\s*:\s*"(.*?)"/g];

  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      const raw = match[1];

      if (raw === undefined) {
        continue;
      }

      const candidate = decodeHtmlEntities(raw).replace(/\\\//g, "/");

      if (!isAllowedImageUrl(candidate) || seen.has(candidate)) {
        continue;
      }

      seen.add(candidate);
      urls.push(candidate);
    }
  }

  return urls;
};

export const searchImageUrls = async (query: string, first: number): Promise<string[]> => {
  const params = new URLSearchParams({
    q: query,
    first: String(first),
    count: String(resultsPerPage),
    mmasync: "1"
  });

  const response = await fetch(`${searchEndpoint}?${params.toString()}`, {
    credentials: "omit",
    referrerPolicy: "no-referrer",
    cache: "no-store",
    headers: {
      "User-Agent": browserUserAgent,
      Accept: "text/html,*/*"
    },
    signal: AbortSignal.timeout(15_000)
  });

  if (!response.ok) {
    return [];
  }

  return parseSearchResults(await response.text());
};

// A random query and a random results page, so two page loads rarely see the
// same set of images.
export const searchRandomPage = async (): Promise<string[]> => {
  const query = searchQueries[Math.floor(Math.random() * searchQueries.length)];
  const first = Math.floor(Math.random() * maxSearchPages) * resultsPerPage;

  return searchImageUrls(query, first);
};
