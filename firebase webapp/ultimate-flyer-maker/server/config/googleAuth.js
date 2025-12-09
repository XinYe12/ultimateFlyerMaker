import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

process.env.GOOGLE_APPLICATION_CREDENTIALS = path.join(
  __dirname,
  "../credentials/service-key.json"
);

console.log("Using credentials:", process.env.GOOGLE_APPLICATION_CREDENTIALS);
