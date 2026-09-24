import { launchApp, enterGuestMode } from './lib/harness.mjs';

const wait = (ms = 500) => new Promise((r) => setTimeout(r, ms));

export async function run() {
    const { page, close } = await launchApp();
    try {
        await page.setViewport({ width: 1440, height: 900 });
        await enterGuestMode(page, { demo: true });
        await wait(1500);

        // 1. Aller sur "Mes devis"
        await page.evaluate(() => {
            const allBtns = Array.from(document.querySelectorAll('button'));
            const devisBtn = allBtns.find(b => b.textContent.includes('Mes devis'));
            if (devisBtn) devisBtn.click();
        });
        await wait(1000);

        // Capture de Mes devis (liste initiale)
        await page.screenshot({ path: '/Users/mahamanehaidara/.gemini/antigravity-ide/brain/c2b0be91-19f8-47a6-9316-05aa6e9fa053/current_devis_list.png' });
        console.log('Capture devis list enregistrée');

        // Sélectionner le premier devis pour afficher le panneau de détail à droite
        await page.evaluate(() => {
            const firstRow = document.querySelector('[data-testid="saved-quotes-list"] table tbody tr');
            if (firstRow) firstRow.click();
        });
        await wait(800);
        await page.screenshot({ path: '/Users/mahamanehaidara/.gemini/antigravity-ide/brain/c2b0be91-19f8-47a6-9316-05aa6e9fa053/current_devis_detail.png' });
        console.log('Capture devis detail enregistrée');

        // 2. Aller sur "Paramètres du compte"
        await page.evaluate(() => {
            const allBtns = Array.from(document.querySelectorAll('button'));
            const sBtn = allBtns.find(b => b.textContent.includes('Paramètres'));
            if (sBtn) sBtn.click();
        });
        await wait(1000);
        await page.screenshot({ path: '/Users/mahamanehaidara/.gemini/antigravity-ide/brain/c2b0be91-19f8-47a6-9316-05aa6e9fa053/current_settings_entreprise.png' });
        console.log('Capture settings entreprise enregistrée');

        // Cliquer sur l'onglet "Facturation & envoi"
        await page.evaluate(() => {
            const tabs = Array.from(document.querySelectorAll('aside[aria-label="Sections des paramètres"] button'));
            const factTab = tabs.find(t => t.textContent.includes('Facturation'));
            if (factTab) factTab.click();
        });
        await wait(600);
        await page.screenshot({ path: '/Users/mahamanehaidara/.gemini/antigravity-ide/brain/c2b0be91-19f8-47a6-9316-05aa6e9fa053/current_settings_facturation.png' });
        console.log('Capture settings facturation enregistrée');

        // Cliquer sur l'onglet "Documents & PDF"
        await page.evaluate(() => {
            const tabs = Array.from(document.querySelectorAll('aside[aria-label="Sections des paramètres"] button'));
            const docTab = tabs.find(t => t.textContent.includes('Documents'));
            if (docTab) docTab.click();
        });
        await wait(600);
        await page.screenshot({ path: '/Users/mahamanehaidara/.gemini/antigravity-ide/brain/c2b0be91-19f8-47a6-9316-05aa6e9fa053/current_settings_documents.png' });
        console.log('Capture settings documents enregistrée');

    } finally {
        await close();
    }
}

run().catch(console.error);
