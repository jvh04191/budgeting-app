import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { openDb } from './db.js';
import { assertLoopbackBind } from './guard.js';

// Secrets and the database live outside the project folder, which may be synced (Dropbox) or pushed
// to GitHub. Default: ~/.kept/.env and ~/.kept/budget.db (override the folder with KEPT_HOME).
const keptHome = process.env.KEPT_HOME || join(homedir(), '.kept');
mkdirSync(keptHome, { recursive: true });

const envFile = join(keptHome, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const strayEnv = fileURLToPath(new URL('../.env', import.meta.url));
if (existsSync(strayEnv)) {
  console.warn(`Ignoring ${strayEnv}. Keep secrets in ${envFile} instead, and delete the file inside the project.`);
}

const port = process.env.PORT || 3001;
// Loopback only: the API serves bank data and has no login.
const host = process.env.HOST || '127.0.0.1';
assertLoopbackBind(host);

const db = openDb(process.env.DB_PATH || join(keptHome, 'budget.db'));
createApp(db).listen(port, host, () => console.log(`budgeting API listening on http://${host}:${port} (data in ${keptHome})`));
