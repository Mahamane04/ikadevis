#!/usr/bin/env node
// Assemble le dossier dist/ à publier par l'hébergeur (Cloudflare Pages).
//
// Pourquoi un dist/ plutôt que publier la racine : la racine contient
// node_modules (dont le Chromium de puppeteer, >100 Mo), les sources JSX, les
// scripts SQL, la suite de tests et le tracker. Rien de tout cela n'a à être
// servi publiquement — et le SQL comme la doc interne n'ont surtout PAS à
// l'être. On ne copie donc que ce dont le navigateur a besoin.
import { cpSync, mkdirSync, rmSync, existsSync, statSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dist = path.join(root, 'dist');

// Liste blanche explicite : tout ajout de fichier public doit être conscient.
const A_PUBLIER = [
    'index.html',
    'app.compiled.js',
    'tailwind.css',
    'config.js',
    'favicon.ico',
    'favicon.svg',
    'assets',   // marque : logo horizontal, carré, icône seule (référencés par
                // index.html pour le favicon et l'icône d'accueil iOS)
    'vendor',
    'js',   // modules extraits (calc-engine, utils, quote-templates) chargés
            // en <script> par index.html — leur absence casse le moteur de calcul
];

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

const manquants = [];
for (const item of A_PUBLIER) {
    const src = path.join(root, item);
    if (!existsSync(src)) { manquants.push(item); continue; }
    cpSync(src, path.join(dist, item), { recursive: true });
}

if (manquants.length) {
    console.error(`\n✗ Fichiers requis absents : ${manquants.join(', ')}`);
    if (manquants.includes('config.js')) {
        console.error('  → config.js se génère via : node scripts/generate-config.mjs <environnement>');
    }
    if (manquants.includes('app.compiled.js') || manquants.includes('tailwind.css')) {
        console.error('  → app.compiled.js / tailwind.css se génèrent via : npm run build');
    }
    process.exit(1);
}

// Garde-fou n°1 — DÉRIVE DE LA LISTE BLANCHE.
// Une liste blanche écrite à la main se périme dès qu'on ajoute un <script>
// ou un <link> à index.html : le fichier manque alors silencieusement en
// production. C'est exactement ce qui est arrivé le 2026-08-17 avec les
// modules js/ (dont calc-engine.js, qui porte le parser AST) — le site se
// chargeait, mais le moteur de calcul était mort.
// On relit donc index.html et on vérifie que chaque ressource locale qu'il
// référence est bien présente dans dist/.
const html = readFileSync(path.join(dist, 'index.html'), 'utf-8');
const references = [...html.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/g)]
    .map((m) => m[1])
    .filter((u) => !/^(https?:)?\/\//.test(u) && !u.startsWith('data:') && !u.startsWith('#'))
    .map((u) => u.split('?')[0].replace(/^\.?\//, ''))
    .filter(Boolean);

const introuvables = [...new Set(references)].filter((r) => !existsSync(path.join(dist, r)));
if (introuvables.length) {
    console.error(`\n✗ ARRÊT : index.html référence des fichiers absents de dist/ :`);
    for (const f of introuvables) console.error(`    ${f}`);
    console.error(`  → ajoutez le fichier ou son dossier parent à A_PUBLIER dans ce script.`);
    process.exit(1);
}
console.log(`  ${[...new Set(references)].length} ressources référencées par index.html : toutes présentes`);

// Garde-fou n°2 : rien de sensible ne doit se retrouver dans dist/
const INTERDITS = ['.env', '.env.development', '.env.staging', '.env.production',
                   'v6_schema.sql', 'v6_platform_admin.sql', 'PROJECT_MASTER_TRACKER.md'];
const fuites = INTERDITS.filter((f) => existsSync(path.join(dist, f)));
if (fuites.length) {
    console.error(`\n✗ ARRÊT : fichiers sensibles présents dans dist/ : ${fuites.join(', ')}`);
    process.exit(1);
}

const taille = (p) => {
    let total = 0;
    const parcourir = (d) => {
        for (const e of readdirSync(d, { withFileTypes: true })) {
            const f = path.join(d, e.name);
            if (e.isDirectory()) parcourir(f); else total += statSync(f).size;
        }
    };
    parcourir(p);
    return total;
};

console.log(`dist/ assemblé — ${A_PUBLIER.length} entrées, ${(taille(dist) / 1024 / 1024).toFixed(1)} Mo`);
