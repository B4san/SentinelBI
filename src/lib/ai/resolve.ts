import { PROVIDERS, isProviderId, normalizeBaseUrl } from './providers';
import { AIProviderError, type GenerateRequest, type ProviderId, type ResolvedProviderConfig } from './types';

export interface EnvLike {
  [key: string]: string | undefined;
}

export function parseProviderId(value: unknown, fallback: ProviderId = 'gemini'): ProviderId {
  return isProviderId(value) ? value : fallback;
}

export function contentsToPrompt(contents: unknown): string {
  if (contents == null) return '';
  if (typeof contents === 'string') return contents;
  if (Array.isArray(contents)) {
    return contents
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object') {
          const rec = item as Record<string, unknown>;
          if (typeof rec.content === 'string') return rec.content;
          if (Array.isArray(rec.parts)) {
            return rec.parts
              .map((part) => (part && typeof part === 'object' && 'text' in part ? String((part as { text: unknown }).text ?? '') : ''))
              .join('\n');
          }
          if (typeof rec.text === 'string') return rec.text;
        }
        return '';
      })
      .filter(Boolean)
      .join('\n\n');
  }
  if (typeof contents === 'object') {
    const rec = contents as Record<string, unknown>;
    if (typeof rec.text === 'string') return rec.text;
    if (typeof rec.content === 'string') return rec.content;
  }
  return String(contents);
}

export function requestToMessages(req: GenerateRequest): { role: 'system' | 'user' | 'assistant'; content: string }[] {
  if (req.messages && req.messages.length > 0) return req.messages;
  const prompt = contentsToPrompt(req.contents);
  return prompt ? [{ role: 'user', content: prompt }] : [];
}

export function envApiKey(env: EnvLike, provider: ProviderId): string {
  const def = PROVIDERS[provider];
  return (
    env[def.envKey] ||
    env.AI_API_KEY ||
    (provider === 'gemini' ? env.GEMINI_API_KEY : '') ||
    ''
  ).trim();
}

export function resolveProviderConfig(
  input: Partial<GenerateRequest>,
  env: EnvLike = {},
): ResolvedProviderConfig {
  const provider = parseProviderId(input.provider || env.AI_PROVIDER, 'gemini');
  const def = PROVIDERS[provider];

  const userBase = normalizeBaseUrl(input.baseUrl || '');
  const envBase = normalizeBaseUrl(env.AI_BASE_URL || '');
  const baseUrl = userBase || envBase || def.defaultBaseUrl;

  const userModel = String(input.model || '').trim();
  const envModel = String(env.AI_MODEL || '').trim();
  const model = userModel || envModel || def.defaultModel;

  const userKey = String(input.apiKey || '').trim();
  const envKey = envApiKey(env, provider);
  const apiKey = userKey || envKey;

  return {
    provider,
    baseUrl,
    model,
    apiKey,
    stream: Boolean(input.stream),
    compatible: def.compatible,
    extraHeaders: { ...(def.extraHeaders || {}) },
    source: {
      baseUrl: userBase ? 'user' : envBase ? 'env' : 'provider',
      model: userModel ? 'user' : envModel ? 'env' : 'provider',
      apiKey: userKey ? 'user' : envKey ? 'env' : 'none',
    },
  };
}

export function assertApiKey(config: ResolvedProviderConfig): void {
  const def = PROVIDERS[config.provider];
  if (def.requiresApiKey && !config.apiKey) {
    throw new AIProviderError({
      message: `Missing API key for ${def.label}. Set it in Settings or the ${def.envKey} environment variable.`,
      status: 401,
      code: 'auth',
      provider: config.provider,
    });
  }
}
