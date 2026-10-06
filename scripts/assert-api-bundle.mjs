import { pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import path from 'node:path';

const file = path.join(process.cwd(), 'api/index.js');
if (!existsSync(file)) {
  console.error('api/index.js missing — run npm run build first');
  process.exit(1);
}

const mod = await import(pathToFileURL(file).href);
if (!mod.default) {
  console.error('Built function has no default export');
  process.exit(1);
}
console.log('ok: api/index.js default export loaded');
