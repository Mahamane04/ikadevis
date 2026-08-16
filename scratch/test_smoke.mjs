// Banc d'essai 0 — Fumée : l'app se charge, le Mode Démo/Invité fonctionne,
// aucune erreur console. C'est le test qui aurait immédiatement révélé que
// scratch/ était vide et que le pipeline CI ne pouvait pas tourner.
import { pathToFileURL } from 'node:url';
import { launchApp, enterGuestMode } from './lib/harness.mjs';

export async function run() {
    const results = [];
    const ok = (label, cond, detail = '') => results.push({ label, pass: !!cond, detail });

    const { page, consoleErrors, close } = await launchApp();
    try {
        const title = await page.title();
        ok('Titre de la page correct', title.includes('ikadevis'), `titre="${title}"`);

        const hasLoginForm = await page.evaluate(() => !!document.querySelector('input[type="email"]'));
        ok('Écran de connexion affiché', hasLoginForm);

        await enterGuestMode(page);
        const hasQuoteEditor = await page.evaluate(() => document.body.innerText.includes('LOTS DU DEVIS'));
        ok('Mode Démo/Invité ouvre l\'éditeur de devis', hasQuoteEditor);

        ok('Aucune erreur console au chargement', consoleErrors.length === 0, consoleErrors.join(' | '));
    } finally {
        await close();
    }
    return results;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    const results = await run();
    for (const r of results) console.log(`  ${r.pass ? '✅' : '❌'} ${r.label}${r.detail ? ' — ' + r.detail : ''}`);
    process.exit(results.every((r) => r.pass) ? 0 : 1);
}
