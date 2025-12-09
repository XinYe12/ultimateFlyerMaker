import fetch from "node-fetch";
import fs from "fs";
import path from "path";

//
// ---- cosine similarity helper ----
//
function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

//
// ---- run test ----
//
async function test(imagePath) {
  console.log("\n🔍 Testing dedup for:", imagePath);

  const abs = path.resolve(imagePath);
  const buffer = fs.readFileSync(abs);

  const form = new FormData();
  form.append("image", new Blob([buffer]), path.basename(abs));

  console.log("⏳ Sending request to backend...");

  const res = await fetch("http://localhost:5050/api/search-by-image", {
    method: "POST",
    body: form,
  });

  const json = await res.json();
  const results = json.results || [];

  console.log("====================================");
  console.log("🟦 RAW BACKEND RESULTS");
  console.log("====================================");

  results.forEach((r, i) => {
    console.log(
      `${i + 1}. ${r.id.padEnd(18)}  score=${(r.score * 100).toFixed(1)}%`
    );
  });

  // ----- compute similarity matrix -----
  console.log("\n====================================");
  console.log("🟪 SIMILARITY MATRIX");
  console.log("====================================");

  for (let i = 0; i < results.length; i++) {
    let row = "";
    for (let j = 0; j < results.length; j++) {
      const sim = cosine(results[i].embedding, results[j].embedding);
      row += sim.toFixed(2).padStart(6);
    }
    console.log(row);
  }

  // ----- detect duplicates -----
  console.log("\n====================================");
  console.log("🟥 POSSIBLE DUPLICATE PAIRS (sim ≥ 0.97)");
  console.log("====================================");

  for (let i = 0; i < results.length; i++) {
    for (let j = i + 1; j < results.length; j++) {
      const sim = cosine(results[i].embedding, results[j].embedding);
      if (sim >= 0.97) {
        console.log(`❗ ${results[i].id}  <->  ${results[j].id}   (${sim.toFixed(3)})`);
      }
    }
  }

  console.log("\n🎉 Dedup test complete.\n");
}

//
// ---- RUN SCRIPT ----
//
const image = process.argv[2] || "scripts/taosu.jpg";
test(image);
