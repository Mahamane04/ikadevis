import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync(new URL('../manifest.webmanifest', import.meta.url), 'utf8'));
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const source = readFileSync(new URL('../index_jsx.js', import.meta.url), 'utf8');
const serviceWorker = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');

assert.equal(manifest.display, 'standalone');
assert.equal(manifest.start_url, './index.html');
assert.equal(manifest.scope, './');
assert.ok(manifest.icons.some(icon => icon.purpose === 'maskable'));
assert.deepEqual(
    manifest.shortcuts.map(shortcut => shortcut.url),
    ['./index.html#new-quote', './index.html#clients', './index.html#invoices']
);
assert.match(html, /rel="manifest" href="manifest\.webmanifest"/);
assert.match(html, /rel="apple-touch-icon" sizes="180x180" href="assets\/icon-192\.png"/);
assert.match(source, /beforeinstallprompt/);
assert.match(source, /#new-quote/);
assert.match(source, /Ajouter à l'écran d'accueil/);
assert.match(serviceWorker, /'\.\/manifest\.webmanifest'/);
assert.match(serviceWorker, /'\.\/assets\/icon-192\.png'/);

console.log('PWA : manifest, installation mobile, raccourcis et coquille offline conformes.');
