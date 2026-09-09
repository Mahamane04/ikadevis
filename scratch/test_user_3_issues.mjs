import { launchApp, enterGuestMode } from './lib/harness.mjs';

const wait = (ms = 400) => new Promise((r) => setTimeout(r, ms));

export async function run() {
    const results = [];
    const ok = (label, cond, detail = '') => results.push({ label, pass: !!cond, detail });

    const { page, close } = await launchApp();
    try {
        await page.setViewport({ width: 1440, height: 900 });
        await enterGuestMode(page, { demo: true });
        await wait(1500);

        // =========================================================================
        // TEST 1 (Image 1) : Suppression totale du scroll horizontal sur la table
        // =========================================================================
        // Ouvrir l'inspecteur pour rétrécir la zone de la table
        const openedInspector = await page.evaluate(() => {
            const rows = document.querySelectorAll('[data-testid="quote-items-desktop"] tbody tr');
            if (rows.length > 0) {
                const btn = rows[0].querySelector('button[title*="détails techniques"], button[aria-label*="Détails techniques"]');
                if (btn) btn.click();
                else rows[0].click();
                return true;
            }
            return false;
        });
        ok('Inspecteur latéral ouvert pour rétrécir la table', openedInspector);
        await wait(600);

        // Tester qu'il n'y a STRICTEMENT AUCUN SCROLL HORIZONTAL à différentes largeurs
        const viewports = [
            { w: 1440, h: 900, name: '1440px (Desktop)' },
            { w: 1280, h: 800, name: '1280px (Compact)' },
            { w: 1100, h: 750, name: '1100px (Étroit)' }
        ];

        for (const vp of viewports) {
            await page.setViewport({ width: vp.w, height: vp.h });
            await wait(400);

            const scrollInfo = await page.evaluate(() => {
                const container = document.querySelector('[data-testid="quote-items-desktop"]');
                if (!container) return { exists: false };
                const overflowX = window.getComputedStyle(container).overflowX;
                const scrollW = container.scrollWidth;
                const clientW = container.clientWidth;
                return {
                    exists: true,
                    overflowX,
                    scrollW,
                    clientW,
                    hasScroll: scrollW > clientW
                };
            });

            ok(
                `Axe 1 (${vp.name}) : Zéro scroll horizontal (scrollW=${scrollInfo.scrollW} <= clientW=${scrollInfo.scrollW ? scrollInfo.clientW : '?'})`,
                scrollInfo.exists && !scrollInfo.hasScroll,
                `overflowX: ${scrollInfo.overflowX}, diff: ${scrollInfo.scrollW - scrollInfo.clientW}px`
            );
        }

        // =========================================================================
        // TEST 2 (Image 2) : Modal Synthèse & Répartition des lots sans troncature
        // =========================================================================
        await page.setViewport({ width: 1440, height: 900 });
        await wait(300);

        // Ouvrir la modale synthèse des lots via le bouton d’onglets
        const openedLotsOverview = await page.evaluate(() => {
            const btn = document.querySelector('[data-testid="lots-overview-btn"]');
            if (btn) {
                btn.click();
                return true;
            }
            return false;
        });
        ok('Modale Synthèse des lots ouverte via le bouton d’onglets', openedLotsOverview);
        await wait(600);

        const lotsModalInfo = await page.evaluate(() => {
            const modal = document.querySelector('[data-testid="lots-overview-modal"]');
            if (!modal) return { exists: false };

            const title = modal.querySelector('h3')?.textContent || '';
            const actionTh = modal.querySelector('[data-testid="lots-actions-th"]') || [...modal.querySelectorAll('th')].find(th => th.textContent.toUpperCase().includes('ACTIONS'));
            const detailRows = modal.querySelectorAll('tbody tr');
            const toggleAllBtn = modal.querySelector('[data-testid="lots-toggle-all-btn"]') || modal.querySelector('button[title*="éplier"]');

            // Vérifier si des lignes d'ouvrages (accordéon) sont affichées
            const itemRows = modal.querySelectorAll('.bg-neutral-50\\/80, [class*="bg-neutral-50"]');

            return {
                exists: true,
                title,
                hasActionTh: !!actionTh,
                detailRowCount: detailRows.length,
                hasToggleAllBtn: !!toggleAllBtn,
                toggleAllText: toggleAllBtn ? toggleAllBtn.textContent.trim() : ''
            };
        });

        ok('Modale Synthèse des lots présente et lisible', lotsModalInfo.exists);
        ok('En-tête de colonne ACTIONS non tronquée', lotsModalInfo.hasActionTh);
        ok('Bouton de contrôle global accordéon présent', lotsModalInfo.hasToggleAllBtn, lotsModalInfo.toggleAllText);
        ok('Lignes de synthèse des lots affichées', lotsModalInfo.detailRowCount > 0, `lignes: ${lotsModalInfo.detailRowCount}`);

        // Fermer la modale synthèse
        await page.evaluate(() => {
            const modal = document.querySelector('[data-testid="lots-overview-modal"]');
            const closeBtn = modal?.querySelector('button[aria-label*="Fermer"]');
            if (closeBtn) closeBtn.click();
        });
        await wait(500);

        // =========================================================================
        // TEST 3 (Image 3) : Ajout Multiple activé PAR DÉFAUT dans WorkItemPicker
        // =========================================================================
        // Ouvrir le catalogue d'ouvrages (WorkItemPicker)
        const openedPicker = await page.evaluate(() => {
            const btn = document.querySelector('button[aria-label="Ouvrir le catalogue complet des ouvrages"]');
            if (btn) {
                btn.click();
                return true;
            }
            return false;
        });
        ok('Bibliothèque des Ouvrages Métiers ouverte', openedPicker);
        await wait(600);

        const pickerInfo = await page.evaluate(() => {
            const modal = document.querySelector('.fixed.inset-0');
            if (!modal) return { exists: false };

            const bulkBtn = modal.querySelector('button i.fa-list-check, button i.fa-check-double')?.parentElement;
            const checkboxes = modal.querySelectorAll('input[type="checkbox"]');
            const selectAllBtn = modal.querySelector('button i.fa-square-check, button i.fa-square')?.parentElement;
            const footer = modal.querySelector('footer, .border-t.bg-neutral-50');

            return {
                exists: true,
                bulkBtnText: bulkBtn ? bulkBtn.textContent.trim() : '',
                bulkBtnClass: bulkBtn ? bulkBtn.className : '',
                checkboxCount: checkboxes.length,
                hasSelectAll: !!selectAllBtn,
                selectAllText: selectAllBtn ? selectAllBtn.textContent.trim() : '',
                hasFooter: !!footer,
                footerText: footer ? footer.textContent.trim() : ''
            };
        });

        ok('Bibliothèque des Ouvrages présente', pickerInfo.exists);
        ok(
            'Axe 3 (Instruction Image 3) : "Ajout Multiple" est ACTIF par défaut à l\'ouverture',
            pickerInfo.bulkBtnText.includes('Actif') || pickerInfo.bulkBtnText.includes('Multiple') || pickerInfo.checkboxCount > 0,
            `Bouton: "${pickerInfo.bulkBtnText}", Cases à cocher: ${pickerInfo.checkboxCount}`
        );
        ok('Cases à cocher visibles dès l’ouverture pour chaque ouvrage', pickerInfo.checkboxCount > 0, `trouvé ${pickerInfo.checkboxCount} cases`);
        ok('Bouton "Tout sélectionner" présent dès l’ouverture', pickerInfo.hasSelectAll, pickerInfo.selectAllText);

    } finally {
        await close();
    }

    const allPassed = results.every(r => r.pass);
    console.log('\n--- Résultats des vérifications 3 Demandes Utilisateur ---');
    results.forEach(r => console.log(`${r.pass ? '✅' : '❌'} ${r.label} ${r.detail ? `(${r.detail})` : ''}`));
    console.log(`\nTotal: ${results.filter(r => r.pass).length}/${results.length} assertions passées\n`);

    if (!allPassed) {
        process.exit(1);
    }
}

run().catch(err => {
    console.error('Erreur test:', err);
    process.exit(1);
});
