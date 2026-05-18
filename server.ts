import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from '@google/genai';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route for Gemini
  app.post("/api/gemini", async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "Gemini API Key missing on server" });
      }

      const ai = new GoogleGenAI({ apiKey });
      const { model, contents } = req.body;

      let response;
      try {
        response = await ai.models.generateContent({
          model: model || 'gemini-3-flash-preview',
          contents,
        });
      } catch (firstErr: any) {
        console.warn(`Error with primary model ${model || 'gemini-3-flash-preview'}, falling back to gemini-2.5-flash`, firstErr.message || firstErr);
        response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents,
        });
      }

      res.json({ text: response.text });
    } catch (error: any) {
      console.error("Gemini API Error:", error);
      res.status(500).json({ error: error.message || "Failed to generate content" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
