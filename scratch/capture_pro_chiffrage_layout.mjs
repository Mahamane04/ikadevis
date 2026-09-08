import { launchApp, enterGuestMode } from './lib/harness.mjs';
import path from 'path';

(async () => {
    const { page, close } = await launchApp();
    try {
        await page.setViewport({ width: 1440, height: 900 });
        // Entrée en mode démo pour avoir un chiffrage garni
        await enterGuestMode(page, { demo: true });
        await new Promise(r => setTimeout(r, 1500));

        // 1. Capture avec bandeau de brouillon / exemple
        await page.screenshot({ path: '/Users/mahamanehaidara/.gemini/antigravity/brain/17526a72-5101-4f14-93d7-24f6608087d9/pro_chiffrage_compact_header.png' });

        // Ouvrir l'inspecteur pour voir l'espace gagné sur les deux colonnes (tableau + inspecteur)
        await page.evaluate(() => {
            const btn = document.querySelector('tbody tr button[title*="Paramètres"], tbody tr button:has(i.fa-sliders)');
            if (btn) btn.click();
        });
        await new Promise(r => setTimeout(r, 800));

        await page.screenshot({ path: '/Users/mahamanehaidara/.gemini/antigravity/brain/17526a72-5101-4f14-93d7-24f6608087d9/pro_chiffrage_inspector_high_density.png' });
        console.log('Screenshots captured successfully');
    } finally {
        await close();
    }
})();
