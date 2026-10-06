import { isDailyFreeQuotaError } from './providers';
import { AIProviderError } from './types';

export function mapProviderError(opts: {
  status?: number;
  body?: string;
  provider?: string;
  cause?: unknown;
  retryAfterMs?: number;
}): AIProviderError {
  const status = opts.status ?? 500;
  const provider = opts.provider ?? 'unknown';
  const raw = (opts.body || extractMessage(opts.cause) || '').slice(0, 500);

  if (status === 401 || status === 403) {
    return new AIProviderError({
      message: `invalid API key for ${provider}`,
      status,
      code: 'auth',
      provider,
    });
  }
  if (status === 402 || /insufficient (credits|quota|funds)|payment required/i.test(raw)) {
    return new AIProviderError({
      message: `insufficient credits for ${provider}`,
      status: 402,
      code: 'payment',
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
    const daily = isDailyFreeQuotaError(raw);
    const retrySec = opts.retryAfterMs != null ? Math.max(1, Math.round(opts.retryAfterMs / 1000)) : undefined;
    return new AIProviderError({
      message: daily
        ? `free quota exhausted, resets daily`
        : retrySec
          ? `rate limited, retry in ${retrySec}s`
          : `rate limited, retry shortly`,
      status,
      code: 'rate_limit',
      provider,
      retryable: !daily,
    });
  }
  if (status === 504) {
    return new AIProviderError({
      message: raw || `Request to ${provider} timed out.`,
      status: 504,
      code: 'timeout',
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
  if (error && typeof error === 'object' && 'status' in error && Number((error as { status: unknown }).status) === 504) {
    return mapProviderError({
      status: 504,
      body: error instanceof Error ? error.message : 'Request timed out',
      provider,
      cause: error,
    });
  }
  return mapProviderError({ cause: error, provider });
}
