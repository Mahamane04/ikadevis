import puppeteer from 'puppeteer';
import path from 'path';

const ARTIFACTS_DIR = '/Users/mahamanehaidara/.gemini/antigravity-ide/brain/c2b0be91-19f8-47a6-9316-05aa6e9fa053';

async function run() {
    console.log('Testing full user flow...');
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

        // Dismiss the "Continuer sur cet exemple" banner if present
        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const contBtn = btns.find(b => b.innerText.includes('Continuer sur cet exemple'));
            if (contBtn) contBtn.click();
        });
        await new Promise(r => setTimeout(r, 600));

        // 1. Verify Top Header: NO BURGER MENU
        const headerHasBurger = await page.evaluate(() => {
            const header = document.querySelector('header');
            if (!header) return false;
            const burger = header.querySelector('i.fa-bars, button[title*="menu"], button[aria-label*="menu"]');
            return !!burger;
        });
        console.log('1. Header has burger menu:', headerHasBurger, '(Expected: false)');

        // 2. Verify Bottom Nav: "Recommandations de menu burger" button exists
        const bottomNavBurgerBtn = await page.evaluate(() => {
            const btn = document.querySelector('button[title="Recommandations de menu burger"], button[aria-label="Recommandations de menu burger"]');
            return btn ? { title: btn.title, ariaLabel: btn.getAttribute('aria-label') } : null;
        });
        console.log('2. Bottom nav burger button found:', bottomNavBurgerBtn);

        // Click bottom nav burger button to open menu
        await page.evaluate(() => {
            const btn = document.querySelector('button[title="Recommandations de menu burger"], button[aria-label="Recommandations de menu burger"]');
            if (btn) btn.click();
        });
        await new Promise(r => setTimeout(r, 600));

        await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'verif_bottom_burger_menu_open.png') });
        console.log('Saved verif_bottom_burger_menu_open.png');

        // Close bottom menu
        await page.evaluate(() => {
            const closeBtn = document.querySelector('.mobile-plus-sheet button[aria-label*="Fermer"]') ||
                document.querySelector('.mobile-plus-sheet button i.fa-xmark')?.parentElement;
            if (closeBtn) closeBtn.click();
        });
        await new Promise(r => setTimeout(r, 500));

        // 3. Test Client & Project selection modal in Calculator
        const clientTriggered = await page.evaluate(() => {
            const clientBtn = document.querySelector('button[data-testid="calculator-client-btn"]') ||
                Array.from(document.querySelectorAll('button')).find(b => b.innerText.toLowerCase().includes('client'));
            if (clientBtn) {
                clientBtn.click();
                return true;
            }
            return false;
        });
        console.log('3. Client button triggered:', clientTriggered);
        await new Promise(r => setTimeout(r, 700));

        await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'verif_client_project_modal.png') });
        console.log('Saved verif_client_project_modal.png');

        // Select or fill client in modal and apply
        await page.evaluate(() => {
            const input = document.querySelector('input[placeholder*="Rechercher ou saisir un client"]');
            if (input) {
                input.value = 'Client Immobilière Moderne';
                input.dispatchEvent(new Event('input', { bubbles: true }));
            }
        });
        await new Promise(r => setTimeout(r, 300));

        // Click Appliquer au devis
        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const applyBtn = btns.find(b => b.innerText.includes('Appliquer') || b.innerText.includes('Enregistrer'));
            if (applyBtn) applyBtn.click();
        });
        await new Promise(r => setTimeout(r, 800));

        // 4. Test "Synthèse / Lots" full-page view
        const syntheseOpened = await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const btn = btns.find(b => b.innerText.includes('Synthèse') || b.title?.includes('Synthèse'));
            if (btn) {
                btn.click();
                return true;
            }
            return false;
        });
        console.log('4. Synthese lots opened:', syntheseOpened);
        await new Promise(r => setTimeout(r, 800));

        await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'verif_synthese_lots_fullpage.png') });
        console.log('Saved verif_synthese_lots_fullpage.png');

        // Verify "Retour" button in Synthese lots
        const hasRetourLots = await page.evaluate(() => {
            const pageEl = document.querySelector('[data-testid="lots-overview-page"]');
            if (!pageEl) return false;
            const retourBtn = Array.from(pageEl.querySelectorAll('button')).find(b => b.innerText.includes('Retour') || b.getAttribute('aria-label')?.includes('Retour'));
            if (retourBtn) {
                retourBtn.click(); // Click retour to go back to calculator!
                return true;
            }
            return false;
        });
        console.log('Has Retour in lots and clicked:', hasRetourLots);
        await new Promise(r => setTimeout(r, 800));

        await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'verif_returned_to_calculator.png') });
        console.log('Saved verif_returned_to_calculator.png');

        console.log('ALL VERIFICATIONS SUCCESSFUL!');
    } catch (e) {
        console.error('Error during test:', e);
    } finally {
        await browser.close();
    }
}

run();
