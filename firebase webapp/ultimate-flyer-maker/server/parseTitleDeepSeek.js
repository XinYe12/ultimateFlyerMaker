// server/parseTitleDeepSeek.js
const fetch = global.fetch;

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY; // store in .env file

// helper to clean OCR junk
function cleanOCR(text) {
  return text
    .split(/\n+/)
    .map(t => t.trim())
    .filter(t =>
      /[\u4e00-\u9fa5]/.test(t) ||     // keep Chinese
      /\b\d+(g|kg|ml|oz|l)\b/i.test(t) // keep weights
    )
    .filter(t => t.length > 1)
    .join("\n");
}


function withTimeout(ms, promise) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timeout")), ms);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

export async function parseProductTitle(ocrText) {
  const cleaned = cleanOCR(ocrText);
  console.log("🧾 Cleaned OCR text preview:\n", cleaned.slice(0, 500));
  console.log("🧠 Sending DeepSeek API request...");

  try {
    const response = await withTimeout(
      20000, // 20 seconds timeout
      fetch("https://api.deepseek.com/v1/chat/completions", {
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
              content:
                "你是一个智能助手，任务是从OCR识别的文字中提取出简洁规范的中文和英文产品标题和重量（如果有的话），只包含品牌名和主产品名称。忽略口味、净含量、杂乱英文和重复信息。优先输出食品类标题，忽略药品类产品。输出中保持一行中文标题，一行英文标题，一行重量（如有）。",
            },
            {
              role: "user",
              content: `以下是OCR识别结果，请你判断这些产品是否属于同一品牌或系列。
                          如果它们属于同一系列（例如不同口味、不同颜色、不同配方），
                          请输出一个概括性的系列名称作为产品标题。
                          输出格式：
                          品牌名称 + 产品细分名称
                          Brand Name + Product Name
                          size
                          --------------------
                          ${cleaned}
                          --------------------
                          输出示例：
                          乐事 薯片系列
                          Lays Potato Chips Series
                          300g
                          请输出：`
            }

          ],
          temperature: 0.3,
          max_tokens: 200,
        }),
      })
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error("❌ DeepSeek API Error:", response.status, errText);
      throw new Error("DeepSeek API call failed");
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim();
    console.log("✅ DeepSeek response received.", content);
    return content || "";
  } catch (err) {
    console.error("⚠️ DeepSeek call failed:", err.message);
    throw err;
  }
}

