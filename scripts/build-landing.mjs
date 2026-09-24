// Build the marketing site separately from the ERP. No credentials or app code.
import { mkdirSync, copyFileSync, rmSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'dist-landing');
const files = [
  ['landing.html', 'index.html'],
  ...['assets/logo-ikadevis.svg', 'assets/icone-ikadevis.svg',
    'assets/landing/hero-artisan.webp', 'assets/landing/manrope-extrabold.ttf', 'assets/landing/Manrope-OFL.txt',
    'assets/landing/landing.css', 'assets/landing/landing.js',
    'vendor/fonts/open-sans.css', 'vendor/fonts/files/open-sans-0.woff2',
    'vendor/fonts/files/open-sans-1.woff2'].map(file => [file, file])
];
// Read before replacing a previous build, so missing source files don't erase it.
for (const [source] of files) readFileSync(path.join(root, source));
rmSync(out, { recursive: true, force: true });
for (const [source, destination] of files) {
  mkdirSync(path.dirname(path.join(out, destination)), { recursive: true });
  copyFileSync(path.join(root, source), path.join(out, destination));
}
const bytes = files.reduce((sum, [, destination]) => sum + statSync(path.join(out, destination)).size, 0);
console.log(`Vitrine assemblée : ${files.length} fichiers publics, ${Math.round(bytes / 1024)} Ko → dist-landing/`);
