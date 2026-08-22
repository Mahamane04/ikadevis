// Banc d'essai V2 — listes documentaires, organisation et devise.
// Ces contrôles restent dans le navigateur comme un utilisateur réel : ils ne
// touchent ni Supabase ni les données de production.
import { pathToFileURL } from 'node:url';
import { launchApp, enterGuestMode } from './lib/harness.mjs';

const wait = (ms = 150) => new Promise(resolve => setTimeout(resolve, ms));

async function clickVisibleButton(page, predicate) {
    return page.evaluate((source) => {
        const matches = [...document.querySelectorAll('button')]
            .filter(button => button.textContent.includes(source));
        const visible = matches.find(button => {
            const rect = button.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
        });
        visible?.click();
        return Boolean(visible);
    }, predicate);
}

export async function run() {
    const results = [];
    const ok = (label, cond, detail = '') => results.push({ label, pass: !!cond, detail });
    const { page, close } = await launchApp();

    try {
        await page.setViewport({ width: 1280, height: 900 });
        await enterGuestMode(page);

        await clickVisibleButton(page, 'Devis Enregistrés');
        await page.waitForFunction(() => document.body.innerText.includes('Mes Devis Enregistrés'));
        ok('La liste des devis expose une recherche dédiée', await page.$('input[aria-label="Rechercher dans les devis"]') !== null);
        ok('La liste des devis expose un filtre de statut', await page.$('select[aria-label="Filtrer les devis par statut"]') !== null);
        ok('La liste des devis expose un tri', await page.$('select[aria-label="Trier les devis"]') !== null);
        const simpleQuoteRow = await page.evaluate(() => {
            const row = [...document.querySelectorAll('tbody tr')]
                .find(node => node.textContent.includes('Société Immobilière NBB'));
            return { text: row?.innerText || '', hasIcon: Boolean(row?.querySelector('i')) };
        });
        const simpleQuoteRowUpper = simpleQuoteRow.text.toUpperCase();
        ok('La liste des devis utilise une table Société/Projet/Devis/Date', ['SOCIÉTÉ IMMOBILIÈRE NBB', 'CONSTRUCTION SIÈGE NBB', 'DEV-2026-001', '22/08/'].every(value => simpleQuoteRowUpper.includes(value)));
        ok('Les lignes de devis sont dépourvues d’icônes et d’actions', !simpleQuoteRow.hasIcon);
        await page.click('tbody tr[role="button"]');
        await wait(180);
        const detailShown = await page.evaluate(() => document.body.innerText.includes('DEVIS COMMERCIAL') && document.body.innerText.includes('Construction Siège NBB'));
        ok('Un clic sur une ligne ouvre le détail à droite', detailShown);
        const detailActions = await page.$('button[aria-label="Modifier le devis DEV-2026-001"]') !== null
            && await page.$('button[aria-label="Créer une révision de DEV-2026-001"]') !== null
            && await page.$('button[aria-label="Dupliquer le devis DEV-2026-001"]') !== null
            && await page.$('button[aria-label="Supprimer le devis DEV-2026-001"]') !== null;
        ok('Les actions restent disponibles dans le détail', detailActions);

        await page.type('input[aria-label="Rechercher dans les devis"]', 'NBB');
        await wait(180);
        const filteredQuoteVisible = await page.evaluate(() =>
            [...document.querySelectorAll('h3')].some(node => node.textContent.includes('Société Immobilière NBB'))
        );
        ok('La recherche des devis retrouve un client', filteredQuoteVisible);

        await page.select('select[aria-label="Filtrer les devis par statut"]', 'draft');
        await wait(120);
        ok('Le filtre de statut affiche un état vide explicite', (await page.evaluate(() => document.body.innerText)).includes('Aucun devis enregistré'));

        await clickVisibleButton(page, 'Factures');
        await page.waitForFunction(() => document.body.innerText.includes('Mes Factures'));
        ok('La liste des factures expose une recherche dédiée', await page.$('input[aria-label="Rechercher dans les factures"]') !== null);
        ok('La liste des factures expose un filtre de statut', await page.$('select[aria-label="Filtrer les factures par statut"]') !== null);
        await page.type('input[aria-label="Rechercher dans les factures"]', 'FACTURE-ABSENTE');
        await wait(120);
        ok('La recherche des factures distingue un résultat absent', (await page.evaluate(() => document.body.innerText)).includes('Aucune facture correspondante'));

        await page.click('button[aria-label="Changer d\'organisation"]');
        await page.waitForFunction(() => document.body.innerText.includes('+ Nouvelle Entreprise'));
        const openedCreateOrg = await clickVisibleButton(page, '+ Nouvelle Entreprise');
        ok('Le sélecteur d’organisation propose la création', openedCreateOrg);
        await page.waitForSelector('#new_org_name', { timeout: 3000 });
        const stepLabel = await page.evaluate(() => [...document.querySelectorAll('p')]
            .map(node => node.textContent.replace(/\s+/g, ' ').trim())
            .find(text => text.includes('Étape 1 sur 6')) || '');
        ok('La création d’organisation suit un parcours en étapes', Boolean(stepLabel), stepLabel);
        const currencyOptions = await page.$$eval('#new_org_currency option', options => options.map(option => option.value));
        ok('La création d’organisation propose FCFA, EUR et USD', ['FCFA', 'EUR', 'USD'].every(value => currencyOptions.includes(value)), currencyOptions.join(', '));

        await clickVisibleButton(page, 'Annuler');
        await page.click('button[aria-label="Paramètres du compte"]');
        await page.waitForSelector('#company_currency', { timeout: 3000 });
        await page.select('#company_currency', 'EUR');
        await wait(120);
        ok('La devise de l’organisation est modifiable depuis ses paramètres', await page.$eval('#company_currency', node => node.value === 'EUR'));
        const settingsOptions = await page.$$eval('#company_currency option', options => options.map(option => option.value));
        ok('Les paramètres conservent les devises prises en charge', ['FCFA', 'EUR', 'USD'].every(value => settingsOptions.includes(value)));

        await page.click('button[aria-label="Fermer la boîte de dialogue"]');
        await clickVisibleButton(page, 'Créer un Devis');
        await page.waitForFunction(() => document.body.innerText.includes('LOTS DU DEVIS'));
        ok('Le formatter monétaire suit la devise organisationnelle', (await page.evaluate(() => document.body.innerText)).includes('€'));
    } finally {
        await close();
    }

    return results;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    const results = await run();
    for (const r of results) console.log(`  ${r.pass ? '✅' : '❌'} ${r.label}${r.detail ? ' — ' + r.detail : ''}`);
    process.exit(results.every(r => r.pass) ? 0 : 1);
}
