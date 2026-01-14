import { ipcMain } from "electron";
import fetch from "node-fetch";
import { getBackendInfo } from "../startBackend.js";

export function registerBackendProxyIpc() {
  ipcMain.handle("backend:request", async (_evt, { path, method = "GET", body }) => {
    const backend = getBackendInfo();
    if (!backend) throw new Error("Backend not started");

    const url = `${backend.url}${path}`;
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });

    const text = await res.text();
    return {
      ok: res.ok,
      status: res.status,
      data: text ? JSON.parse(text) : null,
    };
  });
}

