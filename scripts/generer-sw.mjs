// Écrit sw.js en injectant deux choses lues depuis le projet :
//   1. le jeton de version de index.html — pour que le cache du service
//      worker ne puisse pas diverger du cache-busting manuel ;
//   2. la liste de pré-cache, DÉRIVÉE des références réelles de index.html
//      plus les polices et icônes appelées par les CSS.
//
// La première version de ce script portait une liste écrite à la main. Elle
// oubliait six ressources — dont config.js et les polices — et l'application
// s'ouvrait sur une PAGE BLANCHE hors réseau. Une liste dérivée ne peut pas
// se périmer quand on ajoute un <script> ou un <link>.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(path.join(racine, 'index.html'), 'utf-8');

const m = html.match(/[?&]v=([0-9a-z]+)/);
if (!m) { console.error('✗ Aucun jeton ?v= dans index.html — service worker non généré.'); process.exit(1); }
const version = m[1];

// Références locales de index.html
const refs = [...html.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/g)]
    .map((x) => x[1])
    .filter((u) => !/^(https?:)?\/\//.test(u) && !u.startsWith('data:') && !u.startsWith('#'))
    .map((u) => u.split('?')[0].replace(/^\.?\//, ''))
    .filter(Boolean);

// Polices et icônes réellement employées par l'interface. Ne pas précharger
// toutes les variantes Font Awesome : l'application n'utilise ni Regular ni
// le paquet de compatibilité v4. Elles resteraient en cache sans jamais être
// demandées, ce qui pénalise l'installation PWA sur un réseau mobile.
const binaires = [
    'vendor/fonts/files/open-sans-0.woff2',
    'vendor/fonts/files/open-sans-1.woff2',
    'vendor/fontawesome/webfonts/fa-solid-900.woff2',
    // Retirée le 2026-09-03 (audit, poste « performance ») : la police
    // « Font Awesome Brands » pesait 108 Ko pour DEUX glyphes, WhatsApp et
    // Google — 18 % du poids de la page pour 54 Ko l'icône. Les deux sont
    // désormais dessinées en SVG dans la page (classe .icone-marque).
    // Elle était PRÉ-CHARGÉE ici, donc téléchargée à chaque première visite
    // même sans aucune icône de marque à l'écran : retirer les usages ne
    // suffisait pas, il fallait aussi la retirer de cette liste.
].filter((f) => existsSync(path.join(racine, f)));

const liste = [...new Set(['./', ...refs, ...binaires])]
    .filter((u) => existsSync(path.join(racine, u.replace(/^\.\//, '') || 'index.html')) || u === './')
    .map((u) => (u === './' ? './' : './' + u));

const modele = readFileSync(path.join(racine, 'scripts', 'sw.template.js'), 'utf-8');
const sortie = modele
    .replace('__VERSION__', version)
    .replace('__COQUILLE__', liste.map((u) => `    '${u}',`).join('\n'));
writeFileSync(path.join(racine, 'sw.js'), sortie);
console.log(`  sw.js généré — cache « ikadevis-${version} », ${liste.length} ressources pré-cachées`);
