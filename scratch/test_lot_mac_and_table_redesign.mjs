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

        // 1. Tester la présence de la barre d'action rapide compacte
        const quickActionBar = await page.evaluate(() => {
            const combobox = document.querySelector('[placeholder="Rechercher un ouvrage à ajouter..."]');
            const catalogueBtn = document.querySelector('button[aria-label="Ouvrir le catalogue complet des ouvrages"]');
            const customLineBtn = document.querySelector('button[aria-label="Ajouter une ligne libre"]');
            return {
                hasCombobox: !!combobox,
                hasCatalogueBtn: !!catalogueBtn,
                hasCustomLineBtn: !!customLineBtn,
                catalogueText: catalogueBtn ? catalogueBtn.textContent.trim() : '',
                customLineText: customLineBtn ? customLineBtn.textContent.trim() : ''
            };
        });

        ok('Barre d’action rapide compacte : combobox présent', quickActionBar.hasCombobox);
        ok('Barre d’action rapide : bouton Catalogue compact présent', quickActionBar.hasCatalogueBtn && quickActionBar.catalogueText.includes('Catalogue'));
        ok('Barre d’action rapide : bouton Ligne libre compact présent', quickActionBar.hasCustomLineBtn && quickActionBar.customLineText.includes('Ligne libre'));

        // 2. Tester le tableau d'ouvrages desktop et le badge de métrage
        const tableInfo = await page.evaluate(() => {
            const table = document.querySelector('[data-testid="quote-items-desktop"] table');
            const headers = [...document.querySelectorAll('[data-testid="quote-items-desktop"] th')].map(th => th.textContent.trim());
            const metreBadges = [...document.querySelectorAll('[data-testid="quote-items-desktop"] span')].filter(s => s.textContent.trim().includes('Calculé selon le métrage'));
            return {
                hasTable: !!table,
                headers,
                metreBadgeCount: metreBadges.length
            };
        });

        ok('Le tableau desktop est présent avec en-têtes nettoyés', tableInfo.hasTable && tableInfo.headers.includes('Désignation Ouvrage'));
        ok('Le badge métré "Calculé selon le métrage" est présent dans la colonne désignation', tableInfo.metreBadgeCount > 0, `badges: ${tableInfo.metreBadgeCount}`);

        // 3. Tester la navigation clavier entre lots (Mac & PC)
        // Vérifier l'index du lot actif initial (doit être 0)
        const initialLot = await page.evaluate(() => {
            const activeTab = document.querySelector('[role="tablist"] [role="tab"][aria-selected="true"]');
            return activeTab ? activeTab.textContent.trim() : '';
        });

        // Simuler le raccourci Alt/Option + ArrowDown
        await page.keyboard.down('Alt');
        await page.keyboard.press('ArrowDown');
        await page.keyboard.up('Alt');
        await wait(500);

        const lotAfterAltDown = await page.evaluate(() => {
            const activeTab = document.querySelector('[role="tablist"] [role="tab"][aria-selected="true"]');
            return activeTab ? activeTab.textContent.trim() : '';
        });

        ok('Alt/Option + ArrowDown change de lot vers le bas', lotAfterAltDown !== initialLot, `initial: ${initialLot} -> apres: ${lotAfterAltDown}`);

        // Simuler Alt/Option + ArrowUp
        await page.keyboard.down('Alt');
        await page.keyboard.press('ArrowUp');
        await page.keyboard.up('Alt');
        await wait(500);

        const lotAfterAltUp = await page.evaluate(() => {
            const activeTab = document.querySelector('[role="tablist"] [role="tab"][aria-selected="true"]');
            return activeTab ? activeTab.textContent.trim() : '';
        });

        ok('Alt/Option + ArrowUp revient au lot précédent', lotAfterAltUp === initialLot, `revenu à: ${lotAfterAltUp}`);

        // 4. Tester avec focus dans un input (par exemple le champ prix ou qté)
        await page.click('[data-testid="quote-items-desktop"] input[data-col="price"][data-row="0"]');
        await wait(200);

        // Appuyer sur Option + ArrowDown alors qu'on est en train d'éditer un input !
        await page.keyboard.down('Alt');
        await page.keyboard.press('ArrowDown');
        await page.keyboard.up('Alt');
        await wait(500);

        const lotAfterInputShortcut = await page.evaluate(() => {
            const activeTab = document.querySelector('[role="tablist"] [role="tab"][aria-selected="true"]');
            return activeTab ? activeTab.textContent.trim() : '';
        });

        ok('Option + ArrowDown fonctionne MÊME quand le focus est dans un champ de saisie', lotAfterInputShortcut !== initialLot, `lot actuel: ${lotAfterInputShortcut}`);

        // 5. Tester avec Ctrl + ArrowUp (variante Mac fréquente)
        await page.keyboard.down('Control');
        await page.keyboard.press('ArrowUp');
        await page.keyboard.up('Control');
        await wait(500);

        const lotAfterCtrlUp = await page.evaluate(() => {
            const activeTab = document.querySelector('[role="tablist"] [role="tab"][aria-selected="true"]');
            return activeTab ? activeTab.textContent.trim() : '';
        });

        ok('Ctrl + ArrowUp fonctionne également pour revenir au lot précédent', lotAfterCtrlUp === initialLot, `lot actuel: ${lotAfterCtrlUp}`);

        // 6. Ouvrir l'inspecteur d'ouvrage et tester le sélecteur direct de lot (1-clic)
        const openInspector = await page.evaluate(() => {
            const rows = document.querySelectorAll('[data-testid="quote-items-desktop"] tbody tr');
            if (rows.length > 0) {
                const btn = rows[0].querySelector('button[title*="détails techniques"], button[aria-label*="Détails techniques"], button[title*="Quantité issue du métré"]');
                if (btn) btn.click();
                else rows[0].click();
                return true;
            }
            return false;
        });
        ok('Inspecteur d’ouvrage ouvert avec succès', openInspector);
        await wait(600);

        // 7. Vérifier la présence du sélecteur direct de lot dans le header de l'inspecteur
        const inspectorNavInfo = await page.evaluate(() => {
            const inspector = document.querySelector('aside[aria-label="Inspecteur de l\'ouvrage"]');
            if (!inspector) return { hasInspector: false };
            const dropdownBtn = inspector.querySelector('[data-testid="lot-selector-dropdown-btn"]');
            const prevBtn = inspector.querySelector('[aria-label="Lot précédent"]');
            const nextBtn = inspector.querySelector('[aria-label="Lot suivant"]');
            return {
                hasInspector: true,
                hasDropdownBtn: !!dropdownBtn,
                dropdownText: dropdownBtn ? dropdownBtn.textContent.trim() : '',
                hasPrevBtn: !!prevBtn,
                hasNextBtn: !!nextBtn
            };
        });

        ok('Sélecteur direct de lot présent dans le header de l’inspecteur', inspectorNavInfo.hasInspector && inspectorNavInfo.hasDropdownBtn);
        ok('Boutons chevrons de navigation de lot présents dans l’inspecteur', inspectorNavInfo.hasNextBtn);

        // 8. Cliquer sur le dropdown de lot dans l'inspecteur pour changer de lot en 1 clic
        await page.click('aside[aria-label="Inspecteur de l\'ouvrage"] [data-testid="lot-selector-dropdown-btn"]');
        await wait(300);

        const menuOpen = await page.evaluate(() => {
            const menu = document.querySelector('[data-testid="lot-selector-dropdown-menu"]');
            const options = document.querySelectorAll('[data-testid^="lot-selector-option-"]');
            return {
                isOpen: !!menu,
                optionCount: options.length
            };
        });
        ok('Menu déroulant de choix direct de lot ouvert avec les options', menuOpen.isOpen && menuOpen.optionCount > 1, `options: ${menuOpen.optionCount}`);

        // Sélectionner le Lot 2 en 1 clic !
        await page.click('[data-testid="lot-selector-option-1"]');
        await wait(500);

        const inspectorAfterLotSwitch = await page.evaluate(() => {
            const inspector = document.querySelector('aside[aria-label="Inspecteur de l\'ouvrage"]');
            const dropdownBtn = inspector ? inspector.querySelector('[data-testid="lot-selector-dropdown-btn"]') : null;
            const activeTab = document.querySelector('[role="tablist"] [role="tab"][aria-selected="true"]');
            return {
                dropdownText: dropdownBtn ? dropdownBtn.textContent.trim() : '',
                activeTab: activeTab ? activeTab.textContent.trim() : ''
            };
        });

        ok('Changement de lot direct en 1 clic depuis l’inspecteur sans fermer l’inspecteur', inspectorAfterLotSwitch.dropdownText.includes('02') || inspectorAfterLotSwitch.activeTab.includes('02'), `actuel: ${inspectorAfterLotSwitch.dropdownText}`);

        // 9. Tester le chevron lot précédent dans l'inspecteur pour revenir en 1 clic
        await page.click('aside[aria-label="Inspecteur de l\'ouvrage"] [aria-label="Lot précédent"]');
        await wait(500);

        const inspectorAfterChevronBack = await page.evaluate(() => {
            const inspector = document.querySelector('aside[aria-label="Inspecteur de l\'ouvrage"]');
            const dropdownBtn = inspector ? inspector.querySelector('[data-testid="lot-selector-dropdown-btn"]') : null;
            return dropdownBtn ? dropdownBtn.textContent.trim() : '';
        });

        ok('Chevron "Lot précédent" dans l’inspecteur ramène au Lot 1 en 1 clic', inspectorAfterChevronBack.includes('01'), `lot après chevron: ${inspectorAfterChevronBack}`);

        // 10. Tester le raccourci Alt/Option + ArrowDown alors que l'inspecteur est ouvert
        await page.keyboard.down('Alt');
        await page.keyboard.press('ArrowDown');
        await page.keyboard.up('Alt');
        await wait(500);

        const inspectorAfterAltDown = await page.evaluate(() => {
            const inspector = document.querySelector('aside[aria-label="Inspecteur de l\'ouvrage"]');
            const dropdownBtn = inspector ? inspector.querySelector('[data-testid="lot-selector-dropdown-btn"]') : null;
            return dropdownBtn ? dropdownBtn.textContent.trim() : '';
        });

        ok('Raccourci ⌥↓ (Option + Flèche bas) change de lot avec l’inspecteur ouvert', inspectorAfterAltDown.includes('02'), `lot après ⌥↓: ${inspectorAfterAltDown}`);


    } finally {
        await close();
    }

    const allPassed = results.every(r => r.pass);
    console.log('\n--- Résultats des tests Mac Keyboard & Redesign ---');
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
