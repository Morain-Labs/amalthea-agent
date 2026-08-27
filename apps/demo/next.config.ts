import { join } from 'node:path';
import type { NextConfig } from 'next';
import { loadRootEnv } from './src/lib/env';

// Server-side env (GEMINI_API_KEY and friends) lives in one file at the repo
// root. Load it before Next builds its own env snapshot.
loadRootEnv();

// Local development runs against the Firestore emulator unless the deployed
// backend (Vertex + live Firestore) is explicitly configured.
if (!process.env.FIRESTORE_EMULATOR_HOST && process.env.GOOGLE_GENAI_USE_VERTEXAI !== 'true') {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
}

const nextConfig: NextConfig = {
  transpilePackages: ['@amalthea/assistant-core'],
  // Server-only SDKs stay unbundled: ADK's OpenTelemetry internals and
  // firebase-admin break under bundling, and they only ever run in Node.
  serverExternalPackages: ['@google/adk', '@google/genai', 'firebase-admin'],
  // Cloud Run runs the traced standalone server. The tracing root is the
  // workspace root so @amalthea/assistant-core rides along.
  output: 'standalone',
  outputFileTracingRoot: join(import.meta.dirname, '../../'),
};

export default nextConfig;
