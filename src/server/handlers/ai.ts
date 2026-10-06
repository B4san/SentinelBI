import type { Request, Response } from 'express';
import { geminiCuratedModels, geminiGenerate, geminiStream } from '../../lib/ai/geminiAdapter';
import { openaiGenerate, openaiListModels, openaiStream } from '../../lib/ai/openaiCompatible';
import { PROVIDERS } from '../../lib/ai/providers';
import { assertApiKey, requestToMessages, resolveProviderConfig } from '../../lib/ai/resolve';
import type { GenerateRequest } from '../../lib/ai/types';
import { readApiKey } from '../http';

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
  } as GenerateRequest;
}

export async function aiGenerateHandler(req: Request, res: Response) {
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

  let text = '';
  let routed = config.model;
  if (config.compatible === 'gemini') {
    text = await geminiGenerate(config, messages);
  } else {
    const out = await openaiGenerate(config, messages, { json: input.json, temperature: input.temperature ?? 0.4, maxTokens: 8000 });
    text = out.text;
    routed = out.model || config.model;
  }

  return res.json({
    text,
    provider: config.provider,
    model: routed,
    keySource: config.source.apiKey,
  });
}

export async function aiModelsHandler(req: Request, res: Response) {
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
    // fall through to curated so listing never 500s on a missing or invalid key
  }

  return res.json({ models: def.curatedModels, source: 'curated' });
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
