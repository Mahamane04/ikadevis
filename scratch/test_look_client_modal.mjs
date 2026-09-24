import puppeteer from 'puppeteer';
import path from 'path';

const ARTIFACTS_DIR = '/Users/mahamanehaidara/.gemini/antigravity-ide/brain/c2b0be91-19f8-47a6-9316-05aa6e9fa053';

async function run() {
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });

        await page.goto('http://localhost:8100/index.html', { waitUntil: 'networkidle2' });
        await new Promise(r => setTimeout(r, 1000));

        // Click demo / sans compte
        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const demoBtn = btns.find(b => b.innerText.includes('sans compte') || b.innerText.includes('Essayer'));
            if (demoBtn) demoBtn.click();
        });
        await new Promise(r => setTimeout(r, 1500));

        // Open bottom burger menu
        await page.evaluate(() => {
            const btn = document.querySelector('button[title="Recommandations de menu burger"]');
            if (btn) btn.click();
        });
        await new Promise(r => setTimeout(r, 600));

        // Click Modèles & Look
        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const lookBtn = btns.find(b => b.innerText.includes('Modèles & Look'));
            if (lookBtn) lookBtn.click();
        });
        await new Promise(r => setTimeout(r, 800));

        // Click "Modifier" on the Standard model
        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const modBtn = btns.find(b => b.innerText.trim() === 'Modifier');
            if (modBtn) modBtn.click();
        });
        await new Promise(r => setTimeout(r, 1000));

        await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'verif_model_editor_full.png') });
        console.log('Saved verif_model_editor_full.png');

        // Look for the client & project selection banner/button in the model editor
        const clientSelector = await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const clientBtn = btns.find(b => b.innerText.includes('Client') || b.title?.includes('client'));
            return clientBtn ? clientBtn.innerText.trim() : null;
        });
        console.log('Client button in model editor:', clientSelector);

    } catch (e) {
        console.error('Error during test:', e);
    } finally {
        await browser.close();
    }
}

run();
