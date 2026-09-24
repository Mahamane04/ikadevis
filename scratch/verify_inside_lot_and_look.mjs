import puppeteer from 'puppeteer';
import path from 'path';

const ARTIFACTS_DIR = '/Users/mahamanehaidara/.gemini/antigravity-ide/brain/c2b0be91-19f8-47a6-9316-05aa6e9fa053';

async function main() {
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });

        await page.goto('http://localhost:8100/index.html', { waitUntil: 'networkidle2' });
        await new Promise(r => setTimeout(r, 1000));

        // Click "Essayer sans compte"
        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const demoBtn = btns.find(b => b.innerText.includes('sans compte') || b.innerText.includes('Essayer'));
            if (demoBtn) demoBtn.click();
        });
        await new Promise(r => setTimeout(r, 1000));

        // Dismiss the "Continuer sur cet exemple" banner
        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const contBtn = btns.find(b => b.innerText.includes('Continuer sur cet exemple'));
            if (contBtn) contBtn.click();
        });
        await new Promise(r => setTimeout(r, 500));

        // Click on "Lot 01" to enter inside a lot
        console.log('Entering Lot 01...');
        await page.evaluate(() => {
            const lotBtn = Array.from(document.querySelectorAll('button, div')).find(el => el.innerText && el.innerText.includes('Lot 01'));
            if (lotBtn) lotBtn.click();
        });
        await new Promise(r => setTimeout(r, 800));

        await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'verify_inside_lot.png') });
        console.log('Saved verify_inside_lot.png');

        // Click on "Aperçu PDF" or look settings
        console.log('Clicking Aperçu PDF...');
        await page.evaluate(() => {
            const pdfBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Aperçu PDF') || b.innerText.includes('PDF'));
            if (pdfBtn) pdfBtn.click();
        });
        await new Promise(r => setTimeout(r, 1200));

        await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'verify_pdf_look_modal.png') });
        console.log('Saved verify_pdf_look_modal.png');

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await browser.close();
    }
}

main();
