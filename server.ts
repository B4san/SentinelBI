import { config as loadEnv } from 'dotenv';
import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import geminiHandler from './api/gemini';
import { aiGenerateHandler, aiModelsHandler, aiProvidersHandler } from './api/ai';

loadEnv({ path: '.env.local' });
loadEnv();

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3000);

  app.use(express.json({ limit: '4mb' }));

  app.post('/api/gemini', geminiHandler);
  app.post('/api/ai', aiGenerateHandler);
  app.get('/api/ai/models', aiModelsHandler);
  app.get('/api/ai/providers', aiProvidersHandler);

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
