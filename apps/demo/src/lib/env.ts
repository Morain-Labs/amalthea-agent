import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Loads the repo-root `.env.local` (gitignored, holds GEMINI_API_KEY) into
 * process.env. Walks up from the working directory so it works from the app
 * dir, the repo root, and script runners.
 *
 * Precedence: on a deployed service (Cloud Run sets K_SERVICE) the real
 * environment always wins, so nothing can override deploy config. Locally
 * `.env.local` wins instead, because a stale machine-level GEMINI_API_KEY
 * silently shadowing the project's key costs hours to find. Shadowed keys
 * are reported rather than swallowed.
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
  // A deployed service (Cloud Run) keeps its own environment, always.
  const deployed = process.env.K_SERVICE !== undefined;
  const text = readFileSync(path, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match) continue;
    const key = match[1];
    const rawValue = match[2];
    if (key === undefined || rawValue === undefined) continue;
    const value = rawValue.replace(/^(["'])(.*)\1$/, '$2');
    const existing = process.env[key];
    if (existing !== undefined) {
      if (deployed || existing === value) continue;
      // Name only. Printing even a prefix of a live credential puts it in
      // stdout and any log sink downstream.
      console.warn(
        `[env] ${key} is set in the environment and is being overridden by .env.local.`,
      );
    }
    process.env[key] = value;
  }
}
