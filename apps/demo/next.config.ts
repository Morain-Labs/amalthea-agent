import type { NextConfig } from 'next';
import { loadRootEnv } from './src/lib/env';

// Server-side env (GEMINI_API_KEY and friends) lives in one file at the repo
// root. Load it before Next builds its own env snapshot.
loadRootEnv();

const nextConfig: NextConfig = {
  transpilePackages: ['@amalthea/assistant-core'],
};

export default nextConfig;
