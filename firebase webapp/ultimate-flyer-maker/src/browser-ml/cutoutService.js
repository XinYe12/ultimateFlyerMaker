import { pipeline, env } from "@huggingface/transformers";

// ✅ MUST be enabled for RMBG
env.allowRemoteModels = true;
env.allowLocalModels = false;
env.useBrowserCache = true;

let segmenterPromise = null;

export function loadCutoutModel() {
  if (!segmenterPromise) {
    segmenterPromise = pipeline(
      "image-segmentation",
      "briaai/RMBG-1.4"
    );
  }
  return segmenterPromise;
}


async function downscale(file, max = 1024) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d").drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return canvas;
}

export async function generateCutoutPNG(file) {
  const model = await loadCutoutModel();
  const canvas = await downscale(file);

  const result = await model(canvas, { multi_mask: false });
  const mask = result[0].mask;

  const w = canvas.width;
  const h = canvas.height;
  const src = canvas.getContext("2d").getImageData(0, 0, w, h);

  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const ctx = out.getContext("2d");
  const dst = ctx.createImageData(w, h);

  for (let i = 0; i < src.data.length; i += 4) {
    const alpha = mask.data[i];
    dst.data[i] = src.data[i];
    dst.data[i + 1] = src.data[i + 1];
    dst.data[i + 2] = src.data[i + 2];
    dst.data[i + 3] = alpha;
  }

  ctx.putImageData(dst, 0, 0);
  return out.toDataURL("image/png");
}
