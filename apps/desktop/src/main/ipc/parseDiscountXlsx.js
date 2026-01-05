// apps/desktop/src/main/ipc/parseDiscountXlsx.js
// XLSX → text → DeepSeek → normalized discount items
// SAME LOGIC + OUTPUT CONTRACT AS parseDiscountText
// MAIN PROCESS ONLY — no ipcRenderer, no UI logic, no side effects

import XLSX from "xlsx";

const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-chat";

/* -------------------- helpers (COPIED LOGIC) -------------------- */

function getEnv(name) {
  return (process.env[name] ?? "").toString().trim();
}

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function normalizeOptionalString(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function assertNonEmptyString(value, field) {
  if (typeof value !== "string") {
    throw new Error(`Invalid field "${field}": must be a string`);
  }
  const s = value.trim();
  if (!s) {
    throw new Error(`Invalid field "${field}": cannot be empty`);
  }
  return s;
}

// STRICT PRICE FORMAT (same contract)
function assertPriceString(value, field) {
  const s = assertNonEmptyString(value, field);
  const simple = /^\d+\.\d{2}$/;
  const multibuy = /^\d+\/\d+\.\d{2}$/;

  if (!simple.test(s) && !multibuy.test(s)) {
    throw new Error(
      `Invalid field "${field}": must be "10.99" or "3/9.99"`
    );
  }
  return s;
}

function normalizeUnit(unitRaw) {
  const u = normalizeOptionalString(unitRaw).toLowerCase();

  const UNIT_MAP = {
    lb: ["lb", "lbs", "pound", "pounds"],
    ea: ["ea", "each", "pc", "pcs", "piece", "pieces", "item", "items"],
    bag: ["bag", "bags", "pkg", "pkgs", "package", "packages"],
    order: ["order"]
  };

  for (const [out, variants] of Object.entries(UNIT_MAP)) {
    if (variants.includes(u)) return out;
  }

  // SAME RULE YOU STATED
  return "ea";
}

function normalizeSize(sizeRaw) {
  if (sizeRaw === undefined || sizeRaw === null) return "";

  const s = String(sizeRaw).trim();
  if (!s) return "";

  const SIZE_PATTERNS = [
    // single size: 100g, 1kg, 500ml
    /^\d+(\.\d+)?\s*(g|kg|ml|mL|l|L)$/i,

    // multiplier: 4x20g, 20g*4, 20g x 4
    /^\d+(\.\d+)?\s*(g|kg|ml|mL|l|L)\s*[xX*]\s*\d+$/i,
    /^\d+\s*[xX*]\s*\d+(\.\d+)?\s*(g|kg|ml|mL|l|L)$/i,

    // range: 261g-300g, 500ml-1L
    /^\d+(\.\d+)?\s*(g|kg|ml|mL|l|L)\s*-\s*\d+(\.\d+)?\s*(g|kg|ml|mL|l|L)$/i
  ];

  const isValid = SIZE_PATTERNS.some((re) => re.test(s));
  if (!isValid) return "";

  return s.replace(/\s+/g, "");
}

/* -------------------- validation (DROP BAD ROWS) -------------------- */

function validateItems(parsed) {
  if (!Array.isArray(parsed)) {
    throw new Error("DeepSeek output must be a JSON array");
  }

  return parsed
    .map((item, idx) => {
      if (!isPlainObject(item)) return null;

      const zh = normalizeOptionalString(item.zh);
      const en = normalizeOptionalString(item.en);

      if (!zh && !en) return null;

      let salePrice;
      try {
        salePrice = assertPriceString(
          String(item.salePrice),
          `items[${idx}].salePrice`
        );
      } catch {
        return null; // XLSX RULE: drop bad row
      }

      let regularPrice;
      if (
        item.regularPrice !== undefined &&
        item.regularPrice !== null &&
        String(item.regularPrice).trim() !== ""
      ) {
        try {
          regularPrice = assertPriceString(
            String(item.regularPrice),
            `items[${idx}].regularPrice`
          );
        } catch {
          regularPrice = undefined;
        }
      }

      return {
        zh,
        en,
        salePrice,
        regularPrice,
        unit: normalizeUnit(item.unit),
        size: normalizeSize(item.size)
      };
    })
    .filter(Boolean);
}

/* -------------------- DeepSeek (SAME PROMPT) -------------------- */

function buildMessages(rawText) {
  const system = [
    "You are a strict JSON generator.",
    "Output JSON only. No markdown. No explanation. No comments.",
    "",
    "Rules:",
    '1) Items are separated by numbered markers like "1、 2、 3、".',
    "2) Ignore banners and department headers.",
    '3) Output objects like {"zh":"","en":"","salePrice":"10.99","regularPrice":"","unit":"ea","size":""}.',
    '4) If only one price exists, it is salePrice; regularPrice is empty string.',
    '5) Multi-buy must be "3/9.99".',
    '6) unit defaults to "ea" if missing.',
    '7) size is like "130g", "500mL", "12x355mL". If unclear, empty string.',
    "",
    "Return a JSON array."
  ].join("\n");

  return [
    { role: "system", content: system },
    {
      role: "user",
      content: `DISCOUNT TEXT:\n${rawText}`
    }
  ];
}

async function callDeepSeek(rawText) {
  const apiKey = getEnv("DEEPSEEK_API_KEY");
  if (!apiKey) throw new Error("Missing DEEPSEEK_API_KEY");

  const baseUrl = getEnv("DEEPSEEK_BASE_URL") || DEFAULT_BASE_URL;
  const model = getEnv("DEEPSEEK_MODEL") || DEFAULT_MODEL;

  const res = await fetch(
    `${baseUrl.replace(/\/$/, "")}/chat/completions`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 2048,
        response_format: { type: "json_object" },
        messages: buildMessages(rawText)
      })
    }
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`DeepSeek error ${res.status}: ${text}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;

  if (typeof content !== "string" || !content.trim()) {
    throw new Error("DeepSeek returned empty content");
  }

  if (content.includes("```")) {
    throw new Error("DeepSeek returned non-JSON content");
  }

  const parsed = JSON.parse(content);
  if (Array.isArray(parsed)) return parsed;
  if (isPlainObject(parsed) && Array.isArray(parsed.items)) {
    return parsed.items;
  }

  throw new Error("DeepSeek JSON must be an array");
}

