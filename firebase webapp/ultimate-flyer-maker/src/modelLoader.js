// src/modelLoader.js
import { pipeline, env } from "@xenova/transformers";

// 🧩 Environment configuration
env.use = "wasm";                     // stable backend
env.useBrowserCache = true;           // cache models in IndexedDB
env.allowRemoteModels = true;         // allow fetching from Hugging Face
env.allowLocalModels = true;          // ✅ must be true to keep internal pathJoin happy
env.backends.onnx.wasm.numThreads = 1;
env.backends.onnx.wasm.proxy = true;

let modelInstance = null;
let loadPromise = null;

export async function preloadModel() {
  if (modelInstance) return Promise.resolve(modelInstance);
  if (loadPromise) return loadPromise;

  console.log("🧠 Downloading Xenova MiniLM model...");

  loadPromise = (async () => {
    try {
      const model = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", {
        progress_callback: (p) => {
          if (p?.progress != null) {
            const percent = p.progress > 1 ? p.progress : p.progress * 100;
            console.log(`📦 Loading model: ${percent.toFixed(1)}%`);
          } else {
            console.log(`📦 ${p.status || "Working..."}`);
          }
        },
      });

      modelInstance = model;
      console.log("✅ Model loaded successfully!");
      return modelInstance;
    } catch (err) {
      console.error("❌ Failed to load model:", err);
      throw err;
    }
  })();

  return loadPromise;
}

export function getModel() {
  if (!modelInstance) throw new Error("Model not loaded yet!");
  return modelInstance;
}
