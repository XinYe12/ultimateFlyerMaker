export type SlotDef = { x: number; y: number; width: number; height: number };

export type CardDepartmentDef = {
  region: { x: number; y: number; width: number; height: number };
  rows: number;
  cols?: number;
  cropLeft?: number;
  cropRight?: number;
  cropTop?: number;
  cropBottom?: number;
};

export type DepartmentDef =
  | { x: number; y: number; width: number; height: number }
  | { slots: SlotDef[] }
  | CardDepartmentDef;

export interface FlyerTemplateConfig {
  templateId: string;
  pages: {
    pageId: string;
    imagePath?: string;
    canvasWidth?: number;
    canvasHeight?: number;
    boxes?: CustomBoxDef[];
    departments: Record<string, DepartmentDef>;
    /** Full wizard department metadata (grid style, padding, card appearance). */
    departmentAreas?: DepartmentAreaDef[];
    backgroundColor?: string;
    backgroundImage?: string;
  }[];
}

// ── Custom template types ──

/** @deprecated No longer used for rendering — kept for backward-compat deserialization only */
export type BoxType = string;

export type CustomBoxDef = {
  id: string;
  label: string;
  departmentKey: string;
  color: string;
  textColor: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rows: number;
  textAlign?: 'left' | 'center' | 'right';
  textVertical?: 'top' | 'middle' | 'bottom';
  fontFamily?: string;
  /** Separate font for CJK characters; when set, Chinese text uses this font while Latin text uses fontFamily */
  zhFontFamily?: string;
  cropLeft?: number;
  cropRight?: number;
  cropTop?: number;
  cropBottom?: number;
  /** Box type: product = visual label only (product region comes from departmentAreas), text = multi-line text, image = image placeholder, color = solid bar */
  boxType?: BoxType;
  /** Multi-line text content for text boxes */
  content?: string;
  /** Image path/URL for image boxes (logo, etc.) */
  imagePath?: string;
  /** Highlight color for text boxes */
  highlightColor?: string;
  /** Character range to highlight in content */
  highlightRange?: { start: number; end: number };
  /** Font size for text (product, text, image boxes) */
  fontSize?: number;
  /** Corner rounding in px (default 0) */
  borderRadius?: number;
  /** Border stroke width in px (default 0 = no border) */
  borderWidth?: number;
  /** Border stroke color (hex, default "#000000") */
  borderColor?: string;
  /** Free text position: px from left edge of box (overrides textAlign/textVertical when set) */
  textOffsetX?: number;
  /** Free text position: px from top edge of box */
  textOffsetY?: number;
  /** Whether the user updates this field each week (e.g. valid dates) */
  isEditable?: boolean;
  /** Semantic kind for editable fields */
  fieldKind?: 'date_range' | 'store_name' | 'address' | 'footer' | 'decorative' | 'custom';
};

/** Visual style of the department region background (step 1). */
export type RegionStyleDef = {
  backgroundColor?: string;
  borderRadius?: number;
};

/** Visual appearance of each product card within a department grid. */
export type CardStyleDef = {
  /** Product cell background color */
  backgroundColor?: string;
  /** Corner rounding in px (0 = sharp) */
  borderRadius?: number;
  /** Border stroke width in px (0 = no border) */
  borderWidth?: number;
  /** Border stroke color */
  borderColor?: string;
  /** Whether cells have a drop shadow */
  hasShadow?: boolean;
  /** Layout of content within the card */
  orientation?: 'vertical' | 'horizontal' | 'top';
  /** Product title font size in px */
  titleFontSize?: number;
  /** Unit + regular price font size in px (smaller secondary line) */
  metaFontSize?: number;
  /** Product title text color */
  titleColor?: string;
  /** Price number text color */
  priceColor?: string;
  /** Where the price label sits inside the card */
  pricePosition?: 'bottom-right' | 'bottom-left' | 'bottom-center' | 'right';
  /** Approximate % of cell height (vertical) or width (horizontal) devoted to the image */
  imagePercent?: number;
};

/** Fine-grained control of product grid placement inside productRegion. */
export type GridLayoutDef = {
  /** px gap between adjacent cells */
  cellGap?: number;
  insetTop?: number;
  insetLeft?: number;
  insetRight?: number;
  insetBottom?: number;
  /** Relative row height weights (length = rows) */
  rowWeights?: number[];
  /** Relative column width weights (length = cols) */
  colWeights?: number[];
  /** Target cell width used to derive rows/cols in the import wizard */
  targetCellWidth?: number;
  /** Target cell height used to derive rows/cols in the import wizard */
  targetCellHeight?: number;
};

/** Defines where product cards are laid out. Separate from visual department boxes. */
export type DepartmentAreaDef = {
  id?: string; // optional for backward compat; added when missing
  departmentKey: string;
  label: string;
  rows: number;
  /** Number of product columns per row */
  cols?: number;
  productRegion: { x: number; y: number; width: number; height: number };
  /** Department background fill behind the product grid */
  regionStyle?: RegionStyleDef;
  /** Detected or configured style for each product card in this area */
  cardStyle?: CardStyleDef;
  /** Padding/gap/weights to align grid cells with the source flyer */
  gridLayout?: GridLayoutDef;
};

