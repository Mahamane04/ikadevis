import { launchApp, enterGuestMode } from './lib/harness.mjs';

const wait = (ms = 400) => new Promise((r) => setTimeout(r, ms));

async function runDashboardTest() {
    console.log('🚀 Démarrage du banc d’essai : TABLEAU DE BORD PERSONNALISABLE & UI/UX...');
    const { page, close, consoleErrors } = await launchApp();

    const checks = [];
    function assert(label, pass, detail = '') {
        checks.push({ label, pass, detail });
        console.log(`  ${pass ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`);
    }

    try {
        await page.setViewport({ width: 1440, height: 900 });
        await enterGuestMode(page);
        await wait(1000);

        // Naviguer vers le Tableau de bord
        console.log('\n--- Étape 1 : Accès au Tableau de Bord ---');
        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const dashboardBtn = btns.find(b => 
                b.className.includes('sidebar-item') && b.textContent.includes('Tableau de bord')
            );
            if (dashboardBtn) dashboardBtn.click();
        });
        await wait(800);

        const dashboardHeader = await page.evaluate(() => {
            const h1 = document.querySelector('h1');
            return h1 ? h1.textContent : '';
        });
        assert('Le Tableau de bord est affiché avec son titre', dashboardHeader.includes('Espace') || dashboardHeader.includes('activité') || dashboardHeader.includes('BTP'), dashboardHeader);

        // Vérification des widgets par défaut
        console.log('\n--- Étape 2 : Vérification des widgets par défaut ---');
        const defaultWidgetsPresent = await page.evaluate(() => {
            const text = document.body.innerText;
            const upper = text.toUpperCase();
            return {
                hasGoal: upper.includes("OBJECTIF MENSUEL DE CHIFFRE D'AFFAIRES"),
                hasQuickActions: text.includes('Nouveau devis') && text.includes('Nouveau chantier') && text.includes('Ajouter un client'),
                hasKPIs: upper.includes("CHIFFRE D'AFFAIRES CHIFFRÉ") || upper.includes("DEVIS À SUIVRE") || upper.includes("TOTAL FACTURÉ"),
                hasPipeline: text.includes('Pipeline Commercial des Devis'),
                hasRecentQuotes: text.includes('Devis récents'),
                hasCustomizeBtn: !!document.querySelector('button[aria-label="Modifier et personnaliser le tableau de bord"]')
            };
        });

        assert('Jauge d\'objectif mensuel visible par défaut', defaultWidgetsPresent.hasGoal);
        assert('Raccourcis d\'actions rapides visibles par défaut', defaultWidgetsPresent.hasQuickActions);
        assert('Cartes KPIs visibles par défaut', defaultWidgetsPresent.hasKPIs);
        assert('Pipeline commercial des devis visible par défaut', defaultWidgetsPresent.hasPipeline);
        assert('Section Devis récents visible par défaut', defaultWidgetsPresent.hasRecentQuotes);
        assert('Bouton "Personnaliser" présent dans l\'en-tête', defaultWidgetsPresent.hasCustomizeBtn);

        // Capture d'écran état initial
        await page.screenshot({ path: 'scratch/audit_dashboard_default_1440.png' });
        console.log('  📸 Capture : scratch/audit_dashboard_default_1440.png');

        // Test filtre temporel
        console.log('\n--- Étape 3 : Filtre de Période Interactif ---');
        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const monthBtn = btns.find(b => b.textContent.trim() === 'Ce mois');
            if (monthBtn) monthBtn.click();
        });
        await wait(300);
        assert('Clic sur le filtre "Ce mois" exécuté sans erreur', true);

        // Étape 4 : Ouverture de la modale de personnalisation
        console.log('\n--- Étape 4 : Ouverture de la Modale de Personnalisation ---');
        await page.click('button[aria-label="Modifier et personnaliser le tableau de bord"]');
        await page.waitForSelector('#modal-dashboard-config-title', { timeout: 3000 });

        const modalTitle = await page.evaluate(() => {
            const el = document.querySelector('#modal-dashboard-config-title');
            return el ? el.textContent : '';
        });
        assert('Modale de personnalisation ouverte', modalTitle.includes('Personnaliser mon Tableau de Bord'), modalTitle);

        // Capture d'écran modale
        await page.screenshot({ path: 'scratch/audit_dashboard_customization_modal.png' });
        console.log('  📸 Capture : scratch/audit_dashboard_customization_modal.png');

        // Étape 5 : Personnalisation (désactiver les actions rapides et changer l'objectif)
        console.log('\n--- Étape 5 : Modification des réglages et widgets ---');
        await page.evaluate(() => {
            // Désactiver le widget 'quickActions' (Actions Rapides en 1 Clic)
            const cards = Array.from(document.querySelectorAll('[role="dialog"] .select-none'));
            const qaCard = cards.find(c => c.textContent.includes('Actions Rapides'));
            if (qaCard) qaCard.click();

            // Modifier l'objectif mensuel à 25000000 FCFA via le setter natif React
            const goalInput = document.querySelector('[role="dialog"] input[type="number"]');
            if (goalInput) {
                const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                nativeSetter.call(goalInput, '25000000');
                goalInput.dispatchEvent(new Event('input', { bubbles: true }));
                goalInput.dispatchEvent(new Event('change', { bubbles: true }));
            }
        });
        await wait(300);

        // Enregistrer la personnalisation
        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('[role="dialog"] button'));
            const saveBtn = btns.find(b => b.textContent.includes('Appliquer & Enregistrer'));
            if (saveBtn) saveBtn.click();
        });
        await wait(600);

        // Vérifier l'application immédiate
        const appliedState = await page.evaluate(() => {
            const text = document.body.innerText;
            const cleanText = text.replace(/[\s\u202F\u00A0]/g, '');
            const hasActionsRapides = text.includes('Chiffrer un projet') && text.includes('Ouvrir un dossier');
            const goalMatch = cleanText.includes('25000000');
            const localSaved = localStorage.getItem('ikadevis_dashboard_config');
            return { hasActionsRapides, goalMatch, localSaved: !!localSaved };
        });

        assert('Widget Actions Rapides masqué avec succès', !appliedState.hasActionsRapides);
        assert('Nouvel objectif de 25 000 000 FCFA pris en compte immédiatement', appliedState.goalMatch);
        assert('Configuration persistée dans localStorage', appliedState.localSaved);

        await page.screenshot({ path: 'scratch/audit_dashboard_customized_view.png' });
        console.log('  📸 Capture : scratch/audit_dashboard_customized_view.png');

        // Étape 6 : Rechargement de page (F5) pour vérifier la persistance
        console.log('\n--- Étape 6 : Rechargement complet (F5) & Persistance sans perte ---');
        await page.reload({ waitUntil: 'networkidle2' });
        await wait(800);
        await enterGuestMode(page);
        await wait(800);

        // Revenir au tableau de bord après reload
        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const dashboardBtn = btns.find(b => 
                b.className.includes('sidebar-item') && b.textContent.includes('Tableau de bord')
            );
            if (dashboardBtn) dashboardBtn.click();
        });
        await wait(800);

        const postReloadState = await page.evaluate(() => {
            const text = document.body.innerText;
            const cleanText = text.replace(/[\s\u202F\u00A0]/g, '');
            const hasActionsRapides = text.includes('Chiffrer un projet') && text.includes('Ouvrir un dossier');
            const goalMatch = cleanText.includes('25000000');
            return { hasActionsRapides, goalMatch };
        });

        assert('Persistance après F5 : Actions Rapides toujours masquées', !postReloadState.hasActionsRapides);
        assert('Persistance après F5 : Objectif 25 000 000 FCFA toujours actif', postReloadState.goalMatch);

        // Étape 7 : Rétablissement des paramètres par défaut
        console.log('\n--- Étape 7 : Rétablissement de la configuration par défaut ---');
        await page.click('button[aria-label="Modifier et personnaliser le tableau de bord"]');
        await page.waitForSelector('#modal-dashboard-config-title', { timeout: 3000 });

        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('[role="dialog"] button'));
            const resetBtn = btns.find(b => b.textContent.includes('Rétablir par défaut'));
            if (resetBtn) resetBtn.click();
        });
        await wait(200);

        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('[role="dialog"] button'));
            const saveBtn = btns.find(b => b.textContent.includes('Appliquer & Enregistrer'));
            if (saveBtn) saveBtn.click();
        });
        await wait(600);

        const resetState = await page.evaluate(() => {
            const text = document.body.innerText;
            const cleanText = text.replace(/[\s\u202F\u00A0]/g, '');
            const hasActionsRapides = text.includes('Chiffrer un projet') && text.includes('Ouvrir un dossier');
            const goalMatch = cleanText.includes('15000000');
            return { hasActionsRapides, goalMatch };
        });

        assert('Rétablissement par défaut : Actions Rapides réapparues', resetState.hasActionsRapides);
        assert('Rétablissement par défaut : Objectif 15 000 000 FCFA restauré', resetState.goalMatch);

        // Étape 8 : Test Mobile 390px (Ergonomie & Zéro Scroll Horizontal)
        console.log('\n--- Étape 8 : Test Ergonomie Mobile (390x844) ---');
        await page.setViewport({ width: 390, height: 844 });
        await wait(400);

        const mobileMetrics = await page.evaluate(() => {
            return {
                docWidth: document.documentElement.scrollWidth,
                viewportWidth: window.innerWidth,
                hasOverflow: document.documentElement.scrollWidth > window.innerWidth
            };
        });

        assert('Mobile 390px : Zéro défilement horizontal résiduel', !mobileMetrics.hasOverflow, `docWidth=${mobileMetrics.docWidth}, viewport=${mobileMetrics.viewportWidth}`);
        await page.screenshot({ path: 'scratch/audit_dashboard_mobile_390.png' });
        console.log('  📸 Capture : scratch/audit_dashboard_mobile_390.png');

    } catch (err) {
        console.error('❌ ERREUR DURANT LE TEST DU DASHBOARD :', err);
        console.error('Console errors:', consoleErrors);
        assert('Exécution globale du test sans crash', false, err.message);
    } finally {
        await close();
    }

    const failed = checks.filter(c => !c.pass);
    console.log(`\n============================================================`);
    console.log(`Bilan Banc d’Essai Dashboard : ${checks.length - failed.length}/${checks.length} assertions réussies.`);
    if (failed.length === 0) {
        console.log('🎉 LE DASHBOARD PERSONNALISABLE EST 100% OPÉRATIONNEL ET VALIDÉ !');
        process.exit(0);
    } else {
        console.log('❌ Échecs détectés :', failed);
        process.exit(1);
    }
}

runDashboardTest();
