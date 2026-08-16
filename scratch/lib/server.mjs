// Petit serveur statique sans dépendance, pour servir le projet pendant les tests.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));

const MIME = {
    '.html': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript',
    '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
    '.ico': 'image/x-icon', '.svg': 'image/svg+xml'
};

export function startServer(port = 0) {
    return new Promise((resolve, reject) => {
        const server = http.createServer(async (req, res) => {
            try {
                const urlPath = decodeURIComponent(req.url.split('?')[0]);
                const filePath = path.join(ROOT, urlPath === '/' ? '/index.html' : urlPath);
                if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
                const data = await readFile(filePath);
                const ext = path.extname(filePath);
                res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
                res.end(data);
            } catch (e) {
                res.writeHead(404);
                res.end('Not found');
            }
        });
        server.on('error', reject);
        server.listen(port, '127.0.0.1', () => {
            const { port: boundPort } = server.address();
            resolve({ server, url: `http://127.0.0.1:${boundPort}`, close: () => new Promise((r) => server.close(r)) });
        });
    });
}
