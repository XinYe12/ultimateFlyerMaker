const { contextBridge, ipcRenderer } = require("electron");

/**
 * Preload bridge for Ultimate Flyer Maker
 * IMPORTANT:
 * - Do NOT transform arguments
 * - Do NOT drop parameters
 * - One-to-one forwarding only
 */

contextBridge.exposeInMainWorld("ufm", {

  // ---------- JOB PERSISTENCE ----------
  saveJobsToFile: (data) => ipcRenderer.invoke("ufm:saveJobs", data),
  loadJobsFromFile: () => ipcRenderer.invoke("ufm:loadJobs"),

  getDiscounts: () => {
    return ipcRenderer.invoke("ufm:getDiscounts");
  },

  testFirestore: () => {
    return ipcRenderer.invoke("ufm:testFirestore");
  },

  testGemini: () => {
    return ipcRenderer.invoke("ufm:testGemini");
  },

  searchDatabaseByText: (query, limit) => {
    return ipcRenderer.invoke("ufm:searchDatabaseByText", query, limit);
  },

  searchDatabaseByImage: (imagePath) => {
    return ipcRenderer.invoke("ufm:searchDatabaseByImage", imagePath);
  },

  updateProductTitle: (id, englishTitle) => {
    return ipcRenderer.invoke("ufm:updateProductTitle", id, englishTitle);
  },

  downloadAndIngestFromUrl: (jobIdOrUrl, publicUrlMaybe) => {
    const looksLikeUrl = (v) =>
      typeof v === "string"
      && (v.startsWith("http://") || v.startsWith("https://") || v.startsWith("data:image/"));
    const singleUrlArg = publicUrlMaybe === undefined && looksLikeUrl(jobIdOrUrl);
    const jobId = singleUrlArg ? null : jobIdOrUrl;
    const publicUrl = singleUrlArg ? jobIdOrUrl : publicUrlMaybe;
    return ipcRenderer.invoke("ufm:downloadAndIngestFromUrl", jobId, publicUrl);
  },

  cancelReplacementJob: (jobId) => {
    return ipcRenderer.invoke("ufm:cancelReplacementJob", jobId);
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

  // ---------- BULK DISCOUNT XLSX ----------
  exportExampleXlsx: (format) => ipcRenderer.invoke("ufm:exportExampleXlsx", format),

  parseAllDepartmentsXlsx: (filePath) =>
    ipcRenderer.invoke("ufm:parseAllDepartmentsXlsx", filePath),

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

  // ---------- TWO-PHASE INGESTION ----------
  ingestPhotoPhase1: (filePath) => ipcRenderer.invoke("ufm:ingestPhotoPhase1", filePath),

  startCutout: (id, filePath) => ipcRenderer.invoke("ufm:startCutout", id, filePath),
  rerunCutout: (id, filePath, model) => ipcRenderer.invoke("ufm:rerunCutout", id, filePath, model),

  onCutoutComplete: (callback) => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on("ufm:cutoutComplete", handler);
    return () => ipcRenderer.removeListener("ufm:cutoutComplete", handler);
  },

  onCutoutError: (callback) => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on("ufm:cutoutError", handler);
    return () => ipcRenderer.removeListener("ufm:cutoutError", handler);
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

  // ---------- FOLDER DIALOG ----------
  openFolderDialog: () => {
    return ipcRenderer.invoke("ufm:openFolderDialog");
  },

  resolveDroppedPaths: (paths) => {
    return ipcRenderer.invoke("ufm:resolveDroppedPaths", paths);
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

  onJobStarted: (callback) => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on("ufm:jobStarted", handler);
    return () => ipcRenderer.removeListener("ufm:jobStarted", handler);
  },

  onJobItemComplete: (callback) => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on("ufm:jobItemComplete", handler);
    return () => ipcRenderer.removeListener("ufm:jobItemComplete", handler);
  },

  cancelJob: (jobId) => ipcRenderer.invoke("ufm:cancelJob", jobId),

  getCutoutCacheInfo: () => ipcRenderer.invoke("ufm:getCutoutCacheInfo"),

  onJobAborted: (callback) => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on("ufm:jobAborted", handler);
    return () => ipcRenderer.removeListener("ufm:jobAborted", handler);
  },

  openLogFile: () => ipcRenderer.invoke("ufm:openLogFile"),
  openExternal: (url) => ipcRenderer.invoke("ufm:openExternal", url),

  // ---------- DB BATCH UPLOAD ----------
  startDbBatch: (paths) => ipcRenderer.invoke("ufm:startDbBatch", paths),
  stopDbBatch: () => ipcRenderer.invoke("ufm:stopDbBatch"),
  confirmDbImage: (imagePath, action, parsed) =>
    ipcRenderer.invoke("ufm:confirmDbImage", imagePath, action, parsed),

  getDbStats: () => ipcRenderer.invoke("ufm:getDbStats"),
  checkDbStorage: () => ipcRenderer.invoke("ufm:checkDbStorage"),
  fixDbStorage: (report) => ipcRenderer.invoke("ufm:fixDbStorage", report),
  getQuotaStatus: () => ipcRenderer.invoke("ufm:getQuotaStatus"),
  clearCutoutCache: () => ipcRenderer.invoke("ufm:clearCutoutCache"),

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

  // ---------- SAVE COMBINATION TO DB ----------
  saveCombinationToDb: (items) => ipcRenderer.invoke("ufm:saveCombinationToDb", items),
  getTodaysSaves: () => ipcRenderer.invoke("ufm:getTodaysSaves"),

  onSaveCombinationProgress: (callback) => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on("ufm:saveCombinationProgress", handler);
    return () => ipcRenderer.removeListener("ufm:saveCombinationProgress", handler);
  },

  onSaveCombinationComplete: (callback) => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on("ufm:saveCombinationComplete", handler);
    return () => ipcRenderer.removeListener("ufm:saveCombinationComplete", handler);
  },

  deleteDbProduct: (productId) => ipcRenderer.invoke("ufm:deleteDbProduct", productId),

  reembedAllProducts: () => ipcRenderer.invoke("ufm:reembedAllProducts"),
  onReembedProgress: (callback) => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on("ufm:reembedProgress", handler);
    return () => ipcRenderer.removeListener("ufm:reembedProgress", handler);
  },
  onReembedComplete: (callback) => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on("ufm:reembedComplete", handler);
    return () => ipcRenderer.removeListener("ufm:reembedComplete", handler);
  },

  cleanMessyTitles: () => ipcRenderer.invoke("ufm:cleanMessyTitles"),
  onCleanMessyTitlesProgress: (callback) => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on("ufm:cleanMessyTitlesProgress", handler);
    return () => ipcRenderer.removeListener("ufm:cleanMessyTitlesProgress", handler);
  },
  onCleanMessyTitlesComplete: (callback) => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on("ufm:cleanMessyTitlesComplete", handler);
    return () => ipcRenderer.removeListener("ufm:cleanMessyTitlesComplete", handler);
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

  // ---------- SERPER PROMOTION + SIGNALS ----------
  promoteSerperResults: (items) => ipcRenderer.invoke("ufm:promoteSerperResults", items),
  recordSerperRejection: (signal) => ipcRenderer.invoke("ufm:recordSerperRejection", signal),
  recordManualGoogleAccepted: (signal) => ipcRenderer.invoke("ufm:recordManualGoogleAccepted", signal),
  getSerperLearningStats: () => ipcRenderer.invoke("ufm:getSerperLearningStats"),
  guessFontFromCrop: (payload) => ipcRenderer.invoke("ufm:guessFontFromCrop", payload),

  // ---------- APP PATHS ----------
  getAppPaths: () => ipcRenderer.invoke("ufm:getAppPaths"),

  // ---------- API KEY CONFIG ----------
  getMissingKeys: () => ipcRenderer.invoke("ufm:getMissingKeys"),
  getConfig: () => ipcRenderer.invoke("ufm:getConfig"),
  saveConfig: (patch) => ipcRenderer.invoke("ufm:saveConfig", patch),
  getRembgModel: () => ipcRenderer.invoke("ufm:getRembgModel"),
  setRembgModel: (model) => ipcRenderer.invoke("ufm:setRembgModel", model),

  // ---------- CUTOUT ERASER ----------
  saveErasedCutout: (cutoutPath, pngDataUrl, options) =>
    ipcRenderer.invoke("ufm:saveErasedCutout", cutoutPath, pngDataUrl, options),
  cutoutEditedImage: (basePath, pngDataUrl) =>
    ipcRenderer.invoke("ufm:cutoutEditedImage", basePath, pngDataUrl),
  refineCutoutWithClicks: (args) =>
    ipcRenderer.invoke("ufm:refineCutoutWithClicks", args),
  restoreOriginalCutout: (args) =>
    ipcRenderer.invoke("ufm:restoreOriginalCutout", args),

  // ---------- NATIVE CONTEXT MENU ----------
  showContextMenu: (itemId, actions) =>
    ipcRenderer.send("ufm:showContextMenu", { itemId, actions }),
  showItemInFolder: (filePath) =>
    ipcRenderer.invoke("ufm:showItemInFolder", filePath),
  onContextMenuAction: (callback) => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on("ufm:contextMenuAction", handler);
    return () => ipcRenderer.removeListener("ufm:contextMenuAction", handler);
  },

  // ---------- CONFIRM DIALOG ----------
  showConfirmDialog: (opts) => ipcRenderer.invoke("ufm:showConfirmDialog", opts),

  // ---------- CANVAS ZOOM ----------
  onCanvasZoom: (callback) => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on("ufm:canvasZoom", handler);
    return () => ipcRenderer.removeListener("ufm:canvasZoom", handler);
  },
  setWindowZoom: (factor) => ipcRenderer.invoke("ufm:setWindowZoom", factor),

  // ---------- STARTUP TIMING ----------
  getStartupTiming: () => ipcRenderer.invoke("ufm:getStartupTiming"),

  // ---------- TEMPLATE IMPORT (manual setup) ----------
  probeTemplateImages: (imagePaths) =>
    ipcRenderer.invoke("ufm:probeTemplateImages", imagePaths),
  loadTemplateFromImages: (payload) =>
    ipcRenderer.invoke("ufm:loadTemplateFromImages", payload),
  regenerateUnderprint: (payload) =>
    ipcRenderer.invoke("ufm:regenerateUnderprint", payload),
  persistTemplateAssets: (templateId, pages) =>
    ipcRenderer.invoke("ufm:persistTemplateAssets", templateId, pages),
});
