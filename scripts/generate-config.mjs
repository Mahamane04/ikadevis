#!/usr/bin/env node
// Génère config.js (non versionné) à partir de .env.<environment>, ou à défaut
// des variables d'environnement du processus.
//
// Deux contextes d'exécution :
//   · En local  → lit .env.<environment> (fichiers hors dépôt).
//   · En CI/CD  → ces fichiers n'existent pas sur un checkout neuf ; le script
//                 bascule alors sur process.env. C'est ce qui permet à
//                 Cloudflare Pages de construire l'app avec les identifiants
//                 définis dans ses variables d'environnement, sans qu'aucun
//                 secret ne transite par le dépôt.
//
// Usage: node scripts/generate-config.mjs development|staging|production
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const env = process.argv[2] || 'development';
const envFile = path.join(root, `.env.${env}`);

const parsed = {};
let source;

if (existsSync(envFile)) {
    source = `.env.${env}`;
    for (const line of readFileSync(envFile, 'utf-8').split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq === -1) continue;
        const key = trimmed.slice(0, eq).trim();
        let value = trimmed.slice(eq + 1).trim();
        value = value.split(/\s+#/)[0].trim(); // strip inline comments
        parsed[key] = value;
    }
} else {
    source = "variables d'environnement";
    for (const k of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_APP_ENV']) {
        if (process.env[k]) parsed[k] = process.env[k];
    }
}

const required = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'];
const missing = required.filter((k) => !parsed[k]);
if (missing.length) {
    console.error(`Variables manquantes (${source}) : ${missing.join(', ')}`);
    console.error('En local  : créez .env.' + env + ' (voir .env.example).');
    console.error("En CI/CD  : définissez ces variables dans l'environnement de build.");
    process.exit(1);
}

const out = `// Généré automatiquement depuis ${source} — ne pas éditer à la main, ne pas versionner.
window.__APP_CONFIG__ = {
    SUPABASE_URL: ${JSON.stringify(parsed.VITE_SUPABASE_URL)},
    SUPABASE_ANON: ${JSON.stringify(parsed.VITE_SUPABASE_ANON_KEY)},
    APP_ENV: ${JSON.stringify(parsed.VITE_APP_ENV || env)}
};
`;

writeFileSync(path.join(root, 'config.js'), out);
console.log(`config.js généré pour "${env}" depuis ${source} (${parsed.VITE_SUPABASE_URL})`);
