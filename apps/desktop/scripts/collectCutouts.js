import fs from "fs";
import path from "path";

const PROJECT_ROOT = process.cwd();
const TARGET_DIR = path.join(
  PROJECT_ROOT,
  "apps/desktop/project_assets/cutouts"
);

function walk(dir, results = []) {
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const full = path.join(dir, file);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      walk(full, results);
    } else if (file.endsWith(".cutout.png")) {
      results.push(full);
    }
  }
  return results;
}

// 🔍 Search starting point (adjust if needed)
const SEARCH_ROOTS = [
  path.join(PROJECT_ROOT, "apps"),
  path.join(PROJECT_ROOT, "test"),
  path.join(PROJECT_ROOT, "Downloads")
].filter(fs.existsSync);

fs.mkdirSync(TARGET_DIR, { recursive: true });

let count = 0;

for (const root of SEARCH_ROOTS) {
  const files = walk(root);
  for (const src of files) {
    const name = path.basename(src);
    const dest = path.join(TARGET_DIR, name);

    if (!fs.existsSync(dest)) {
      fs.copyFileSync(src, dest);
      console.log("COPIED:", name);
      count++;
    }
  }
}

console.log(`DONE. ${count} cutout images collected.`);
