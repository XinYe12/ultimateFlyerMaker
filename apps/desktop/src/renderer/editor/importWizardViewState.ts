export type WizardViewMode = "overlay" | "sideBySide";

export type UnderprintOpacityPreset = "solid" | "fade30" | "fade70" | "hidden";

export const UNDERPRINT_OPACITY_CYCLE: {
  key: UnderprintOpacityPreset;
  label: string;
  opacity: number;
}[] = [
  { key: "solid", label: "Solid", opacity: 1 },
  { key: "fade30", label: "30% fade", opacity: 0.7 },
  { key: "fade70", label: "70% fade", opacity: 0.3 },
  { key: "hidden", label: "Hidden", opacity: 0 },
];

export function nextUnderprintPresetIdx(current: number): number {
  return (current + 1) % UNDERPRINT_OPACITY_CYCLE.length;
}
