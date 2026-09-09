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

        // 1. Vérifier la présence de LotTabsBar
        const tabsInfo = await page.evaluate(() => {
            const tablist = document.querySelector('[role="tablist"][aria-label="Onglets des lots de travaux"]');
            if (!tablist) return { present: false };
            const tabs = [...tablist.querySelectorAll('[role="tab"]')].map(t => ({
                text: (t.textContent || '').trim(),
                selected: t.getAttribute('aria-selected') === 'true'
            }));
            const addLotBtn = tablist.querySelector('button[aria-label="Ajouter un lot au devis"]');
            const syntheseBtn = document.querySelector('button[aria-label="Synthèse des lots"]');
            return {
                present: true,
                count: tabs.length,
                tabs,
                hasAddBtn: !!addLotBtn,
                hasSyntheseBtn: !!syntheseBtn
            };
        });

        ok('La barre d’onglets horizontaux LotTabsBar est présente', tabsInfo.present);
        ok('LotTabsBar affiche les lots sous forme d’onglets', tabsInfo.count > 0, `lots: ${tabsInfo.count}`);
        ok('Le premier onglet est actif par défaut', tabsInfo.tabs?.[0]?.selected === true);
        ok('Bouton d’ajout rapide de lot présent dans la barre', tabsInfo.hasAddBtn);
        ok('Bouton de synthèse présent à droite des onglets', tabsInfo.hasSyntheseBtn);

        // 2. Tester le clic sur le 2ème onglet
        if (tabsInfo.count > 1) {
            await page.evaluate(() => {
                const tabs = document.querySelectorAll('[role="tablist"][aria-label="Onglets des lots de travaux"] [role="tab"]');
                if (tabs[1]) tabs[1].click();
            });
            await wait(400);

            const lotApresOnglet = await page.evaluate(() => {
                const tabs = [...document.querySelectorAll('[role="tablist"][aria-label="Onglets des lots de travaux"] [role="tab"]')];
                const headerBadge = document.querySelector('header + div') || document.body;
                return {
                    tab1Selected: tabs[1]?.getAttribute('aria-selected') === 'true'
                };
            });
            ok('Cliquer sur le 2ème onglet sélectionne le 2ème lot', lotApresOnglet.tab1Selected);
        }

        // 3. Tester les chevrons de navigation séquentielle Précédent / Suivant
        const chevronsInfo = await page.evaluate(() => {
            const prevBtn = document.querySelector('button[aria-label="Lot précédent"]');
            const nextBtn = document.querySelector('button[aria-label="Lot suivant"]');
            return {
                hasPrev: !!prevBtn,
                hasNext: !!nextBtn,
                prevDisabled: prevBtn?.disabled,
                nextDisabled: nextBtn?.disabled
            };
        });
        ok('Boutons chevrons précédent/suivant présents dans l’en-tête de lot', chevronsInfo.hasPrev && chevronsInfo.hasNext);

        // 4. Tester l’ouverture du menu d’options de lot (•••)
        await page.evaluate(() => {
            const btn = document.querySelector('button[aria-label="Options du lot"]');
            if (btn) btn.click();
        });
        await wait(300);

        const menuLotInfo = await page.evaluate(() => {
            const menu = document.querySelector('button[aria-label="Options du lot"] + div');
            if (!menu) return { open: false };
            const texts = [...menu.querySelectorAll('button')].map(b => (b.textContent || '').trim());
            return {
                open: true,
                items: texts,
                hasRenommer: texts.some(t => /Renommer/i.test(t)),
                hasMonter: texts.some(t => /Monter/i.test(t)),
                hasSupprimer: texts.some(t => /Supprimer/i.test(t))
            };
        });
        ok('Le menu d’options de lot (•••) s’ouvre au clic', menuLotInfo.open);
        ok('Le menu d’options de lot contient Renommer et Supprimer', menuLotInfo.hasRenommer && menuLotInfo.hasSupprimer);

        // Fermer le menu
        await page.evaluate(() => {
            document.body.click();
        });
        await wait(200);

        // 5. Tester la modale de Synthèse des lots
        await page.evaluate(() => {
            const btn = document.querySelector('button[aria-label="Synthèse des lots"]');
            if (btn) btn.click();
        });
        await wait(400);

        const modalSyntheseInfo = await page.evaluate(() => {
            const modal = document.querySelector('[role="dialog"][aria-modal="true"]');
            if (!modal) return { open: false };
            const title = modal.querySelector('h3')?.textContent || '';
            const rows = modal.querySelectorAll('tbody tr').length;
            const closeBtn = modal.querySelector('button[aria-label="Fermer la synthèse des lots"]');
            return {
                open: true,
                title,
                rowCount: rows,
                hasCloseBtn: !!closeBtn
            };
        });
        ok('La modale de synthèse des lots s’ouvre avec succès', modalSyntheseInfo.open);
        ok('La synthèse liste tous les lots dans un tableau comparatif', modalSyntheseInfo.rowCount > 0, `lignes: ${modalSyntheseInfo.rowCount}`);

        // Fermer la modale
        await page.evaluate(() => {
            const closeBtn = document.querySelector('button[aria-label="Fermer la synthèse des lots"]');
            if (closeBtn) closeBtn.click();
        });
        await wait(300);

        // 6. Tester l’adoucissement visuel des boutons de ligne du tableau
        const actionOpacityInfo = await page.evaluate(() => {
            const actionDiv = document.querySelector('[data-testid="quote-items-desktop"] tbody tr td .transition-opacity');
            if (!actionDiv) return { found: false };
            return {
                found: true,
                className: actionDiv.className,
                hasTransition: actionDiv.className.includes('transition-opacity') && actionDiv.className.includes('opacity-40')
            };
        });
        ok('Les boutons d’actions du tableau intègrent la transition d’opacité fluide', actionOpacityInfo.hasTransition);

        // 7. Tester l'inspecteur d'ouvrage et le bouton "Déplacer vers un autre lot"
        await page.evaluate(() => {
            const inspectBtns = document.querySelectorAll('[data-testid="quote-items-desktop"] button[title^="Voir et modifier"]');
            if (inspectBtns[0]) inspectBtns[0].click();
        });
        await wait(500);

        const moveBtnInfo = await page.evaluate(() => {
            const moveBtn = document.querySelector('button[aria-label="Déplacer l\'ouvrage vers un autre lot"]');
            const tabsStillPresent = !!document.querySelector('[role="tablist"][aria-label="Onglets des lots de travaux"]');
            return {
                hasMoveBtn: !!moveBtn,
                tabsStillPresent
            };
        });
        ok('La barre d’onglets LotTabsBar RESTE VISIBLE quand l’inspecteur est ouvert', moveBtnInfo.tabsStillPresent);
        ok('Le bouton "Déplacer vers…" est présent dans le fil d’Ariane de l’inspecteur', moveBtnInfo.hasMoveBtn);

    } finally {
        await close();
    }

    return results;
}

import { pathToFileURL } from 'url';
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const results = await run();
    for (const r of results) console.log(`  ${r.pass ? '✅' : '❌'} ${r.label}${r.detail ? ' — ' + r.detail : ''}`);
    const passed = results.every(r => r.pass);
    console.log(`\nRésultat: ${results.filter(r => r.pass).length}/${results.length} assertions passées`);
    process.exit(passed ? 0 : 1);
}
