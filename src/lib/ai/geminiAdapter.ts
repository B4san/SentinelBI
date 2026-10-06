import { GoogleGenAI } from '@google/genai';
import { mapProviderError } from './errors';
import { PROVIDERS } from './providers';
import type { ModelInfo, ResolvedProviderConfig } from './types';

function toGeminiContents(messages: { role: string; content: string }[]): unknown {
  return messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));
}

export async function geminiGenerate(
  config: ResolvedProviderConfig,
  messages: { role: string; content: string }[],
): Promise<string> {
  if (!config.apiKey) {
    throw mapProviderError({
      status: 401,
      body: 'Missing Gemini API key',
      provider: 'gemini',
    });
  }

  const ai = new GoogleGenAI({ apiKey: config.apiKey });
  const contents = toGeminiContents(messages);
  const primary = config.model || 'gemini-2.5-flash';

  try {
    const response = await ai.models.generateContent({
      model: primary,
      contents: contents as never,
    });
    return String(response.text || '');
  } catch (firstErr) {
    if (primary === 'gemini-2.5-flash') {
      throw mapProviderError({ cause: firstErr, provider: 'gemini' });
    }
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: contents as never,
      });
      return String(response.text || '');
    } catch (secondErr) {
      throw mapProviderError({ cause: secondErr, provider: 'gemini' });
    }
  }
}

export async function geminiStream(
  config: ResolvedProviderConfig,
  messages: { role: string; content: string }[],
  onDelta: (chunk: string) => void,
): Promise<string> {
  if (!config.apiKey) {
    throw mapProviderError({ status: 401, body: 'Missing Gemini API key', provider: 'gemini' });
  }

  const ai = new GoogleGenAI({ apiKey: config.apiKey });
  const contents = toGeminiContents(messages);

  try {
    const stream = await ai.models.generateContentStream({
      model: config.model || 'gemini-2.5-flash',
      contents: contents as never,
    });
    let full = '';
    for await (const chunk of stream) {
      const text = String(chunk.text || '');
      if (text) {
        full += text;
        onDelta(text);
      }
    }
    return full;
  } catch (cause) {
    const fallback = await geminiGenerate(config, messages);
    onDelta(fallback);
    return fallback;
  }
}

export function geminiCuratedModels(): ModelInfo[] {
  return PROVIDERS.gemini.curatedModels.map((m) => ({ id: m.id, label: m.label, ownedBy: 'google' }));
}
