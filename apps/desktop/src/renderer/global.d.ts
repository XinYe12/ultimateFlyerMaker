export {};

import type { IngestResult, ParsedDiscount, DiscountLabel } from "./types";

export type DbSearchResult = {
  id: string;
  englishTitle?: string;
  chineseTitle?: string;
  brand?: string;
  size?: string;
  category?: string;
  publicUrl?: string;
  score: number;
};

export type GoogleSearchResult = {
  title: string;
  url: string;
  /** Proxied image URL for thumbnails; image search only */
  thumbnail?: string;
  description?: string;
};

export type DbParsedMetadata = {
  englishTitle: string;
  chineseTitle: string;
  brand: string;
  size: string;
  category: string;
  cleanTitle: string;
};

/** Per-image DB batch pipeline segment durations (main process, ms). */
export type DbPipelineTimingMs = {
  hashing: number;
  dedup: number;
  analyzing?: number;
  savingSet?: number;
  uploading?: number;
  savingUpdate?: number;
  total: number;
};

export type DbBatchProgressEvent = {
  path: string;
  status:
    | "hashing"
    | "dedup"
    | "analyzing"
    | "analyzed"
    | "uploading"
    | "saving"
    | "done"
    | "duplicate"
    | "skipped"
    | "error"
    | "needs_confirmation";
  productId?: string;
  title?: string;
  publicUrl?: string;
  error?: string;
  parsed?: DbParsedMetadata & { isProduct?: boolean; ocrText?: string };
  embedding?: number[];
  pipelineTimingMs?: DbPipelineTimingMs;
};

export type DbBatchCompleteEvent = {
  added: number;
  duplicates: number;
  skipped: number;
  errors: number;
  error?: string;
  stopped?: boolean;
};

export type ScanNonProductsProgressEvent = {
  productId: string;
  title?: string;
  status: "scanning" | "product" | "deleted" | "skipped" | "error";
  deleted?: boolean;
  error?: string;
};

export type ScanNonProductsCompleteEvent = {
  scanned: number;
  deleted: number;
  errors: number;
  error?: string;
};

export type DbSyncReport = {
  totalDocs: number;
  totalStorageFiles: number;
  stuck: string[];
  missingInStorage: string[];
  orphanedInStorage: string[];
};

export type DbSyncResult = {
  fixed: number;
  errors: { productId: string; error: string }[];
};

export type QuotaEntry = {
  used: number;
  limit: number;
  pct: number;         // 0-100
  nearLimit: boolean;  // >= 90%
  atLimit: boolean;    // >= 98%
  source?: "live" | "local";
};

export type QuotaStatus = {
  day: string;
  reads: QuotaEntry;
  writes: QuotaEntry;
  deletes: QuotaEntry;
  geminiRequests: QuotaEntry;
  storageTotalBytes: QuotaEntry;
};

export type TodaysSaveItem = {
  id: string;
  englishTitle: string;
  chineseTitle: string;
  publicUrl: string;
  salePrice: string;
  department: string;
  createdAt: number;
  status: string;
};

