import { launchApp, enterGuestMode } from './lib/harness.mjs';

const wait = (ms = 400) => new Promise((r) => setTimeout(r, ms));

async function main() {
    const { page, close } = await launchApp();
    try {
        await page.setViewport({ width: 1440, height: 900 });
        await enterGuestMode(page, { demo: true });
        await wait(1200);

        // Ouvrir l'inspecteur du premier ouvrage
        await page.evaluate(() => {
            const rows = document.querySelectorAll('[data-testid="quote-items-desktop"] tbody tr');
            if (rows.length > 0) {
                const btn = rows[0].querySelector('button[title*="détails"], button[aria-label*="Détails"]');
                if (btn) btn.click();
            }
        });
        await wait(800);

        // Capture à 1440px montrant le tableau rétréci sans scroll horizontal + inspecteur
        await page.screenshot({ path: 'scratch/verif_req1_desktop_narrow_1440.png', fullPage: false });
        console.log('Capture 1440px réussie : scratch/verif_req1_desktop_narrow_1440.png');

    } finally {
        await close();
    }
}

main();
