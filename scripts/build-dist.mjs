#!/usr/bin/env node
// Assemble le dossier dist/ à publier par l'hébergeur (Cloudflare Pages).
//
// Pourquoi un dist/ plutôt que publier la racine : la racine contient
// node_modules (dont le Chromium de puppeteer, >100 Mo), les sources JSX, les
// scripts SQL, la suite de tests et le tracker. Rien de tout cela n'a à être
// servi publiquement — et le SQL comme la doc interne n'ont surtout PAS à
// l'être. On ne copie donc que ce dont le navigateur a besoin.
import { cpSync, mkdirSync, rmSync, existsSync, statSync, readdirSync } from 'node:fs';
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
    'vendor',
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

// Garde-fou : rien de sensible ne doit se retrouver dans dist/
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
