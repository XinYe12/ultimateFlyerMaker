// apps/desktop/apps/desktop/src/main/preload.js
// ✅ COMPLETE FILE — COPY / PASTE AS-IS (CommonJS only)

const { contextBridge, ipcRenderer } = require("electron");

console.log("🔥 PRELOAD SCRIPT LOADED 🔥");

contextBridge.exposeInMainWorld("cutoutAPI", {
  batchCutout: (paths) => {
    console.log("🔥 PRELOAD batchCutout 🔥", paths);
    return ipcRenderer.invoke("batch-cutout", paths);
  },
});

contextBridge.exposeInMainWorld("ufm", {
  ingestPhoto: (path) => {
    console.log("🔥 PRELOAD ingestPhoto 🔥", path);
    return ipcRenderer.invoke("ufm:ingestPhoto", path);
  },
});
