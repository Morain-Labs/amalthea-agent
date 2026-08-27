/**
 * Model routing. The id comes from env so nothing is hardcoded:
 * - GEMINI_MODEL overrides the default (documented fallback: gemini-3.6-flash
 *   if 3.7 misbehaves).
 * - The backend (Gemini API key locally vs Vertex AI on Cloud Run) is decided
 *   entirely by ADK from GOOGLE_GENAI_USE_VERTEXAI and its companion env vars.
 */
export const DEFAULT_MODEL = 'gemini-3.7-flash';
export const FALLBACK_MODEL = 'gemini-3.6-flash';
export const DEFAULT_LIVE_MODEL = 'gemini-3.1-flash-live-preview';

export function modelId(): string {
  return process.env.GEMINI_MODEL ?? DEFAULT_MODEL;
}

export function liveModelId(): string {
  return process.env.GEMINI_LIVE_MODEL ?? DEFAULT_LIVE_MODEL;
}
