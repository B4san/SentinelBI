import type { Request, Response } from 'express';
import { PROVIDERS, isProviderId } from '../../lib/ai/providers';
import { detectStorageKind, hasServerKey, runtimeKind } from '../runtime';

export async function healthHandler(_req: Request, res: Response) {
  const envProvider = process.env.AI_PROVIDER && isProviderId(process.env.AI_PROVIDER)
    ? process.env.AI_PROVIDER
    : 'gemini';
  const def = PROVIDERS[envProvider];
  const model =
    (envProvider === 'openrouter' ? process.env.OPENROUTER_MODEL : '')
    || process.env.AI_MODEL
    || def.defaultModel;

  return res.json({
    ok: true,
    provider: envProvider,
    model,
    hasServerKey: hasServerKey(process.env),
    runtime: runtimeKind(process.env),
    storage: detectStorageKind(process.env),
  });
}
