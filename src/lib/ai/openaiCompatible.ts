import { mapProviderError } from './errors';
import type { ModelInfo, ResolvedProviderConfig } from './types';

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

export async function openaiGenerate(
  config: ResolvedProviderConfig,
  messages: { role: string; content: string }[],
  opts: { json?: boolean; temperature?: number; maxTokens?: number; jsonSchema?: Record<string, unknown> } = {},
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
          stream: false,
          json: opts.json,
          temperature: opts.temperature,
          maxTokens: opts.maxTokens,
          jsonSchema: opts.jsonSchema,
        }),
      ),
    });
  } catch (cause) {
    throw mapProviderError({ cause, provider: config.provider, status: 0 });
  }

  let raw = await res.text();
  if (!res.ok && opts.jsonSchema && (res.status === 400 || res.status === 422)) {
    try {
      res = await fetch(chatCompletionsUrl(config.baseUrl), {
        method: 'POST',
        headers: authHeaders(config),
        body: JSON.stringify(
          buildChatBody({
            model: config.model,
            messages,
            stream: false,
            json: true,
            temperature: opts.temperature,
            maxTokens: opts.maxTokens,
          }),
        ),
      });
      raw = await res.text();
    } catch (cause) {
      throw mapProviderError({ cause, provider: config.provider, status: 0 });
    }
  }
  if (!res.ok) {
    throw mapProviderError({ status: res.status, body: raw, provider: config.provider });
  }

  try {
    return extractChatText(JSON.parse(raw));
  } catch {
    return raw;
  }
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

export async function openaiListModels(config: ResolvedProviderConfig): Promise<ModelInfo[]> {
  let res: Response;
  try {
    res = await fetch(modelsUrl(config.baseUrl), {
      method: 'GET',
      headers: authHeaders(config),
    });
  } catch (cause) {
    throw mapProviderError({ cause, provider: config.provider, status: 0 });
  }

  const raw = await res.text();
  if (!res.ok) {
    throw mapProviderError({ status: res.status, body: raw, provider: config.provider });
  }

  try {
    const payload = JSON.parse(raw) as { data?: Array<{ id?: string; owned_by?: string }> };
    const rows = Array.isArray(payload.data) ? payload.data : [];
    return rows
      .map((row) => ({
        id: String(row.id || ''),
        label: String(row.id || ''),
        ownedBy: row.owned_by,
      }))
      .filter((row) => row.id)
      .sort((a, b) => a.id.localeCompare(b.id));
  } catch {
    return [];
  }
}
