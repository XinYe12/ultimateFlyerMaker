// PATH: apps/desktop/src/renderer/types.ts
// 🔧 ADD: DiscountMatch + DiscountItem exports (keep existing ingestion/editor fields)

export type IngestStatus = "pending" | "running" | "done" | "error";

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
  layout: { size: string };
  titleImagePath?: string;
  priceImagePath?: string;


  title: {
    en: string;
    zh?: string;
    size?: string;
    confidence: "high" | "low";
    source?: "deepseek";
  };

  aiTitle?: {
    en: string;
    zh?: string;
    size?: string;
    confidence: "high" | "low";
    source?: "deepseek";
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
// JOB QUEUE TYPES
// =======================

export type JobStatus = "drafting" | "queued" | "processing" | "completed" | "failed";

export type ImageTask = {
  id: string;
  path: string;
  status: "pending" | "processing" | "done" | "error";
  result?: IngestResult;
  error?: string;
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
  };
  error?: string;
};
