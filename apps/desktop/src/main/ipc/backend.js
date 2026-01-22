// apps/desktop/src/main/ipc/backend.js

import { ipcMain } from "electron";
import { getBackendInfo } from "../startBackend.js";
import { matchDiscountToSlots } from "../discount/matchDiscountToSlots.js";
import { getLastParsedDiscounts } from "./parseDiscountText.js";

export function registerBackendIpc() {
  ipcMain.handle("backend:getInfo", () => {
    const info = getBackendInfo();
    if (!info) {
      throw new Error("Backend not started");
    }
    return info;
  });

  ipcMain.handle("ufm:getDiscounts", () => {
    
    return getLastParsedDiscounts();
  });


  // ---------- MATCH DISCOUNTS TO SLOTS ----------
  ipcMain.handle(
    "ufm:matchDiscountToSlots",
    async (_event, args) => {
      const { images, discounts, opts } = args || {};
      return matchDiscountToSlots(images, discounts, opts);
    }
  );
}
