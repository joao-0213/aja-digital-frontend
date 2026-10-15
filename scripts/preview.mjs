import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../out', import.meta.url));
const port = Number(process.env.PORT ?? 3001);
const insideRoot = file => file === root || file.startsWith(root + path.sep);
const mime = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2'
};

if (!fs.existsSync(path.join(root, 'index.html'))) {
  process.stderr.write('Gere o site primeiro com npm run build.\n');
  process.exit(1);
}
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  process.stderr.write('PORT deve ser uma porta válida entre 1 e 65535.\n');
  process.exit(1);
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch { res.writeHead(400).end('Bad request'); return; }

  const file = path.resolve(root, `.${pathname}`);
  if (!insideRoot(file)) { res.writeHead(403).end('Forbidden'); return; }
  const candidates = [file, path.join(file, 'index.html'), `${file}.html`];

  // Match the nested segment artifacts emitted by this Next.js static export.
  const rsc = pathname.match(/^(.*)\/(__next\..+)\.txt$/);
  if (rsc) {
    const segments = rsc[1].split('/').filter(Boolean);
    const artifact = rsc[2].split('.');
    if (segments.length && artifact.length >= 3) {
      candidates.push(path.join(root, ...segments, `__next.${segments[0]}`, ...segments.slice(1), `${artifact.at(-1)}.txt`));
    }
  }
  const found = candidates.find(candidate => {
    if (!insideRoot(candidate)) return false;
    try { return fs.statSync(candidate).isFile(); }
    catch { return false; }
  });
  const target = found ?? path.join(root, '404.html');
  if (!fs.existsSync(target)) { res.writeHead(404).end('Not found'); return; }
  const stream = fs.createReadStream(target);
  stream.once('open', () => {
    res.writeHead(found ? 200 : 404, {
      'Content-Type': mime[path.extname(target)] ?? 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    if (req.method === 'HEAD') { stream.destroy(); res.end(); }
    else stream.pipe(res);
  });
  stream.once('error', () => {
    if (!res.headersSent) res.writeHead(500).end('Read error');
    else res.destroy();
  });
});

server.on('error', error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => process.stdout.write(`Prévia AJA em http://127.0.0.1:${port}\n`));
