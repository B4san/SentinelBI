import { createApp } from './app';
import { loadProductionRenderer, prodAssets } from './ssr';

const app = createApp({
  loadRenderer: loadProductionRenderer,
  assets: prodAssets,
});

export default app;
