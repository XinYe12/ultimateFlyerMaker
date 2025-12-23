import fs from "fs";
import path from "path";
import { processFlyerImage } from "./imagePipeline.js";

// ===== CONFIG =====
// CHANGE THIS to your test image folder (ABSOLUTE PATH)
const TEST_DIR = "/Users/xuxinye/Desktop/cutout-test";

// ===== LOAD FILES =====
const files = fs
  .readdirSync(TEST_DIR)
  .filter(f => /\.(jpg|jpeg|png)$/i.test(f));

if (files.length === 0) {
  console.error("No images found in test directory");
  process.exit(1);
}

console.log("CUTOUT BATCH TEST");
console.log("Images:", files.length);
console.log("----------------------");

const totalStart = Date.now();

// ===== PROCESS EACH IMAGE =====
for (let i = 0; i < files.length; i++) {
  const file = files[i];
  const inputPath = path.join(TEST_DIR, file);

  const flyerItem = {
    image: {
      src: inputPath
    }
  };

  const start = Date.now();
  await processFlyerImage(flyerItem);
  const end = Date.now();

  const seconds = ((end - start) / 1000).toFixed(2);

  console.log(
    `[${i + 1}/${files.length}]`,
    file,
    "→",
    seconds,
    "sec"
  );
}

const totalEnd = Date.now();
const totalSeconds = ((totalEnd - totalStart) / 1000).toFixed(2);

console.log("----------------------");
console.log("TOTAL TIME (seconds):", totalSeconds);
console.log(
  "AVG PER IMAGE (seconds):",
  (totalSeconds / files.length).toFixed(2)
);
