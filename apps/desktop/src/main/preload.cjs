const { contextBridge, ipcRenderer } = require("electron");

/**
 * Preload bridge for Ultimate Flyer Maker
 * IMPORTANT:
 * - Do NOT transform arguments
 * - Do NOT drop parameters
 * - One-to-one forwarding only
 */

contextBridge.exposeInMainWorld("ufm", {
  
  getDiscounts: () => {
    return ipcRenderer.invoke("ufm:getDiscounts");
  },

  testFirestore: () => {
    return ipcRenderer.invoke("ufm:testFirestore");
  },

  searchDatabaseByText: (query) => {
    return ipcRenderer.invoke("ufm:searchDatabaseByText", query);
  },

  downloadAndIngestFromUrl: (publicUrl) => {
    return ipcRenderer.invoke("ufm:downloadAndIngestFromUrl", publicUrl);
  },

  googleImageSearch: (query) => {
    return ipcRenderer.invoke("ufm:googleImageSearch", query);
  },

  openGoogleSearchWindow: (query) => {
    return ipcRenderer.invoke("ufm:openGoogleSearchWindow", query);
  },

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
  parseDiscountXlsx: (filePath, department) => {
    console.log(
      "PRELOAD parseDiscountXlsx received:",
      JSON.stringify(filePath),
      "dept:", department
    );
    return ipcRenderer.invoke("ufm:parseDiscountXlsx", filePath, department);
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
  },

  // ---------- XLSX DIALOG ----------
  openXlsxDialog: () => {
    console.log("🧩 PRELOAD openXlsxDialog called");
    return ipcRenderer.invoke("ufm:openXlsxDialog");
  },

  // ---------- IMAGE DIALOG ----------
  openImageDialog: () => {
    console.log("🧩 PRELOAD openImageDialog called");
    return ipcRenderer.invoke("ufm:openImageDialog");
  },

  // ---------- MATCH DISCOUNTS ----------
  matchDiscountToSlots: (args) => {
    console.log("🧩 PRELOAD matchDiscountToSlots called");
    return ipcRenderer.invoke("ufm:matchDiscountToSlots", args);
  },

  // ---------- BACKEND PROXY ----------
  backendRequest: (req) => {
    return ipcRenderer.invoke("backend:request", req);
  },

  // ---------- NATIVE FILE DRAG (for Google Lens) ----------
  startDrag: (filePath) => ipcRenderer.send("ufm:startDrag", filePath),

  // ---------- CRASH RECOVERY ----------
  didCrashLastRun: () => ipcRenderer.invoke("ufm:didCrashLastRun"),
  requestQuit: () => ipcRenderer.invoke("ufm:requestQuit"),

  // ---------- JOB QUEUE ----------
  startJob: (job) => {
    console.log("PRELOAD startJob received:", job?.id);
    return ipcRenderer.invoke("ufm:startJob", job);
  },

  getJobQueueStatus: () => {
    return ipcRenderer.invoke("ufm:getJobQueueStatus");
  },

  onJobProgress: (callback) => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on("ufm:jobProgress", handler);
    return () => ipcRenderer.removeListener("ufm:jobProgress", handler);
  },

  onJobComplete: (callback) => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on("ufm:jobComplete", handler);
    return () => ipcRenderer.removeListener("ufm:jobComplete", handler);
  },

  onJobError: (callback) => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on("ufm:jobError", handler);
    return () => ipcRenderer.removeListener("ufm:jobError", handler);
  },

  // ---------- DB BATCH UPLOAD ----------
  startDbBatch: (paths) => ipcRenderer.invoke("ufm:startDbBatch", paths),
  confirmDbImage: (imagePath, action, parsed, embedding) =>
    ipcRenderer.invoke("ufm:confirmDbImage", imagePath, action, parsed, embedding),

  getDbStats: () => ipcRenderer.invoke("ufm:getDbStats"),
  checkDbStorage: () => ipcRenderer.invoke("ufm:checkDbStorage"),
  fixDbStorage: (report) => ipcRenderer.invoke("ufm:fixDbStorage", report),
  checkOllamaStatus: () => ipcRenderer.invoke("ufm:checkOllamaStatus"),
  getQuotaStatus: () => ipcRenderer.invoke("ufm:getQuotaStatus"),

  onDbBatchProgress: (callback) => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on("ufm:dbBatchProgress", handler);
    return () => ipcRenderer.removeListener("ufm:dbBatchProgress", handler);
  },

  onDbBatchComplete: (callback) => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on("ufm:dbBatchComplete", handler);
    return () => ipcRenderer.removeListener("ufm:dbBatchComplete", handler);
  },

  scanNonProducts: () => ipcRenderer.invoke("ufm:scanNonProducts"),
  onScanNonProductsProgress: (callback) => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on("ufm:scanNonProductsProgress", handler);
    return () => ipcRenderer.removeListener("ufm:scanNonProductsProgress", handler);
  },
  onScanNonProductsComplete: (callback) => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on("ufm:scanNonProductsComplete", handler);
    return () => ipcRenderer.removeListener("ufm:scanNonProductsComplete", handler);
  },
});
