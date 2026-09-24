import { launchApp, enterGuestMode } from './lib/harness.mjs';
import path from 'path';

const ARTIFACT_DIR = '/Users/mahamanehaidara/.gemini/antigravity-ide/brain/c2b0be91-19f8-47a6-9316-05aa6e9fa053';

async function test() {
    console.log('🚀 Checking sidebar active menu appearance...');
    const { page, browser, close } = await launchApp();

    try {
        await page.setViewport({ width: 1440, height: 900 });
        await enterGuestMode(page);

        // Click on "Chantiers" in sidebar
        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const chantiersBtn = btns.find(b => b.className.includes('sidebar-item') && b.textContent.includes('Chantiers'));
            if (chantiersBtn) chantiersBtn.click();
        });

        await new Promise(r => setTimeout(r, 800));

        // Take a screenshot of the sidebar area
        const sidebar = await page.$('aside, [role="navigation"]');
        if (sidebar) {
            await sidebar.screenshot({ path: path.join(ARTIFACT_DIR, 'verify_sidebar_chantiers_active.png') });
            console.log('✓ Captured verify_sidebar_chantiers_active.png');
        } else {
            await page.screenshot({ path: path.join(ARTIFACT_DIR, 'verify_sidebar_chantiers_active.png') });
            console.log('✓ Captured full page');
        }

        console.log('🎉 Verification done!');
    } finally {
        await close();
    }
}

test().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
