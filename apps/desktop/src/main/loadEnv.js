import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { app } from 'electron';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Packaged: load the .env bundled into resources/.env
// Dev: load from apps/desktop/.env
const envPath = app.isPackaged
  ? path.join(process.resourcesPath, '.env')
  : path.join(__dirname, '../../../.env');

dotenv.config({ path: envPath });
