import puppeteer from 'puppeteer';
import { launchApp, enterGuestMode } from './lib/harness.mjs';

(async () => {
    let passed = 0, failed = 0;
    const ok = (label, cond, detail = '') => {
        if (cond) { console.log(`  ✅ ${label}${detail ? ' — ' + detail : ''}`); passed++; }
        else { console.error(`  ❌ ${label}${detail ? ' — ' + detail : ''}`); failed++; }
    };

    console.log('\n=== VALIDATION AUTOMATISÉE — SPRINT 1 UX CHIFFRAGE BTP ===\n');

    const { page, close } = await launchApp();
    try {
        await page.setViewport({ width: 1440, height: 900 });
        // Entrer avec demo: true pour charger le devis d'exemple complet avec son bandeau
        await enterGuestMode(page, { demo: true });
        await new Promise(r => setTimeout(r, 1200));

        // 1. Vérification du bandeau d'onboarding déplié
        const foldBtn = await page.$('button[title*="Replier le bandeau d\'aide"]');
        ok("Bouton de repliement du bandeau d'exemple présent", foldBtn !== null);

        // Mesurer la hauteur avant repli
        const heightBefore = await page.evaluate(() => {
            const el = document.querySelector('div[role="status"]');
            return el ? el.getBoundingClientRect().height : 0;
        });
        console.log(`  ℹ️ Hauteur initiale du bandeau : ${Math.round(heightBefore)}px`);

        // Cliquer sur le bouton pour replier le bandeau
        if (foldBtn) {
            await foldBtn.click();
            await new Promise(r => setTimeout(r, 400));
        }

        // Mesurer la hauteur après repli
        const heightAfter = await page.evaluate(() => {
            const el = document.querySelector('div[role="status"]');
            return el ? el.getBoundingClientRect().height : 0;
        });
        console.log(`  ℹ️ Hauteur après repliement : ${Math.round(heightAfter)}px`);
        ok("Le bandeau s'est replié en format compact", heightAfter > 0 && heightAfter < heightBefore);
        ok("Gain d'espace vertical significatif (≥ 40px)", (heightBefore - heightAfter) >= 40, `Gain mesuré: ${Math.round(heightBefore - heightAfter)}px`);

        // 2. Vérifier la présence du bouton de dépliement
        const unfoldBtn = await page.evaluate(() => {
            const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes("Déplier l'aide"));
            return !!btn;
        });
        ok("Bouton « Déplier l'aide » présent en mode compact", unfoldBtn);

        // 3. Vérifier les boutons d'effacement Client & Projet
        const clientInput = 'input[aria-label="Client du devis"]';
        await page.click(clientInput);
        await page.type(clientInput, 'Client Test Tap', { delay: 10 });
        await new Promise(r => setTimeout(r, 200));

        const clearBtnDims = await page.evaluate(() => {
            const btn = document.querySelector('button[aria-label="Effacer le client"]');
            if (!btn) return null;
            const rect = btn.getBoundingClientRect();
            return { w: rect.width, h: rect.height };
        });
        ok("Bouton d'effacement du client avec zone tactile élargie (≥ 24px)", clearBtnDims && clearBtnDims.w >= 24 && clearBtnDims.h >= 24, `${clearBtnDims?.w}x${clearBtnDims?.h}px`);

        // 4. Ouvrir l'inspecteur sur le premier article du tableau desktop pour tester l'ancrage visuel
        const clickedInspector = await page.evaluate(() => {
            const desktopTable = document.querySelector('[data-testid="quote-items-desktop"]');
            const btn = desktopTable?.querySelector('button[title="Voir et modifier les détails techniques & métrés"]');
            if (btn) {
                btn.click();
                return true;
            }
            return false;
        });
        ok("Clic sur l'inspecteur de l'article desktop réussi", clickedInspector);
        await new Promise(r => setTimeout(r, 600));

        const activeRowHighlighted = await page.evaluate(() => {
            const desktopTable = document.querySelector('[data-testid="quote-items-desktop"]');
            const rows = desktopTable ? desktopTable.querySelectorAll('tbody tr') : [];
            if (rows.length === 0) return null;
            const firstRow = rows[0];
            const hasBorder = firstRow.className.includes('border-l-4') && firstRow.className.includes('border-l-brand-600');
            const hasBg = firstRow.className.includes('bg-brand-50');
            const hasBadge = firstRow.textContent.includes('Édition');
            return { hasBorder, hasBg, hasBadge };
        });

        ok("Ligne en cours d'édition surlignée avec bordure bleue de 4px", activeRowHighlighted?.hasBorder);
        ok("Fond teinté de confort appliqué à la ligne active", activeRowHighlighted?.hasBg);
        ok("Badge visuel « Édition » présent sur l'article actif", activeRowHighlighted?.hasBadge);

        // 5. Vérifier le badge compact Calculé
        const compactBadgePresent = await page.evaluate(() => {
            const badges = [...document.querySelectorAll('span')].filter(s => s.textContent.includes('Calculé') && s.querySelector('.fa-ruler-combined'));
            return badges.length > 0;
        });
        ok("Micro-badge « Calculé » présent avec icône géométrique", compactBadgePresent);

        // 6. Capturer les screenshots de validation
        const outDir = '/Users/mahamanehaidara/.gemini/antigravity/brain/17526a72-5101-4f14-93d7-24f6608087d9';
        await page.screenshot({ path: `${outDir}/sprint1_chiffrage_desktop_active.png`, fullPage: false });
        console.log(`  📸 Capture desktop enregistrée : ${outDir}/sprint1_chiffrage_desktop_active.png`);

        // Test vue tablette
        await page.setViewport({ width: 800, height: 1024, deviceScaleFactor: 2 });
        await new Promise(r => setTimeout(r, 400));
        await page.screenshot({ path: `${outDir}/sprint1_chiffrage_tablet_view.png`, fullPage: false });
        console.log(`  📸 Capture tablette enregistrée : ${outDir}/sprint1_chiffrage_tablet_view.png`);

        // Test vue mobile
        await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
        await new Promise(r => setTimeout(r, 400));
        await page.screenshot({ path: `${outDir}/sprint1_chiffrage_mobile_view.png`, fullPage: false });
        console.log(`  📸 Capture mobile enregistrée : ${outDir}/sprint1_chiffrage_mobile_view.png`);

    } finally {
        await close();
    }

    console.log(`\n>>> RÉSULTATS SPRINT 1 : ${passed} PASSED ✅ / ${failed} FAILED ❌ <<<\n`);
    if (failed > 0) process.exit(1);
})();
