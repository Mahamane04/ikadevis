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

        // Dismiss banner
        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const contBtn = btns.find(b => b.innerText.includes('Continuer sur cet exemple'));
            if (contBtn) contBtn.click();
        });
        await new Promise(r => setTimeout(r, 500));

        // Click Aperçu PDF
        console.log('Clicking Aperçu PDF...');
        await page.evaluate(() => {
            const pdfBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Aperçu PDF'));
            if (pdfBtn) pdfBtn.click();
        });
        await new Promise(r => setTimeout(r, 1200));

        // Click "Modifier client / projet" inside the PDF modal
        console.log('Clicking "Modifier client / projet" in PDF modal...');
        const clickedEdit = await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const btn = btns.find(b => b.innerText.includes('Modifier client / projet'));
            if (btn) {
                btn.click();
                return true;
            }
            return false;
        });
        console.log('Clicked edit client in PDF:', clickedEdit);
        await new Promise(r => setTimeout(r, 800));

        await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'verify_client_picker_from_pdf.png') });
        console.log('Saved verify_client_picker_from_pdf.png');

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await browser.close();
    }
}

main();
