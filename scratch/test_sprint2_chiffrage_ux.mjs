import puppeteer from 'puppeteer';
import { launchApp, enterGuestMode } from './lib/harness.mjs';

(async () => {
    let passed = 0, failed = 0;
    const ok = (label, cond, detail = '') => {
        if (cond) { console.log(`  ✅ ${label}${detail ? ' — ' + detail : ''}`); passed++; }
        else { console.error(`  ❌ ${label}${detail ? ' — ' + detail : ''}`); failed++; }
    };

    console.log('\n=== VALIDATION AUTOMATISÉE — SPRINT 2 UX CHIFFRAGE BTP ===\n');

    const { page, close } = await launchApp();
    try {
        await page.setViewport({ width: 1440, height: 900 });
        // Charger le devis d'exemple complet
        await enterGuestMode(page, { demo: true });
        await new Promise(r => setTimeout(r, 1200));

        // 1. Vérification des colonnes P.U. HT équipées de data-col='price'
        const priceInputs = await page.$$('[data-testid="quote-items-desktop"] input[data-col="price"]');
        ok("Colonnes P.U. HT équipées de data-col='price'", priceInputs.length >= 2, `Trouvé ${priceInputs.length} champs`);

        // 2. Navigation clavier verticale sur P.U. HT (Enter & ArrowUp)
        await page.click('[data-testid="quote-items-desktop"] input[data-col="price"][data-row="0"]');
        await new Promise(r => setTimeout(r, 150));

        let focusedCol = await page.evaluate(() => {
            const el = document.activeElement;
            return el ? { col: el.getAttribute('data-col'), row: el.getAttribute('data-row') } : null;
        });
        ok("Focus initial sur P.U. HT ligne 0", focusedCol?.col === 'price' && focusedCol?.row === '0');

        // Appui sur Enter -> doit descendre à la ligne 1
        await page.keyboard.press('Enter');
        await new Promise(r => setTimeout(r, 150));
        focusedCol = await page.evaluate(() => {
            const el = document.activeElement;
            return el ? { col: el.getAttribute('data-col'), row: el.getAttribute('data-row') } : null;
        });
        ok("Touche 'Enter' descend le focus sur P.U. HT ligne 1", focusedCol?.col === 'price' && focusedCol?.row === '1');

        // Appui sur ArrowUp -> doit remonter à la ligne 0
        await page.keyboard.press('ArrowUp');
        await new Promise(r => setTimeout(r, 150));
        focusedCol = await page.evaluate(() => {
            const el = document.activeElement;
            return el ? { col: el.getAttribute('data-col'), row: el.getAttribute('data-row') } : null;
        });
        ok("Touche 'ArrowUp' remonte le focus sur P.U. HT ligne 0", focusedCol?.col === 'price' && focusedCol?.row === '0');

        // 3. Test des quantités métrées (bouton cliquable vers inspecteur) et lignes libres avec data-col="qty"
        const derivedQtyButtons = await page.$$('[data-testid="quote-items-desktop"] button[title*="Quantité issue du métré"]');
        ok("Quantités métrées affichées sous forme de bouton interactif", derivedQtyButtons.length >= 2, `Trouvé ${derivedQtyButtons.length} boutons`);

        // Ajouter 2 lignes libres pour valider la saisie et la navigation sur QTÉ
        const addResult = await page.evaluate(() => {
            const btns = [...document.querySelectorAll('button')].filter(b => 
                b.getAttribute('aria-label') === 'Ajouter une ligne libre' || 
                b.textContent.includes('Ajouter une ligne libre')
            );
            const visible = btns.filter(b => b.offsetParent !== null);
            if (visible.length > 0) {
                visible[0].click();
                return { total: btns.length, visible: visible.length, clicked: true };
            }
            return { total: btns.length, visible: 0, clicked: false };
        });
        console.log(`  ℹ️ Bouton ligne libre :`, addResult);
        await new Promise(r => setTimeout(r, 400));

        // Cliquer une deuxième fois pour avoir au moins 2 lignes avec QTÉ éditable
        await page.evaluate(() => {
            const btns = [...document.querySelectorAll('button')].filter(b => 
                (b.getAttribute('aria-label') === 'Ajouter une ligne libre' || b.textContent.includes('Ajouter une ligne libre')) &&
                b.offsetParent !== null
            );
            if (btns.length > 0) btns[0].click();
        });
        await new Promise(r => setTimeout(r, 400));

        const qtyInputs = await page.$$('[data-testid="quote-items-desktop"] input[data-col="qty"]');
        ok("Champs de saisie QTÉ générés pour les lignes libres", qtyInputs.length >= 2, `Trouvé ${qtyInputs.length} champs`);

        // Tester la navigation clavier sur la première ligne libre
        await qtyInputs[0].click();
        await new Promise(r => setTimeout(r, 150));
        let qtyFocused = await page.evaluate(() => {
            const el = document.activeElement;
            return el ? el.getAttribute('data-col') : null;
        });
        ok("Focus réussi sur champ QTÉ", qtyFocused === 'qty');

        // Appui sur Enter -> doit descendre au champ QTÉ suivant
        await page.keyboard.press('Enter');
        await new Promise(r => setTimeout(r, 150));
        let secondQtyFocused = await page.evaluate(() => {
            const el = document.activeElement;
            return el ? el.getAttribute('data-row') : null;
        });
        const firstQtyRow = await page.evaluate(el => el.getAttribute('data-row'), qtyInputs[0]);
        ok("Touche 'Enter' descend le focus sur le champ QTÉ suivant", secondQtyFocused !== null && secondQtyFocused !== firstQtyRow);

        // Screenshot navigation Excel-like
        await page.screenshot({ path: '/Users/mahamanehaidara/.gemini/antigravity/brain/17526a72-5101-4f14-93d7-24f6608087d9/sprint2_excel_navigation.png' });

        // 4. Fil d'Ariane Métier CCTP dans l'Inspecteur d'Ouvrage
        const clickedInspector = await page.evaluate(() => {
            const desktopTable = document.querySelector('[data-testid="quote-items-desktop"]');
            const btn = desktopTable?.querySelector('button[title="Voir et modifier les détails techniques & métrés"]');
            if (btn) {
                btn.click();
                return true;
            }
            return false;
        });
        ok("Ouverture de l'inspecteur d'ouvrage", clickedInspector);
        await new Promise(r => setTimeout(r, 600));

        const breadcrumbInfo = await page.evaluate(() => {
            const inspector = document.querySelector("aside[aria-label=\"Inspecteur de l'ouvrage\"]");
            if (!inspector) return null;
            const text = inspector.textContent;
            const hasLot = text.includes('Lot 01') || text.includes('Gros Œuvre');
            const hasOuvrageIndex = text.includes('Ouvrage #') || text.includes('Ouvrage n°');
            return { hasLot, hasOuvrageIndex };
        });
        ok("Fil d'Ariane CCTP affiche le nom du lot", breadcrumbInfo?.hasLot);
        ok("Fil d'Ariane CCTP affiche le numéro d'ouvrage", breadcrumbInfo?.hasOuvrageIndex);

        // Screenshot fil d'ariane
        await page.screenshot({ path: '/Users/mahamanehaidara/.gemini/antigravity/brain/17526a72-5101-4f14-93d7-24f6608087d9/sprint2_inspector_breadcrumb.png' });

        // 5. Basculer en Mode Avancé pour vérifier les Mini-KPIs financiers figés
        const switchedToAdvanced = await page.evaluate(() => {
            const btns = [...document.querySelectorAll('button')];
            const advBtn = btns.find(b => b.textContent.includes('Avancé'));
            if (advBtn) {
                advBtn.click();
                return true;
            }
            return false;
        });
        ok("Basculement en Mode Avancé (Sous-ouvrages)", switchedToAdvanced);
        await new Promise(r => setTimeout(r, 400));

        const miniKpis = await page.evaluate(() => {
            const kpiBar = document.querySelector('[data-testid="inspector-mini-kpis"]');
            if (!kpiBar) return null;
            const text = kpiBar.textContent;
            const hasDS = text.includes('Déboursé Sec');
            const hasPV = text.includes('Vente HT');
            const hasMarge = text.includes('Marge');
            return { exists: true, hasDS, hasPV, hasMarge, text };
        });
        ok("Bandeau de mini-KPIs financiers figé présent en Mode Avancé", miniKpis?.exists);
        ok("Mini-KPI Déboursé Sec (DS) présent", miniKpis?.hasDS);
        ok("Mini-KPI Vente HT présent", miniKpis?.hasPV);
        ok("Mini-KPI Marge Réelle (€ et %) présent", miniKpis?.hasMarge);

        // Screenshot mini-KPIs
        await page.screenshot({ path: '/Users/mahamanehaidara/.gemini/antigravity/brain/17526a72-5101-4f14-93d7-24f6608087d9/sprint2_inspector_mini_kpis.png' });

    } catch (err) {
        console.error("Erreur durant le test :", err);
        failed++;
    } finally {
        await close();
    }

    console.log(`\n--------------------------------------------`);
    console.log(`RÉSULTATS SPRINT 2 : ${passed} passés, ${failed} échoués`);
    console.log(`--------------------------------------------\n`);
    process.exit(failed > 0 ? 1 : 0);
})();