/* -------------------- XLSX → CLEAN TEXT -------------------- */

function xlsxToText(filePath) {
  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];

  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: ""
  });

  const lines = [];
  let n = 1;

  for (const row of rows) {
    if (!Array.isArray(row)) continue;

    const name = String(row[1] || "").trim();
    const zh = String(row[2] || "").trim();
    const size = String(row[3] || "").trim();
    const now = String(row[4] || "").trim();
    const was = String(row[5] || "").trim();

    // 🔑 HARD RULE: no valid price → ignore row
    if (!/^\d+\.\d{2}$/.test(now) && !/^\d+\/\d+\.\d{2}$/.test(now)) continue;

    const parts = [];
    if (name) parts.push(`EN:${name}`);
    if (zh) parts.push(`ZH:${zh}`);

    if (size) parts.push(size);
    parts.push(now);
    if (/^\d+\.\d{2}$/.test(was)) parts.push(`Was ${was}`);

    lines.push(`${n}、 ${parts.join(" ")}`);
    n++;
  }

  return lines.join("\n");
}

/* -------------------- IPC handler -------------------- */

export async function parseDiscountXlsx(_event, filePath) {
  const path =
    typeof filePath === "string" ? filePath.trim() : "";

  if (!path) {
    throw new Error("parseDiscountXlsx received empty file path");
  }

  const text = xlsxToText(path);
  if (!text) {
    throw new Error("XLSX contained no valid discount rows");
  }

  const items = await callDeepSeek(text);
  const validated = validateItems(items);

  return validated.map((item) => {
    const out = { ...item };
    const isMulti = out.salePrice.includes("/");

    if (out.regularPrice !== undefined) {
      const rp = String(out.regularPrice).trim();

      if (rp === "") {
        delete out.regularPrice;
      } else if (isMulti) {
        out.regularPrice = `$${rp} /ea`;
      } else {
        out.regularPrice = rp;
      }
    }

    return out;
  });
}
