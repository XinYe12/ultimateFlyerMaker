import { CustomFlyerTemplateConfig, UNDERPRINT_SCHEMA_VERSION } from "./loadFlyerTemplateConfig";

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
  // Stamp new underprinst with the current schema version so they're not re-generated on load.
  pages = pages.map(p => ({ ...p, underprintSchemaVersion: UNDERPRINT_SCHEMA_VERSION }));
  saveCustomTemplate({ ...c, pages });
}

export function deleteCustomTemplate(id: string): void {
  const all = loadAll();
  delete all[id];
  localStorage.setItem(KEY, JSON.stringify(all));
}

/**
 * Re-generates outdated underprint PNGs for a custom template and saves the
 * updated config. Returns the updated config if any page was upgraded, null
 * if everything was already current or no upgrade was possible.
 */
export async function upgradeTemplateUnderprintsIfNeeded(
  templateId: string
): Promise<CustomFlyerTemplateConfig | null> {
  const all = loadAll();
  const template = all[templateId];
  if (!template) return null;

  let anyChanged = false;
  const updatedPages = await Promise.all(
    template.pages.map(async page => {
      if ((page.underprintSchemaVersion ?? 0) >= UNDERPRINT_SCHEMA_VERSION) return page;
      const sourcePath = page.sourceImagePath;
      const oldOutputPath = page.backgroundImage;
      const areas = page.departmentAreas;
      if (!sourcePath || !oldOutputPath || !areas?.length) {
        // Can't regenerate — mark as current so we don't retry
        return { ...page, underprintSchemaVersion: UNDERPRINT_SCHEMA_VERSION };
      }
      try {
        // Write to a new versioned path so the <img> src changes and the browser re-fetches.
        const newOutputPath = oldOutputPath.replace(/\.png$/i, `_v${UNDERPRINT_SCHEMA_VERSION}.png`);
        await window.ufm.regenerateUnderprint({
          sourcePath,
          outputPath: newOutputPath,
          canvasWidth: page.canvasWidth,
          canvasHeight: page.canvasHeight,
          departmentAreas: areas,
        });
        anyChanged = true;
        return { ...page, backgroundImage: newOutputPath, underprintSchemaVersion: UNDERPRINT_SCHEMA_VERSION };
      } catch (e) {
        console.warn("[underprint-upgrade] Failed for page", page.pageId, e);
        return page;
      }
    })
  );

  if (!anyChanged) {
    // Still mark pages as current (e.g. no sourceImagePath) to avoid repeated checks
    const markedPages = updatedPages;
    const allMarked = markedPages.every(p => (p.underprintSchemaVersion ?? 0) >= UNDERPRINT_SCHEMA_VERSION);
    if (!allMarked) return null;
    const updated = { ...template, pages: markedPages };
    saveCustomTemplate(updated);
    return null;
  }

  const updated = { ...template, pages: updatedPages };
  saveCustomTemplate(updated);
  return updated;
}
