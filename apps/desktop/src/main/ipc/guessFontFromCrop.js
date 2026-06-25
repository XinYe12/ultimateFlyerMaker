import { net } from "electron";
import { resolveGeminiVisionModel } from "../config/geminiModels.js";

const FONT_OPTIONS = [
  { label: "Inter", value: "Inter, sans-serif" },
  { label: "Bebas", value: '"Bebas Neue", Impact, sans-serif' },
  { label: "Oswald", value: "Oswald, sans-serif" },
  { label: "Anton", value: "Anton, Impact, sans-serif" },
  { label: "Impact", value: "Impact, sans-serif" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Barlow", value: '"Barlow Condensed", sans-serif' },
  { label: "Teko", value: "Teko, sans-serif" },
  { label: "Fjalla", value: '"Fjalla One", sans-serif' },
  { label: "Raleway", value: '"Raleway", sans-serif' },
  { label: "Nunito", value: '"Nunito", sans-serif' },
];

function parseDataUrl(dataUrl) {
  const m = /^data:([^;]+);base64,(.+)$/i.exec(String(dataUrl || ""));
  if (!m) throw new Error("Invalid image data URL");
  return { mimeType: m[1], data: m[2] };
}

function mapLabelToValue(label) {
  const normalized = String(label || "").trim().toLowerCase();
  const hit = FONT_OPTIONS.find(
    o => o.label.toLowerCase() === normalized || o.label.toLowerCase().startsWith(normalized)
  );
  return hit?.value ?? null;
}

/**
 * @param {{ cropDataUrl: string }} payload
 * @returns {Promise<{ fontFamily: string | null; label: string | null; confidence: number; source: string } | null>}
 */
export async function guessFontFromCrop(payload) {
  const apiKey = String(process.env.GEMINI_API_KEY || "").trim();
  if (!apiKey) return null;

  const { mimeType, data } = parseDataUrl(payload?.cropDataUrl);
  const GEMINI_MODEL = await resolveGeminiVisionModel(apiKey);
  const allowed = FONT_OPTIONS.map(o => o.label).join(", ");

  const prompt = `You are a typography expert analyzing a cropped flyer text region.
Pick the closest matching font from this allowed list ONLY:
${allowed}

Return ONLY JSON:
{"label":"exact label from list or closest match","confidence":0.0}

confidence is 0-1 for how sure you are. If unreadable, use {"label":"","confidence":0}.`;

  const res = await net.fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inlineData: { mimeType, data } },
            { text: prompt },
          ],
        }],
        generationConfig: { temperature: 0, maxOutputTokens: 256 },
      }),
    }
  );

  if (!res.ok) return null;
  const json = await res.json();
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  if (!text) return null;

  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return null;
  }

  const fontFamily = mapLabelToValue(parsed.label);
  if (!fontFamily) return null;

  return {
    fontFamily,
    label: parsed.label,
    confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0.5)),
    source: "gemini",
  };
}
