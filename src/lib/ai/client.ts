import { PROVIDERS, isProviderId } from './providers';
import { contentsToPrompt } from './resolve';
import { AIProviderError, type GenerateRequest, type ModelInfo, type ProviderConfig } from './types';

const SETTINGS_KEY = 'sentinel_ai_settings';

export const DEFAULT_AI_SETTINGS: ProviderConfig = {
  provider: 'gemini',
  baseUrl: PROVIDERS.gemini.defaultBaseUrl,
  model: PROVIDERS.gemini.defaultModel,
  apiKey: '',
  stream: true,
};

export function loadAiSettings(): ProviderConfig {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_AI_SETTINGS };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const legacyKey = localStorage.getItem('sentinel_api_key') || '';
    const provider = isProviderId(parsed.provider) ? parsed.provider : DEFAULT_AI_SETTINGS.provider;
    return {
      provider,
      baseUrl: parsed.baseUrl || PROVIDERS[provider]?.defaultBaseUrl || DEFAULT_AI_SETTINGS.baseUrl,
      model: parsed.model || PROVIDERS[provider]?.defaultModel || DEFAULT_AI_SETTINGS.model,
      apiKey: parsed.apiKey || legacyKey,
      stream: parsed.stream !== false,
    };
  } catch {
    return { ...DEFAULT_AI_SETTINGS };
  }
}

export function saveAiSettings(settings: ProviderConfig): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  if (settings.apiKey) {
    localStorage.setItem('sentinel_api_key', settings.apiKey);
  } else {
    localStorage.removeItem('sentinel_api_key');
  }
}

function headers(settings: ProviderConfig): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (settings.apiKey) headers['x-api-key'] = settings.apiKey;
  return headers;
}

export async function generateContent(
  input: Omit<GenerateRequest, 'apiKey' | 'provider' | 'baseUrl'> & Partial<ProviderConfig>,
): Promise<{ text: string; provider?: string; model?: string }> {
  const settings = loadAiSettings();
  const payload = {
    provider: input.provider || settings.provider,
    baseUrl: input.baseUrl || settings.baseUrl,
    model: input.model || settings.model,
    stream: false,
    json: input.json,
    contents: input.contents,
    messages: input.messages,
    temperature: input.temperature,
  };

  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: headers({ ...settings, ...input, apiKey: input.apiKey || settings.apiKey }),
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new AIProviderError({
      message: data.error || `AI request failed (${res.status})`,
      status: res.status,
      code: data.code,
      provider: data.provider || payload.provider,
    });
  }
  return { text: data.text || '', provider: data.provider, model: data.model };
}

export async function streamContent(
  input: Omit<GenerateRequest, 'apiKey'> & Partial<ProviderConfig>,
  onDelta: (chunk: string) => void,
): Promise<{ text: string }> {
  const settings = loadAiSettings();
  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: headers({ ...settings, apiKey: input.apiKey || settings.apiKey }),
    body: JSON.stringify({
      provider: input.provider || settings.provider,
      baseUrl: input.baseUrl || settings.baseUrl,
      model: input.model || settings.model,
      stream: true,
      json: input.json,
      contents: input.contents,
      messages: input.messages,
    }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new AIProviderError({
      message: data.error || `AI stream failed (${res.status})`,
      status: res.status,
      code: data.code,
      provider: data.provider || settings.provider,
    });
  }

  if (!res.body) {
    const data = await res.json().catch(() => ({}));
    const text = data.text || '';
    if (text) onDelta(text);
    return { text };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\n\n/);
    buffer = lines.pop() || '';
    for (const block of lines) {
      const line = block.trim();
      if (!line.startsWith('data:')) continue;
      try {
        const payload = JSON.parse(line.slice(5).trim());
        if (payload.text && !payload.done) {
          full += payload.text;
          onDelta(payload.text);
        }
        if (payload.done && payload.text && !full) {
          full = payload.text;
          onDelta(payload.text);
        }
      } catch {
        // ignore
      }
    }
  }

  return { text: full };
}

export async function fetchModels(settings?: Partial<ProviderConfig>): Promise<{ models: ModelInfo[]; source: string }> {
  const current = { ...loadAiSettings(), ...settings };
  const params = new URLSearchParams({
    provider: current.provider,
    baseUrl: current.baseUrl,
    model: current.model,
  });
  const res = await fetch(`/api/ai/models?${params.toString()}`, {
    headers: headers(current),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new AIProviderError({
      message: data.error || 'Could not list models',
      status: res.status,
      provider: current.provider,
    });
  }
  return { models: data.models || [], source: data.source || 'curated' };
}

export { contentsToPrompt };
