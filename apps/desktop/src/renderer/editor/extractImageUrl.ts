/**
 * Extract the actual image URL from a drag-and-drop DataTransfer.
 *
 * Priority order:
 *  1. text/html  — extract <img src="…"> (most reliable for browser drags;
 *     Google wraps images in redirect pages, so text/uri-list often points
 *     at the HTML page, not the image itself).
 *  2. text/uri-list — raw URL, used if html extraction failed.
 *  3. text/plain    — fallback, parse first URL from plain text.
 *
 * All candidates are run through unwrapGoogleUrl() so that Google imgres
 * redirect URLs are resolved to the real image URL.
 *
 * Returns the URL string or "" if nothing usable was found.
 */
export function extractImageUrl(dt: DataTransfer): string {
  // 1. Try text/html — look for <img src="…">
  const html = dt.getData("text/html");
  if (html) {
    const imgMatch = html.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (imgMatch?.[1]) {
      const src = imgMatch[1];
      if (/^https?:\/\//.test(src)) return unwrapGoogleUrl(src);
    }
  }

  // 2. Try text/uri-list
  const uriList = dt.getData("text/uri-list");
  if (uriList) {
    const first = uriList.split("\n")[0].trim();
    if (first) return unwrapGoogleUrl(first);
  }

  // 3. Fallback to text/plain
  const text = dt.getData("text/plain");
  if (text) {
    const match = text.match(/https?:\/\/\S+/);
    if (match) return unwrapGoogleUrl(match[0]);
  }

  return "";
}

/**
 * Google image search wraps real image URLs inside redirect pages like:
 *   https://www.google.com/imgres?imgurl=https%3A%2F%2Fexample.com%2Fphoto.jpg&…
 *
 * This extracts the `imgurl` param so we fetch the actual image.
 */
function unwrapGoogleUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("google.com") && parsed.pathname === "/imgres") {
      const imgurl = parsed.searchParams.get("imgurl");
      if (imgurl) return imgurl;
    }
  } catch {
    // not a valid URL, return as-is
  }
  return url;
}
