import http from "http";

const MAX_RETRIES = 30;
const INTERVAL_MS = 500;

export function waitForBackend(backend) {
  if (!backend?.url) {
    return Promise.reject(
      new Error("waitForBackend called without backend.url")
    );
  }

  const url = `${backend.url}/health`;
  let attempts = 0;

  return new Promise((resolve, reject) => {
    const check = () => {
      attempts++;

      const req = http.get(url, (res) => {
        if (res.statusCode === 200) {
          console.log(`✅ Backend [${backend.name}] is healthy`);
          resolve();
        } else {
          retry();
        }
      });

      req.on("error", retry);
      req.end();
    };

    const retry = () => {
      if (attempts >= MAX_RETRIES) {
        reject(
          new Error(`Backend [${backend.name}] health timeout`)
        );
        return;
      }
      setTimeout(check, INTERVAL_MS);
    };

    check();
  });
}
