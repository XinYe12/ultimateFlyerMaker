// PATH: apps/desktop/src/renderer/types.ts

export type IngestStatus = "pending" | "running" | "done" | "error";

export type OCRResult = Array<{
  rec_texts: string[];
  rec_scores?: number[];
}>;

export type IngestResult = {
  inputPath: string;
  cutoutPath: string;
  layout: { size: string };
  title: { en: string; zh: string };
  ocr: OCRResult;
  llmResult: any;
  dbMatches?: any;
  webMatches?: any;
};

export type IngestItem = {
  id: string;
  path: string;
  status: IngestStatus;
  result?: IngestResult;
  error?: string;
};
