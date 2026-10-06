import type { Request, Response } from 'express';
import { geminiGenerate } from '../../lib/ai/geminiAdapter';
import { requestToMessages, resolveProviderConfig } from '../../lib/ai/resolve';
import { readApiKey } from '../http';

export async function geminiHandler(req: Request, res: Response) {
  const apiKey = readApiKey(req);
  const config = resolveProviderConfig(
    {
      provider: 'gemini',
      model: req.body?.model,
      apiKey,
      contents: req.body?.contents,
    },
    process.env,
  );

  if (!config.apiKey) {
    return res.status(401).json({
      error: 'invalid API key for gemini',
      code: 'auth',
      provider: 'gemini',
    });
  }

  const messages = requestToMessages({ contents: req.body?.contents, messages: req.body?.messages });
  if (messages.length === 0) {
    return res.status(400).json({ error: 'Missing contents' });
  }

  const text = await geminiGenerate(config, messages);
  return res.json({ text, provider: 'gemini', model: config.model, keySource: config.source.apiKey });
}

export default geminiHandler;
