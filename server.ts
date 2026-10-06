import { config as loadEnv } from 'dotenv';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { createServer as createViteServer, type ViteDevServer } from 'vite';
import { createApp } from './src/server/app';
import type { DashboardRenderer } from './src/server/ssr';

loadEnv({ path: '.env.local' });
loadEnv();

async function startServer() {
  const PORT = Number(process.env.PORT || 3000);
  const isProd = process.env.NODE_ENV === 'production';

  let vite: ViteDevServer | undefined;
  if (!isProd) {
    vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
  }

  async function loadRenderer(): Promise<DashboardRenderer> {
    if (vite) {
      return vite.ssrLoadModule('/src/entry-server.tsx') as Promise<DashboardRenderer>;
    }
    return import(pathToFileURL(path.join(process.cwd(), 'dist/ssr/entry-server.js')).href) as Promise<DashboardRenderer>;
  }

  const app = createApp({
    loadRenderer,
    assets: () => {
      if (!isProd) return { js: ['/src/entry-client-dashboard.tsx'] };
      try {
        const manifestPath = path.join(process.cwd(), 'dist/.vite/manifest.json');
        if (fs.existsSync(manifestPath)) {
          const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Record<string, { file: string; css?: string[]; imports?: string[] }>;
          const entry = manifest['src/entry-client-dashboard.tsx'] || manifest['src/entry-client-dashboard.ts'];
          const main = manifest['index.html'];
          const css = new Set<string>();
          const addCss = (item?: { css?: string[]; imports?: string[] }) => {
            for (const href of item?.css || []) css.add(href.startsWith('/') ? href : `/${href}`);
            for (const id of item?.imports || []) addCss(manifest[id]);
          };
          addCss(entry);
          addCss(main);
          const js = entry?.file ? [entry.file.startsWith('/') ? entry.file : `/${entry.file}`] : [];
          if (js.length) return { css: [...css], js };
        }
        const html = fs.readFileSync(path.join(process.cwd(), 'dist/index.html'), 'utf8');
        const css = [...html.matchAll(/href="([^"]+\.css)"/g)].map((m) => m[1]);
        const js = [...html.matchAll(/src="([^"]+\.js)"/g)].map((m) => m[1]);
        return { css, js };
      } catch {
        return undefined;
      }
    },
  });

  if (!isProd && vite) {
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
