// Banc d'essai Phase 2 — ajout d'ouvrage directement depuis le tableau.
import { pathToFileURL } from 'node:url';
import { launchApp, enterGuestMode } from './lib/harness.mjs';

export async function run() {
    const results = [];
    const ok = (label, cond, detail = '') => results.push({ label, pass: !!cond, detail });

    const { page, close } = await launchApp();
    try {
        await enterGuestMode(page);

        const search = 'input[aria-label="Rechercher un ouvrage à ajouter"]';
        await page.click(search);
        const compactCatalog = await page.evaluate(() => {
            const list = document.querySelector('[data-testid="quote-solution-scroll"]');
            if (!list) return false;
            const style = window.getComputedStyle(list);
            return style.overflowY === 'auto' && list.clientHeight <= 160 && list.scrollHeight > list.clientHeight;
        });
        ok('Le catalogue affiche trois ouvrages au plus avec défilement interne', compactCatalog);
        await page.type(search, 'Peinture Murale', { delay: 15 });
        await page.keyboard.press('Enter');
        await new Promise(resolve => setTimeout(resolve, 250));
        const addedExisting = await page.evaluate(() => document.body.innerText.includes('Peinture Murale'));
        ok('Un ouvrage existant est ajoutable depuis la ligne de recherche du tableau', addedExisting);

        await page.click(search);
        await page.type(search, 'Ouvrage créé depuis tableau', { delay: 15 });
        await page.keyboard.press('Enter');
        await new Promise(resolve => setTimeout(resolve, 300));
        const addedCreated = await page.evaluate(() => document.body.innerText.includes('Ouvrage créé depuis tableau'));
        ok('Un ouvrage absent peut être créé et ajouté depuis la même ligne', addedCreated);
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
