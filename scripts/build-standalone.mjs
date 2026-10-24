import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve(root, '../../outputs/银作工作台-v1.1.html');
let html = await readFile(path.join(root, 'src/index.html'), 'utf8');
const css = await readFile(path.join(root, 'src/style.css'), 'utf8');
const planner = (await readFile(path.join(root, 'src/planner.js'), 'utf8')).replace(/\bexport\s+/g, '');
const media = (await readFile(path.join(root, 'src/media.js'), 'utf8')).replace(/\bexport\s+/g, '');
const app = (await readFile(path.join(root, 'src/app.js'), 'utf8')).replace(/^import[^\n]+\n/gm, '');
const script = [planner, media, app].join('\n').replace(/<\/script/gi, '<\\/script');
html = html.replace('<link rel="stylesheet" href="/style.css">', () => `<style>${css}</style>`)
  .replace('<script type="module" src="/app.js"></script>', () => `<script type="module">${script}</script>`)
  .replace('<a class="brand" href="/"', '<a class="brand" href="#"');
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, html, 'utf8');
console.log(`Standalone HTML: ${output}`);
