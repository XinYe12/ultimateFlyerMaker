import { CustomBoxDef } from "./loadFlyerTemplateConfig";

export type BoxFontWeight = "thin" | "normal" | "bold";

export const BOX_FONT_WEIGHT_OPTIONS: ReadonlyArray<{
  value: BoxFontWeight;
  label: string;
  css: number;
}> = [
  { value: "thin", label: "Thin", css: 300 },
  { value: "normal", label: "Original", css: 400 },
  { value: "bold", label: "Bold", css: 700 },
];

export function resolveBoxFontWeight(
  box: Pick<CustomBoxDef, "fontWeight" | "boxType" | "isEditable">,
): number {
  const preset = BOX_FONT_WEIGHT_OPTIONS.find(o => o.value === box.fontWeight);
  if (preset) return preset.css;
  if (box.boxType === "text" || box.isEditable) return 400;
  return 700;
}

export function normalizeBoxFontWeight(raw: unknown): BoxFontWeight | undefined {
  if (raw === "thin" || raw === "normal" || raw === "bold") return raw;
  return undefined;
}
