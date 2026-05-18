import { Request, Response } from 'express';
import { GoogleGenAI } from '@google/genai';

export default async function geminiHandler(req: Request, res: Response) {
  try {
    // Busca la API key de los headers (localStorage frontend), del body, o de las variables de entorno
    const apiKey = req.headers['x-api-key'] || req.body.apiKey || process.env.GEMINI_API_KEY || "AIzaSyDS-8HX_Wx3icQZqlxXeoOPYk9Ggu2ztJw";
    
    if (!apiKey) {
      return res.status(500).json({ error: "Gemini API Key missing on server" });
    }

    const ai = new GoogleGenAI({ apiKey: apiKey as string });
    const { model, contents } = req.body;

    let response;
    try {
      // Intentar primero con el modelo solicitado o el default
      response = await ai.models.generateContent({
        model: model || 'gemini-3-flash-preview',
        contents,
      });
    } catch (firstErr: any) {
      console.warn(`Error with primary model ${model || 'gemini-3-flash-preview'}, falling back to gemini-2.5-flash:`, firstErr.message || firstErr);
      // Fallback a gemini-2.5-flash
      response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents,
      });
    }

    res.json({ text: response.text });
  } catch (error: any) {
    console.error("Gemini API Error in /api/gemini fallback:", error);
    res.status(500).json({ error: error.message || "Failed to generate content" });
  }
};
