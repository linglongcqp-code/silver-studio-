import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import handler from '../src/server.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const staticFiles = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/style.css': ['style.css', 'text/css; charset=utf-8'],
  '/media.js': ['media.js', 'text/javascript; charset=utf-8'],
  '/planner.js': ['planner.js', 'text/javascript; charset=utf-8'],
};
const port = Number(process.env.PORT || 4173);
const hostname = '127.0.0.1';

http.createServer(async (incoming, outgoing) => {
  try {
    const url = new URL(incoming.url || '/', `http://${hostname}:${port}`);
    const asset = staticFiles[url.pathname];
    if (asset && ['GET', 'HEAD'].includes(incoming.method)) {
      const content = await readFile(path.join(root, 'src', asset[0]));
      outgoing.writeHead(200, { 'Content-Type': asset[1], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      outgoing.end(incoming.method === 'HEAD' ? undefined : content);
      return;
    }
    const requestInit = { method: incoming.method, headers: incoming.headers };
    if (!['GET', 'HEAD'].includes(incoming.method)) {
      requestInit.body = incoming;
      requestInit.duplex = 'half';
    }
    const request = new Request(url, requestInit);
    const response = await handler.fetch(request, process.env);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    outgoing.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    outgoing.end(JSON.stringify({ error: '本地服务暂时不可用，请检查终端配置后重试。' }));
  }
}).listen(port, hostname, () => {
  console.log(`localURL: http://${hostname}:${port}`);
});
