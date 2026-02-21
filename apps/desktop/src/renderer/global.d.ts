export {};

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
};

export type DbBatchCompleteEvent = {
  added: number;
  duplicates: number;
  skipped: number;
  errors: number;
  error?: string;
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

declare global {
  interface Window {
    electron: {
      invoke: (channel: string, ...args: any[]) => Promise<any>;
    };

    ufm: {
      ingestPhoto: (path: string) => Promise<any>;
      parseDiscountText: (text: string) => Promise<any>;
      parseDiscountXlsx: (filePath: string, department?: string) => Promise<any>;
      exportDiscountImages: (items: any[]) => Promise<any>;
      openXlsxDialog: () => Promise<string>;
      openImageDialog: () => Promise<string | null>;
      ingestImages: (paths: string[]) => Promise<any[]>;
      getDiscounts: () => Promise<any[]>;
      testFirestore: () => Promise<{ ok: boolean; count?: number; sample?: any[]; error?: string }>;

      searchDatabaseByText: (query: string) => Promise<DbSearchResult[]>;
      downloadAndIngestFromUrl: (publicUrl: string) => Promise<{ path: string; result: any }>;
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
      confirmDbImage: (
        imagePath: string,
        action: "add" | "skip",
        parsed?: object,
        embedding?: number[]
      ) => Promise<{ ok: boolean; productId?: string; title?: string; publicUrl?: string; duplicate?: boolean; error?: string }>;
      getDbStats: () => Promise<{ count: number; quota?: QuotaStatus; error?: string }>;
      checkDbStorage: () => Promise<DbSyncReport>;
      fixDbStorage: (report: DbSyncReport) => Promise<DbSyncResult>;
      checkOllamaStatus: () => Promise<{ ok: boolean; model?: string; error?: string }>;
      getQuotaStatus: () => Promise<QuotaStatus>;
      onDbBatchProgress: (cb: (data: DbBatchProgressEvent) => void) => () => void;
      onDbBatchComplete: (cb: (data: DbBatchCompleteEvent) => void) => () => void;

      scanNonProducts: () => Promise<{ ok: boolean }>;
      onScanNonProductsProgress: (cb: (data: ScanNonProductsProgressEvent) => void) => () => void;
      onScanNonProductsComplete: (cb: (data: ScanNonProductsCompleteEvent) => void) => () => void;
    };
  }
}

declare namespace JSX {
  interface IntrinsicElements {
    webview: React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement> & {
        src?: string;
        partition?: string;
        allowpopups?: string;
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
