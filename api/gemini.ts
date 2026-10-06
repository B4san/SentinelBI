import type { Request, Response } from 'express';
import { geminiGenerate } from '../src/lib/ai/geminiAdapter';
import { requestToMessages, resolveProviderConfig } from '../src/lib/ai/resolve';
import { toUserFacingError } from '../src/lib/ai/errors';

export default async function geminiHandler(req: Request, res: Response) {
  try {
    const header = req.headers['x-api-key'];
    const fromHeader = Array.isArray(header) ? header[0] : header;
    const apiKey = String(fromHeader || req.body?.apiKey || '').trim();
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
        error: 'Gemini API key missing. Add it in Settings or set GEMINI_API_KEY.',
      });
    }

    const messages = requestToMessages({ contents: req.body?.contents, messages: req.body?.messages });
    if (messages.length === 0) {
      return res.status(400).json({ error: 'Missing contents' });
    }

    const text = await geminiGenerate(config, messages);
    return res.json({ text, provider: 'gemini', model: config.model });
  } catch (error) {
    const mapped = toUserFacingError(error, 'gemini');
    return res.status(mapped.status || 500).json({ error: mapped.message });
  }
}
