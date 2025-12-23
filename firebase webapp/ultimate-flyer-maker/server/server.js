// server/server.js

import fetch from "node-fetch"; // if Node < v18; else can omit and use global fetch
import express from "express";
import cors from "cors";
import multer from "multer";
import "./config/firebase.js";
import fs from "fs";
import sharp from "sharp";
import vision from "@google-cloud/vision";
import "dotenv/config"; // loads .env automatically
import "./config/googleAuth.js";  
import identifyProductRoute from "./routes/identifyProductRoute.js";


import { parseProductTitle } from "./parseTitleDeepSeek.js";
import searchByPhotoRoute from "./routes/searchByPhotoRoute.js";
import searchByImageRoute from "./routes/searchByImageRoute.js";
import productRoutes from "./routes/productRoutes.js";
import checkDuplicateImageRoute from "./routes/checkDuplicateImageRoute.js";
import { searchBrave, buildBraveQueryFromParsed } from "./services/braveSearchService.js";


// ---- SETUP ----
const app = express();

// ✅ 1) Body parsers FIRST (for JSON APIs like /api/products)
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// ✅ 2) CORS BEFORE ANY ROUTES (important for login + React)
app.use(
  cors({
    origin: "http://localhost:3000", // your React dev server
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true, // allow cookies / auth headers for login
  })
);
app.use("/api/check-duplicate-image", checkDuplicateImageRoute);


// ✅ 3) Multer for file upload (used by /analyze)
const upload = multer({ dest: "uploads/" });

// ---- GOOGLE VISION ----
const client = new vision.ImageAnnotatorClient();

// ---- DEEPSEEK ----
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

async function refineWithDeepSeek(ocrText) {
  try {
    const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          {
            role: "system",
            content: `
        你是一个专业的商品标题提取助手。你的任务：
        1) 从 OCR 文字中提取最能代表该商品的中文名称
        2) 提取对应的英文名称（只能根据 OCR 中出现或能够直接翻译的内容）
        3) 如有重量信息，也需要提取；没有则留空

        **严格要求：**
        - 只能基于 OCR 中真实出现的信息，不得发挥，不得猜测，不得创造不存在的品牌或名称。
        - 如果 OCR 未出现明确的商品名称（例如“饺子皮”“豆腐”“面条”等），允许输出一个合理的通用名称，例如“食品”或“OCR Unclear”，但不要输出“产品 / Product”这类无意义的词。
        - 不得参考示例，不得模仿格式中的词语。
        - 优先使用出现频率最高、字体最大的中文内容。
        - 如果同时出现中英文字，必须保持语义一致。
        - 不允许输出示例中的薯片、Lays 等词。

        输出格式（共三行，不多不少）：
        <中文标题>
        <English Title>
        <weight or empty>
            `,
          },
          {
            role: "user",
            content: `
        以下是OCR识别文字，请分析其中真实出现的可作为商品名称的内容：

        --------------------
        ${ocrText}
        --------------------

        如果 OCR 文本中没有明显的商品名称，请输出最合理的通用描述，如：
        食品
        Food Item

        请按三行格式输出，不要添加其他文字。
            `,
          },
        ],

        temperature: 0.1,   // more deterministic
        max_tokens: 150,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("❌ DeepSeek API error:", response.status, text);
      return null;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim() || "";

    const lines = content.split(/\n+/).map(s => s.trim()).filter(Boolean);
    const joined = lines.join(" ");

    const weightMatch = joined.match(/(\d+(?:\.\d+)?\s?(g|kg|克|毫升|ml|oz|l))/i);
    const weight = weightMatch ? weightMatch[1].trim() : "";

    return {
      title_zh: lines[0] || "",
      title_en: lines[1] || "",
      weight,
      raw: content
    };
  } catch (e) {
    console.error("⚠️ DeepSeek call failed:", e);
    return null;
  }
}



