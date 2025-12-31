const { contextBridge, ipcRenderer } = require("electron");

console.log("🔥 PRELOAD FILE EXECUTED");

contextBridge.exposeInMainWorld("ufm", {
  ingestPhoto: (inputPath) =>
    ipcRenderer.invoke("ufm:ingestPhoto", inputPath),
});
