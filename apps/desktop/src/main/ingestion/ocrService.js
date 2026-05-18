import fetch from "node-fetch";

// PaddleOCR 3.x downloads models lazily on first use — allow up to 90s
const OCR_TIMEOUT_MS = 90_000;

/**
 * Calls Python OCR service.
 * FINAL CONTRACT:
 * - Sends JSON { image_path }
 * - Returns: Array<{ rec_texts: string[], rec_scores: number[] }>
 */
export async function runOCR(imagePath) {
  const res = await fetch("http://127.0.0.1:17890/ocr", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      image_path: imagePath,
    }),
    signal: AbortSignal.timeout(OCR_TIMEOUT_MS),
  });

  if (!res.ok) {
    return [];
  }

  const data = await res.json();
  return Array.isArray(data) ? data : [];
}
