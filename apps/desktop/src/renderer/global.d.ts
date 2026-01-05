export {};

declare global {
  interface Window {
    electron: {
      invoke: (channel: string, ...args: any[]) => Promise<any>;
    };

    ufm: {
      ingestPhoto: (path: string) => Promise<any>;
      parseDiscountText: (text: string) => Promise<any>;
      parseDiscountXlsx: (filePath: string) => Promise<any>; // ✅ FIXED
      exportDiscountImages: (items: any[]) => Promise<any>;
            // ---------- XLSX DIALOG ----------
      openXlsxDialog: () => Promise<string>;
      ingestImages: (paths: string[]) => Promise<any[]>;
    };
  }
}


