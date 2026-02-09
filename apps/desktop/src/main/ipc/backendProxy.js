import { ipcMain } from "electron";
import fetch from "node-fetch";
import { getBackendInfo } from "../startBackend.js";

export function registerBackendProxyIpc() {
  ipcMain.handle("backend:request", async (_evt, { path, method = "GET", body, timeout = 120000 }) => {
    const backend = getBackendInfo();
    if (!backend) throw new Error("Backend not started");

    const url = `${backend.url}${path}`;

    // Create AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const text = await res.text();
      return {
        ok: res.ok,
        status: res.status,
        data: text ? JSON.parse(text) : null,
      };
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw new Error(`Request timeout after ${timeout}ms`);
      }
      throw err;
    }
  });
}

