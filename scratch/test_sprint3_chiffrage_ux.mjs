import puppeteer from 'puppeteer';
import { launchApp, enterGuestMode } from './lib/harness.mjs';

(async () => {
    let passed = 0, failed = 0;
    const ok = (label, cond, detail = '') => {
        if (cond) { console.log(`  ✅ ${label}${detail ? ' — ' + detail : ''}`); passed++; }
        else { console.error(`  ❌ ${label}${detail ? ' — ' + detail : ''}`); failed++; }
    };

    console.log('\n=== VALIDATION AUTOMATISÉE — SPRINT 3 UX CHIFFRAGE BTP (MÉTRÉS VISUELS 2D SVG) ===\n');

    const { page, close } = await launchApp();
    try {
        await page.setViewport({ width: 1440, height: 900 });
        // Charger le devis d'exemple complet
        await enterGuestMode(page, { demo: true });
        await new Promise(r => setTimeout(r, 1200));

        // 1. Sélectionner un ouvrage pour ouvrir l'inspecteur
        const openInspectorResult = await page.evaluate(() => {
            const rows = document.querySelectorAll('[data-testid="quote-items-desktop"] tbody tr');
            if (rows.length > 0) {
                // Cliquer sur le bouton d'édition ou le bouton de quantité métrée
                const editBtn = rows[0].querySelector('button[title*="détails techniques"], button[aria-label*="Détails techniques"], button[title*="Quantité issue du métré"]');
                if (editBtn) {
                    editBtn.click();
                    return { clicked: 'editBtn' };
                }
                const anyBtn = rows[0].querySelector('button');
                if (anyBtn) {
                    anyBtn.click();
                    return { clicked: 'anyBtn' };
                }
                rows[0].click();
                return { clicked: 'row' };
            }
            return { clicked: null };
        });
        console.log("  ℹ️ Ouverture inspecteur :", openInspectorResult);
        await new Promise(r => setTimeout(r, 500));

        // Basculer en Mode Avancé si nécessaire
        await page.evaluate(() => {
            const advBtn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Avancé'));
            if (advBtn) advBtn.click();
        });
        await new Promise(r => setTimeout(r, 300));

        // Activer l'onglet 'dimensions' ("1. Métré & Dimensions")
        await page.evaluate(() => {
            const dimTab = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Métré') || b.textContent.includes('Dimensions'));
            if (dimTab) dimTab.click();
        });
        await new Promise(r => setTimeout(r, 300));

        // 2. Vérification de la présence du composant MetreVisualizer2D
        const visualizer = await page.$('[data-testid="metre-visualizer-2d"]');
        ok("Composant MetreVisualizer2D présent dans l'onglet Métré", !!visualizer);

        const svgElement = await page.$('[data-testid="metre-visualizer-svg"]');
        ok("Élément SVG coté interactif présent", !!svgElement);

        // 3. Test du Mode Volume (2.5D axonométrique actif par défaut sur l'ouvrage 1)
        const isVolumeRendered = await page.evaluate(() => {
            const el = document.querySelector('[data-testid="metre-mode-volume"]');
            return !!el;
        });
        ok("Projection 2.5D active en mode volume", isVolumeRendered);

        // Vérifier les cotes initiales (14m × 20m × 0.60m = 168m³)
        let visualizerText = await page.evaluate(() => {
            const el = document.querySelector('[data-testid="metre-visualizer-2d"]');
            return el ? el.textContent : '';
        });
        ok("Cotes initiales affichées (14m, 20m, 0.60m)", visualizerText.includes('14.00') && visualizerText.includes('20.00') && visualizerText.includes('0.60'));
        ok("Volume initial calculé (168.000 m³)", visualizerText.includes('168.000') || visualizerText.includes('168 m³'));

        // 4. Modifier en direct Largeur = 10, Hauteur = 5, Épaisseur = 0.50
        await page.evaluate(() => {
            const setReactInput = (inp, val) => {
                const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                setter.call(inp, val);
                inp.dispatchEvent(new Event('input', { bubbles: true }));
                inp.dispatchEvent(new Event('change', { bubbles: true }));
            };

            const inputs = document.querySelectorAll('aside input[type="number"]');
            inputs.forEach(inp => {
                const label = inp.closest('div')?.querySelector('label');
                if (label && label.textContent.includes('Largeur')) {
                    setReactInput(inp, '10');
                }
                if (label && label.textContent.includes('Hauteur')) {
                    setReactInput(inp, '5');
                }
                if (label && (label.textContent.includes('Épaisseur') || label.textContent.includes('Profondeur'))) {
                    setReactInput(inp, '0.50');
                }
            });
        });
        await new Promise(r => setTimeout(r, 600));

        // Vérifier les nouvelles valeurs dans le visualiseur
        visualizerText = await page.evaluate(() => {
            const el = document.querySelector('[data-testid="metre-visualizer-2d"]');
            return el ? el.textContent : '';
        });
        console.log("  ℹ️ Contenu après mise à jour :", visualizerText.slice(0, 150));

        ok("Cote Largeur 10 m visible dans le schéma", visualizerText.includes('10.00') || visualizerText.includes('10 m'));
        ok("Cote Hauteur 5 m visible dans le schéma", visualizerText.includes('5.00') || visualizerText.includes('5 m'));
        ok("Cote Épaisseur 0.50 m visible dans le schéma", visualizerText.includes('0.50') || visualizerText.includes('0.5 m'));
        ok("Nouveau volume calculé (25.000 m³)", visualizerText.includes('25.000') || visualizerText.includes('25 m³'));

        // 5. Tester l'alerte sur dimension nulle (Épaisseur = 0)
        await page.evaluate(() => {
            const setReactInput = (inp, val) => {
                const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                setter.call(inp, val);
                inp.dispatchEvent(new Event('input', { bubbles: true }));
                inp.dispatchEvent(new Event('change', { bubbles: true }));
            };

            const inputs = document.querySelectorAll('aside input[type="number"]');
            inputs.forEach(inp => {
                const label = inp.closest('div')?.querySelector('label');
                if (label && (label.textContent.includes('Épaisseur') || label.textContent.includes('Profondeur'))) {
                    setReactInput(inp, '0');
                }
            });
        });
        await new Promise(r => setTimeout(r, 500));

        const alertShown = await page.evaluate(() => {
            const alert = document.querySelector('[data-testid="metre-warning-alert"]');
            return alert ? alert.textContent : null;
        });
        ok("Garde-fou visuel actif si épaisseur nulle en mode volume", !!alertShown, alertShown || '');

        // Remettre une épaisseur valide (0.50 m)
        await page.evaluate(() => {
            const setReactInput = (inp, val) => {
                const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                setter.call(inp, val);
                inp.dispatchEvent(new Event('input', { bubbles: true }));
                inp.dispatchEvent(new Event('change', { bubbles: true }));
            };

            const inputs = document.querySelectorAll('aside input[type="number"]');
            inputs.forEach(inp => {
                const label = inp.closest('div')?.querySelector('label');
                if (label && (label.textContent.includes('Épaisseur') || label.textContent.includes('Profondeur'))) {
                    setReactInput(inp, '0.50');
                }
            });
        });
        await new Promise(r => setTimeout(r, 500));

        // 6. Test du bouton de bascule Thème Blueprint / Papier Millimétré
        const blueprintToggle = await page.$('[data-testid="toggle-blueprint-theme"]');
        ok("Bouton de bascule thème Blueprint CAD présent", !!blueprintToggle);
        if (blueprintToggle) {
            await blueprintToggle.click();
            await new Promise(r => setTimeout(r, 250));
            const isDarkBlueprint = await page.evaluate(() => {
                const card = document.querySelector('[data-testid="metre-visualizer-2d"]');
                return card ? (card.classList.contains('theme-blueprint') || card.innerHTML.includes('bg-slate-900') || card.innerHTML.includes('bg-neutral-900')) : false;
            });
            ok("Bascule vers le mode Blueprint CAD sombre effective", isDarkBlueprint);
        }

        // 7. Test de l'affichage en mode Surface (Lot 02 ou 03)
        // Fermer l'inspecteur
        await page.evaluate(() => {
            const closeBtn = document.querySelector('aside button[aria-label*="Retour"]');
            if (closeBtn) closeBtn.click();
        });
        await new Promise(r => setTimeout(r, 400));

        // Sélectionner le Lot 02
        await page.evaluate(() => {
            const lotBtns = [...document.querySelectorAll('[role="button"], button')].filter(b => b.textContent.includes('Lot 02') || b.textContent.includes('Cloisonnements') || b.textContent.includes('02'));
            if (lotBtns.length > 0) lotBtns[0].click();
        });
        await new Promise(r => setTimeout(r, 600));

        // Ouvrir l'inspecteur sur l'ouvrage du Lot 02 (mode surface)
        await page.evaluate(() => {
            const rows = document.querySelectorAll('[data-testid="quote-items-desktop"] tbody tr');
            if (rows.length > 0) {
                const editBtn = rows[0].querySelector('button[title*="détails techniques"], button[aria-label*="Détails techniques"], button[title*="Quantité issue du métré"]');
                if (editBtn) editBtn.click();
            }
        });
        await new Promise(r => setTimeout(r, 500));

        // Basculer en Mode Avancé
        await page.evaluate(() => {
            const advBtn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Avancé'));
            if (advBtn) advBtn.click();
        });
        await new Promise(r => setTimeout(r, 300));

        // Onglet dimensions
        await page.evaluate(() => {
            const dimTab = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Métré') || b.textContent.includes('Dimensions'));
            if (dimTab) dimTab.click();
        });
        await new Promise(r => setTimeout(r, 300));

        const isSurfaceRendered = await page.evaluate(() => {
            const el = document.querySelector('[data-testid="metre-mode-surface"]');
            return !!el;
        });
        ok("Rendu du schéma en mode surface directe actif", isSurfaceRendered);

        // Capture d'écran finale pour le walkthrough
        await page.screenshot({ path: '/Users/mahamanehaidara/.gemini/antigravity/brain/17526a72-5101-4f14-93d7-24f6608087d9/sprint3_metre_visualizer_desktop.png' });

        console.log(`\n📊 RÉSULTAT SPRINT 3 : ${passed} réussis, ${failed} échoués.\n`);
    } catch (err) {
        console.error("Erreur durant l'exécution du test :", err);
        failed++;
    } finally {
        await close();
    }
    process.exit(failed > 0 ? 1 : 0);
})();
