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

declare global {
  interface Window {
    electron: {
      invoke: (channel: string, ...args: any[]) => Promise<any>;
    };

    ufm: {
      ingestPhoto: (path: string) => Promise<any>;
      parseDiscountText: (text: string) => Promise<any>;
      parseDiscountXlsx: (filePath: string) => Promise<any>;
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
