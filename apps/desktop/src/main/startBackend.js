import { spawn } from "child_process";
import path from "path";
import { app } from "electron";

let backendProcess = null;

export function startBackend() {

  if (backendProcess) return;

  const pythonExe = path.join(
    app.getAppPath(),
    "backend",
    "python",
    "python.exe"
  );

  const backendRoot = path.join(
    app.getAppPath(),
    "backend",
    "src"
  );

    console.log("🟢 startBackend() called");
    console.log("pythonExe =", pythonExe);
    console.log("backendRoot =", backendRoot);


  backendProcess = spawn(
    pythonExe,
    [
      "-m",
      "uvicorn",
      "cutout_service.server:app",
      "--host",
      "127.0.0.1",
      "--port",
      "8000"
    ],
    {
      cwd: backendRoot,
      env: {
        ...process.env,
        PYTHONPATH: backendRoot,
        DISABLE_MODEL_SOURCE_CHECK: "True"
      },
        stdio: "inherit",
        windowsHide: false

    }
  );
}

export function stopBackend() {
  if (backendProcess) {
    backendProcess.kill();
    backendProcess = null;
  }
}
