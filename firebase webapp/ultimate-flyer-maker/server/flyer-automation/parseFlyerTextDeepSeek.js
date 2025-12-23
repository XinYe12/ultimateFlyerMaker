// server/parseFlyerTextDeepSeek.js
import "dotenv/config";
const fetch = global.fetch;

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

function normalizeInput(text) {
  return text
    .replace(/，/g, ",")
    .replace(/。/g, "")
    .replace(/\s+/g, "")
    .trim();
}

// Step 1: parse CN + price
function parseItems(rawText) {
  const normalized = normalizeInput(rawText);
  const parts = normalized.split(",").filter(Boolean);

  const items = [];

  for (const part of parts) {
    const match = part.match(
      /^([\u4e00-\u9fff𦟌]+)(\d+(\.\d+)?)(lb|LB)$/i
    );
    if (!match) continue;

    items.push({
      cnName: match[1],
      price: Number(match[2]),
      unit: "LB",
    });
  }
  return items;
}

// Step 2: DeepSeek translation
async function translateWithDeepSeek(cnNames) {
  const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      temperature: 0.1,
      max_tokens: 300,
      messages: [
        {
          role: "system",
          content:
            "你是一个超市促销文案助手。你的任务是将中文肉类/食品商品名称翻译成简洁、规范、适合超市传单使用的英文商品标题。" +
            "要求：不添加重量、不添加价格、不添加修饰词，保留品牌（如 永达 → Yongda）。" +
            "只输出 JSON。",
        },
        {
          role: "user",
          content:
            `请翻译以下商品名称，输出 JSON 数组，格式：` +
            `[{"cn":"中文名","en":"英文名"}]\n\n` +
            JSON.stringify(cnNames),
        },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error("DeepSeek error: " + errText);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("DeepSeek returned invalid JSON:\n" + content);
  }

  const map = new Map();
  for (const row of parsed) {
    if (row.cn && row.en) {
      map.set(row.cn, row.en);
    }
  }
  return map;
}

// Step 3: format flyer blocks
function formatBlock(en, cn, price, unit) {
  return {
    enTitle: en.toUpperCase(),
    cnTitle: cn,
    priceLine: `$${price.toFixed(2)} /${unit}`,
    textBlock: `${en.toUpperCase()}\n${cn}\n$${price.toFixed(2)} /${unit}`,
  };
}

// MAIN ENTRY
export async function buildFlyerTextFromInput(rawText) {
  const items = parseItems(rawText);
  if (!items.length) return [];

  const cnNames = items.map(i => i.cnName);
  const translationMap = await translateWithDeepSeek(cnNames);

  return items.map(item => {
    const en =
      translationMap.get(item.cnName) || item.cnName;
    return formatBlock(en, item.cnName, item.price, item.unit);
  });
}
