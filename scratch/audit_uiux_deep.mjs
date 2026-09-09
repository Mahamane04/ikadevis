import { launchApp, enterGuestMode } from './lib/harness.mjs';
import path from 'node:path';

const wait = (ms = 400) => new Promise((r) => setTimeout(r, ms));
const ARTIFACT_DIR = '/Users/mahamanehaidara/.gemini/antigravity-ide/brain/c2b0be91-19f8-47a6-9316-05aa6e9fa053';

async function audit() {
    console.log('=== Démarrage de l\'audit UI/UX approfondi ===');
    const { page, close } = await launchApp();

    const findings = [];

    try {
        // -------------------------------------------------------------
        // 1. DESKTOP : Vue générale du chiffrage (1440x900)
        // -------------------------------------------------------------
        await page.setViewport({ width: 1440, height: 900 });
        await enterGuestMode(page, { demo: true });
        await wait(1500);

        await page.screenshot({ path: path.join(ARTIFACT_DIR, 'audit_desktop_main.png') });
        console.log('📸 Capture desktop principal enregistrée.');

        // Analyse de débordement horizontal sur la page
        const desktopScrollCheck = await page.evaluate(() => {
            const body = document.body;
            const docEl = document.documentElement;
            const hasHScroll = docEl.scrollWidth > docEl.clientWidth || body.scrollWidth > body.clientWidth;
            const tableContainer = document.querySelector('[data-testid="quote-items-desktop"]');
            return {
                pageScrollW: docEl.scrollWidth,
                pageClientW: docEl.clientWidth,
                hasHScroll,
                tableScrollW: tableContainer?.scrollWidth,
                tableClientW: tableContainer?.clientWidth,
                tableHScroll: tableContainer ? tableContainer.scrollWidth > tableContainer.clientWidth : false
            };
        });
        findings.push({ category: 'Desktop Layout', ...desktopScrollCheck });

        // -------------------------------------------------------------
        // 2. DESKTOP : Avec Inspecteur Latéral Ouvert (Split View)
        // -------------------------------------------------------------
        await page.evaluate(() => {
            const rows = document.querySelectorAll('[data-testid="quote-items-desktop"] tbody tr');
            if (rows.length > 0) rows[0].click();
        });
        await wait(600);

        await page.screenshot({ path: path.join(ARTIFACT_DIR, 'audit_desktop_inspector.png') });
        console.log('📸 Capture desktop avec inspecteur enregistrée.');

        const inspectorCheck = await page.evaluate(() => {
            const tableContainer = document.querySelector('[data-testid="quote-items-desktop"]');
            const inspector = document.querySelector('aside[aria-label="Inspecteur de l\'ouvrage"]');
            
            // Vérifier si des éléments de la table sont cachés ou illisibles
            const firstRowCells = tableContainer ? [...tableContainer.querySelectorAll('tbody tr:first-child td')].map(td => ({
                text: td.textContent.trim().replace(/\s+/g, ' '),
                scrollW: td.scrollWidth,
                offsetW: td.offsetWidth,
                isOverflowing: td.scrollWidth > td.offsetWidth
            })) : [];

            return {
                inspectorPresent: !!inspector,
                inspectorW: inspector?.offsetWidth,
                tableContainerW: tableContainer?.offsetWidth,
                tableScrollW: tableContainer?.scrollWidth,
                tableClientW: tableContainer?.clientWidth,
                hasHScroll: tableContainer ? tableContainer.scrollWidth > tableContainer.clientWidth : false,
                firstRowCells
            };
        });
        findings.push({ category: 'Inspector Split View', ...inspectorCheck });

        // -------------------------------------------------------------
        // 3. MODALE : Synthèse et Répartition des Lots
        // -------------------------------------------------------------
        await page.evaluate(() => {
            const btn = document.querySelector('[data-testid="lots-overview-btn"]');
            if (btn) btn.click();
        });
        await wait(600);

        await page.screenshot({ path: path.join(ARTIFACT_DIR, 'audit_lots_overview_modal.png') });
        console.log('📸 Capture Synthèse des lots enregistrée.');

        const lotsModalCheck = await page.evaluate(() => {
            const modal = document.querySelector('[data-testid="lots-overview-modal"]');
            if (!modal) return { present: false };
            const actionTh = modal.querySelector('[data-testid="lots-actions-th"]');
            const actionButtons = [...modal.querySelectorAll('tbody button')].map(b => b.textContent.trim());
            const lotRows = modal.querySelectorAll('tbody tr').length;
            return {
                present: true,
                modalWidth: modal.offsetWidth,
                modalHeight: modal.offsetHeight,
                actionThText: actionTh?.textContent.trim(),
                lotRows,
                actionButtons: actionButtons.slice(0, 10)
            };
        });
        findings.push({ category: 'Lots Overview Modal', ...lotsModalCheck });

        // Fermer modale synthèse
        await page.evaluate(() => {
            const modal = document.querySelector('[data-testid="lots-overview-modal"]');
            const closeBtn = modal?.querySelector('button[aria-label*="Fermer"]');
            if (closeBtn) closeBtn.click();
        });
        await wait(400);

        // -------------------------------------------------------------
        // 4. MODALE : Bibliothèque des Ouvrages (WorkItemPicker)
        // -------------------------------------------------------------
        await page.evaluate(() => {
            const btn = document.querySelector('button[title*="Catalogue"], button[aria-label*="Catalogue"]');
            if (btn) btn.click();
        });
        await wait(600);

        await page.screenshot({ path: path.join(ARTIFACT_DIR, 'audit_workitem_picker.png') });
        console.log('📸 Capture Bibliothèque des ouvrages enregistrée.');

        const pickerCheck = await page.evaluate(() => {
            const picker = document.querySelector('[role="dialog"]');
            const checkboxes = picker?.querySelectorAll('input[type="checkbox"]').length || 0;
            const bulkBtn = picker ? [...picker.querySelectorAll('button')].find(b => b.textContent.includes('Ajout Multiple')) : null;
            const addButtons = picker ? [...picker.querySelectorAll('button')].filter(b => b.textContent.trim() === 'Ajouter').length : 0;
            const selectAllBtn = picker ? [...picker.querySelectorAll('button')].find(b => b.textContent.includes('Tout sélectionner')) : null;

            return {
                present: !!picker,
                bulkModeActive: bulkBtn ? bulkBtn.textContent.trim() : '',
                checkboxesCount: checkboxes,
                addButtonsCount: addButtons,
                hasSelectAll: !!selectAllBtn
            };
        });
        findings.push({ category: 'WorkItemPicker', ...pickerCheck });

        // Fermer la bibliothèque
        await page.evaluate(() => {
            const picker = document.querySelector('[role="dialog"]');
            const closeBtn = picker?.querySelector('button[aria-label*="Fermer"]');
            if (closeBtn) closeBtn.click();
        });
        await wait(400);

        // -------------------------------------------------------------
        // 5. MOBILE : Ergonomie sur Smartphone (390x844 - iPhone 14/15)
        // -------------------------------------------------------------
        await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
        await wait(800);

        await page.screenshot({ path: path.join(ARTIFACT_DIR, 'audit_mobile_view.png') });
        console.log('📸 Capture mobile enregistrée.');

        const mobileCheck = await page.evaluate(() => {
            const docEl = document.documentElement;
            const body = document.body;
            const hasHScroll = docEl.scrollWidth > docEl.clientWidth || body.scrollWidth > body.clientWidth;
            const mobileCards = document.querySelectorAll('[data-testid^="quote-item-mobile-"], .quote-item-card, [data-testid="quote-items-mobile"] > div');
            const totalsBar = document.querySelector('[data-testid="quote-totals-bar"], .quote-totals-sticky');
            const bottomNav = document.querySelector('nav, [data-testid="mobile-bottom-nav"]');
            const fab = document.querySelector('button[title*="Ajouter"], button[aria-label*="Ajouter"], .fab-add');

            return {
                viewport: '390x844',
                hasHScroll,
                scrollWidth: docEl.scrollWidth,
                clientWidth: docEl.clientWidth,
                mobileCardsCount: mobileCards.length,
                totalsBarPresent: !!totalsBar,
                totalsBarHeight: totalsBar?.offsetHeight,
                bottomNavPresent: !!bottomNav,
                fabPresent: !!fab
            };
        });
        findings.push({ category: 'Mobile View', ...mobileCheck });

        // -------------------------------------------------------------
        // 6. Accessibilité & Qualité des Boutons / Micro-Interactions
        // -------------------------------------------------------------
        const a11yCheck = await page.evaluate(() => {
            const buttons = [...document.querySelectorAll('button, a[href], input, select')];
            const buttonsWithoutLabel = buttons.filter(b => {
                const text = b.textContent?.trim();
                const ariaLabel = b.getAttribute('aria-label');
                const title = b.getAttribute('title');
                return !text && !ariaLabel && !title;
            }).map(b => b.outerHTML.slice(0, 80));

            const smallTapTargets = buttons.filter(b => {
                const rect = b.getBoundingClientRect();
                return (rect.width > 0 && rect.width < 28) || (rect.height > 0 && rect.height < 28);
            }).map(b => ({
                tag: b.tagName,
                class: b.className?.slice?.(0, 40),
                w: b.offsetWidth,
                h: b.offsetHeight,
                label: b.getAttribute('aria-label') || b.textContent?.trim()?.slice(0, 20)
            }));

            return {
                totalInteractiveElements: buttons.length,
                buttonsWithoutLabelCount: buttonsWithoutLabel.length,
                sampleWithoutLabel: buttonsWithoutLabel.slice(0, 5),
                smallTapTargetsCount: smallTapTargets.length,
                sampleSmallTargets: smallTapTargets.slice(0, 5)
            };
        });
        findings.push({ category: 'Accessibility & Tap Targets', ...a11yCheck });

        console.log('\n=== RÉSULTATS DE L\'AUDIT UI/UX ===');
        console.log(JSON.stringify(findings, null, 2));

    } finally {
        await close();
    }
}

audit().catch(console.error);
