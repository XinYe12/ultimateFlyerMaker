// apps/desktop/src/main/ipc/parseDiscountText.js
// DeepSeek-powered discount parser
// MAIN PROCESS ONLY — no ipcRenderer, no UI logic, no side effects

const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-chat";

/* -------------------- helpers -------------------- */

function getEnv(name) {
  return (process.env[name] ?? "").toString().trim();
}

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
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

function normalizeOptionalString(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

// allowed:
//  - "10.99"
//  - "3/9.99"
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
  const u = assertNonEmptyString(unitRaw, "unit").toLowerCase();

  const UNIT_MAP = {
    lb: ["lb", "lbs", "pound", "pounds"],
    ea: ["ea", "each", "pc", "pcs", "piece", "pieces", "item", "items"],
    bag: ["bag", "bags", "pkg", "pkgs", "package", "packages"],
    order: ["order"]
  };

  for (const [out, variants] of Object.entries(UNIT_MAP)) {
    if (variants.includes(u)) {
      return out;
    }
  }
  return "ea";
}

function normalizeSize(sizeRaw) {
  if (sizeRaw === undefined || sizeRaw === null) return "";

  const s = String(sizeRaw).trim();
  if (!s) return "";

  const SIZE_PATTERNS = [
    /^\d+(\.\d+)?\s*(g|kg|ml|mL|l|L)$/i,
    /^\d+\s*[xX*]\s*\d+(\.\d+)?\s*(g|kg|ml|mL|l|L)$/i
  ];

  const isValid = SIZE_PATTERNS.some((re) => re.test(s));
  if (!isValid) return "";

  return s.replace(/\s+/g, "");
}

/* -------------------- validation -------------------- */

function validateItems(parsed) {
  if (!Array.isArray(parsed)) {
    throw new Error("DeepSeek output must be a JSON array");
  }

  return parsed.map((item, idx) => {
    if (!isPlainObject(item)) {
      throw new Error(`Item #${idx + 1} must be an object`);
    }

    const zh = normalizeOptionalString(item.zh);
    const en = normalizeOptionalString(item.en);

    if (!zh && !en) {
      throw new Error(`Item #${idx + 1}: either zh or en title must be present`);
    }

    const salePrice = assertPriceString(
      item.salePrice,
      `items[${idx}].salePrice`
    );

    let regularPrice;
    if (
      item.regularPrice !== undefined &&
      item.regularPrice !== null &&
      String(item.regularPrice).trim() !== ""
    ) {
      regularPrice = assertPriceString(
        String(item.regularPrice),
        `items[${idx}].regularPrice`
      );
    }

    const unit = normalizeUnit(item.unit);
    const size = normalizeSize(item.size);

    return {
      zh,
      en,
      salePrice,
      regularPrice,
      unit,
      size
    };
  });
}

/* -------------------- DeepSeek -------------------- */

function buildMessages(rawText) {
  const system = [
    "You are a strict JSON generator.",
    "Output JSON only. No markdown. No explanation. No comments.",
    "",
    "Rules:",
    '1) Items are separated by numbered markers like "1、 2、 3、".',
    "2) Ignore banners like 这周特价 / 限时优惠.",
    '3) Output objects like {"zh":"","en":"","salePrice":"10.99","regularPrice":"","unit":"ea","size":""}.',
    '4) If only one price exists, it is salePrice; regularPrice is empty string.',
    '5) Multi-buy prices MUST preserve original format like "2/4.99", "3/9.99". Do NOT rewrite as natural language.',
    '6) unit must be one of: "lb", "ea", "bag", "order". If missing, use "ea".',
    '7) size is portion size like "100g", "100mL", "250g", "1L", or "12x355mL". If missing or unclear, output empty string.',
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
  if (!apiKey) {
    throw new Error("Missing DEEPSEEK_API_KEY");
  }

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

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("DeepSeek returned invalid JSON");
  }

  if (Array.isArray(parsed)) return parsed;
  if (isPlainObject(parsed) && Array.isArray(parsed.items)) {
    return parsed.items;
  }

  throw new Error("DeepSeek JSON must be an array");
}

/* -------------------- IPC handler -------------------- */

export async function parseDiscountText(_event, rawText) {
  const input =
    typeof rawText === "string" ? rawText.trim() : "";

  if (!input) {
    throw new Error("parseDiscountText received empty input");
  }

  const items = await callDeepSeek(input);
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
