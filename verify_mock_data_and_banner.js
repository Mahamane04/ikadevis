const puppeteer = require("puppeteer");

(async () => {
    let passed = 0, failed = 0;
    const ok = (label, cond, detail = '') => {
        if (cond) { console.log(`  ✅ ${label}`); passed++; }
        else { console.error(`  ❌ ${label}${detail ? ' — ' + detail : ''}`); failed++; }
    };

    const browser = await puppeteer.launch({
        executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        headless: true
    });

    const page = await browser.newPage();
    const path = "file://" + process.cwd() + "/index.html";
    console.log("\n=== VERIFICATION MOCK DATA & BUDGET CALCUL ÉQUILIBRÉ ===");

    await page.goto(path, { waitUntil: "networkidle0" });
    await new Promise(r => setTimeout(r, 1000));

    const mockDataTest = await page.evaluate(() => {
        window.localStorage.clear();
        return true;
    });

    await page.reload({ waitUntil: "networkidle0" });
    await new Promise(r => setTimeout(r, 1000));

    const pageText = await page.evaluate(() => document.body.innerText);

    const hasCoherentBudget = pageText.includes('COÛT CONSUMMÉ') && pageText.includes('BUDGET D\'ACHAT');
    ok("Interface Calculateur chargée avec Coût Consommé & Budget d'Achat", hasCoherentBudget);

    ok("Panneau avec cadre métallique et autocollant présent", pageText.includes('Panneau avec cadre métallique et autocollant'));

    await page.close();
    await browser.close();

    console.log(`\n>>> RÉSULTAT : ${passed} PASSED ✅ / ${failed} FAILED ❌ <<<`);
    if (failed > 0) process.exit(1);
})();
