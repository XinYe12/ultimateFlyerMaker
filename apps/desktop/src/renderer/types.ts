// PATH: apps/desktop/src/renderer/types.ts

export type IngestStatus = "pending" | "running" | "done" | "error";

export type OCRResult = Array<{
  rec_texts: string[];
  rec_scores?: number[];
}>;

export type DepartmentId =
  | 'grocery'
  | 'frozen'
  | 'hot_food'
  | 'sushi'
  | 'meat'
  | 'seafood'
  | 'fruit'
  | 'vegetable'


export type IngestResult = {
  inputPath: string;
  cutoutPath: string;
  layout: { size: string };

  // authoritative (can become user-entered later)
  title: {
    en: string;
    zh?: string;
    size?: string;
    confidence: "high" | "low";
    source?: "deepseek";
  };

  // preserved AI suggestion (never overwritten)
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

    // ---------- MATCHING RESULT (EDITOR VISIBILITY) ----------
  discount?: any;

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

  // used for "cancel replace"
  titleReplaceBackup?: {
    en: string;
    zh?: string;
    size?: string;
  };
};
