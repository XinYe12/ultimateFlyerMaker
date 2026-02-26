// Minimal preload for the splash window.
// Exposes a single onStatus listener so the splash page can receive
// status updates sent from the main process via splash:status.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("splash", {
  onStatus: (cb) => ipcRenderer.on("splash:status", (_event, msg) => cb(msg)),
});
