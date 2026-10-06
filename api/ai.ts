import type { Request, Response } from 'express';
import { geminiCuratedModels, geminiGenerate, geminiStream } from '../src/lib/ai/geminiAdapter';
import { openaiGenerate, openaiListModels, openaiStream } from '../src/lib/ai/openaiCompatible';
import { PROVIDERS } from '../src/lib/ai/providers';
import { assertApiKey, requestToMessages, resolveProviderConfig } from '../src/lib/ai/resolve';
import { toUserFacingError } from '../src/lib/ai/errors';
import { AIProviderError, type GenerateRequest } from '../src/lib/ai/types';

function readApiKey(req: Request): string {
  const header = req.headers['x-api-key'];
  const fromHeader = Array.isArray(header) ? header[0] : header;
  const bodyKey = typeof req.body?.apiKey === 'string' ? req.body.apiKey : '';
  return String(fromHeader || bodyKey || '').trim();
}

function requestFromExpress(req: Request): GenerateRequest {
  return {
    provider: req.body?.provider || req.query.provider,
    baseUrl: req.body?.baseUrl || req.query.baseUrl,
    model: req.body?.model || req.query.model,
    apiKey: readApiKey(req),
    stream: Boolean(req.body?.stream || req.query.stream === '1'),
    json: Boolean(req.body?.json),
    contents: req.body?.contents,
    messages: req.body?.messages,
    temperature: req.body?.temperature,
  };
}

export async function aiGenerateHandler(req: Request, res: Response) {
  try {
    const input = requestFromExpress(req);
    const config = resolveProviderConfig(input, process.env);
    assertApiKey(config);
    const messages = requestToMessages(input);
    if (messages.length === 0) {
      return res.status(400).json({ error: 'Provide contents or messages.' });
    }

    if (input.stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      const onDelta = (chunk: string) => {
        res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
      };
      const text =
        config.compatible === 'gemini'
          ? await geminiStream(config, messages, onDelta)
          : await openaiStream(config, messages, onDelta, { json: input.json, temperature: input.temperature });
      res.write(`data: ${JSON.stringify({ done: true, text })}\n\n`);
      return res.end();
    }

    const text =
      config.compatible === 'gemini'
        ? await geminiGenerate(config, messages)
        : await openaiGenerate(config, messages, { json: input.json, temperature: input.temperature });

    return res.json({
      text,
      provider: config.provider,
      model: config.model,
    });
  } catch (error) {
    const mapped = toUserFacingError(error);
    return res.status(mapped.status || 500).json({
      error: mapped.message,
      code: mapped instanceof AIProviderError ? mapped.code : 'provider_error',
      provider: mapped instanceof AIProviderError ? mapped.provider : undefined,
    });
  }
}

export async function aiModelsHandler(req: Request, res: Response) {
  try {
    const input = requestFromExpress(req);
    const config = resolveProviderConfig(input, process.env);
    const def = PROVIDERS[config.provider];

    if (config.compatible === 'gemini') {
      return res.json({ models: geminiCuratedModels(), source: 'curated' });
    }

    if (!def.supportsModelList) {
      return res.json({ models: def.curatedModels, source: 'curated' });
    }

    try {
      assertApiKey(config);
      const models = await openaiListModels(config);
      if (models.length > 0) {
        return res.json({ models, source: 'live' });
      }
    } catch {
      // fall through to curated
    }

    return res.json({ models: def.curatedModels, source: 'curated' });
  } catch (error) {
    const mapped = toUserFacingError(error);
    return res.status(mapped.status || 500).json({ error: mapped.message });
  }
}

export async function aiProvidersHandler(_req: Request, res: Response) {
  res.json({
    providers: Object.values(PROVIDERS).map((p) => ({
      id: p.id,
      label: p.label,
      description: p.description,
      defaultBaseUrl: p.defaultBaseUrl,
      defaultModel: p.defaultModel,
      supportsModelList: p.supportsModelList,
      requiresApiKey: p.requiresApiKey,
      compatible: p.compatible,
      curatedModels: p.curatedModels,
    })),
  });
}
