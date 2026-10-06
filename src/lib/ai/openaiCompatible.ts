import { mapProviderError } from './errors';
import type { ModelInfo, ResolvedProviderConfig } from './types';

export const GENERATE_TIMEOUT_MS = 240_000;
export const OVERALL_GENERATE_DEADLINE_MS = 300_000;

export class GenerationTimeoutError extends Error {
  status = 504;
  step?: string;
  elapsedMs?: number;
  constructor(message = 'Dashboard generation timed out after 240s.', extras?: { step?: string; elapsedMs?: number }) {
    super(message);
    this.name = 'GenerationTimeoutError';
    this.step = extras?.step;
    this.elapsedMs = extras?.elapsedMs;
  }
}

export function chatCompletionsUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
}

export function modelsUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/models`;
}

export function buildChatBody(opts: {
  model: string;
  messages: { role: string; content: string }[];
  stream?: boolean;
  json?: boolean;
  temperature?: number;
  maxTokens?: number;
  jsonSchema?: Record<string, unknown>;
  reasoning?: { effort?: 'low' | 'medium' | 'high'; exclude?: boolean };
}): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: opts.model,
    messages: opts.messages,
    stream: Boolean(opts.stream),
    temperature: opts.temperature ?? 0.4,
    max_tokens: opts.maxTokens ?? 8000,
  };
  if (opts.jsonSchema) {
    body.response_format = {
      type: 'json_schema',
      json_schema: { name: 'dashboard_spec', strict: false, schema: opts.jsonSchema },
    };
  } else if (opts.json) {
    body.response_format = { type: 'json_object' };
  }
  if (opts.reasoning) {
    body.reasoning = opts.reasoning;
  }
  return body;
}

export function authHeaders(config: ResolvedProviderConfig): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...config.extraHeaders,
  };
  if (config.apiKey) {
    headers.Authorization = `Bearer ${config.apiKey}`;
  }
  return headers;
}

export function chatPayloadError(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const rec = payload as Record<string, unknown>;
  const choices = rec.choices;
  const empty = !Array.isArray(choices) || choices.length === 0;
  const err = rec.error;
  if (!err || !empty) return undefined;
  if (typeof err === 'string') return err;
  if (typeof err === 'object' && err && 'message' in err) {
    return String((err as { message: unknown }).message || 'Upstream error');
  }
  try {
    return JSON.stringify(err);
  } catch {
    return 'Upstream error';
  }
}

export function extractChatText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const rec = payload as Record<string, unknown>;
  const choices = rec.choices;
  if (Array.isArray(choices) && choices[0] && typeof choices[0] === 'object') {
    const choice = choices[0] as Record<string, unknown>;
    const message = choice.message as { content?: unknown } | undefined;
    if (typeof message?.content === 'string') return message.content;
    if (typeof choice.text === 'string') return choice.text;
    const delta = choice.delta as { content?: unknown } | undefined;
    if (typeof delta?.content === 'string') return delta.content;
  }
  if (typeof rec.text === 'string') return rec.text;
  return '';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function headerGet(headers: unknown, name: string): string | undefined {
  if (!headers) return undefined;
  if (typeof (headers as Headers).get === 'function') {
    return (headers as Headers).get(name) || undefined;
  }
  const rec = headers as Record<string, string>;
  return rec[name] || rec[name.toLowerCase()];
}

export function parseRetryAfterMs(headers: unknown, fallback = 5_000): number {
  const raw = headerGet(headers, 'retry-after') || headerGet(headers, 'Retry-After');
  if (!raw) return fallback;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.max(0, seconds * 1000);
  const when = Date.parse(raw);
  if (!Number.isNaN(when)) return Math.max(0, when - Date.now());
  return fallback;
}

export type ResponseFormatStep = 'json_schema' | 'json_object' | 'plain';

export interface OpenaiGenerateOpts {
  json?: boolean;
  temperature?: number;
  maxTokens?: number;
  jsonSchema?: Record<string, unknown>;
  timeoutMs?: number;
  retries?: number;
  format?: ResponseFormatStep;
  fetchImpl?: typeof fetch;
  reasoning?: { effort?: 'low' | 'medium' | 'high'; exclude?: boolean };
  rateLimitWaitMs?: number;
}

export interface ChatResult {
  status: number;
  raw: string;
  payload: unknown;
  headers?: unknown;
}

async function postChat(
  config: ResolvedProviderConfig,
  messages: { role: string; content: string }[],
  opts: OpenaiGenerateOpts,
  format: ResponseFormatStep,
): Promise<ChatResult> {
  const controller = new AbortController();
  const timeoutMs = Math.max(250, opts.timeoutMs ?? GENERATE_TIMEOUT_MS);
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const fetchImpl = opts.fetchImpl || fetch;
  const jsonSchema = format === 'json_schema' ? opts.jsonSchema : undefined;
  const json = format !== 'plain';
  const bodyMessages = format === 'plain'
    ? [...messages, { role: 'system', content: 'Return only JSON. No markdown, no prose.' }]
    : messages;
  const reasoning = opts.reasoning
    || (config.provider === 'openrouter' || /reason|r1|thinking/i.test(config.model)
      ? { effort: 'low' as const }
      : undefined);
  try {
    const res = await fetchImpl(chatCompletionsUrl(config.baseUrl), {
      method: 'POST',
      headers: authHeaders(config),
      body: JSON.stringify(
        buildChatBody({
          model: config.model,
          messages: bodyMessages,
          stream: false,
          json,
          temperature: opts.temperature,
          maxTokens: opts.maxTokens,
          jsonSchema,
          reasoning,
        }),
      ),
      signal: controller.signal,
    });
    const raw = await res.text();
    let payload: unknown = raw;
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = raw;
    }
    return { status: res.status, raw, payload, headers: res.headers };
  } catch (cause) {
    if (cause instanceof Error && cause.name === 'AbortError') {
      throw new GenerationTimeoutError(`Dashboard generation timed out after ${Math.round(timeoutMs / 1000)}s.`, {
        elapsedMs: timeoutMs,
      });
    }
    throw mapProviderError({ cause, provider: config.provider, status: 0 });
  } finally {
    clearTimeout(timer);
  }
}

export async function openaiGenerate(
  config: ResolvedProviderConfig,
  messages: { role: string; content: string }[],
  opts: OpenaiGenerateOpts = {},
): Promise<string> {
  const format: ResponseFormatStep = opts.format || (opts.jsonSchema ? 'json_schema' : opts.json ? 'json_object' : 'plain');
  const retries = opts.retries ?? 2;
  let lastStatus = 0;
  let lastRaw = '';
  let lastError = '';
  let waitedOn429 = false;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const result = await postChat(config, messages, opts, format);
    lastStatus = result.status;
    lastRaw = result.raw;

    if (result.status === 429) {
      lastError = chatPayloadError(result.payload) || result.raw || '429 rate limited';
      if (!waitedOn429) {
        waitedOn429 = true;
        await sleep(parseRetryAfterMs(result.headers, opts.rateLimitWaitMs ?? 5_000));
        continue;
      }
      throw mapProviderError({ status: 429, body: lastError, provider: config.provider });
    }

    if (result.status === 400 || result.status === 422) {
      const detail = chatPayloadError(result.payload) || result.raw;
      throw mapProviderError({ status: result.status, body: detail, provider: config.provider });
    }

    if (result.status >= 500) {
      lastError = chatPayloadError(result.payload) || result.raw || `${result.status}`;
      if (attempt < retries) {
        await sleep(400 * (attempt + 1));
        continue;
      }
      throw mapProviderError({ status: result.status, body: lastError, provider: config.provider });
    }

    if (result.status && result.status >= 400) {
      throw mapProviderError({ status: result.status, body: result.raw, provider: config.provider });
    }

    const upstream = chatPayloadError(result.payload);
    if (upstream) {
      lastError = upstream;
      if (attempt < retries) {
        await sleep(400 * (attempt + 1));
        continue;
      }
      throw mapProviderError({ status: 503, body: upstream, provider: config.provider });
    }

    if (typeof result.payload === 'object') {
      const text = extractChatText(result.payload);
      if (text) return text;
    }
    if (typeof result.raw === 'string' && result.raw.trim()) return result.raw;
    lastError = 'Empty model response';
    if (attempt < retries) await sleep(400 * (attempt + 1));
  }

  throw mapProviderError({
    status: lastStatus || 502,
    body: lastError || lastRaw,
    provider: config.provider,
  });
}

export async function openaiStream(
  config: ResolvedProviderConfig,
  messages: { role: string; content: string }[],
  onDelta: (chunk: string) => void,
  opts: { json?: boolean; temperature?: number } = {},
): Promise<string> {
  let res: Response;
  try {
    res = await fetch(chatCompletionsUrl(config.baseUrl), {
      method: 'POST',
      headers: authHeaders(config),
      body: JSON.stringify(
        buildChatBody({
          model: config.model,
          messages,
          stream: true,
          json: opts.json,
          temperature: opts.temperature,
        }),
      ),
    });
  } catch (cause) {
    throw mapProviderError({ cause, provider: config.provider, status: 0 });
  }

  if (!res.ok) {
    const raw = await res.text();
    throw mapProviderError({ status: res.status, body: raw, provider: config.provider });
  }

  if (!res.body) {
    const raw = await res.text();
    onDelta(raw);
    return raw;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const data = trimmed.slice(5).trim();
      if (data === '[DONE]') continue;
      try {
        const piece = extractChatText(JSON.parse(data));
        if (piece) {
          full += piece;
          onDelta(piece);
        }
      } catch {
        // ignore keep-alives
      }
    }
  }

  return full;
}

const structuredOutputCache = new Map<string, { at: number; supported: boolean }>();

function rowSupportsStructuredOutputs(row: Record<string, unknown>): boolean {
  if (row.structured_outputs === true || row.supports_structured_outputs === true) return true;
  const params = row.supported_parameters;
  if (Array.isArray(params) && params.some((p) => /structured_outputs|response_format/i.test(String(p)))) return true;
  const top = row.top_provider;
  if (top && typeof top === 'object' && (top as { is_moderated?: boolean }).is_moderated != null) {
    const supported = (top as { supported_parameters?: unknown }).supported_parameters;
    if (Array.isArray(supported) && supported.some((p) => /structured_outputs/i.test(String(p)))) return true;
  }
  return false;
}

export async function openaiListModels(
  config: ResolvedProviderConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<ModelInfo[]> {
  let res: Response;
  try {
    res = await fetchImpl(modelsUrl(config.baseUrl), {
      method: 'GET',
      headers: authHeaders(config),
    });
  } catch (cause) {
    throw mapProviderError({ cause, provider: config.provider, status: 0 });
  }

  const raw = await res.text();
  if ((res as Response).ok === false || (res.status && res.status >= 400)) {
    throw mapProviderError({ status: res.status, body: raw, provider: config.provider });
  }

  try {
    const payload = JSON.parse(raw) as { data?: Array<Record<string, unknown>> };
    const rows = Array.isArray(payload.data) ? payload.data : [];
    return rows
      .map((row) => ({
        id: String(row.id || ''),
        label: String(row.id || ''),
        ownedBy: typeof row.owned_by === 'string' ? row.owned_by : undefined,
        structuredOutputs: rowSupportsStructuredOutputs(row),
      }))
      .filter((row) => row.id)
      .sort((a, b) => a.id.localeCompare(b.id));
  } catch {
    return [];
  }
}

export async function modelSupportsStructuredOutputs(
  config: ResolvedProviderConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const key = `${config.provider}:${config.baseUrl}:${config.model}`;
  const cached = structuredOutputCache.get(key);
  if (cached && Date.now() - cached.at < 10 * 60_000) return cached.supported;
  try {
    const models = await openaiListModels(config, fetchImpl);
    const match = models.find((m) => m.id === config.model || m.id.endsWith(`/${config.model}`));
    const supported = Boolean(match?.structuredOutputs);
    structuredOutputCache.set(key, { at: Date.now(), supported });
    return supported;
  } catch {
    structuredOutputCache.set(key, { at: Date.now(), supported: false });
    return false;
  }
}

export function clearStructuredOutputCache(): void {
  structuredOutputCache.clear();
}
