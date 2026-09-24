import puppeteer from 'puppeteer';
import path from 'path';

const ARTIFACTS_DIR = '/Users/mahamanehaidara/.gemini/antigravity-ide/brain/c2b0be91-19f8-47a6-9316-05aa6e9fa053';

async function run() {
    console.log('Capturing Landing Page at 1440px desktop...');
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });

        // Go to landing page served locally on port 8100
        await page.goto('http://localhost:8100/landing.html', { waitUntil: 'networkidle2' });
        await new Promise(r => setTimeout(r, 1500));

        // 1. Capture Hero at 1440x900
        await page.screenshot({
            path: path.join(ARTIFACTS_DIR, 'landing_hero_1440.png'),
            fullPage: false
        });
        console.log('Saved landing_hero_1440.png');

        // 2. Capture FULL PAGE vertical (1440px wide)
        await page.screenshot({
            path: path.join(ARTIFACTS_DIR, 'ikadevis_landing_page_full_1440.png'),
            fullPage: true
        });
        console.log('Saved ikadevis_landing_page_full_1440.png');

        // Check if all major sections exist
        const sections = await page.evaluate(() => {
            return {
                title: document.title,
                hasHeader: !!document.querySelector('header'),
                hasHero: !!document.querySelector('h1'),
                hasTrades: !!document.querySelector('#metiers'),
                hasPricing: !!document.querySelector('#tarifs'),
                hasFaq: !!document.querySelector('#faq'),
                hasFooter: !!document.querySelector('footer'),
                logoSvgExists: !!document.querySelector('header svg')
            };
        });
        console.log('Sections verified:', sections);

    } catch (e) {
        console.error('Error during capture:', e);
    } finally {
        await browser.close();
    }
}

run();
