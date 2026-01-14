import { spawn } from "child_process";
import path from "path";
import { app } from "electron";
import "dotenv/config";
import getPort from "get-port";
import { BACKENDS } from "./backendRegistry.js";

let backendProcess = null;
let backendInfo = null;

export async function startBackend(name = "cutout") {
  if (backendProcess) return backendInfo;

  console.log(`🟢 startBackend("${name}") called`);

  const cfg = BACKENDS[name];
  if (!cfg) {
    throw new Error(`Unknown backend: ${name}`);
  }

  const backendRoot = path.join(
    app.getAppPath(),
    "backend",
    "src"
  );

  const port = cfg.port ?? (await getPort({ port: 8000 }));

  console.log("Backend root:", backendRoot);
  console.log("Backend port:", port);

  const pythonBin = process.env.PYTHON_BIN;
  if (!pythonBin) {
    throw new Error("PYTHON_BIN is not set");
  }

  backendProcess = spawn(
    pythonBin,
    ["-m", "cutout_service.server"],
    {
      cwd: backendRoot,
      env: {
        ...process.env,
        UFM_HOST: cfg.host,
        UFM_PORT: String(port),

        // critical on macOS
        PATH: [
          "/usr/local/bin",
          "/opt/homebrew/bin",
          "/usr/bin",
          "/bin",
          process.env.PATH || "",
        ].join(":"),

        PYTHONPATH: backendRoot,
      },
      stdio: "inherit",
    }
  );

  backendProcess.on("exit", (code, signal) => {
    console.error("❌ Backend exited", { code, signal });
    backendProcess = null;
    backendInfo = null;
  });

  backendProcess.on("error", (err) => {
    console.error("❌ Backend spawn error:", err);
  });

  backendInfo = {
    name,
    pid: backendProcess.pid,
    host: cfg.host,
    port,
    url: `http://${cfg.host}:${port}`,
  };

  return backendInfo;
}

export function stopBackend() {
  if (backendProcess) {
    backendProcess.kill();
    backendProcess = null;
    backendInfo = null;
  }
}

export function getBackendInfo() {
  return backendInfo;
}
