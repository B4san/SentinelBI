export type RuntimeKind = 'vercel' | 'node';
export type StorageKind = 'memory' | 'blob' | 'kv' | 'fs';

export const VERCEL_MAX_DURATION_S = 60;
export const VERCEL_GENERATE_DEADLINE_MS = 50_000;
export const LOCAL_GENERATE_DEADLINE_MS = 240_000;
export const VERCEL_STEP_TIMEOUT_MS = 20_000;

export function isVercel(env: NodeJS.Dict<string> = process.env): boolean {
  return Boolean(env.VERCEL || env.VERCEL_ENV);
}

export function runtimeKind(env: NodeJS.Dict<string> = process.env): RuntimeKind {
  return isVercel(env) ? 'vercel' : 'node';
}

export function detectStorageKind(env: NodeJS.Dict<string> = process.env): StorageKind {
  if (env.BLOB_READ_WRITE_TOKEN) return 'blob';
  if (env.KV_REST_API_URL && (env.KV_REST_API_TOKEN || env.KV_REST_API_READ_WRITE_TOKEN)) return 'kv';
  if (!isVercel(env)) return 'fs';
  return 'memory';
}

export function resolveGenerateDeadlineMs(env: NodeJS.Dict<string> = process.env): number {
  const explicit = Number(env.AI_DEADLINE_MS || env.GENERATE_DEADLINE_MS || '');
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  if (isVercel(env)) return VERCEL_GENERATE_DEADLINE_MS;
  const maxDurationS = Number(env.VERCEL_MAX_DURATION || 250);
  const fromPlan = Math.max(5_000, (maxDurationS - 10) * 1000);
  return Math.min(fromPlan, LOCAL_GENERATE_DEADLINE_MS);
}

export function resolveStepTimeoutMs(remainingMs: number, env: NodeJS.Dict<string> = process.env): number {
  const cap = isVercel(env) ? VERCEL_STEP_TIMEOUT_MS : LOCAL_GENERATE_DEADLINE_MS;
  return Math.max(250, Math.min(remainingMs, cap));
}

export function hasServerKey(env: NodeJS.Dict<string> = process.env): boolean {
  return Boolean(
    env.AI_API_KEY
    || env.GEMINI_API_KEY
    || env.OPENROUTER_API_KEY
    || env.OPENAI_API_KEY
    || env.GROQ_API_KEY
    || env.TOGETHER_API_KEY
    || env.DEEPSEEK_API_KEY
    || env.MISTRAL_API_KEY,
  );
}
