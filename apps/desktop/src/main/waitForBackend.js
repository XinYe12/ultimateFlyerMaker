 import http from "http";

export function waitForBackend({
  host = "127.0.0.1",
  port = 8000,
  timeoutMs = 15000
}) {
  const start = Date.now();

  return new Promise((resolve, reject) => {
    function check() {
      const req = http.get(
        {
          host,
          port,
          path: "/health",
          timeout: 2000
        },
        res => {
          if (res.statusCode === 200) {
            resolve(true);
          } else {
            retry();
          }
        }
      );

      req.on("error", retry);
      req.on("timeout", retry);
    }

    function retry() {
      if (Date.now() - start > timeoutMs) {
        reject(new Error("Backend health timeout"));
        return;
      }
      setTimeout(check, 500);
    }

    check();
  });
}
