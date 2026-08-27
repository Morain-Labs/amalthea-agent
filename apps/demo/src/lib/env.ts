import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Loads the repo-root `.env.local` (gitignored, holds GEMINI_API_KEY) into
 * process.env. Walks up from the working directory so it works from the app
 * dir, the repo root, and script runners. Values already present in the
 * environment always win, so Cloud Run env vars are never overridden.
 */
export function loadRootEnv(): void {
  let dir = process.cwd();
  for (let depth = 0; depth < 5; depth++) {
    const candidate = join(dir, '.env.local');
    if (existsSync(candidate)) {
      applyEnvFile(candidate);
      return;
    }
    const parent = dirname(dir);
    if (parent === dir) return;
    dir = parent;
  }
}

function applyEnvFile(path: string): void {
  const text = readFileSync(path, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match) continue;
    const key = match[1];
    const rawValue = match[2];
    if (key === undefined || rawValue === undefined) continue;
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue.replace(/^(["'])(.*)\1$/, '$2');
  }
}
