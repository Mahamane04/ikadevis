import { launchApp, enterGuestMode } from './lib/harness.mjs';
import path from 'node:path';

const wait = (ms = 400) => new Promise((r) => setTimeout(r, ms));
const ARTIFACT_DIR = '/Users/mahamanehaidara/.gemini/antigravity-ide/brain/c2b0be91-19f8-47a6-9316-05aa6e9fa053';

async function testMobileLot() {
    const { page, close } = await launchApp();
    try {
        await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
        await enterGuestMode(page, { demo: true });
        await wait(1500);

        // Cliquer sur le Lot 1
        await page.evaluate(() => {
            const lotCard = document.querySelector('[data-testid^="lot-card-"], button:has(.fa-chevron-right), div:has(> .fa-chevron-right)');
            const firstLot = [...document.querySelectorAll('div, button')].find(el => el.textContent.includes('Lot 01 — Terrassement'));
            if (firstLot) firstLot.click();
        });
        await wait(800);

        await page.screenshot({ path: path.join(ARTIFACT_DIR, 'audit_mobile_inside_lot.png') });
        console.log('📸 Capture mobile intérieur lot enregistrée.');

        // Ouvrir le catalogue depuis l'intérieur du lot
        await page.evaluate(() => {
            const catBtn = document.querySelector('button[title*="Catalogue"], button[aria-label*="Catalogue"], button:has(i.fa-book)');
            const anyCat = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Catalogue') && !b.closest('nav'));
            if (anyCat) anyCat.click();
        });
        await wait(800);

        await page.screenshot({ path: path.join(ARTIFACT_DIR, 'audit_mobile_workitem_picker.png') });
        console.log('📸 Capture mobile modal picker enregistrée.');

    } finally {
        await close();
    }
}

testMobileLot().catch(console.error);
