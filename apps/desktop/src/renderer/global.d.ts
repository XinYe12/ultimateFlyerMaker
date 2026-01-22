export {};

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
      ingestImages: (paths: string[]) => Promise<any[]>;
      getDiscounts: () => Promise<any[]>;


      // ✅ ADD THIS
      matchDiscountToSlots: (args: {
        images: any[];
        discounts: any[];
        opts?: any;
      }) => Promise<any[]>;
    };
  }
}
