import { launchApp, enterGuestMode } from './lib/harness.mjs';
import path from 'node:path';

const wait = (ms = 400) => new Promise((r) => setTimeout(r, ms));
const ARTIFACT_DIR = '/Users/mahamanehaidara/.gemini/antigravity-ide/brain/c2b0be91-19f8-47a6-9316-05aa6e9fa053';

async function testMobile() {
    const { page, close } = await launchApp();
    try {
        await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
        await enterGuestMode(page, { demo: true });
        await wait(1500);

        await page.screenshot({ path: path.join(ARTIFACT_DIR, 'audit_mobile_editor.png') });
        console.log('📸 Capture mobile éditeur enregistrée.');

        // Ouvrir l'inspecteur mobile d'un ouvrage
        await page.evaluate(() => {
            const editBtn = document.querySelector('[data-testid^="quote-item-mobile-"] button, .quote-item-card button, button[aria-label*="Inspecteur"], button[title*="Inspecteur"]');
            if (editBtn) editBtn.click();
        });
        await wait(800);

        await page.screenshot({ path: path.join(ARTIFACT_DIR, 'audit_mobile_inspector.png') });
        console.log('📸 Capture mobile inspecteur enregistrée.');

        // Ouvrir la bibliothèque d'ouvrages sur mobile
        await page.evaluate(() => {
            const closeInspector = document.querySelector('button[aria-label*="Fermer"]');
            if (closeInspector) closeInspector.click();
        });
        await wait(400);

        await page.evaluate(() => {
            const catBtn = document.querySelector('button[title*="Catalogue"], button[aria-label*="Catalogue"], .fab-add');
            if (catBtn) catBtn.click();
        });
        await wait(600);

        await page.screenshot({ path: path.join(ARTIFACT_DIR, 'audit_mobile_picker.png') });
        console.log('📸 Capture mobile bibliothèque enregistrée.');

    } finally {
        await close();
    }
}

testMobile().catch(console.error);
