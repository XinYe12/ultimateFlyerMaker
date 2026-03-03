// PATH: apps/desktop/src/renderer/types.ts
// 🔧 ADD: DiscountMatch + DiscountItem exports (keep existing ingestion/editor fields)

export type IngestStatus = "pending" | "running" | "done" | "error";

// Shape produced by parseDiscountText and parseDiscountXlsx
export type ParsedDiscount = {
  en: string;
  zh: string;
  size: string;
  salePrice: string;
  regularPrice: string;
  unit: string;
  quantity: string | number | null;
  isSeries: boolean;
  flavorCount: number;
  price: { display: string };
};

export type OCRResult = Array<{
  rec_texts: string[];
  rec_scores?: number[];
}>;

export type DepartmentId =
  | "grocery"
  | "frozen"
  | "hot_food"
  | "sushi"
  | "meat"
  | "seafood"
  | "fruit"
  | "vegetable"
  | "hot_sale"
  | "produce";

export type IngestResult = {
  inputPath: string;
  cutoutPath: string;
  /** Multi-flavor/series: currently active/selected product images */
  cutoutPaths?: string[];
  /** Full staged set from DB search — preserved even after user narrows selection */
  allFlavorPaths?: string[];
  /** True when item is a series and user has not yet chosen which flavors to include */
  pendingFlavorSelection?: boolean;
  layout: { size: string };
  titleImagePath?: string;
  priceImagePath?: string;


  title: {
    en: string;
    zh?: string;
    size?: string;
    confidence: "high" | "low";
    source?: "deepseek" | "manual" | "xlsx";
  };

  aiTitle?: {
    en: string;
    zh?: string;
    size?: string;
    confidence: "high" | "low";
    source?: "deepseek" | "manual" | "xlsx";
  };

  ocr: OCRResult;
  llmResult: any;
  dbMatches?: any;
  webMatches?: any;

  // ---------- MATCHING (EDITOR / DEBUG ONLY) ----------
  discount?: {
    en?: string;
    english_name?: string;
    [key: string]: any;
  };

  matchScore?: number;
  matchConfidence?: "high" | "low" | "none";
};

export type IngestItem = {
  id: string;
  path: string;
  status: IngestStatus;
  result?: IngestResult;
  error?: string;

  // Slot assignment for manual placement
  slotIndex?: number;

  userEdited?: {
    title?: boolean;
    price?: boolean;
    image?: boolean;
    size?: boolean;
  };

  titleReplaceBackup?: {
    en: string;
    zh?: string;
    size?: string;
  };
};

// =======================
// MATCHING (NO LAYOUT)
// =======================

export type DiscountMatch = {
  ingestedItemId: string;

  title: {
    en: string;
    zh?: string;
  };

  price: {
    display: string;
    value?: number;
  };

  confidence: {
    score: number; // 0–1
    reasons: string[];
  };
};

// =======================
// DISCOUNT ITEM (NO LAYOUT)
// =======================

export type DiscountItem = {
  id: string;

  image: {
    src: string;
  };

  title: {
    en: string;
    zh?: string;
  };

  price: {
    display: string;
    value?: number;
  };

  confidence: {
    score: number; // 0–1
    reasons: string[];
  };
};

// =======================
// DISCOUNT LABEL (TEXT-BASED)
// =======================

export type DiscountLabel = {
  id: string;
  title: {
    en: string;
    zh: string;
    size: string;
    regularPrice: string;
  };
  price: {
    display: string;
    quantity?: number | null;
    unit?: string;
    regular?: string;
  };
};

// =======================
// CARD LAYOUT TYPES
// =======================

export type CardDef = {
  id: string;        // uuid
  row: number;       // 0-based row index
  order: number;     // left-to-right position within row
  widthPx: number;   // pixel width (from fraction initially, then drag-adjusted)
  itemId?: string;   // linked IngestItem.id; undefined = empty card
  rowSpan?: number;  // number of rows this card spans (default 1)
  contentScale?: number;  // visual content scale within card (default 1.0, range 0.3–2.0)
  imageScale?: number;   // scales product image size independently (default 1.0)
  titleScale?: number;   // scales title/meta font sizes independently (default 1.0)
  priceScale?: number;   // scales price font sizes independently (default 1.0)
};

export type CardLayout = CardDef[];

// =======================
// JOB QUEUE TYPES
// =======================

export type JobStatus = "drafting" | "queued" | "processing" | "completed" | "failed";

export type ImageTask = {
  id: string;
  path: string;
  status: "pending" | "processing" | "done" | "error";
  result?: IngestResult;
  error?: string;
  slotIndex?: number;
};

export type DiscountInput = {
  type: "text" | "xlsx";
  source: string;
  parsedItems?: any[];
  status: "pending" | "parsing" | "done" | "error";
};

export type FlyerJob = {
  id: string;
  name: string;
  department: DepartmentId;
  templateId: string;
  images: ImageTask[];
  discount: DiscountInput | null;
  status: JobStatus;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  progress: {
    totalImages: number;
    processedImages: number;
    currentStep: string;
  };
  result?: {
    processedImages: ImageTask[];
    discountLabels: DiscountLabel[];
    verificationDone?: boolean;
    verificationProgress?: {
      currentIdx: number;
      step: "title" | "image" | "price";
      flags: number[];
      approved: [number, string[]][];
    };
    departmentLocked?: boolean;
  };
  error?: string;

  /** Per-slot position/size overrides, keyed by slot index */
  slotOverrides?: Record<number, { x: number; y: number; width: number; height: number }>;

  /** Card layouts for card-based departments (departmentId → cards) */
  cardLayouts?: Record<string, CardLayout>;
};
