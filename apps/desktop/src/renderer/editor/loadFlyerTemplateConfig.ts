export type SlotDef = { x: number; y: number; width: number; height: number };

export type DepartmentDef =
  | { x: number; y: number; width: number; height: number }
  | { slots: SlotDef[] };

export interface FlyerTemplateConfig {
  templateId: string;
  pages: {
    pageId: string;
    imagePath: string;
    departments: Record<string, DepartmentDef>;
  }[];
}

export function isSlottedDepartment(def: DepartmentDef): def is { slots: SlotDef[] } {
  return "slots" in def && Array.isArray(def.slots);
}

export async function loadFlyerTemplateConfig(
  templateId: string
): Promise<FlyerTemplateConfig> {
  // try subfolder layout first, fall back to flat
  // (Vite dev server may return index.html with 200 for missing files, so we catch JSON parse errors)
  const urls = [
    `/assets/flyer_templates/${templateId}/${templateId}.config.json`,
    `/assets/flyer_templates/${templateId}.config.json`,
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const config = await res.json();
      if (config && typeof config.templateId === "string" && Array.isArray(config.pages)) {
        return config;
      }
    } catch {
      continue;
    }
  }

  throw new Error(`Failed to load template config: ${templateId}`);
}

export function findPageForDepartment(
  config: FlyerTemplateConfig,
  department: string
) {
  return config.pages.find(
    page => page.departments && page.departments[department]
  );
}
