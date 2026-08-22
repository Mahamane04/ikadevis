// Banc d'essai Phase 3 — le tableau reste disponible pendant l'inspection et
// permet de passer directement d'un ouvrage à l'autre.
import { pathToFileURL } from 'node:url';
import { launchApp, enterGuestMode } from './lib/harness.mjs';

async function addFromInline(page, name) {
    const search = 'input[aria-label="Rechercher un ouvrage à ajouter"]';
    await page.click(search);
    await page.type(search, name, { delay: 12 });
    await page.keyboard.press('Enter');
    await new Promise(resolve => setTimeout(resolve, 250));
}

export async function run() {
    const results = [];
    const ok = (label, cond, detail = '') => results.push({ label, pass: !!cond, detail });

    const { page, close } = await launchApp();
    try {
        await page.setViewport({ width: 1280, height: 900 });
        await enterGuestMode(page);
        await addFromInline(page, 'Peinture Murale');
        await addFromInline(page, 'Carrelage Sol');

        const rowCount = await page.$$eval('table tbody tr', rows => rows.length);
        ok('Le tableau conserve les deux ouvrages visibles avant inspection', rowCount === 2, `lignes=${rowCount}`);

        await page.evaluate(() => {
            const button = document.querySelector('button[aria-label^="Détails techniques de"]');
            button?.scrollIntoView({ block: 'center' });
            button?.click();
        });
        await new Promise(resolve => setTimeout(resolve, 200));
        const tableStillVisible = await page.evaluate(() => {
            const table = document.querySelector('table');
            return Boolean(table && table.getBoundingClientRect().width > 0 && table.getBoundingClientRect().height > 0);
        });
        const hasInspectorNav = await page.$('button[aria-label="Ouvrage suivant"]') !== null;
        ok('Le tableau reste visible à côté de l’inspecteur sur desktop', tableStillVisible);
        ok('L’inspecteur propose la navigation entre les ouvrages', hasInspectorNav);

        await page.evaluate(() => document.querySelector('button[aria-label="Ouvrage suivant"]')?.click());
        await new Promise(resolve => setTimeout(resolve, 150));
        const activeInspector = await page.evaluate(() => document.body.innerText.includes('Détails : Carrelage Sol'));
        ok('Le passage à l’ouvrage suivant se fait sans fermer l’inspecteur', activeInspector);
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
