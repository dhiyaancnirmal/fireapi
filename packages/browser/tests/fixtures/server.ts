import { readFile } from 'node:fs/promises';
import { type Server, createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pagesDir = path.join(__dirname, 'pages');

function contentTypeFor(filePath: string): string {
  if (filePath.endsWith('.html')) {
    return 'text/html; charset=utf-8';
  }
  if (filePath.endsWith('.js')) {
    return 'application/javascript; charset=utf-8';
  }
  if (filePath.endsWith('.css')) {
    return 'text/css; charset=utf-8';
  }
  return 'application/octet-stream';
}

export interface FixtureServerHandle {
  server: Server;
  baseUrl: string;
  close(): Promise<void>;
  urlFor(pageName: string): string;
}

export async function startFixtureServer(port = 0): Promise<FixtureServerHandle> {
  const server = createServer(async (req, res) => {
    try {
      const reqUrl = new URL(req.url ?? '/', 'http://127.0.0.1');
      const pathname = reqUrl.pathname === '/' ? '/simple-search.html' : reqUrl.pathname;
      const fullPath = path.join(pagesDir, path.normalize(pathname).replace(/^\/+/, ''));
      if (!fullPath.startsWith(pagesDir)) {
        res.writeHead(403).end('Forbidden');
        return;
      }
      const file = await readFile(fullPath);
      res.writeHead(200, { 'Content-Type': contentTypeFor(fullPath) }).end(file);
    } catch {
      res.writeHead(404).end('Not Found');
    }
  });

  await new Promise<void>((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Unexpected server address');
  }

  const baseUrl = `http://127.0.0.1:${address.port}`;
  return {
    server,
    baseUrl,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (err) {
            reject(err);
            return;
          }
          resolve();
        });
      }),
    urlFor: (pageName: string) => `${baseUrl}/${pageName}`,
  };
}
