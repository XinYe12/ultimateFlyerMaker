export interface FlyerTemplateConfig {
  templateId: string;
  pages: {
    pageId: string;
    imagePath: string;
    departments: Record<
      string,
      {
        x: number;
        y: number;
        width: number;
        height: number;
      }
    >;
  }[];
}

export async function loadFlyerTemplateConfig(
  templateId: string
): Promise<FlyerTemplateConfig> {
  const res = await fetch(
    `/assets/flyer_templates/${templateId}.config.json`
  );

  if (!res.ok) {
    throw new Error(`Failed to load template config: ${templateId}`);
  }

  const config = await res.json();

  if (
    !config ||
    typeof config.templateId !== "string" ||
    !Array.isArray(config.pages)
  ) {
    throw new Error("Invalid flyer template config");
  }

  return config;
}

export function findPageForDepartment(
  config: FlyerTemplateConfig,
  department: string
) {
  return config.pages.find(
    page => page.departments && page.departments[department]
  );
}
