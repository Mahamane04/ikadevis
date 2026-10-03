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
        // 2026-10-03 — Ce banc vérifiait qu'une balise <table> restait visible.
        // Depuis CHIF-07 (2026-09-28), la liste passe VOLONTAIREMENT en cartes
        // quand la zone de travail tombe sous 680 px — ce qui arrive à 1280 px
        // dès que l'inspecteur s'ouvre (le tableau débordait et imposait un
        // défilement horizontal). Le banc testait donc un détail de rendu, pas
        // la promesse : les ouvrages restent lisibles À CÔTÉ de l'inspecteur.
        // Il mesure désormais celle-ci, quelle que soit la forme de la liste.
        const listeAuCote = await page.evaluate(() => {
            const visible = (el) => {
                if (!el) return false;
                const r = el.getBoundingClientRect();
                return r.width > 0 && r.height > 0 && getComputedStyle(el).display !== 'none';
            };
            const tableau = document.querySelector('[data-testid="quote-items-desktop"]');
            const cartes = document.querySelector('[data-testid="quote-items-mobile"]');
            const zone = visible(tableau) ? tableau : visible(cartes) ? cartes : null;
            const inspecteur = document.querySelector('button[aria-label="Ouvrage suivant"]')?.closest('aside');
            // Les désignations sont des champs éditables : leur texte est dans
            // `value`, que innerText ne restitue pas.
            const texte = zone
                ? zone.innerText + ' ' + [...zone.querySelectorAll('input, textarea')].map((c) => c.value).join(' ')
                : '';
            return {
                forme: zone === tableau ? 'tableau' : zone ? 'cartes' : 'aucune',
                deuxOuvrages: /Peinture/i.test(texte) && /Carrelage/i.test(texte),
                cote: Boolean(zone && inspecteur && zone.getBoundingClientRect().right <= inspecteur.getBoundingClientRect().left + 2)
            };
        });
        const hasInspectorNav = await page.$('button[aria-label="Ouvrage suivant"]') !== null;
        ok('La liste des ouvrages reste visible à côté de l’inspecteur sur desktop',
            listeAuCote.forme !== 'aucune' && listeAuCote.deuxOuvrages && listeAuCote.cote,
            `forme=${listeAuCote.forme}, deux ouvrages=${listeAuCote.deuxOuvrages}, côte à côte=${listeAuCote.cote}`);
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
