import { launchApp, enterGuestMode } from './lib/harness.mjs';
import path from 'path';

const ARTIFACT_DIR = '/Users/mahamanehaidara/.gemini/antigravity-ide/brain/c2b0be91-19f8-47a6-9316-05aa6e9fa053';
const wait = (ms = 500) => new Promise((r) => setTimeout(r, ms));

async function auditSettings() {
    console.log('🚀 Démarrage de l\'audit UI/UX complet de la page Paramètres...');
    const { page, browser, close } = await launchApp();

    try {
        await page.setViewport({ width: 1440, height: 900 });
        await enterGuestMode(page, { demo: true });
        await wait(1000);

        // Ouvrir les paramètres via le bouton dans la sidebar
        await page.evaluate(() => {
            const btn = document.querySelector('button[aria-label*="Paramètres"]') ||
                        Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Paramètres'));
            if (btn) btn.click();
        });
        await wait(1000);

        // 1. Desktop - Entreprise
        await page.screenshot({ path: path.join(ARTIFACT_DIR, 'settings_audit_desktop_entreprise.png') });
        console.log('✓ Capture Desktop: Entreprise');

        // 2. Desktop - Documents & PDF
        await page.evaluate(() => {
            const tabs = Array.from(document.querySelectorAll('aside[aria-label="Sections des paramètres"] button'));
            const docTab = tabs.find(t => t.textContent.includes('Documents'));
            if (docTab) docTab.click();
        });
        await wait(600);
        await page.screenshot({ path: path.join(ARTIFACT_DIR, 'settings_audit_desktop_documents.png') });
        console.log('✓ Capture Desktop: Documents & PDF');

        // 3. Desktop - Facturation & envoi
        await page.evaluate(() => {
            const tabs = Array.from(document.querySelectorAll('aside[aria-label="Sections des paramètres"] button'));
            const factTab = tabs.find(t => t.textContent.includes('Facturation'));
            if (factTab) factTab.click();
        });
        await wait(600);
        await page.screenshot({ path: path.join(ARTIFACT_DIR, 'settings_audit_desktop_facturation.png') });
        console.log('✓ Capture Desktop: Facturation & envoi');

        // 4. Desktop - Équipe (si disponible)
        const hasEquipe = await page.evaluate(() => {
            const tabs = Array.from(document.querySelectorAll('aside[aria-label="Sections des paramètres"] button'));
            const eqTab = tabs.find(t => t.textContent.includes('Équipe'));
            if (eqTab) { eqTab.click(); return true; }
            return false;
        });
        if (hasEquipe) {
            await wait(600);
            await page.screenshot({ path: path.join(ARTIFACT_DIR, 'settings_audit_desktop_equipe.png') });
            console.log('✓ Capture Desktop: Équipe');
        }

        // 5. Desktop - Diagnostic
        await page.evaluate(() => {
            const tabs = Array.from(document.querySelectorAll('aside[aria-label="Sections des paramètres"] button'));
            const diagTab = tabs.find(t => t.textContent.includes('Diagnostic'));
            if (diagTab) diagTab.click();
        });
        await wait(600);
        await page.screenshot({ path: path.join(ARTIFACT_DIR, 'settings_audit_desktop_diagnostic.png') });
        console.log('✓ Capture Desktop: Diagnostic');

        // 6. Desktop - Données locales
        await page.evaluate(() => {
            const tabs = Array.from(document.querySelectorAll('aside[aria-label="Sections des paramètres"] button'));
            const dataTab = tabs.find(t => t.textContent.includes('Données'));
            if (dataTab) dataTab.click();
        });
        await wait(600);
        await page.screenshot({ path: path.join(ARTIFACT_DIR, 'settings_audit_desktop_donnees.png') });
        console.log('✓ Capture Desktop: Données locales');

        // 7. Mobile Viewport (390 x 844)
        await page.setViewport({ width: 390, height: 844 });
        await wait(600);

        // Mobile - Entreprise
        await page.evaluate(() => {
            window.location.hash = '#settings/entreprise';
        });
        await wait(600);
        await page.screenshot({ path: path.join(ARTIFACT_DIR, 'settings_audit_mobile_entreprise.png') });
        console.log('✓ Capture Mobile: Entreprise');

        // Mobile - Facturation
        await page.evaluate(() => {
            window.location.hash = '#settings/facturation';
        });
        await wait(600);
        await page.screenshot({ path: path.join(ARTIFACT_DIR, 'settings_audit_mobile_facturation.png') });
        console.log('✓ Capture Mobile: Facturation');

        // Mobile - Documents
        await page.evaluate(() => {
            window.location.hash = '#settings/documents';
        });
        await wait(600);
        await page.screenshot({ path: path.join(ARTIFACT_DIR, 'settings_audit_mobile_documents.png') });
        console.log('✓ Capture Mobile: Documents');

        console.log('🎉 Audit captures complétées avec succès !');

    } finally {
        await close();
    }
}

auditSettings().catch(console.error);
