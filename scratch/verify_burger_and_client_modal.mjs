import puppeteer from 'puppeteer';
import path from 'path';

const ARTIFACTS_DIR = '/Users/mahamanehaidara/.gemini/antigravity-ide/brain/c2b0be91-19f8-47a6-9316-05aa6e9fa053';

async function main() {
    console.log('Launching Puppeteer...');
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
        await new Promise(r => setTimeout(r, 1500));

        // Dismiss the "Continuer sur cet exemple" banner if present
        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const contBtn = btns.find(b => b.innerText.includes('Continuer sur cet exemple'));
            if (contBtn) contBtn.click();
        });
        await new Promise(r => setTimeout(r, 500));

        // Now we are inside the calculator!
        await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'verify_calculator_open.png') });
        console.log('Saved verify_calculator_open.png');

        // Look for the client button in calculator header or bar
        const clientButtonInfo = await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const clientBtn = btns.find(b => 
                b.innerText.toLowerCase().includes('client') ||
                (b.title && b.title.toLowerCase().includes('client'))
            );
            if (clientBtn) {
                clientBtn.click();
                return { text: clientBtn.innerText.trim(), title: clientBtn.title };
            }
            return null;
        });
        console.log('Clicked client button in calculator:', clientButtonInfo);
        await new Promise(r => setTimeout(r, 800));

        // Screenshot of the Client & Project Modal!
        await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'verify_client_modal_open.png') });
        console.log('Saved verify_client_modal_open.png');

        // Check modal content
        const modalText = await page.evaluate(() => {
            const modal = document.querySelector('.fixed.inset-0.z-50, .fixed.inset-0.z-\\[60\\]');
            return modal ? modal.innerText : 'Modal not found';
        });
        console.log('Modal text preview:', modalText ? modalText.slice(0, 200) : 'none');

        // Now select a client inside the modal
        const selectedClient = await page.evaluate(() => {
            const clientItems = Array.from(document.querySelectorAll('button'));
            const item = clientItems.find(b => b.innerText.includes('SOCIETE') || b.innerText.includes('Client') || b.innerText.includes('SARL'));
            if (item) {
                item.click();
                return item.innerText.trim();
            }
            return null;
        });
        console.log('Selected client item:', selectedClient);
        await new Promise(r => setTimeout(r, 500));

        // Click "Appliquer au devis"
        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const applyBtn = btns.find(b => b.innerText.includes('Appliquer') || b.innerText.includes('Enregistrer') || b.innerText.includes('Valider'));
            if (applyBtn) applyBtn.click();
        });
        await new Promise(r => setTimeout(r, 600));

        await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'verify_client_applied.png') });
        console.log('Saved verify_client_applied.png');

        // Now navigate to the "Look & Finitions" or "Modèles & Look" tab/modal
        // From bottom menu "Recommandations de menu burger" -> "Modèles & Look"
        console.log('Opening menu burger recommendations...');
        await page.evaluate(() => {
            const btn = document.querySelector('button[title="Recommandations de menu burger"]');
            if (btn) btn.click();
        });
        await new Promise(r => setTimeout(r, 600));

        console.log('Clicking "Modèles & Look"...');
        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const lookBtn = btns.find(b => b.innerText.includes('Modèles & Look') || b.innerText.includes('Look'));
            if (lookBtn) lookBtn.click();
        });
        await new Promise(r => setTimeout(r, 800));

        await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'verify_look_view.png') });
        console.log('Saved verify_look_view.png');

    } catch (err) {
        console.error('Error during test:', err);
    } finally {
        await browser.close();
    }
}

main();
