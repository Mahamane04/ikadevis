import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const PORT = process.env.PORT || 8099;
const HOST = '127.0.0.1'; // Restriction stricte au loopback (SEC-07)

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.webp': 'image/webp',
    '.woff2': 'font/woff2',
    '.woff': 'font/woff',
    '.ttf': 'font/ttf'
};

// Fichiers et extensions strictement interdits
const FORBIDDEN_EXTENSIONS = ['.env', '.sql', '.git', '.sh', '.key', '.pem', '.log'];

const server = http.createServer((req, res) => {
    // Méthodes autorisées
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { 'Content-Type': 'text/plain' });
        return res.end('Method Not Allowed');
    }

    const parsedUrl = new URL(req.url, `http://${HOST}:${PORT}`);
    let reqPath = decodeURIComponent(parsedUrl.pathname);

    if (reqPath === '/') {
        reqPath = '/index.html';
    }

    const safePath = path.normalize(reqPath).replace(/^(\.\.[\/\\])+/, '');
    const fullPath = path.join(ROOT_DIR, safePath);

    // Vérification de confinement dans le répertoire racine
    if (!fullPath.startsWith(ROOT_DIR)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        return res.end('Forbidden');
    }

    // Blocage strict des dotfiles (.env, .git, etc.) et extensions sensibles (.sql, etc.)
    const filename = path.basename(fullPath);
    const ext = path.extname(fullPath).toLowerCase();

    if (
        filename.startsWith('.') ||
        FORBIDDEN_EXTENSIONS.includes(ext) ||
        safePath.includes('/.') ||
        safePath.startsWith('/supabase/') ||
        safePath.startsWith('/.git')
    ) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        return res.end('Forbidden: sensitive or protected resource');
    }

    fs.stat(fullPath, (err, stats) => {
        if (err || !stats.isFile()) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            return res.end('Not Found');
        }

        const mimeType = MIME_TYPES[ext] || 'application/octet-stream';
        res.writeHead(200, {
            'Content-Type': mimeType,
            'Content-Length': stats.size,
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'SAMEORIGIN',
            'Referrer-Policy': 'strict-origin-when-cross-origin'
        });

        if (req.method === 'HEAD') {
            return res.end();
        }

        const readStream = fs.createReadStream(fullPath);
        readStream.pipe(res);
    });
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    server.listen(PORT, HOST, () => {
        console.log(`Serveur de développement sécurisé (SEC-07) actif sur http://${HOST}:${PORT}`);
        console.log(`Confinement strict : loopback uniquement, exclusion des dotfiles et fichiers SQL.`);
    });
}

export { server, HOST, PORT };
