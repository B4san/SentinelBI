import type { Request, Response, NextFunction } from 'express';
import { GenerationTimeoutError } from '../lib/ai/openaiCompatible';
import { toUserFacingError } from '../lib/ai/errors';
import { AIProviderError } from '../lib/ai/types';
import type { GenerateDashboardResult } from '../lib/dashboard/generate';

export function readApiKey(req: Request): string {
  const header = req.headers['x-api-key'];
  const fromHeader = Array.isArray(header) ? header[0] : header;
  const bodyKey = typeof req.body?.apiKey === 'string' ? req.body.apiKey : '';
  return String(fromHeader || bodyKey || '').trim();
}

export function asyncRoute(
  handler: (req: Request, res: Response, next: NextFunction) => unknown,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req, res, next)).catch((error) => sendMappedError(res, error));
  };
}

export function sendMappedError(res: Response, error: unknown) {
  if (res.headersSent) return;
  const mapped = error instanceof GenerationTimeoutError
    ? new AIProviderError({
        message: error.message,
        status: 504,
        code: 'timeout',
        provider: 'AI provider',
      })
    : toUserFacingError(error);
  return res.status(mapped.status || 500).json({
    error: mapped.message,
    code: mapped instanceof AIProviderError ? mapped.code : 'provider_error',
    provider: mapped instanceof AIProviderError ? mapped.provider : undefined,
  });
}

export function httpStatusForGenerateResult(result: GenerateDashboardResult): number {
  const attempts = result.attempts || [];
  const text = `${result.fallbackReason || ''} ${result.error || ''}`;
  if (attempts.some((a) => a.status === 429) || /429|quota is exhausted|rate[- ]limit/i.test(text)) return 429;
  if (attempts.some((a) => a.status === 401 || a.status === 403) || /invalid API key|authentication failed/i.test(text)) return 401;
  if (attempts.some((a) => a.status === 402) || /insufficient credits/i.test(text)) return 402;
  if (attempts.some((a) => a.status === 504) || /timed out/i.test(text)) return 504;
  return 200;
}

export function jsonError(res: Response, status: number, error: string, extra: Record<string, unknown> = {}) {
  return res.status(status).json({ error, ...extra });
}
