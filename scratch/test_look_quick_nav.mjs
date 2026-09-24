import puppeteer from 'puppeteer';

async function run() {
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    await page.goto('http://localhost:8099', { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 1000));

    // Si page de connexion, cliquer sur mode démo
    const guestBtn = await page.evaluate(() => {
        const btn = [...document.querySelectorAll('button')].find(b => /invité|démo|essayer/i.test(b.textContent));
        if (btn) { btn.click(); return true; }
        return false;
    });
    if (guestBtn) await new Promise(r => setTimeout(r, 1500));

    // Capture vue d'accueil / chiffrage
    await page.screenshot({ path: 'scratch/screenshot_quick_nav_initial.png', fullPage: false });
    console.log('Capture initiale enregistrée dans scratch/screenshot_quick_nav_initial.png');

    // Cliquer sur le bouton "Catalogue" de la nouvelle barre rapide
    const clickedCatalogue = await page.evaluate(() => {
        const btn = [...document.querySelectorAll('.workspace-quick-nav button')].find(b => /catalogue/i.test(b.textContent));
        if (btn) { btn.click(); return true; }
        return false;
    });
    console.log('Clic sur Catalogue :', clickedCatalogue);
    await new Promise(r => setTimeout(r, 600));
    await page.screenshot({ path: 'scratch/screenshot_quick_nav_catalogue.png', fullPage: false });

    // Cliquer sur "Mes devis"
    const clickedDevis = await page.evaluate(() => {
        const btn = [...document.querySelectorAll('.workspace-quick-nav button')].find(b => /devis/i.test(b.textContent));
        if (btn) { btn.click(); return true; }
        return false;
    });
    console.log('Clic sur Mes devis :', clickedDevis);
    await new Promise(r => setTimeout(r, 600));
    await page.screenshot({ path: 'scratch/screenshot_quick_nav_devis.png', fullPage: false });

    // Récupérer le texte du badge de temps ms
    const badgeText = await page.evaluate(() => {
        const badge = document.querySelector('.workspace-quick-nav [title*="Temps de chargement"]');
        return badge ? badge.textContent.trim() : null;
    });
    console.log('Badge temps de chargement mesuré :', badgeText);

    await browser.close();
}

run().catch(console.error);
