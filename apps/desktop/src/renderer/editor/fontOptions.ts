export type FontOption = { label: string; value: string };

/** value: "" means use the CSS class default font */
export const FONT_OPTIONS: FontOption[] = [
  { label: "Default", value: "" },
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

export const ZH_FONT_OPTIONS: FontOption[] = [
  { label: "默认 Default", value: "" },
  { label: "Source Han Sans 思源黑体", value: '"Source Han Sans", "Noto Sans SC", sans-serif' },
  { label: "PingFang SC 苹方", value: '"PingFang SC", sans-serif' },
  { label: "Microsoft YaHei 微软雅黑", value: '"Microsoft YaHei", sans-serif' },
  { label: "SimHei 黑体", value: "SimHei, sans-serif" },
  { label: "KaiTi 楷体", value: "KaiTi, serif" },
  { label: "FangSong 仿宋", value: "FangSong, serif" },
  { label: "SimSun 宋体", value: "SimSun, serif" },
];

export function findFontOption(value: string | undefined, options: FontOption[] = FONT_OPTIONS): FontOption | undefined {
  if (!value) return options.find(o => o.value === "");
  return options.find(o => o.value === value);
}

export function fontLabelForValue(value: string | undefined, options: FontOption[] = FONT_OPTIONS): string {
  const opt = findFontOption(value, options);
  return opt?.label ?? value ?? "Default";
}
