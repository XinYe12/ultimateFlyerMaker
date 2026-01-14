const { contextBridge, ipcRenderer } = require("electron");

/**
 * Preload bridge for Ultimate Flyer Maker
 * IMPORTANT:
 * - Do NOT transform arguments
 * - Do NOT drop parameters
 * - One-to-one forwarding only
 */

contextBridge.exposeInMainWorld("ufm", {
  // ---------- TEXT ----------
  parseDiscountText: (rawText) => {
    console.log(
      "🧩 PRELOAD parseDiscountText received:",
      JSON.stringify(rawText),
      typeof rawText
    );

    return ipcRenderer.invoke("ufm:parseDiscountText", rawText);
  },

  // ---------- XLSX ----------
  parseDiscountXlsx: (filePath) => {
    console.log(
      "🧩 PRELOAD parseDiscountXlsx received:",
      JSON.stringify(filePath),
      typeof filePath
    );

    return ipcRenderer.invoke("ufm:parseDiscountXlsx", filePath);
  },

  // ---------- EXPORT ----------
  exportDiscountImages: (items) => {
    console.log(
      "🧩 PRELOAD exportDiscountImages received items:",
      Array.isArray(items) ? items.length : items
    );

    return ipcRenderer.invoke("ufm:exportDiscountImages", items);
  },

  // ---------- IMAGE ----------
  ingestPhoto: (filePath) => {
    console.log(
      "🧩 PRELOAD ingestPhoto received:",
      JSON.stringify(filePath),
      typeof filePath
    );

    return ipcRenderer.invoke("ufm:ingestPhoto", filePath);
  }
    ,

  // ---------- XLSX DIALOG ----------
  openXlsxDialog: () => {
    console.log("🧩 PRELOAD openXlsxDialog called");
    return ipcRenderer.invoke("ufm:openXlsxDialog");
  },
  
  ingestImages: (paths) =>
  ipcRenderer.invoke("ingestImages", paths),

    // ---------- BACKEND PROXY ----------
  backendRequest: (req) => {
    return ipcRenderer.invoke("backend:request", req);
  }

});