// 🈶 Drop English transliterations if Chinese dupes exist
const dropEnglishDupes = (lines) => {
  const chinese = lines.filter((l) => /[\u4e00-\u9fa5]/.test(l));
  return lines.filter((l) => {
    if (!/[A-Za-z]/.test(l)) return true;
    const normalized = l.replace(/[A-Za-z]/g, "").trim();
    return !chinese.some((c) => c.includes(normalized.slice(0, 2)));
  });
};

// 🧠 Refined language-weighted parser with product-core clustering
function parseProductText(texts) {
  if (!texts || !texts.length)
    return { title: "", note: "no text", confidence: 0 };

  const normalize = (s) =>
    s.replace(/[^\u4e00-\u9fa5A-Za-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  let lines = Array.from(new Set(texts.map(normalize).filter(Boolean)));

  lines = dropEnglishDupes(lines);

  const joined = lines.join(" ");
  const weightMatch = joined.match(/(\d+(?:\.\d+)?\s?(g|kg|克|毫升|ml|oz|l))/i);
  const weight = weightMatch ? weightMatch[1].trim() : "";

  // --- 1️⃣ find repeating Chinese substrings ---
  const words = joined.match(/[\u4e00-\u9fa5]{2,4}/g) || [];
  const freq = {};
  for (const w of words) freq[w] = (freq[w] || 0) + 1;
  const sorted = Object.entries(freq)
    .filter(([w, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1]);
  const productCore = sorted.length ? sorted[0][0] : "";

  // --- 2️⃣ find best product line containing that core ---
  let productLine = "";
  if (productCore) {
    const candidates = lines.filter((l) => l.includes(productCore));
    productLine =
      candidates.sort((a, b) => b.length - a.length)[0] || productCore;
  } else {
    productLine =
      lines.find((l) => /[\u4e00-\u9fa5]{3,}/.test(l)) ||
      lines.find((l) => /[\u4e00-\u9fa5]/.test(l)) ||
      lines[0];
  }

  // --- 3️⃣ choose brand: short Chinese line near productLine ---
  const productIndex = lines.indexOf(productLine);
  let brand = "";
  if (productIndex > 0) {
    const before = lines
      .slice(Math.max(0, productIndex - 3), productIndex)
      .filter((l) => /[\u4e00-\u9fa5]{2,4}/.test(l));
    brand =
      before.sort((a, b) => a.length - b.length)[0] ||
      lines.find((l) => /[\u4e00-\u9fa5]{2,4}/.test(l));
  }

  // --- 4️⃣ detect series ---
  const series =
    (productCore && joined.split(productCore).length > 3) ||
    /(系列)/.test(joined);
  if (series && !/系列$/.test(productLine)) productLine += "系列";

  // --- 5️⃣ compose title ---
  const title = [brand, productLine, weight].filter(Boolean).join(" ").trim();

  return {
    brand,
    product: productLine,
    main: productLine,
    weight,
    title,
    confidence: 0.95,
    note: series
      ? "Repeated product pattern detected (series)."
      : "Core-word clustering applied.",
  };
}

// ----------------------------
// ✅ API ROUTES (use CORS/body already set up)
// ----------------------------

// Health check
app.get("/", (req, res) => {
  res.send("Backend is live ✅");
});

// Product + image search routes
app.use("/api/search-by-image", searchByImageRoute);
app.use("/api/search-by-photo", searchByPhotoRoute);
app.use("/api/products", productRoutes); // ✅ only once now
app.use("/api/identify-product", identifyProductRoute);


// ----------------------------
// /analyze ROUTE
// ----------------------------
app.post("/analyze", upload.single("image"), async (req, res) => {
  const filePath = req.file.path;
  console.log("📸 File uploaded:", filePath);

  try {
    console.log("🧠 Running object localization...");
    const [localizeResult] = await client.objectLocalization(filePath);
    const objects = localizeResult.localizedObjectAnnotations || [];
    console.log("🔍 Object count:", objects.length);

    let texts = [];
    let croppedBase64 = "";
    let detectedObject = "none";

    const visualSearchPath = fs.existsSync(`${filePath}-crop.jpg`)
      ? `${filePath}-crop.jpg`
      : filePath;

    // --- Case A: no object localization ---
if (!objects.length) {
  console.log("⚠️ No objects detected. Running OCR on full image...");
  const [textResult] = await client.textDetection(filePath);
  texts = textResult.textAnnotations?.map((t) => t.description) || [];

  const buffer = fs.readFileSync(filePath);
  croppedBase64 = buffer.toString("base64");

  // 🔍 JOIN OCR TEXT INTO MULTI-LINE STRING
  const ocrText = texts.join("\n");

  // 📝 PRINT FULL OCR TEXT FOR DEBUGGING
  console.log("===== 📝 OCR RAW TEXT BEGIN =====");
  console.log(ocrText);
  console.log("===== 📝 OCR RAW TEXT END =====");

  console.log("🧾 OCR extracted text length:", ocrText.length);


  try {
      console.log("🤖 Calling DeepSeek parseTitleDeepSeek...");
      const aiTitle = await parseProductTitle(ocrText);

      const parsed = {
        title_ai: aiTitle,
        title_zh: "", // no structured split here, but keep fields for Brave
        title_en: "",
        weight: "",
        note: "Used DeepSeek AI parser due to no localized objects.",
      };

      // 🧠 Build Brave query from parsed / AI title / OCR text
      const braveQuery = buildBraveQueryFromParsed(parsed, aiTitle || ocrText);

      let braveResults = [];
      try {
        braveResults = await searchBrave(braveQuery, { count: 5 });
        console.log("🧭 Brave results (no-objects):", braveResults.length);
      } catch (e) {
        console.error("⚠️ Brave search failed in no-objects branch:", e);
      }

      fs.unlinkSync(filePath);
      return res.json({ detectedObject, texts, parsed, croppedBase64, braveResults });
    } catch (err) {
      console.error(
        "❌ DeepSeek failed, falling back to local parser:",
        err.message
      );
      const parsed = parseProductText(texts);

      // 🧠 Build Brave query from local parsed result + OCR
      const braveQuery = buildBraveQueryFromParsed(parsed, ocrText);

      let braveResults = [];
      try {
        braveResults = await searchBrave(braveQuery, { count: 5 });
        console.log("🧭 Brave results (fallback no-objects):", braveResults.length);
      } catch (e) {
        console.error("⚠️ Brave search failed in fallback no-objects branch:", e);
      }

      fs.unlinkSync(filePath);
      return res.json({ detectedObject, texts, parsed, croppedBase64, braveResults });
    }
  }
   else {
      // --- Case B: crop the most central/large object, but rank by OCR density ---
      const { width, height } = await sharp(filePath).metadata();
      const centerX = width / 2;
      const centerY = height / 2;

      const scored = objects.map((obj) => {
        const v = obj.boundingPoly.normalizedVertices;
        const xs = v.map((v) => v.x * width);
        const ys = v.map((v) => v.y * height);
        const left = Math.min(...xs);
        const right = Math.max(...xs);
        const top = Math.min(...ys);
        const bottom = Math.max(...ys);
        const area = (right - left) * (bottom - top);
        const distance = Math.sqrt(
          (centerX - (left + right) / 2) ** 2 +
            (centerY - (top + bottom) / 2) ** 2
        );
        const score = area / (distance + 1);
        return { obj, left, top, right, bottom, score };
      });

      console.log("🔎 Scoring objects by OCR text density...");
      for (const candidate of scored) {
        const cropPath = `${filePath}-${candidate.obj.name}.jpg`;

        await sharp(filePath)
          .extract({
            left: Math.max(0, Math.floor(candidate.left)),
            top: Math.max(0, Math.floor(candidate.top)),
            width: Math.floor(candidate.right - candidate.left),
            height: Math.floor(candidate.bottom - candidate.top),
          })
          .resize(600)
          .toFile(cropPath);

        const [textResult] = await client.textDetection(cropPath);
        const textCount = textResult.textAnnotations?.length || 0;
        candidate.textCount = textCount;

        fs.unlinkSync(cropPath);
      }

      // pick the object with most text annotations
      scored.sort((a, b) => b.textCount - a.textCount);
      const best = scored[0];
      detectedObject = best.obj.name;
      console.log(
        `🎯 Selected object: ${detectedObject} (textCount=${best.textCount})`
      );

      const cropPath = `${filePath}-crop.jpg`;
      await sharp(filePath)
        .extract({
          left: Math.max(0, Math.floor(best.left)),
          top: Math.max(0, Math.floor(best.top)),
          width: Math.floor(best.right - best.left),
          height: Math.floor(best.bottom - best.top),
        })
        .toFile(cropPath);

      const [textResult] = await client.textDetection(cropPath);
      texts = textResult.textAnnotations?.map((t) => t.description) || [];
      // 🔍 JOIN OCR TEXT INTO MULTI-LINE STRING
      const ocrText = texts.join("\n");

      // 📝 PRINT FULL OCR TEXT FOR DEBUGGING
      console.log("===== 📝 OCR RAW TEXT BEGIN =====");
      console.log(ocrText);
      console.log("===== 📝 OCR RAW TEXT END =====");


      // fallback if cropped OCR is empty
      if (!texts.length) {
        console.log("⚠️ Cropped OCR empty. Fallback to full image OCR...");
        const [textResultFull] = await client.textDetection(filePath);
        texts = textResultFull.textAnnotations?.map((t) => t.description) || [];
        const buffer = fs.readFileSync(filePath);
        croppedBase64 = buffer.toString("base64");
      } else {
        const buffer = fs.readFileSync(cropPath);
        croppedBase64 = buffer.toString("base64");
        fs.unlinkSync(cropPath);
      }
    }

        // ---- 6️⃣ Use local parser first ----
    const parsed = parseProductText(texts);
    console.log("✅ Local parsed title:", parsed.title);

    // ---- 7️⃣ Refine with DeepSeek ----
    const joinedText = texts.join(" ");
    const aiParsed = await refineWithDeepSeek(joinedText);

    if (aiParsed) {
      parsed.title_zh = aiParsed.title_zh || parsed.title || "";
      parsed.title_en = aiParsed.title_en || "";
      parsed.weight = aiParsed.weight || parsed.weight || "";
      parsed.raw_ai = aiParsed.raw || "";

      parsed.title_ai = [parsed.title_zh, parsed.title_en, parsed.weight]
        .filter(Boolean)
        .join("\n");

      parsed.note += " | DeepSeek bilingual refinement applied.";
      console.log("🤖 DeepSeek output:", aiParsed);
    } else {
      parsed.title_ai = parsed.title;
    }

    // ---- 8️⃣ Brave search using parsed info ----
    const braveQuery = buildBraveQueryFromParsed(parsed, joinedText);

    let braveResults = [];
    try {
      braveResults = await searchBrave(braveQuery, { count: 5 });
      console.log("🧭 Brave results (objects branch):", braveResults.length);
    } catch (e) {
      console.error("⚠️ Brave search failed in objects branch:", e);
    }

    res.json({ detectedObject, texts, parsed, croppedBase64, braveResults });
    fs.unlinkSync(filePath);
  } catch (err) {
    console.error("❌ Error:", err);
    res.status(500).json({ error: "Failed to analyze image." });
  }
});


// ---- START SERVER ----
const PORT = process.env.PORT || 5050;
app.listen(PORT, () =>
  console.log(`🚀 Server running on http://localhost:${PORT}`)
);

export default app;
