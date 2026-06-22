import fetch from "node-fetch";

// PaddleOCR 3.x downloads models lazily on first use — allow up to 90s for routine calls
const OCR_TIMEOUT_MS = 90_000;
// Template layout runs OCR once before vision; first cold start can exceed 90s behind ocr_lock
const LAYOUT_OCR_TIMEOUT_MS = 300_000;

function mergeAbortSignals(abortSignal, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error("OCR timed out")), timeoutMs);
  const onUserAbort = () => {
    clearTimeout(timeout);
    controller.abort(abortSignal?.reason ?? new Error("OCR cancelled"));
  };
  if (abortSignal?.aborted) {
    clearTimeout(timeout);
    onUserAbort();
  } else {
    abortSignal?.addEventListener("abort", onUserAbort, { once: true });
  }
  controller.signal.addEventListener("abort", () => clearTimeout(timeout), { once: true });
  return controller.signal;
}

/**
 * Calls Python OCR service.
 * FINAL CONTRACT:
 * - Sends JSON { image_path }
 * - Returns: Array<{ rec_texts: string[], rec_scores: number[] }>
 */
export async function runOCR(imagePath, options = {}) {
  const timeoutMs = options.timeoutMs ?? OCR_TIMEOUT_MS;
  const signal = options.abortSignal
    ? mergeAbortSignals(options.abortSignal, timeoutMs)
    : AbortSignal.timeout(timeoutMs);

  let res;
  try {
    res = await fetch("http://127.0.0.1:17890/ocr", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        image_path: imagePath,
      }),
      signal,
    });
  } catch (err) {
    if (err?.name === "AbortError" || signal.aborted) {
      const reason = options.abortSignal?.reason;
      if (reason?.code === "PARSE_CANCELLED") throw reason;
      throw new Error(err?.message?.includes("timed out") ? "OCR timed out" : "OCR cancelled");
    }
    throw err;
  }

  if (!res.ok) {
    return [];
  }

  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export { LAYOUT_OCR_TIMEOUT_MS };
