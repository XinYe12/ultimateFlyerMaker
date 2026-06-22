// apps/desktop/src/main/ipc/configStore.js
// Persists user-supplied API keys to userData/ufm.config.json
// and merges them into process.env at startup.

import { app } from "electron";
import path from "path";
import fs from "fs";

function configPath() {
  return path.join(app.getPath("userData"), "ufm.config.json");
}

export function loadUserConfig() {
  try {
    const raw = fs.readFileSync(configPath(), "utf8");
    const config = JSON.parse(raw);
    for (const [key, value] of Object.entries(config)) {
      // User settings always win over .env defaults so preferences persist across restarts.
      if (typeof value === "string" && value.trim()) {
        process.env[key] = value;
      }
    }
  } catch {
    // No config file yet — fine on first run
  }
}

export function readUserConfig() {
  try {
    return JSON.parse(fs.readFileSync(configPath(), "utf8"));
  } catch {
    return {};
  }
}

export function writeUserConfig(patch) {
  const updated = { ...readUserConfig(), ...patch };
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(updated, null, 2), "utf8");
  for (const [key, value] of Object.entries(patch)) {
    if (typeof value === "string") process.env[key] = value;
  }
}
