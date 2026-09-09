import { launchApp, enterGuestMode, addCatalogItemBySearch, setFirstOuvrageRectangle } from './lib/harness.mjs';

const wait = (ms = 500) => new Promise((r) => setTimeout(r, ms));

export async function run() {
    console.log('🎨 Démarrage de l\'audit expert UI/UX (Senior Principal Designer 15+ ans)...');
    const { page, close } = await launchApp();
    const findings = [];
    const report = {
        viewports: {},
        accessibility: {},
        ergonomics: {},
        visualHierarchy: {},
        edgeCases: {}
    };

    try {
        // =====================================================================
        // TEST 1 : Écran Desktop Standard (1440x900) — Espace de Chiffrage Complet
        // =====================================================================
        console.log('\n📐 1. Analyse Desktop Standard (1440x900)...');
        await page.setViewport({ width: 1440, height: 900 });
        await enterGuestMode(page, { demo: true });
        await wait(1200);

        // Capture d'écran générale
        await page.screenshot({ path: 'scratch/audit_expert_desktop_workspace.png', fullPage: false });
        console.log('  📸 Capture : scratch/audit_expert_desktop_workspace.png');

        // Analyse de la hiérarchie visuelle, typographie et contrastes
        const desktopMetrics = await page.evaluate(() => {
            const getMetrics = (el) => {
                if (!el) return null;
                const rect = el.getBoundingClientRect();
                const style = window.getComputedStyle(el);
                return {
                    text: el.innerText ? el.innerText.trim().slice(0, 40) : '',
                    width: Math.round(rect.width),
                    height: Math.round(rect.height),
                    fontSize: style.fontSize,
                    fontWeight: style.fontWeight,
                    lineHeight: style.lineHeight,
                    color: style.color,
                    backgroundColor: style.backgroundColor,
                    fontFamily: style.fontFamily.split(',')[0],
                    display: style.display,
                    boxShadow: style.boxShadow
                };
            };

            // Éléments clés de l'espace de chiffrage
            const breadcrumb = document.querySelector('nav[aria-label*="fil"], .breadcrumb, h1, [role="heading"]');
            const clientInput = document.querySelector('input[aria-label*="Client"]');
            const projectInput = document.querySelector('input[aria-label*="Projet"]');
            const lotTabs = Array.from(document.querySelectorAll('[role="tablist"] [role="tab"]')).map(getMetrics);
            const table = document.querySelector('[data-testid="quote-items-desktop"] table');
            const tableContainer = document.querySelector('[data-testid="quote-items-desktop"]');
            const thList = Array.from(table?.querySelectorAll('th') || []).map(getMetrics);
            const firstRowTds = Array.from(table?.querySelectorAll('tbody tr:first-child td') || []).map(getMetrics);
            const totalsBar = document.querySelector('.quote-totals-bar');
            const totalTtc = Array.from(document.querySelectorAll('span, div')).find(el => el.textContent.includes('TOTAL TTC'));

            // Boutons d'action principaux
            const saveBtn = Array.from(document.querySelectorAll('button')).find(b => /Enregistrer|Mettre à jour/i.test(b.textContent || ''));
            const previewBtn = Array.from(document.querySelectorAll('button')).find(b => /Aperçu Client & PDF/i.test(b.textContent || ''));
            const addLotBtn = document.querySelector('button[aria-label*="Ajouter un lot"]');
            const catalogBtn = document.querySelector('button[aria-label*="catalogue"], button[aria-label*="Catalogue"]');
            const customLineBtn = document.querySelector('button[aria-label*="libre"]');

            return {
                tableScrollWidth: tableContainer?.scrollWidth || 0,
                tableClientWidth: tableContainer?.clientWidth || 0,
                hasTableOverflow: (tableContainer?.scrollWidth || 0) > (tableContainer?.clientWidth || 0),
                clientInput: getMetrics(clientInput),
                projectInput: getMetrics(projectInput),
                lotTabs,
                thList,
                firstRowTds,
                saveBtn: getMetrics(saveBtn),
                previewBtn: getMetrics(previewBtn),
                addLotBtn: getMetrics(addLotBtn),
                catalogBtn: getMetrics(catalogBtn),
                customLineBtn: getMetrics(customLineBtn),
                totalsBar: getMetrics(totalsBar)
            };
        });

        report.desktop = desktopMetrics;
        console.log(`  🔍 Tableau 1440px : scrollWidth=${desktopMetrics.tableScrollWidth}px, clientWidth=${desktopMetrics.tableClientWidth}px (Overflow: ${desktopMetrics.hasTableOverflow ? 'OUI' : 'NON'})`);
        console.log(`  🔍 Cible tactile Bouton Sauvegarder : ${desktopMetrics.saveBtn?.width}x${desktopMetrics.saveBtn?.height}px`);
        console.log(`  🔍 Cible tactile Bouton Catalogue : ${desktopMetrics.catalogBtn?.width}x${desktopMetrics.catalogBtn?.height}px`);
        console.log(`  🔍 Onglets de lots : ${desktopMetrics.lotTabs.length} onglets détectés`);

        // =====================================================================
        // TEST 2 : État Déplié avec Inspecteur Latéral (Épreuve de Densité)
        // =====================================================================
        console.log('\n📐 2. Analyse avec Inspecteur Latéral Ouvert (Split View)...');
        await page.evaluate(() => {
            const firstDetailsBtn = document.querySelector('[data-testid="quote-items-desktop"] tbody tr:first-child button[title*="détails"], [data-testid="quote-items-desktop"] tbody tr:first-child button[aria-label*="Détails"]');
            firstDetailsBtn?.click();
        });
        await wait(900);

        await page.screenshot({ path: 'scratch/audit_expert_inspector_active.png', fullPage: false });
        console.log('  📸 Capture : scratch/audit_expert_inspector_active.png');

        const inspectorMetrics = await page.evaluate(() => {
            const tableContainer = document.querySelector('[data-testid="quote-items-desktop"]');
            const inspector = document.querySelector('aside[aria-label*="Inspecteur"]');
            const inspectorHeader = inspector?.querySelector('header, .inspector-header, div:first-child');
            const simpleModeBtn = Array.from(inspector?.querySelectorAll('button') || []).find(b => b.textContent.includes('Simple'));
            const advancedModeBtn = Array.from(inspector?.querySelectorAll('button') || []).find(b => b.textContent.includes('Avancé'));
            const qtyInput = inspector?.querySelector('input[type="number"]');

            return {
                inspectorVisible: !!inspector,
                inspectorWidth: inspector ? Math.round(inspector.getBoundingClientRect().width) : 0,
                inspectorHeight: inspector ? Math.round(inspector.getBoundingClientRect().height) : 0,
                tableWidth: tableContainer ? Math.round(tableContainer.getBoundingClientRect().width) : 0,
                tableScrollWidth: tableContainer?.scrollWidth || 0,
                tableClientWidth: tableContainer?.clientWidth || 0,
                hasScrollX: (tableContainer?.scrollWidth || 0) > (tableContainer?.clientWidth || 0),
                hasSimpleBtn: !!simpleModeBtn,
                hasAdvancedBtn: !!advancedModeBtn,
                qtyInputWidth: qtyInput ? Math.round(qtyInput.getBoundingClientRect().width) : 0
            };
        });

        report.inspector = inspectorMetrics;
        console.log(`  🔍 Inspecteur largeur : ${inspectorMetrics.inspectorWidth}px (Tableau restant : ${inspectorMetrics.tableWidth}px)`);
        console.log(`  🔍 Tableau après ouverture inspecteur : scrollWidth=${inspectorMetrics.tableScrollWidth}px, clientWidth=${inspectorMetrics.tableClientWidth}px (Débordement : ${inspectorMetrics.hasScrollX ? 'OUI ❌' : 'ZÉRO ✅'})`);

        // Refermer l'inspecteur
        await page.evaluate(() => {
            const closeBtn = document.querySelector('button[aria-label*="Retour aux ouvrages"]');
            closeBtn?.click();
        });
        await wait(600);

        // =====================================================================
        // TEST 3 : Modale Synthèse des Lots (Évaluation de la Lisibilité Macro)
        // =====================================================================
        console.log('\n📐 3. Analyse de la Synthèse des Lots (Vue d\'ensemble & Accordéon)...');
        await page.evaluate(() => {
            const overviewBtn = document.querySelector('button[data-testid="lots-overview-btn"]') ||
                                document.querySelector('button[aria-label="Synthèse des lots"]');
            overviewBtn?.click();
        });
        await wait(800);

        await page.screenshot({ path: 'scratch/audit_expert_lots_overview.png', fullPage: false });
        console.log('  📸 Capture : scratch/audit_expert_lots_overview.png');

        const modalMetrics = await page.evaluate(() => {
            const modal = document.querySelector('[role="dialog"]');
            if (!modal) return null;
            const rect = modal.getBoundingClientRect();
            const thList = Array.from(modal.querySelectorAll('thead th')).map(th => ({
                text: th.innerText.trim(),
                width: Math.round(th.getBoundingClientRect().width)
            }));
            const actionBtns = Array.from(modal.querySelectorAll('tbody button')).map(b => ({
                text: b.innerText.trim(),
                width: Math.round(b.getBoundingClientRect().width),
                height: Math.round(b.getBoundingClientRect().height)
            }));
            const accordionRows = modal.querySelectorAll('tbody tr');

            return {
                modalWidth: Math.round(rect.width),
                modalHeight: Math.round(rect.height),
                viewportRatio: Math.round((rect.width / window.innerWidth) * 100),
                thList,
                actionBtnsCount: actionBtns.length,
                firstActionBtn: actionBtns[0],
                totalRows: accordionRows.length
            };
        });

        report.lotsModal = modalMetrics;
        console.log(`  🔍 Modale Synthèse : ${modalMetrics?.modalWidth}px de large (${modalMetrics?.viewportRatio}% du viewport)`);
        console.log(`  🔍 Colonne ACTIONS présente : ${modalMetrics?.thList.some(th => /ACTIONS/i.test(th.text)) ? 'OUI ✅' : 'NON ❌'}`);
        console.log(`  🔍 Nombre de lignes détaillées visibles : ${modalMetrics?.totalRows}`);

        // Refermer la modale
        await page.evaluate(() => {
            const closeBtn = document.querySelector('[role="dialog"] button[aria-label*="Fermer"]');
            closeBtn?.click();
        });
        await wait(600);

        // =====================================================================
        // TEST 4 : Écran Étroit / Laptop Compact (1280x800)
        // =====================================================================
        console.log('\n📐 4. Analyse Laptop Compact (1280x800)...');
        await page.setViewport({ width: 1280, height: 800 });
        await wait(800);

        // Ouvrir l'inspecteur à 1280px pour tester la contrainte spatiale maximale
        await page.evaluate(() => {
            const firstDetailsBtn = document.querySelector('[data-testid="quote-items-desktop"] tbody tr:first-child button[title*="détails"], [data-testid="quote-items-desktop"] tbody tr:first-child button[aria-label*="Détails"]');
            firstDetailsBtn?.click();
        });
        await wait(900);

        await page.screenshot({ path: 'scratch/audit_expert_compact_1280.png', fullPage: false });
        console.log('  📸 Capture : scratch/audit_expert_compact_1280.png');

        const compactMetrics = await page.evaluate(() => {
            const tableContainer = document.querySelector('[data-testid="quote-items-desktop"]');
            const inspector = document.querySelector('aside[aria-label*="Inspecteur"]');
            return {
                tableScrollWidth: tableContainer?.scrollWidth || 0,
                tableClientWidth: tableContainer?.clientWidth || 0,
                hasScrollX: (tableContainer?.scrollWidth || 0) > (tableContainer?.clientWidth || 0),
                tableWidth: Math.round(tableContainer?.getBoundingClientRect().width || 0),
                inspectorWidth: Math.round(inspector?.getBoundingClientRect().width || 0)
            };
        });

        report.compact1280 = compactMetrics;
        console.log(`  🔍 1280px avec inspecteur : tableWidth=${compactMetrics.tableWidth}px, scrollWidth=${compactMetrics.tableScrollWidth}px (Scroll X : ${compactMetrics.hasScrollX ? 'OUI ❌' : 'ZÉRO ✅'})`);

        // Refermer l'inspecteur
        await page.evaluate(() => {
            const closeBtn = document.querySelector('button[aria-label*="Retour aux ouvrages"]');
            closeBtn?.click();
        });
        await wait(600);

        // =====================================================================
        // TEST 5 : Mobile / Tactile (390x844 — iPhone 14 Pro)
        // =====================================================================
        console.log('\n📐 5. Analyse Mobile Tactile (390x844)...');
        await page.setViewport({ width: 390, height: 844 });
        await wait(1000);

        await page.screenshot({ path: 'scratch/audit_expert_mobile_touch.png', fullPage: false });
        console.log('  📸 Capture : scratch/audit_expert_mobile_touch.png');

        // Test interaction mobile : clic sur un ouvrage pour ouvrir l'inspecteur mobile
        await page.evaluate(() => {
            const firstRow = document.querySelector('[data-testid="quote-items-mobile"] > div, [data-testid="quote-items-desktop"] tbody tr:first-child');
            firstRow?.click();
        });
        await wait(800);
        await page.screenshot({ path: 'scratch/audit_expert_mobile_inspector.png', fullPage: false });
        console.log('  📸 Capture : scratch/audit_expert_mobile_inspector.png');

        const mobileMetrics = await page.evaluate(() => {
            const docWidth = document.documentElement.offsetWidth;
            const bodyWidth = document.body.offsetWidth;
            const viewportWidth = window.innerWidth;
            const buttons = Array.from(document.querySelectorAll('button')).filter(b => b.getBoundingClientRect().height > 0);
            const smallTargets = buttons.filter(b => {
                const rect = b.getBoundingClientRect();
                return rect.height < 36 || rect.width < 36;
            });
            const totalsBar = document.querySelector('.quote-totals-bar');
            const quickSearch = document.querySelector('input[aria-label*="Rechercher"]');

            return {
                viewportWidth,
                docWidth,
                bodyWidth,
                hasDocOverflow: docWidth > viewportWidth,
                totalButtons: buttons.length,
                smallTargetsCount: smallTargets.length,
                totalsBarHeight: totalsBar ? Math.round(totalsBar.getBoundingClientRect().height) : 0,
                hasQuickSearch: !!quickSearch
            };
        });

        report.mobile = mobileMetrics;
        console.log(`  🔍 Mobile 390px : docWidth=${mobileMetrics.docWidth}px, viewportWidth=${mobileMetrics.viewportWidth}px (Débordement : ${mobileMetrics.hasDocOverflow ? 'OUI ❌' : 'AUCUN ✅'})`);
        console.log(`  🔍 Cibles tactiles < 36px : ${mobileMetrics.smallTargetsCount}/${mobileMetrics.totalButtons}`);

        return { success: true, report };

    } finally {
        await close();
    }
}

run();
