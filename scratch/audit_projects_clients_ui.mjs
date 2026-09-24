import { launchApp, enterGuestMode } from './lib/harness.mjs';
import path from 'path';

const ARTIFACT_DIR = '/Users/mahamanehaidara/.gemini/antigravity-ide/brain/c2b0be91-19f8-47a6-9316-05aa6e9fa053';
const wait = (ms = 500) => new Promise((r) => setTimeout(r, ms));

async function audit() {
    const { page, close } = await launchApp();
    try {
        await page.setViewport({ width: 1440, height: 900 });
        await enterGuestMode(page, { demo: true });
        await wait(1500);

        // Switch to Projects (Chantiers)
        console.log('Navigating to Chantiers...');
        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button, a'));
            const prjBtn = btns.find(b => b.textContent.includes('Chantiers'));
            if (prjBtn) prjBtn.click();
        });
        await wait(1000);
        await page.screenshot({ path: path.join(ARTIFACT_DIR, 'audit_projects_desktop_1440.png') });
        console.log('✓ audit_projects_desktop_1440.png captured');

        // Select first project
        await page.evaluate(() => {
            const firstPrj = document.querySelector('button[aria-label*="Sélectionner le chantier"]');
            if (firstPrj) firstPrj.click();
        });
        await wait(600);
        await page.screenshot({ path: path.join(ARTIFACT_DIR, 'audit_projects_selected_desktop_1440.png') });
        console.log('✓ audit_projects_selected_desktop_1440.png captured');

        // Open New Project Modal
        await page.evaluate(() => {
            const newBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Nouveau Chantier'));
            if (newBtn) newBtn.click();
        });
        await wait(600);
        await page.screenshot({ path: path.join(ARTIFACT_DIR, 'audit_projects_modal_1440.png') });
        console.log('✓ audit_projects_modal_1440.png captured');

        // Close Modal
        await page.evaluate(() => {
            const closeBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Annuler') || b.querySelector('.fa-xmark'));
            if (closeBtn) closeBtn.click();
        });
        await wait(600);

        // Switch to Clients
        console.log('Navigating to Clients...');
        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button, a'));
            const cliBtn = btns.find(b => b.textContent.includes('Clients'));
            if (cliBtn) cliBtn.click();
        });
        await wait(1000);
        await page.screenshot({ path: path.join(ARTIFACT_DIR, 'audit_clients_desktop_1440.png') });
        console.log('✓ audit_clients_desktop_1440.png captured');

        // Select first client
        await page.evaluate(() => {
            const firstCli = document.querySelector('button[aria-label*="Sélectionner"]');
            if (firstCli) firstCli.click();
        });
        await wait(600);
        await page.screenshot({ path: path.join(ARTIFACT_DIR, 'audit_clients_selected_desktop_1440.png') });
        console.log('✓ audit_clients_selected_desktop_1440.png captured');

        // Open New Client Modal
        await page.evaluate(() => {
            const newBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Nouveau Client'));
            if (newBtn) newBtn.click();
        });
        await wait(600);
        await page.screenshot({ path: path.join(ARTIFACT_DIR, 'audit_clients_modal_1440.png') });
        console.log('✓ audit_clients_modal_1440.png captured');

        // Close Modal
        await page.evaluate(() => {
            const closeBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Annuler') || b.querySelector('.fa-xmark'));
            if (closeBtn) closeBtn.click();
        });
        await wait(600);

        // Test Mobile 390px
        console.log('Testing mobile viewports (390px)...');
        await page.setViewport({ width: 390, height: 844 });
        await wait(600);
        await page.screenshot({ path: path.join(ARTIFACT_DIR, 'audit_clients_mobile_390.png') });
        console.log('✓ audit_clients_mobile_390.png captured');

        // Switch to Projects on mobile
        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button, a'));
            const prjBtn = btns.find(b => b.textContent.includes('Chantiers'));
            if (prjBtn) prjBtn.click();
        });
        await wait(600);
        await page.screenshot({ path: path.join(ARTIFACT_DIR, 'audit_projects_mobile_390.png') });
        console.log('✓ audit_projects_mobile_390.png captured');

        console.log('Audit completed successfully!');
    } finally {
        await close();
    }
}

audit().catch(console.error);
