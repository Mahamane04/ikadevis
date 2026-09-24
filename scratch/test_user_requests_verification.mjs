import puppeteer from 'puppeteer';

async function test() {
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        // --- 1. TEST DESKTOP (1440x900) ---
        console.log('--- TEST DESKTOP ---');
        const pageDesktop = await browser.newPage();
        await pageDesktop.setViewport({ width: 1440, height: 900 });
        await pageDesktop.goto('http://localhost:8099', { waitUntil: 'networkidle0' });
        await new Promise(r => setTimeout(r, 1000));

        // Passer l'écran invité si présent
        const guestClicked = await pageDesktop.evaluate(() => {
            const btn = [...document.querySelectorAll('button')].find(b => /invité|démo|essayer/i.test(b.textContent));
            if (btn) { btn.click(); return true; }
            return false;
        });
        if (guestClicked) await new Promise(r => setTimeout(r, 1500));

        // 1.1 Vérifier que workspace-quick-nav est bien masqué sur desktop
        const quickNavVisibleOnDesktop = await pageDesktop.evaluate(() => {
            const el = document.querySelector('.workspace-quick-nav');
            if (!el) return false;
            const style = window.getComputedStyle(el);
            return style.display !== 'none' && style.visibility !== 'hidden';
        });
        console.log('workspace-quick-nav visible sur desktop ?', quickNavVisibleOnDesktop, '(Attendu : FALSE)');

        // 1.2 Vérifier l'icône de dépenses dans la sidebar
        const depensesIconData = await pageDesktop.evaluate(() => {
            const depensesBtn = [...document.querySelectorAll('.sidebar-item')].find(b => /dépenses/i.test(b.textContent));
            if (!depensesBtn) return null;
            const img = depensesBtn.querySelector('img');
            const iconI = depensesBtn.querySelector('i');
            return {
                found: true,
                hasImg: !!img,
                imgSrc: img ? img.getAttribute('src') : null,
                imgClass: img ? img.className : null,
                hasI: !!iconI
            };
        });
        console.log('Données icône Dépenses sidebar desktop :', depensesIconData);

        // Capture écran desktop
        await pageDesktop.screenshot({ path: 'scratch/verif_desktop_single_menu.png', fullPage: false });
        console.log('Capture desktop enregistrée : scratch/verif_desktop_single_menu.png');
        await pageDesktop.close();

        // --- 2. TEST MOBILE (390x844 - iPhone) ---
        console.log('\n--- TEST MOBILE ---');
        const pageMobile = await browser.newPage();
        await pageMobile.setViewport({ width: 390, height: 844 });
        await pageMobile.goto('http://localhost:8099', { waitUntil: 'networkidle0' });
        await new Promise(r => setTimeout(r, 1000));

        const guestClickedMobile = await pageMobile.evaluate(() => {
            const btn = [...document.querySelectorAll('button')].find(b => /invité|démo|essayer/i.test(b.textContent));
            if (btn) { btn.click(); return true; }
            return false;
        });
        if (guestClickedMobile) await new Promise(r => setTimeout(r, 1500));

        // 2.1 Vérifier les icônes de la barre basse mobile
        const bottomNavIcons = await pageMobile.evaluate(() => {
            const nav = document.querySelector('.mobile-bottom-nav');
            if (!nav) return null;
            const buttons = [...nav.querySelectorAll('button')];
            return buttons.map(b => {
                const img = b.querySelector('img');
                const i = b.querySelector('i');
                return {
                    text: b.textContent.trim(),
                    hasImg: !!img,
                    src: img ? img.getAttribute('src') : null,
                    iconClass: i ? i.className : null
                };
            });
        });
        console.log('Icônes barre basse mobile :', JSON.stringify(bottomNavIcons, null, 2));

        // Capture mobile fermée
        await pageMobile.screenshot({ path: 'scratch/verif_mobile_bottom_nav.png', fullPage: false });
        console.log('Capture mobile enregistrée : scratch/verif_mobile_bottom_nav.png');

        // 2.2 Ouvrir le menu burger mobile
        const menuOpened = await pageMobile.evaluate(() => {
            const menuBtn = [...document.querySelectorAll('.mobile-bottom-nav button')].find(b => /menu/i.test(b.textContent));
            if (menuBtn) { menuBtn.click(); return true; }
            return false;
        });
        console.log('Menu burger ouvert :', menuOpened);
        await new Promise(r => setTimeout(r, 600));

        // Vérifier les icônes dans la feuille de menu plus
        const sheetIcons = await pageMobile.evaluate(() => {
            const sheet = document.querySelector('[aria-label="Recommandations de menu burger"]');
            if (!sheet) return null;
            const buttons = [...sheet.querySelectorAll('button')];
            return buttons.map(b => {
                const img = b.querySelector('img');
                return {
                    label: b.textContent.trim().replace(/\s+/g, ' '),
                    hasImg: !!img,
                    src: img ? img.getAttribute('src') : null
                };
            }).filter(item => item.label.length > 0 && item.label.length < 40);
        });
        console.log('Icônes feuille de menu burger mobile :', JSON.stringify(sheetIcons, null, 2));

        await pageMobile.screenshot({ path: 'scratch/verif_mobile_burger_sheet.png', fullPage: false });
        console.log('Capture mobile feuille de menu enregistrée : scratch/verif_mobile_burger_sheet.png');

        await pageMobile.close();

    } finally {
        await browser.close();
    }
}

test().catch(console.error);
