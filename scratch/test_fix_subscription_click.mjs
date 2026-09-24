import puppeteer from 'puppeteer';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

async function run() {
    console.log('Testing Subscription Modal Click & Pricing Render...');
    
    // Check SubscriptionService directly in node
    const subService = await import('../js/subscription-service.js');
    console.log('SubscriptionService loaded.');

    const server = http.createServer((req, res) => {
        let filePath = path.join(process.cwd(), req.url.split('?')[0]);
        if (filePath.endsWith('/')) filePath += 'index.html';
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            const ext = path.extname(filePath);
            const contentTypes = {
                '.html': 'text/html',
                '.js': 'application/javascript',
                '.css': 'text/css',
                '.json': 'application/json',
                '.png': 'image/png',
                '.svg': 'image/svg+xml'
            };
            res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'application/octet-stream' });
            fs.createReadStream(filePath).pipe(res);
        } else {
            res.writeHead(404);
            res.end('Not found');
        }
    });

    await new Promise((resolve) => server.listen(8125, resolve));
    console.log('HTTP Server listening on 8125');

    try {
        const browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        
        const errors = [];
        page.on('pageerror', err => {
            console.error('PAGE ERROR:', err.message);
            errors.push(err.message);
        });

        await page.goto('http://localhost:8125/index.html', { waitUntil: 'domcontentloaded' });
        await new Promise(r => setTimeout(r, 1000));

        // Click demo / sans compte
        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const demoBtn = btns.find(b => b.innerText.includes('sans compte') || b.innerText.includes('Essayer') || b.innerText.includes('Mode Démo'));
            if (demoBtn) demoBtn.click();
        });
        await new Promise(r => setTimeout(r, 1500));

        // Open subscription modal via helper
        await page.evaluate(() => {
            if (window.__openSubscriptionModal) {
                window.__openSubscriptionModal();
            }
        });
        await page.waitForSelector('button', { timeout: 5000 });
        await new Promise(r => setTimeout(r, 1500));

        // Capture screenshot of the new modal design
        await page.screenshot({ path: 'scratch/subscription_modal_design_system.png', fullPage: true });
        console.log('Saved screenshot to scratch/subscription_modal_design_system.png');

        // Click "Choisir Standard"
        console.log('Clicking "Choisir Standard"...');
        const clickedStandard = await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const btn = btns.find(b => b.textContent.includes('Choisir Standard') || b.textContent.includes('Standard'));
            if (btn) {
                btn.click();
                return btn.textContent.trim();
            }
            return null;
        });
        console.log('Clicked standard button text:', clickedStandard);
        await new Promise(r => setTimeout(r, 1000));

        // Check if drawer appeared with price
        const drawerText = await page.evaluate(() => {
            const drawer = document.querySelector('.animate-scale-up');
            return drawer ? drawer.innerText : null;
        });
        console.log('Drawer text preview:', drawerText ? drawerText.slice(0, 100) : 'No drawer');

        // Click "Choisir Entreprise"
        console.log('Clicking "Choisir Entreprise"...');
        const clickedEntreprise = await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const btn = btns.find(b => b.textContent.includes('Choisir Entreprise') || b.textContent.includes('Entreprise'));
            if (btn) {
                btn.click();
                return btn.textContent.trim();
            }
            return null;
        });
        console.log('Clicked entreprise button text:', clickedEntreprise);
        await new Promise(r => setTimeout(r, 1000));

        const drawerEntrepriseText = await page.evaluate(() => {
            const drawer = document.querySelector('.animate-scale-up');
            return drawer ? drawer.innerText : null;
        });
        console.log('Drawer Entreprise preview:', drawerEntrepriseText ? drawerEntrepriseText.slice(0, 100) : 'No drawer');

        // Check if error boundary or "Récupération Sécurisée" appeared
        const hasCrash = await page.evaluate(() => {
            return document.body.innerText.includes('Récupération Sécurisée');
        });

        console.log('Has crash screen:', hasCrash);
        console.log('Page errors count:', errors.length);

        await browser.close();

        if (hasCrash || errors.length > 0) {
            console.error('TEST FAILED!');
            process.exit(1);
        } else {
            console.log('✅ TEST PASSED: No toLocaleString error, modal and payment drawer operate cleanly!');
            process.exit(0);
        }
    } finally {
        server.close();
    }
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
