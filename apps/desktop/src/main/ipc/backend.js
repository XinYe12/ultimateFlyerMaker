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
  "match-discount-to-slots",
  async (_event, payload) => {
    console.log("🧩 BACKEND MATCHING START");

    const result = matchDiscountToSlots(payload);

    result.forEach((r, i) => {
      console.log(
        `🧠 IMAGE ${i + 1}:`,
        r.discount
          ? {
              name: r.discount.en || r.discount.english_name,
              score: r.matchScore,
              confidence: r.matchConfidence,
            }
          : "NO MATCH"
      );
    });

    console.log("🧩 BACKEND MATCHING END");

    return result;
  }
);

}
