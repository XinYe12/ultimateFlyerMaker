import { Agent, fetch as undiciFetch } from "undici";

/** Vision layout parsing can exceed 2+ minutes on first model load (CPU / large flyer). */
export const OLLAMA_FETCH_TIMEOUT_MS = 600_000;

const ollamaAgent = new Agent({
  headersTimeout: OLLAMA_FETCH_TIMEOUT_MS,
  bodyTimeout: OLLAMA_FETCH_TIMEOUT_MS,
  connectTimeout: 30_000,
});

/** Fetch with extended undici timeouts for slow local Ollama vision inference. */
export function ollamaFetch(url, options = {}) {
  return undiciFetch(url, {
    ...options,
    dispatcher: ollamaAgent,
  });
}
