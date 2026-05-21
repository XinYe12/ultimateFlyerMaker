/**
 * check-exports-in-db.mjs
 *
 * Checks whether images in the Downloads/Export* folders are already in the
 * Firestore product_vectors collection, using pHash deduplication (same logic
 * as batchIngestToDB.js).
 *
 * Run from apps/desktop/:
 *   node check-exports-in-db.mjs
 */

import { createCanvas, loadImage } from "@napi-rs/canvas";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Config ──────────────────────────────────────────────────────────────────
const SERVICE_ACCOUNT_PATH = path.join(
  __dirname,
  "backend/config/firebase-service-account.json"
);
const DOWNLOADS_DIR = "C:\\Users\\Xinye\\Downloads";
const PHASH_THRESHOLD = 10;
const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif"]);

// ── pHash (identical to pHashService.js) ───────────────────────────────────
const SIZE = 32;
const SMALLER = 8;

async function computePHash(imagePath) {
  const img = await loadImage(imagePath);
  const canvas = createCanvas(SIZE, SIZE);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, SIZE, SIZE);
  const { data } = ctx.getImageData(0, 0, SIZE, SIZE);

  const vals = [];
  for (let y = 0; y < SIZE; y++) {
    const row = new Float64Array(SIZE);
    for (let x = 0; x < SIZE; x++) {
      const i = (y * SIZE + x) * 4;
      row[x] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    }
    vals.push(row);
  }

  const dct = applyDCT(vals);

  const list = [];
  for (let y = 0; y < SMALLER; y++) {
    for (let x = 0; x < SMALLER; x++) {
      if (!(x === 0 && y === 0)) list.push(dct[y][x]);
    }
  }

  const sorted = [...list].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? (sorted[mid] + sorted[mid - 1]) / 2
      : sorted[mid];

  let hash = 0n;
  for (const v of list) {
    hash = (hash << 1n) | (v > median ? 1n : 0n);
  }
  return hash.toString(16).padStart(16, "0");
}

function applyDCT(f) {
  const result = [];
  for (let u = 0; u < SIZE; u++) {
    result.push(new Float64Array(SIZE));
    const cu = u === 0 ? 1 / Math.sqrt(2) : 1.0;
    for (let v = 0; v < SIZE; v++) {
      const cv = v === 0 ? 1 / Math.sqrt(2) : 1.0;
      let sum = 0;
      for (let i = 0; i < SIZE; i++) {
        for (let j = 0; j < SIZE; j++) {
          sum +=
            Math.cos(((2 * i + 1) * u * Math.PI) / (2 * SIZE)) *
            Math.cos(((2 * j + 1) * v * Math.PI) / (2 * SIZE)) *
            f[i][j];
        }
      }
      result[u][v] = 0.25 * cu * cv * sum;
    }
  }
  return result;
}

function hammingDistance(h1, h2) {
  let xor = BigInt("0x" + h1) ^ BigInt("0x" + h2);
  let count = 0;
  while (xor > 0n) {
    count += Number(xor & 1n);
    xor >>= 1n;
  }
  return count;
}

// ── Collect images ──────────────────────────────────────────────────────────
function collectImages(dir) {
  const images = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return images;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      images.push(...collectImages(full));
    } else if (IMAGE_EXTS.has(path.extname(e.name).toLowerCase())) {
      images.push(full);
    }
  }
  return images;
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  // 1. Init Firestore
  console.log("Connecting to Firestore...");
  const serviceAccount = JSON.parse(readFileSync(SERVICE_ACCOUNT_PATH, "utf8"));
  const fbApp = !getApps().length
    ? initializeApp({ credential: cert(serviceAccount) })
    : getApps()[0];
  const db = getFirestore(fbApp);

  // 2. Load all existing pHashes
  console.log("Loading pHashes from Firestore...");
  const snap = await db.collection("product_vectors").select("pHash").get();
  const existingHashes = snap.docs.map((d) => d.data().pHash).filter(Boolean);
  console.log(`Loaded ${existingHashes.length} pHashes from DB (${snap.docs.length} total docs)\n`);

  // 3. Collect Export folders
  const exportFolders = readdirSync(DOWNLOADS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^export/i.test(e.name))
    .map((e) => path.join(DOWNLOADS_DIR, e.name))
    .sort();

  console.log(`Found ${exportFolders.length} Export folders:`);
  exportFolders.forEach((f) => console.log(" ", f));
  console.log();

  // 4. Process each image
  const results = { inDb: [], notInDb: [], errors: [] };
  let totalImages = 0;

  for (const folder of exportFolders) {
    const images = collectImages(folder);
    totalImages += images.length;
    const folderName = path.basename(folder);
    let folderInDb = 0, folderNotInDb = 0, folderErrors = 0;

    process.stdout.write(`Processing ${folderName} (${images.length} images)...`);

    for (let i = 0; i < images.length; i++) {
      const imgPath = images[i];
      try {
        const pHash = await computePHash(imgPath);
        const found = existingHashes.some((h) => hammingDistance(h, pHash) <= PHASH_THRESHOLD);
        if (found) {
          results.inDb.push(imgPath);
          folderInDb++;
        } else {
          results.notInDb.push(imgPath);
          folderNotInDb++;
        }
      } catch (err) {
        results.errors.push({ path: imgPath, error: err.message });
        folderErrors++;
      }

      // Progress dot every 50 images
      if ((i + 1) % 50 === 0) {
        process.stdout.write(` ${i + 1}`);
      }
    }

    console.log(
      `\n  ✓ ${folderInDb} in DB  |  ✗ ${folderNotInDb} NOT in DB  |  ⚠ ${folderErrors} errors\n`
    );
  }

  // 5. Summary
  console.log("═══════════════════════════════════════════════");
  console.log(`SUMMARY — ${totalImages} total images across ${exportFolders.length} folders`);
  console.log(`  Already in DB:  ${results.inDb.length}`);
  console.log(`  NOT in DB:      ${results.notInDb.length}`);
  console.log(`  Errors:         ${results.errors.length}`);
  console.log("═══════════════════════════════════════════════");

  if (results.notInDb.length > 0) {
    console.log("\nImages NOT in DB (first 20 shown):");
    results.notInDb.slice(0, 20).forEach((p) => console.log(" ", p));
    if (results.notInDb.length > 20) {
      console.log(`  ... and ${results.notInDb.length - 20} more`);
    }
  }

  if (results.errors.length > 0) {
    console.log("\nErrors:");
    results.errors.slice(0, 10).forEach(({ path: p, error: e }) =>
      console.log(`  ${p}: ${e}`)
    );
  }

  // Write full not-in-db list to file
  if (results.notInDb.length > 0) {
    const outFile = path.join(__dirname, "exports-not-in-db.txt");
    const { writeFileSync } = await import("fs");
    writeFileSync(outFile, results.notInDb.join("\n"), "utf8");
    console.log(`\nFull list of missing images written to:\n  ${outFile}`);
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
