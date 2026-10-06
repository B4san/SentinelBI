import { describe, expect, it } from 'vitest';
import { mapProviderError } from '../src/lib/ai/errors';
import { authHeaders, buildChatBody, chatCompletionsUrl, extractChatText, modelsUrl } from '../src/lib/ai/openaiCompatible';
import { PROVIDERS, isProviderId, normalizeBaseUrl } from '../src/lib/ai/providers';
import { contentsToPrompt, requestToMessages, resolveProviderConfig } from '../src/lib/ai/resolve';
import { AIProviderError } from '../src/lib/ai/types';

describe('provider catalog', () => {
  it('includes OpenRouter and OpenAI-compatible endpoints', () => {
    expect(PROVIDERS.openrouter.defaultBaseUrl).toContain('openrouter.ai');
    expect(PROVIDERS.openai.compatible).toBe('openai');
    expect(PROVIDERS.groq.compatible).toBe('openai');
    expect(PROVIDERS.ollama.requiresApiKey).toBe(false);
    expect(PROVIDERS.gemini.compatible).toBe('gemini');
    expect(isProviderId('together')).toBe(true);
    expect(isProviderId('not-a-provider')).toBe(false);
  });

  it('normalizes trailing slashes on base URLs', () => {
    expect(normalizeBaseUrl('https://api.openai.com/v1/')).toBe('https://api.openai.com/v1');
  });
});

describe('resolveProviderConfig', () => {
  it('prefers user overrides, then env, then provider defaults', () => {
    const resolved = resolveProviderConfig(
      { provider: 'openrouter', baseUrl: 'https://example.test/v1/', model: 'my-model', apiKey: 'user-key' },
      { AI_PROVIDER: 'openai', AI_BASE_URL: 'https://env.example/v1', AI_MODEL: 'env-model', OPENROUTER_API_KEY: 'env-key' },
    );
    expect(resolved.provider).toBe('openrouter');
    expect(resolved.baseUrl).toBe('https://example.test/v1');
    expect(resolved.model).toBe('my-model');
    expect(resolved.apiKey).toBe('user-key');
    expect(resolved.source.apiKey).toBe('user');
    expect(resolved.extraHeaders['X-Title']).toBe('SentinelBI');
  });

  it('falls back to Gemini and GEMINI_API_KEY', () => {
    const resolved = resolveProviderConfig({}, { GEMINI_API_KEY: 'server-key' });
    expect(resolved.provider).toBe('gemini');
    expect(resolved.apiKey).toBe('server-key');
    expect(resolved.source.apiKey).toBe('env');
    expect(resolved.model).toBe(PROVIDERS.gemini.defaultModel);
  });

  it('uses AI_API_KEY for custom providers without a user key', () => {
    const resolved = resolveProviderConfig({ provider: 'custom' }, { AI_API_KEY: 'shared' });
    expect(resolved.apiKey).toBe('shared');
    expect(resolved.baseUrl).toBe(PROVIDERS.custom.defaultBaseUrl);
  });
});

describe('contents adapters', () => {
  it('flattens Gemini parts and string contents', () => {
    expect(contentsToPrompt('hello')).toBe('hello');
    expect(
      contentsToPrompt([
        { role: 'user', parts: [{ text: 'Analyze revenue' }] },
        { role: 'user', parts: [{ text: 'Keep it short' }] },
      ]),
    ).toBe('Analyze revenue\n\nKeep it short');
  });

  it('builds chat messages from either contents or messages', () => {
    expect(requestToMessages({ messages: [{ role: 'user', content: 'Hi' }] })[0].content).toBe('Hi');
    expect(requestToMessages({ contents: 'Go' })[0]).toEqual({ role: 'user', content: 'Go' });
  });
});

describe('openai-compatible request builders', () => {
  it('builds chat URLs and JSON-mode bodies', () => {
    expect(chatCompletionsUrl('https://openrouter.ai/api/v1')).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(modelsUrl('https://api.groq.com/openai/v1/')).toBe('https://api.groq.com/openai/v1/models');
    const body = buildChatBody({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'hi' }],
      json: true,
    });
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.stream).toBe(false);
  });

  it('adds bearer auth only when a key exists', () => {
    const withKey = authHeaders({
      provider: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      apiKey: 'sk-test',
      stream: false,
      compatible: 'openai',
      extraHeaders: { 'X-Title': 'SentinelBI' },
      source: { baseUrl: 'provider', model: 'provider', apiKey: 'user' },
    });
    expect(withKey.Authorization).toBe('Bearer sk-test');
    expect(withKey['X-Title']).toBe('SentinelBI');

    const noKey = authHeaders({
      provider: 'ollama',
      baseUrl: 'http://127.0.0.1:11434/v1',
      model: 'llama3.2',
      apiKey: '',
      stream: false,
      compatible: 'openai',
      extraHeaders: {},
      source: { baseUrl: 'provider', model: 'provider', apiKey: 'none' },
    });
    expect(noKey.Authorization).toBeUndefined();
  });

  it('extracts streamed and non-streamed chat text', () => {
    expect(extractChatText({ choices: [{ message: { content: 'done' } }] })).toBe('done');
    expect(extractChatText({ choices: [{ delta: { content: 'tok' } }] })).toBe('tok');
  });
});

describe('error mapping', () => {
  it('maps auth, rate limit, and network failures', () => {
    expect(mapProviderError({ status: 401, provider: 'openai' }).code).toBe('auth');
    expect(mapProviderError({ status: 429, provider: 'groq' }).retryable).toBe(true);
    expect(mapProviderError({ status: 0, body: 'fetch failed', provider: 'ollama' }).code).toBe('network');
    expect(mapProviderError({ status: 500, provider: 'together' })).toBeInstanceOf(AIProviderError);
  });
});
