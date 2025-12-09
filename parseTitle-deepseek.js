// parseTitle-deepseek.js
const fetch = global.fetch; // Node 18+ has fetch built in

const DEEPSEEK_API_KEY = 'sk-79262b88256d491d9156005b32569ed8'; // replace with your key

const ocrText = `
U.S.A./É.-U.A. NO.1
EXTRA FANCY/DE FANTAISIE
RIZ POUR SUS
寿司米
ぼたん米 牡丹圓米
BOTAN
BRAND
MARQUE
XTR
たん
C
A
RI
T 6.
OF USA
CALROSE
RIZ RICE
NET 6.8 kg 15 lb K
PRODUCT OF USA/PRODUIT DES ÉTATS-UNIS
NON
GMO
SANS
OGM
VERIFIED VERIFIE
PACKED FOR EMBALLE POUR
A, ON, LAW OCT. CAADA U.S.A./É.-U.A . NO.1 EXTRA FANCY / DE FANTAISIE RIZ POUR SUS 寿司 米 ぼたん 米 牡丹 圓 米 BOTAN BRAND MARQUE XTR たん C A RI T 6 . OF USA CALROSE RIZ RICE NET 6.8 kg 15 lb K PRODUCT OF USA / PRODUIT DES ÉTATS - UNIS NON GMO SANS OGM VERIFIED VERIFIE PACKED FOR EMBALLE POUR A , ON , LAW OCT . 
`;

// ---- helper cleaner ----
function cleanOCR(text) {
  text = text.replace(/[a-zA-Z]/g, ' ');
  text = text.replace(/\d+克/g, ' ');
  text = text.replace(/[^\u4e00-\u9fa5\s]/g, ' ');
  return text.replace(/\s+/g, ' ').trim();
}
const cleaned = cleanOCR(ocrText);

// ---- main ----
async function parseProductTitle() {
  const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'deepseek-chat', // or 'deepseek-reasoner'
      messages: [
        {
          role: 'system',
          content:
            '你是一个智能助手，任务是从OCR识别的文字中提取出简洁规范的中文产品标题，只包含品牌名和主产品名称。忽略口味、净含量、杂乱英文和重复信息。',
        },
        {
          role: 'user',
          content: `OCR文字：${cleaned}\n\n输出示例：半糖时光 宫廷桃酥系列\n\n请输出产品标题：`,
        },
      ],
      temperature: 0.3,
      max_tokens: 200,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    console.error('❌ API Error:', response.status, err);
    return;
  }

  const data = await response.json();
  console.log('\n🧾 Parsed Product Title:');
  console.log(data.choices[0].message.content.trim());
}

parseProductTitle();
