#!/usr/bin/env node
// Génère config.js (non versionné) à partir de .env.<environment>.
// Usage: node scripts/generate-config.mjs development|staging|production
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const env = process.argv[2] || 'development';
const envFile = path.join(root, `.env.${env}`);

if (!existsSync(envFile)) {
    console.error(`Fichier introuvable: .env.${env}`);
    console.error('Environnements disponibles: development, staging, production');
    process.exit(1);
}

const parsed = {};
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

const required = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'];
const missing = required.filter((k) => !parsed[k]);
if (missing.length) {
    console.error(`Variables manquantes dans .env.${env}: ${missing.join(', ')}`);
    process.exit(1);
}

const out = `// Généré automatiquement depuis .env.${env} — ne pas éditer à la main, ne pas versionner.
window.__APP_CONFIG__ = {
    SUPABASE_URL: ${JSON.stringify(parsed.VITE_SUPABASE_URL)},
    SUPABASE_ANON: ${JSON.stringify(parsed.VITE_SUPABASE_ANON_KEY)},
    APP_ENV: ${JSON.stringify(parsed.VITE_APP_ENV || env)}
};
`;

writeFileSync(path.join(root, 'config.js'), out);
console.log(`config.js généré pour l'environnement "${env}" (${parsed.VITE_SUPABASE_URL})`);