export type CustomTemplatePage = {
  pageId: string;
  canvasWidth: number;
  canvasHeight: number;
  boxes: CustomBoxDef[];
  /** Product placement regions. When present, used instead of product box dimensions. */
  departmentAreas?: DepartmentAreaDef[];
  /** Background image URL (data URL or asset path) for banner-style templates */
  backgroundImage?: string;
  /** Original source flyer image path (for reference overlay in builder) */
  sourceImagePath?: string;
  /** Fallback background color when no image */
  backgroundColor?: string;
};

export type CustomFlyerTemplateConfig = {
  templateId: string;
  isCustom: true;
  name: string;
  pages: CustomTemplatePage[];
};

export function isCustomPage(page: any): boolean {
  return Array.isArray(page?.boxes);
}

/** Legacy: product boxes without departmentAreas. Use region BELOW the visual box, not the box itself. */
function boxesToDepartments(
  boxes: CustomBoxDef[],
  canvasWidth: number,
  canvasHeight: number
): Record<string, DepartmentDef> {
  const productBoxes = boxes.filter(b => !b.boxType || b.boxType === 'product');
  return Object.fromEntries(
    productBoxes.map(b => {
      const belowY = b.y + b.height;
      const region = {
        x: b.x,
        y: belowY,
        width: Math.min(b.width, canvasWidth - b.x),
        height: Math.max(300, canvasHeight - belowY - 40),
      };
      return [
        b.departmentKey,
        {
          region,
          rows: b.rows,
          cropLeft: b.cropLeft,
          cropRight: b.cropRight,
          cropTop: b.cropTop,
          cropBottom: b.cropBottom,
        } as CardDepartmentDef,
      ];
    })
  );
}

const DEPT_REGION_GAP = 6;

/** Expand department area to fill canvas if it was saved with the old small default (400px). */
function expandSqueezedRegion(
  productRegion: { x: number; y: number; width: number; height: number },
  canvasWidth: number,
  canvasHeight: number,
  siblingAreas?: DepartmentAreaDef[]
): { x: number; y: number; width: number; height: number } {
  let availableHeight = canvasHeight - productRegion.y - 40;

  if (siblingAreas?.length) {
    const nextBelow = siblingAreas
      .map(a => a.productRegion.y)
      .filter(y => y > productRegion.y + 1)
      .sort((a, b) => a - b)[0];
    if (nextBelow != null) {
      availableHeight = Math.min(availableHeight, nextBelow - productRegion.y - DEPT_REGION_GAP);
    }
  }

  availableHeight = Math.max(0, availableHeight);
  if (productRegion.height >= availableHeight * 0.5) return productRegion;
  return {
    ...productRegion,
    width: Math.min(productRegion.width, canvasWidth - productRegion.x),
    height: availableHeight,
  };
}

function buildDepartments(page: CustomTemplatePage): Record<string, DepartmentDef> {
  if (page.departmentAreas?.length) {
    const cw = page.canvasWidth;
    const ch = page.canvasHeight;
    return Object.fromEntries(
      page.departmentAreas.map(d => {
        const region = expandSqueezedRegion(d.productRegion, cw, ch, page.departmentAreas);
        return [
          d.departmentKey,
          {
            region,
            rows: d.rows,
            ...(d.cols != null ? { cols: d.cols } : {}),
          } as CardDepartmentDef,
        ];
      })
    );
  }
  return boxesToDepartments(page.boxes, page.canvasWidth, page.canvasHeight);
}

function hydrateCustomTemplate(c: CustomFlyerTemplateConfig): FlyerTemplateConfig {
  return {
    templateId: c.templateId,
    pages: c.pages.map(p => ({
      pageId: p.pageId,
      imagePath: p.backgroundImage ?? undefined,
      canvasWidth: p.canvasWidth,
      canvasHeight: p.canvasHeight,
      boxes: p.boxes,
      departments: buildDepartments(p),
      departmentAreas: p.departmentAreas,
      backgroundColor: p.backgroundColor,
      backgroundImage: p.backgroundImage,
    })),
  };
}

export function isCardDepartment(def: DepartmentDef): def is CardDepartmentDef {
  return "region" in def && "rows" in def;
}

export function isSlottedDepartment(def: DepartmentDef): def is { slots: SlotDef[] } {
  return "slots" in def && Array.isArray((def as any).slots);
}

export async function loadFlyerTemplateConfig(
  templateId: string
): Promise<FlyerTemplateConfig> {
  // Check localStorage for custom templates first
  try {
    const raw = localStorage.getItem("ufm_custom_templates");
    if (raw) {
      const customs: Record<string, CustomFlyerTemplateConfig> = JSON.parse(raw);
      if (customs[templateId]) return hydrateCustomTemplate(customs[templateId]);
    }
  } catch { /* ignore */ }

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

/** Wizard department area for a department key (grid style, padding, card appearance). */
export function findDepartmentArea(
  config: FlyerTemplateConfig,
  department: string
): DepartmentAreaDef | null {
  for (const page of config.pages) {
    const area = page.departmentAreas?.find(a => a.departmentKey === department);
    if (area) return area;
  }
  return null;
}
