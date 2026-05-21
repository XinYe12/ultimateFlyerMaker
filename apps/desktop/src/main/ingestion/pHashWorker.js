import { parentPort } from "worker_threads";
import { computePHash } from "./pHashService.js";

parentPort.on("message", async ({ imagePath }) => {
  try {
    const hash = await computePHash(imagePath);
    parentPort.postMessage({ hash });
  } catch (err) {
    parentPort.postMessage({ error: err.message });
  }
});
