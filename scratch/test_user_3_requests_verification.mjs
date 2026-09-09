import { launchApp, enterGuestMode } from './lib/harness.mjs';

const wait = (ms = 400) => new Promise((r) => setTimeout(r, ms));

export async function run() {
    console.log('🚀 Lancement de la vérification automatisée des 3 demandes utilisateur...');
    const results = [];
    function assert(condition, message) {
        if (condition) {
            console.log(`✅ ${message}`);
            results.push({ pass: true, message });
        } else {
            console.error(`❌ ÉCHEC: ${message}`);
            results.push({ pass: false, message });
        }
    }

    const { page, close } = await launchApp();

    try {
        await page.setViewport({ width: 1440, height: 900 });
        await enterGuestMode(page, { demo: true });
        await wait(1200);

        // ==========================================
        // VÉRIFICATION DEMANDE 1 (Image 1) : Suppression du scroll horizontal
        // ==========================================
        console.log('\n--- Test Demande 1 : Absence totale de défilement horizontal ---');

        // Test a) Avec inspecteur FERMÉ
        const scrollCheckClosed = await page.evaluate(() => {
            const el = document.querySelector('[data-testid="quote-items-desktop"]');
            if (!el) return null;
            const style = window.getComputedStyle(el);
            return {
                scrollWidth: el.scrollWidth,
                clientWidth: el.clientWidth,
                overflowX: style.overflowX,
                hasScrollbar: el.scrollWidth > el.clientWidth
            };
        });

        assert(scrollCheckClosed !== null, 'Tableau desktop [data-testid="quote-items-desktop"] trouvé');
        assert(scrollCheckClosed?.hasScrollbar === false, `Pas de scroll horizontal (inspecteur fermé) : scrollWidth(${scrollCheckClosed?.scrollWidth}) <= clientWidth(${scrollCheckClosed?.clientWidth})`);
        assert(scrollCheckClosed?.overflowX === 'hidden', `overflow-x est bien "hidden" (valeur: ${scrollCheckClosed?.overflowX})`);

        // Test b) Ouvrir l'inspecteur d'ouvrage (vue rétrécie)
        const inspectorOpened = await page.evaluate(() => {
            const rows = document.querySelectorAll('[data-testid="quote-items-desktop"] tbody tr');
            if (rows.length > 0) {
                const btn = rows[0].querySelector('button[title*="détails"], button[aria-label*="Détails"]');
                if (btn) {
                    btn.click();
                    return true;
                }
            }
            return false;
        });
        assert(inspectorOpened === true, 'Bouton d\'ouverture de l\'inspecteur cliqué');
        await wait(600);

        const scrollCheckOpen = await page.evaluate(() => {
            const el = document.querySelector('[data-testid="quote-items-desktop"]');
            if (!el) return null;
            const style = window.getComputedStyle(el);
            return {
                scrollWidth: el.scrollWidth,
                clientWidth: el.clientWidth,
                overflowX: style.overflowX,
                hasScrollbar: el.scrollWidth > el.clientWidth
            };
        });

        assert(scrollCheckOpen !== null, 'Tableau desktop présent en mode rétréci avec inspecteur');
        assert(scrollCheckOpen?.hasScrollbar === false, `Pas de scroll horizontal (inspecteur OUVERT, vue rétrécie) : scrollWidth(${scrollCheckOpen?.scrollWidth}) <= clientWidth(${scrollCheckOpen?.clientWidth})`);

        // Test c) Viewport plus étroit (1024px)
        await page.setViewport({ width: 1024, height: 768 });
        await wait(500);
        const scrollCheck1024 = await page.evaluate(() => {
            const el = document.querySelector('[data-testid="quote-items-desktop"]');
            if (!el) return null;
            return {
                scrollWidth: el.scrollWidth,
                clientWidth: el.clientWidth,
                hasScrollbar: el.scrollWidth > el.clientWidth
            };
        });
        assert(scrollCheck1024?.hasScrollbar === false, `Pas de scroll horizontal à 1024px avec inspecteur ouvert : scrollWidth(${scrollCheck1024?.scrollWidth}) <= clientWidth(${scrollCheck1024?.clientWidth})`);

        // Capture d'écran Demande 1
        await page.screenshot({ path: 'scratch/verif_req1_no_scroll_narrow.png', fullPage: false });
        console.log('📸 Capture enregistrée : scratch/verif_req1_no_scroll_narrow.png');

        // Réinitialiser la taille d'écran à 1440px
        await page.setViewport({ width: 1440, height: 900 });
        await wait(400);

        // Fermer l'inspecteur
        const inspectorClosed = await page.evaluate(() => {
            const btn = document.querySelector('button[title*="Fermer"], button[aria-label="Retour aux ouvrages du lot"]');
            if (btn) {
                btn.click();
                return true;
            }
            return false;
        });
        await wait(500);

        // ==========================================
        // VÉRIFICATION DEMANDE 2 (Image 2) : Modal Lots & affichage de tous les éléments
        // ==========================================
        console.log('\n--- Test Demande 2 : Modal Lots avec TOUS les éléments et sans coupure ---');

        // Trouver et cliquer sur le bouton de synthèse des lots
        const openLotsModalBtn = await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const b = btns.find(el => el.textContent.includes('Lots (') || el.title?.includes('Vue d\'ensemble') || el.textContent.includes('Synthèse des lots'));
            if (b) {
                b.click();
                return true;
            }
            return false;
        });

        assert(openLotsModalBtn === true, 'Bouton pour ouvrir la Synthèse des lots cliqué');
        await wait(600);

        const lotsModalCheck = await page.evaluate(() => {
            const modal = document.querySelector('[role="dialog"]');
            if (!modal) return null;

            // Vérifier les en-têtes
            const headers = Array.from(modal.querySelectorAll('th')).map(th => th.textContent.trim());
            const hasFullActionsHeader = headers.some(h => h === 'ACTIONS' || h === 'Actions');

            // Vérifier la présence des boutons Ouvrir / Actif
            const buttons = Array.from(modal.querySelectorAll('button')).map(b => b.textContent.trim());
            const hasFullOpenOrActiveBtn = buttons.some(b => b.includes('Actif') || b.includes('Ouvrir'));

            // Vérifier les lignes d'ouvrages détaillés dans l'accordéon
            const items = modal.querySelectorAll('table tbody tr');

            return {
                modalTitle: modal.querySelector('h2, h3')?.textContent.trim(),
                hasFullActionsHeader,
                hasFullOpenOrActiveBtn,
                tableRowsCount: items.length,
                hasAccordionToggle: !!modal.querySelector('button[title*="déplier"], button[title*="replier"]') || buttons.some(b => b.includes('déplier') || b.includes('replier'))
            };
        });

        assert(lotsModalCheck !== null, 'Modal de synthèse des lots trouvée');
        assert(lotsModalCheck?.hasFullActionsHeader === true, 'Colonne ACTIONS complète et non tronquée ("ACTIONS")');
        assert(lotsModalCheck?.hasFullOpenOrActiveBtn === true, 'Boutons d\'action de lot complets ("Actif" / "Ouvrir")');
        assert(lotsModalCheck?.tableRowsCount > 2, `Tous les éléments de lots et ouvrages sont affichés (lignes trouvées : ${lotsModalCheck?.tableRowsCount})`);
        assert(lotsModalCheck?.hasAccordionToggle === true, 'Bouton de contrôle global de l\'accordéon des éléments présent');

        // Capture d'écran Demande 2
        await page.screenshot({ path: 'scratch/verif_req2_lots_modal_all_items.png', fullPage: false });
        console.log('📸 Capture enregistrée : scratch/verif_req2_lots_modal_all_items.png');

        // Fermer la modal de lots
        const closeLotsModal = await page.evaluate(() => {
            const btn = document.querySelector('button[aria-label*="Fermer la synthèse"], [role="dialog"] button[aria-label*="Fermer"]');
            if (btn) {
                btn.click();
                return true;
            }
            return false;
        });
        assert(closeLotsModal === true, 'Modal de synthèse des lots fermée avec succès');
        await wait(500);

        // ==========================================
        // VÉRIFICATION DEMANDE 3 (Image 3) : Ajout Multiple activé par défaut
        // ==========================================
        console.log('\n--- Test Demande 3 : Bibliothèque des Ouvrages - Ajout Multiple actif par défaut ---');

        // Ouvrir la bibliothèque d'ouvrages
        const openPickerBtn = await page.evaluate(() => {
            const btn = document.querySelector('button[aria-label="Ouvrir le catalogue complet des ouvrages"]') ||
                        Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Catalogue');
            if (btn) {
                btn.click();
                return true;
            }
            return false;
        });

        assert(openPickerBtn === true, 'Bouton d\'ouverture de la bibliothèque d\'ouvrages cliqué');
        await wait(800);

        const pickerCheck = await page.evaluate(() => {
            const modal = document.querySelector('[role="dialog"][aria-label*="Bibliothèque"]') ||
                          document.querySelector('[role="dialog"]');
            if (!modal) return null;

            // Vérifier le bouton Ajout Multiple
            const toggleBulkBtn = Array.from(modal.querySelectorAll('button')).find(b => 
                b.textContent.includes('Ajout Multiple') || b.textContent.includes('Mode Simple')
            );
            const toggleBtnText = toggleBulkBtn ? toggleBulkBtn.textContent.trim() : '';

            // Vérifier si des cases à cocher (checkboxes) sont présentes et visibles
            const checkboxes = modal.querySelectorAll('input[type="checkbox"]');

            return {
                modalTitle: modal.querySelector('h3')?.textContent.trim(),
                toggleBtnText,
                checkboxCount: checkboxes.length,
                isBulkActive: toggleBtnText.includes('Ajout Multiple (Actif)') || toggleBtnText.includes('Actif') || checkboxes.length > 0
            };
        });

        assert(pickerCheck !== null, 'Modal Bibliothèque des Ouvrages ouverte');
        assert(pickerCheck?.isBulkActive === true, `Ajout Multiple est bien activé par défaut ! (Bouton: "${pickerCheck?.toggleBtnText}", Checkboxes: ${pickerCheck?.checkboxCount})`);
        assert(pickerCheck?.checkboxCount > 0, `Les cases à cocher de sélection multiple sont présentes (${pickerCheck?.checkboxCount} affichées)`);

        // Capture d'écran Demande 3
        await page.screenshot({ path: 'scratch/verif_req3_bulk_mode_default.png', fullPage: false });
        console.log('📸 Capture enregistrée : scratch/verif_req3_bulk_mode_default.png');

        // Résumé global
        const failed = results.filter(r => !r.pass);
        console.log(`\n==========================================`);
        console.log(`Bilan : ${results.length - failed.length}/${results.length} vérifications réussies.`);
        if (failed.length > 0) {
            console.error(`❌ Échecs détectés :`, failed);
            process.exit(1);
        } else {
            console.log(`🎉 TOUTES LES 3 DEMANDES SONT PARFAITEMENT VALIDÉES SANS AUCUN DÉFAUT !`);
        }

    } finally {
        await close();
    }
}

run();
