import { AIProviderError } from './types';

export function mapProviderError(opts: {
  status?: number;
  body?: string;
  provider?: string;
  cause?: unknown;
}): AIProviderError {
  const status = opts.status ?? 500;
  const provider = opts.provider ?? 'unknown';
  const raw = (opts.body || extractMessage(opts.cause) || '').slice(0, 500);

  if (status === 401 || status === 403) {
    return new AIProviderError({
      message: `Authentication failed for ${provider}. Check the API key and that it is enabled for this endpoint.`,
      status,
      code: 'auth',
      provider,
    });
  }
  if (status === 404) {
    return new AIProviderError({
      message: `Model or endpoint not found on ${provider}. Confirm the model id and base URL.`,
      status,
      code: 'not_found',
      provider,
    });
  }
  if (status === 429) {
    return new AIProviderError({
      message: `${provider} rate-limited the request. Wait a moment and retry.`,
      status,
      code: 'rate_limit',
      provider,
      retryable: true,
    });
  }
  if (status >= 500) {
    return new AIProviderError({
      message: `${provider} is unavailable (${status}). ${raw || 'Try again shortly.'}`,
      status,
      code: 'upstream',
      provider,
      retryable: true,
    });
  }
  if (status === 0 || /fetch failed|ECONNREFUSED|ENOTFOUND|network/i.test(raw)) {
    return new AIProviderError({
      message: `Could not reach ${provider}. Check the base URL and that the local server (Ollama / LM Studio) is running.`,
      status: 503,
      code: 'network',
      provider,
      retryable: true,
    });
  }

  return new AIProviderError({
    message: raw || `Request to ${provider} failed (${status}).`,
    status,
    code: 'provider_error',
    provider,
  });
}

export function extractMessage(error: unknown): string {
  if (!error) return '';
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export function toUserFacingError(error: unknown, provider = 'AI provider'): AIProviderError {
  if (error instanceof AIProviderError) return error;
  return mapProviderError({ cause: error, provider });
}
