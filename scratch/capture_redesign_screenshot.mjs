import { launchApp, enterGuestMode } from './lib/harness.mjs';

const wait = (ms = 400) => new Promise((r) => setTimeout(r, ms));

export async function run() {
    const { page, close } = await launchApp();
    try {
        await page.setViewport({ width: 1440, height: 900 });
        await enterGuestMode(page, { demo: true });
        await wait(1500);

        // Ouvrir le premier ouvrage dans l'inspecteur pour reproduire exactement l'état de la capture de l'utilisateur
        await page.evaluate(() => {
            const inspectBtns = document.querySelectorAll('[data-testid="quote-items-desktop"] button[title^="Voir et modifier"]');
            if (inspectBtns[0]) inspectBtns[0].click();
        });
        await wait(800);

        // Ouvrir le sélecteur direct de lot dans l'inspecteur pour montrer le menu déroulant
        await page.evaluate(() => {
            const dropdownBtn = document.querySelector('aside[aria-label="Inspecteur de l\'ouvrage"] [data-testid="lot-selector-dropdown-btn"]');
            if (dropdownBtn) dropdownBtn.click();
        });
        await wait(500);

        // Capturer l'écran complet
        const screenshotPath = '/Users/mahamanehaidara/.gemini/antigravity-ide/brain/c2b0be91-19f8-47a6-9316-05aa6e9fa053/chiffrage_redesign_pro.png';
        await page.screenshot({ path: screenshotPath });
        console.log('Capture enregistrée dans:', screenshotPath);
    } finally {
        await close();
    }
}

run().catch(console.error);
