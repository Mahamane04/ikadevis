import puppeteer from 'puppeteer';

async function run() {
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844 }); // iPhone 14 / standard mobile

    await page.goto('http://localhost:8099', { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 1000));

    // Mode démo
    const guestBtn = await page.evaluate(() => {
        const btn = [...document.querySelectorAll('button')].find(b => /invité|démo|essayer/i.test(b.textContent));
        if (btn) { btn.click(); return true; }
        return false;
    });
    if (guestBtn) await new Promise(r => setTimeout(r, 1500));

    await page.screenshot({ path: 'scratch/screenshot_quick_nav_mobile.png', fullPage: false });
    console.log('Capture mobile enregistrée dans scratch/screenshot_quick_nav_mobile.png');

    await browser.close();
}

run().catch(console.error);
