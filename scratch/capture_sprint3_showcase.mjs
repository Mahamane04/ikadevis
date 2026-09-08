import { launchApp, enterGuestMode } from './lib/harness.mjs';

(async () => {
    const { page, close } = await launchApp();
    try {
        await page.setViewport({ width: 1440, height: 900 });
        await enterGuestMode(page, { demo: true });
        await new Promise(r => setTimeout(r, 1200));

        // Ouvrir l'inspecteur sur l'ouvrage 1 (Lot 1 - Fouilles / Béton, mode volume)
        await page.evaluate(() => {
            const rows = document.querySelectorAll('[data-testid="quote-items-desktop"] tbody tr');
            if (rows.length > 0) {
                const editBtn = rows[0].querySelector('button[title*="détails techniques"], button[aria-label*="Détails techniques"], button[title*="Quantité issue du métré"]');
                if (editBtn) editBtn.click();
            }
        });
        await new Promise(r => setTimeout(r, 500));

        // Mode avancé et onglet dimensions
        await page.evaluate(() => {
            const advBtn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Avancé'));
            if (advBtn) advBtn.click();
            const dimTab = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Métré') || b.textContent.includes('Dimensions'));
            if (dimTab) dimTab.click();
        });
        await new Promise(r => setTimeout(r, 400));

        // 1. Thème Blueprint sur Volume 2.5D
        const blueprintToggle = await page.$('[data-testid="toggle-blueprint-theme"]');
        if (blueprintToggle) await blueprintToggle.click();
        await new Promise(r => setTimeout(r, 300));
        await page.screenshot({ path: '/Users/mahamanehaidara/.gemini/antigravity/brain/17526a72-5101-4f14-93d7-24f6608087d9/sprint3_metre_volume_blueprint.png' });

        // 2. Garde-fou / Alerte d'épaisseur nulle
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
        await new Promise(r => setTimeout(r, 400));
        await page.screenshot({ path: '/Users/mahamanehaidara/.gemini/antigravity/brain/17526a72-5101-4f14-93d7-24f6608087d9/sprint3_metre_volume_alert.png' });

        // 3. Vue Mobile (390x844)
        await page.setViewport({ width: 390, height: 844 });
        await new Promise(r => setTimeout(r, 400));
        await page.screenshot({ path: '/Users/mahamanehaidara/.gemini/antigravity/brain/17526a72-5101-4f14-93d7-24f6608087d9/sprint3_metre_mobile.png' });

        console.log("✅ Captures d'écran du Sprint 3 enregistrées !");
    } finally {
        await close();
    }
})();