declare global {
  interface Window {
    electron: {
      invoke: (channel: string, ...args: any[]) => Promise<any>;
    };

    ufm: {
      ingestPhoto: (path: string) => Promise<IngestResult>;
      ingestPhotoPhase1: (path: string) => Promise<{ inputPath: string; cutoutPath: null; layout: null; title: any; aiTitle: any; ocr: any; llmResult: any }>;
      startCutout: (id: string, path: string) => Promise<{ queued: boolean }>;
      onCutoutComplete: (cb: (data: { id: string; cutoutPath: string; layout: { size: string } }) => void) => () => void;
      onCutoutError: (cb: (data: { id: string; error: string }) => void) => () => void;
      parseDiscountText: (text: string) => Promise<ParsedDiscount[]>;
      parseDiscountXlsx: (filePath: string, department?: string) => Promise<ParsedDiscount[]>;
      parseAllDepartmentsXlsx: (filePath: string) => Promise<Record<string, ParsedDiscount[]>>;
      exportExampleXlsx: (format?: "single" | "multi") => Promise<{ filePath?: string; canceled?: boolean }>;
      exportDiscountImages: (items: any[]) => Promise<DiscountLabel[]>;
      openXlsxDialog: () => Promise<string>;
      openImageDialog: () => Promise<string | null>;
      openFolderDialog: () => Promise<string[]>;
      resolveDroppedPaths: (paths: string[]) => Promise<string[]>;
      ingestImages: (paths: string[]) => Promise<IngestResult[]>;
      getDiscounts: () => Promise<ParsedDiscount[]>;
      testFirestore: () => Promise<{ ok: boolean; count?: number; sample?: any[]; error?: string }>;
      testGemini: () => Promise<{ apiKeyPresent: boolean; vision: { ok: boolean; status?: number; body?: string; error?: string } | null; embed: { ok: boolean; status?: number; body?: string; error?: string } | null; error?: string }>;

      searchDatabaseByText: (query: string, limit?: number) => Promise<DbSearchResult[]>;
      downloadAndIngestFromUrl: (publicUrl: string) => Promise<{ path: string; result: IngestResult }>;
      googleImageSearch: (query: string) => Promise<GoogleSearchResult[]>;
      openGoogleSearchWindow: (query: string) => Promise<void>;

      matchDiscountToSlots: (args: {
        images: any[];
        discounts: any[];
        opts?: any;
      }) => Promise<any[]>;

      startDrag: (filePath: string) => void;

      didCrashLastRun: () => Promise<boolean>;
      requestQuit: () => Promise<void>;

      startDbBatch: (paths: string[]) => Promise<{ ok: boolean }>;
      stopDbBatch: () => Promise<{ ok: boolean }>;
      confirmDbImage: (
        imagePath: string,
        action: "add" | "skip",
        parsed?: object
      ) => Promise<{ ok: boolean; productId?: string; title?: string; publicUrl?: string; duplicate?: boolean; error?: string }>;
      getDbStats: () => Promise<{ count: number; quota?: QuotaStatus; error?: string }>;
      checkDbStorage: () => Promise<DbSyncReport>;
      fixDbStorage: (report: DbSyncReport) => Promise<DbSyncResult>;
      getQuotaStatus: () => Promise<QuotaStatus>;
      clearCutoutCache: () => Promise<{ cleared: number; error?: string }>;
      onDbBatchProgress: (cb: (data: DbBatchProgressEvent) => void) => () => void;
      onDbBatchComplete: (cb: (data: DbBatchCompleteEvent) => void) => () => void;

      onJobPreflight: (cb: (data: { jobId: string; matched: number; total: number; coverage: number }) => void) => () => void;

      openLogFile: () => Promise<string>;

      saveCombinationToDb: (items: {
        id: string;
        imagePath: string;
        en: string;
        zh: string;
        size: string;
        salePrice: string;
        regularPrice: string;
        unit: string;
        quantity: number | null;
        department: string;
      }[]) => Promise<{ ok: boolean }>;
      onSaveCombinationProgress: (cb: (data: {
        id: string; index: number; total: number;
        status: "embedding" | "saving" | "uploading" | "done" | "skipped" | "error";
        reason?: string; error?: string; productId?: string; publicUrl?: string;
      }) => void) => () => void;
      onSaveCombinationComplete: (cb: (data: {
        saved: number; skipped: number; errors: number; error?: string;
      }) => void) => () => void;

      deleteDbProduct: (productId: string) => Promise<{ ok: boolean; error?: string }>;
      getTodaysSaves: () => Promise<TodaysSaveItem[]>;

      reembedAllProducts: () => Promise<{ ok: boolean }>;
      onReembedProgress: (cb: (data: { current: number; total: number; label: string }) => void) => () => void;
      onReembedComplete: (cb: (data: { updated: number; total: number; errors: number; error?: string }) => void) => () => void;

      cleanMessyTitles: () => Promise<{ ok: boolean }>;
      onCleanMessyTitlesProgress: (cb: (data: { current: number; total: number; title: string }) => void) => () => void;
      onCleanMessyTitlesComplete: (cb: (data: { deleted: number; total: number; errors: number; error?: string }) => void) => () => void;

      scanNonProducts: () => Promise<{ ok: boolean }>;
      onScanNonProductsProgress: (cb: (data: ScanNonProductsProgressEvent) => void) => () => void;
      onScanNonProductsComplete: (cb: (data: ScanNonProductsCompleteEvent) => void) => () => void;
      showContextMenu: (itemId: string, actions: Array<{ id: string; label: string; enabled?: boolean }>) => void;
      onContextMenuAction: (cb: (data: { itemId: string; action: string }) => void) => () => void;

      getStartupTiming: () => Promise<{
        totalMs: number;
        t0Absolute: number;
        phases: { whenReady?: number; backendSpawn?: number; backendHealthy?: number; firebase?: number; viteReady?: number; windowCreated?: number };
      } | null>;

      getAppPaths: () => Promise<{ userData: string; firebaseCredential: string; firebaseCredentialExists: boolean }>;
      getMissingKeys: () => Promise<string[]>;
      getConfig: () => Promise<{
        requiredKeys: Array<{ key: string; label: string; description: string; url: string; value: string; isSet: boolean }>;
        optionalKeys: Array<{ key: string; label: string; description: string; url: string; value: string; isSet: boolean }>;
      }>;
      saveConfig: (patch: Record<string, string>) => Promise<{ ok: boolean; missingKeys: string[] }>;
      getRembgModel: () => Promise<string>;
      setRembgModel: (model: string) => Promise<{ ok: boolean }>;
    };
  }
}

declare namespace JSX {
  interface IntrinsicElements {
    webview: React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement> & {
        src?: string;
        partition?: string;
        allowpopups?: boolean;
        useragent?: string;
      },
      HTMLElement
    >;
  }
}

declare module '../../../../shared/flyer/layout/sizeFromImage' {
  export function sizeFromImage(
    imagePath: string
  ): { width: number; height: number }
}
