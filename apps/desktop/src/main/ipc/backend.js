import { ipcMain } from "electron";
import { getBackendInfo } from "../startBackend.js";

export function registerBackendIpc() {
  ipcMain.handle("backend:getInfo", () => {
    const info = getBackendInfo();
    if (!info) {
      throw new Error("Backend not started");
    }
    return info;
  });
}
