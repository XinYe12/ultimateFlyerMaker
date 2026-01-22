import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import { fileURLToPath } from "url";
import fetch from "node-fetch";
import FormData from "form-data";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// project-owned exports dir
const EXPORT_ROOT = path.resolve(__dirname, "../../../exports/cutouts");

async function ensureExportDir() {
  await fs.mkdir(EXPORT_ROOT, { recursive: true });
}

export async function runCutout(inputPath) {
  await ensureExportDir();

  const form = new FormData();
  const stream = fsSync.createReadStream(inputPath);
  form.append("file", stream);

  let res;
  try {
    res = await fetch("http://127.0.0.1:17890/cutout", {
      method: "POST",
      body: form,
      timeout: 30_000,
    });
  } finally {
    // ensure fd is released
    stream.destroy();
  }

  if (!res || !res.ok) {
    throw new Error(`Cutout failed`);
  }

  const { output_path } = await res.json();

  const finalName =
    path.basename(inputPath).replace(/\s+/g, "_") + ".cutout.png";

  const finalPath = path.join(EXPORT_ROOT, finalName);

  await fs.rename(output_path, finalPath);

  return finalPath;
}
