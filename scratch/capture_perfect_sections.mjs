import puppeteer from 'puppeteer';
import path from 'path';

const ARTIFACTS_DIR = '/Users/mahamanehaidara/.gemini/antigravity-ide/brain/c2b0be91-19f8-47a6-9316-05aa6e9fa053';

async function run() {
    console.log('Capturing complete, flawless sectional screenshots...');
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1440, height: 1080, deviceScaleFactor: 2 });
        await page.goto('http://localhost:8100/landing.html', { waitUntil: 'networkidle2' });
        await new Promise(r => setTimeout(r, 1200));

        // Part 1: Header + Hero + Barre métiers (0 to 935)
        await page.screenshot({
            path: path.join(ARTIFACTS_DIR, '01_landing_hero_1440.png'),
            clip: { x: 0, y: 0, width: 1440, height: 935 }
        });
        console.log('Saved 01_landing_hero_1440.png');

        // Part 2: Rentabilité & Balance + Workflow (933 to 2772 -> height 1840)
        await page.screenshot({
            path: path.join(ARTIFACTS_DIR, '02_landing_rentabilite_workflow.png'),
            clip: { x: 0, y: 933, width: 1440, height: 1840 }
        });
        console.log('Saved 02_landing_rentabilite_workflow.png');

        // Part 3: Dashboard Central 360° (2772 to 3980 -> height 1210)
        await page.screenshot({
            path: path.join(ARTIFACTS_DIR, '03_landing_dashboard_360.png'),
            clip: { x: 0, y: 2772, width: 1440, height: 1210 }
        });
        console.log('Saved 03_landing_dashboard_360.png');

        // Part 4: 3 Colonnes comparatives (3980 to 5663 -> height 1685)
        await page.screenshot({
            path: path.join(ARTIFACTS_DIR, '04_landing_comparatif.png'),
            clip: { x: 0, y: 3980, width: 1440, height: 1685 }
        });
        console.log('Saved 04_landing_comparatif.png');

        // Part 5: Métiers BTP (10 cartes) + Grille Tarifs (4 offres) (5663 to 7713 -> height 2050)
        await page.screenshot({
            path: path.join(ARTIFACTS_DIR, '05_landing_metiers_et_tarifs.png'),
            clip: { x: 0, y: 5663, width: 1440, height: 2050 }
        });
        console.log('Saved 05_landing_metiers_et_tarifs.png');

        // Part 6: Preuves du terrain + FAQ Accordion + CTA final + Footer (7713 to 10290 -> height 2577)
        await page.screenshot({
            path: path.join(ARTIFACTS_DIR, '06_landing_faq_cta_footer.png'),
            clip: { x: 0, y: 7713, width: 1440, height: 2577 }
        });
        console.log('Saved 06_landing_faq_cta_footer.png');

        // Perfect unrepeated full-page screenshot: disable sticky position on header temporarily for fullPage capture
        await page.evaluate(() => {
            const h = document.querySelector('header');
            if (h) h.style.position = 'relative';
        });
        await page.screenshot({
            path: path.join(ARTIFACTS_DIR, 'ikadevis_landing_page_full_1440.png'),
            fullPage: true
        });
        console.log('Saved ikadevis_landing_page_full_1440.png');

    } catch (e) {
        console.error('Error during capture:', e);
    } finally {
        await browser.close();
    }
}

run();
