import { CustomFlyerTemplateConfig } from "./loadFlyerTemplateConfig";

const KEY = "ufm_custom_templates";

function loadAll(): Record<string, CustomFlyerTemplateConfig> {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function loadCustomTemplates(): Record<string, CustomFlyerTemplateConfig> {
  return loadAll();
}

export function listCustomTemplates(): CustomFlyerTemplateConfig[] {
  return Object.values(loadAll());
}

export function saveCustomTemplate(c: CustomFlyerTemplateConfig): void {
  const all = loadAll();
  all[c.templateId] = c;
  localStorage.setItem(KEY, JSON.stringify(all));
}

/** Persist underprint assets to userData, then save template config. */
export async function saveCustomTemplateWithAssets(c: CustomFlyerTemplateConfig): Promise<void> {
  let pages = c.pages;
  if ((window as any).ufm?.persistTemplateAssets) {
    pages = await (window as any).ufm.persistTemplateAssets(c.templateId, c.pages);
  }
  saveCustomTemplate({ ...c, pages });
}

export function deleteCustomTemplate(id: string): void {
  const all = loadAll();
  delete all[id];
  localStorage.setItem(KEY, JSON.stringify(all));
}
