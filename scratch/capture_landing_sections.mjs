import puppeteer from 'puppeteer';
import path from 'path';

const ARTIFACTS_DIR = '/Users/mahamanehaidara/.gemini/antigravity-ide/brain/c2b0be91-19f8-47a6-9316-05aa6e9fa053';

async function run() {
    console.log('Capturing sectional high-res screenshots...');
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1440, height: 1080, deviceScaleFactor: 2 });

        await page.goto('http://localhost:8100/landing.html', { waitUntil: 'networkidle2' });
        await new Promise(r => setTimeout(r, 1200));

        // 1. Hero + Barre métiers
        await page.evaluate(() => window.scrollTo(0, 0));
        await new Promise(r => setTimeout(r, 300));
        await page.screenshot({
            path: path.join(ARTIFACTS_DIR, '01_landing_hero_1440.png'),
            clip: { x: 0, y: 0, width: 1440, height: 980 }
        });
        console.log('Saved 01_landing_hero_1440.png');

        // 2. Rentabilité + Balance + Workflow
        const pos2 = await page.evaluate(() => {
            const el = document.querySelector('#solutions');
            return el ? el.offsetTop : 980;
        });
        await page.evaluate((y) => window.scrollTo(0, y), pos2);
        await new Promise(r => setTimeout(r, 400));
        await page.screenshot({
            path: path.join(ARTIFACTS_DIR, '02_landing_rentabilite_workflow.png'),
            clip: { x: 0, y: pos2, width: 1440, height: 1550 }
        });
        console.log('Saved 02_landing_rentabilite_workflow.png');

        // 3. Dashboard Central & 3 Colonnes comparatives
        const pos3 = await page.evaluate(() => {
            const el = document.querySelectorAll('section')[3];
            return el ? el.offsetTop : 2500;
        });
        await page.evaluate((y) => window.scrollTo(0, y), pos3);
        await new Promise(r => setTimeout(r, 400));
        await page.screenshot({
            path: path.join(ARTIFACTS_DIR, '03_landing_dashboard_comparatif.png'),
            clip: { x: 0, y: pos3, width: 1440, height: 1850 }
        });
        console.log('Saved 03_landing_dashboard_comparatif.png');

        // 4. Métiers & Pricing
        const pos4 = await page.evaluate(() => {
            const el = document.querySelector('#metiers');
            return el ? el.offsetTop : 4350;
        });
        await page.evaluate((y) => window.scrollTo(0, y), pos4);
        await new Promise(r => setTimeout(r, 400));
        await page.screenshot({
            path: path.join(ARTIFACTS_DIR, '04_landing_metiers_pricing.png'),
            clip: { x: 0, y: pos4, width: 1440, height: 1650 }
        });
        console.log('Saved 04_landing_metiers_pricing.png');

        // 5. Preuves, FAQ, CTA final & Footer
        const pos5 = await page.evaluate(() => {
            const el = document.querySelector('#faq');
            return el ? el.offsetTop - 300 : 6000;
        });
        await page.evaluate((y) => window.scrollTo(0, y), pos5);
        await new Promise(r => setTimeout(r, 400));
        await page.screenshot({
            path: path.join(ARTIFACTS_DIR, '05_landing_faq_cta_footer.png'),
            clip: { x: 0, y: pos5, width: 1440, height: 1800 }
        });
        console.log('Saved 05_landing_faq_cta_footer.png');

    } catch (e) {
        console.error('Error during capture:', e);
    } finally {
        await browser.close();
    }
}

run();
