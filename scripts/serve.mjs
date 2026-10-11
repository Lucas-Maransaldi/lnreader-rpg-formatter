import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root = resolve('.');
createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const path = resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/fixtures/preview.html' : url.pathname));
  if (!path.startsWith(root + sep) || !['.html', '.js', '.css', '.png'].includes(extname(path))) { res.writeHead(404).end(); return; }
  try {
    const data = await readFile(path);
    res.setHeader('Content-Type', ({ '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html', '.png': 'image/png' })[extname(path)]);
    res.end(data);
  } catch { res.writeHead(404).end(); }
}).listen(4173, '127.0.0.1', () => console.log('Preview: http://127.0.0.1:4173'));
