// Banc d'essai V2 — listes documentaires, organisation et devise.
// Ces contrôles restent dans le navigateur comme un utilisateur réel : ils ne
// touchent ni Supabase ni les données de production.
import { pathToFileURL } from 'node:url';
import { launchApp, enterGuestMode } from './lib/harness.mjs';

const wait = (ms = 150) => new Promise(resolve => setTimeout(resolve, ms));

async function clickVisibleButton(page, predicate, exact = false) {
    return page.evaluate(({ source, exactMatch }) => {
        const matches = [...document.querySelectorAll('button')]
            .filter(button => {
                const text = button.textContent || '';
                const aria = button.getAttribute('aria-label') || '';
                return exactMatch
                    ? text.trim() === source || aria.trim() === source
                    : text.includes(source) || aria.includes(source);
            });
        const visible = matches.find(button => {
            const rect = button.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
        });
        visible?.click();
        return Boolean(visible);
    }, { source: predicate, exactMatch: exact });
}

export async function run() {
    const results = [];
    const ok = (label, cond, detail = '') => results.push({ label, pass: !!cond, detail });
    const { page, close } = await launchApp();

    try {
        await page.setViewport({ width: 1280, height: 900 });
        await enterGuestMode(page);

        await clickVisibleButton(page, 'Mes devis', true);
        await page.waitForFunction(() => document.body.innerText.includes('Mes devis'));
        ok('La liste des devis expose une recherche dédiée', await page.$('input[aria-label="Rechercher dans les devis"]') !== null);
        ok('La liste des devis expose un filtre de statut', await page.$('select[aria-label="Filtrer les devis par statut"]') !== null);
        ok('La liste des devis expose un tri', await page.$('select[aria-label="Trier les devis"]') !== null);
        const simpleQuoteRow = await page.evaluate(() => {
            const row = [...document.querySelectorAll('tbody tr')]
                .find(node => node.textContent.includes('Société Immobilière NBB'));
            return {
                text: row?.innerText || '',
                nbActions: row ? row.querySelectorAll('button').length : -1,
                actions: row ? [...row.querySelectorAll('button')].map(b => b.getAttribute('aria-label') || b.textContent.trim()) : []
            };
        });
        const simpleQuoteRowUpper = simpleQuoteRow.text.toUpperCase();
        ok('La liste des devis utilise une table Société/Projet/Devis/Date', ['SOCIÉTÉ IMMOBILIÈRE NBB', 'CONSTRUCTION SIÈGE NBB', 'DEV-2026-001'].every(value => simpleQuoteRowUpper.includes(value)) && /\d{2}\/\d{2}\/\d{4}/.test(simpleQuoteRow.text));
        // Cette ligne exigeait « aucune icône ni action » jusqu'au 2026-09-02.
        // Un utilisateur a alors signalé, capture à l'appui, qu'il ne voyait
        // aucun moyen de supprimer un devis — et il avait raison : la seule
        // commande de suppression de l'application était derrière le dépliant
        // « Actions du devis », replié par défaut la veille. La liste épurée
        // était donc devenue une liste sans issue.
        // La règle change, mais l'intention qu'elle défendait est conservée
        // telle quelle : la ligne ne doit pas redevenir une rangée d'icônes.
        // Une seule action, et c'est celle qui manquait.
        ok(`La ligne n'expose qu'une seule action, la suppression — ${JSON.stringify(simpleQuoteRow.actions)}`,
            simpleQuoteRow.nbActions === 1 && /^Supprimer le devis /.test(simpleQuoteRow.actions[0] || ''));
        await page.click('tbody tr[role="button"] td:nth-child(2)');
        await wait(180);
        const detailShown = await page.evaluate(() => document.body.innerText.includes('DEVIS COMMERCIAL') && document.body.innerText.includes('Construction Siège NBB'));
        ok('Un clic sur une cellule ouvre le détail à droite', detailShown);
        const desktopSplitVisible = await page.evaluate(() => {
            const list = document.querySelector('[data-testid="saved-quotes-list"]');
            const detail = document.querySelector('[data-testid="saved-quote-detail"]');
            if (!list || !detail) return false;
            const listRect = list.getBoundingClientRect();
            const detailRect = detail.getBoundingClientRect();
            return listRect.width > 0 && detailRect.width > 260 && detailRect.left >= listRect.right - 2;
        });
        ok('La table et le détail sont visibles côte à côte sur desktop', desktopSplitVisible);
        // Audit UX (2026-09-01) — ce banc testait la PRÉSENCE dans le DOM. Depuis
        // que la bande d'actions se replie pour rendre sa hauteur au document, un
        // bouton `display:none` reste présent : le banc serait resté vert avec des
        // actions devenues inatteignables. Il vérifie donc maintenant l'état réel —
        // repliées à l'ouverture, effectivement visibles après le clic — et que le
        // document, la raison d'être de l'écran, a une hauteur exploitable.
        // Révisé le 2026-09-02, second signalement du même utilisateur : « je ne
        // vois pas de bouton pour convertir en facture le devis ». Le repli
        // écrit la veille masquait les CINQ actions, dont les deux qui font
        // avancer un devis — le convertir en facture, et le modifier. Replier
        // « Dupliquer » se défend ; replier la suite du parcours commercial,
        // non. Le banc distingue donc désormais deux familles au lieu d'une.
        const ACTIONS_TOUJOURS_VISIBLES = [
            'Convertir le devis DEV-2026-001 en facture',
            'Modifier le devis DEV-2026-001'
        ];
        const ACTIONS_REPLIEES = [
            'Créer une révision de DEV-2026-001',
            'Dupliquer le devis DEV-2026-001',
            'Supprimer le devis DEV-2026-001'
        ];
        const LIBELLES_ACTIONS = [...ACTIONS_TOUJOURS_VISIBLES, ...ACTIONS_REPLIEES];
        const mesureActions = () => page.evaluate((libelles) => {
            const carte = document.querySelector('[data-testid="saved-quote-detail"] .saved-quote-detail-card');
            const visibles = libelles.filter(l => {
                const b = carte?.querySelector(`button[aria-label="${l}"]`);
                if (!b) return false;
                const r = b.getBoundingClientRect();
                return r.width > 0 && r.height > 0;
            }).length;
            const doc = carte?.querySelector('.saved-quote-document-scroll');
            return {
                presentes: libelles.every(l => carte?.querySelector(`button[aria-label="${l}"]`) !== null),
                visibles,
                hauteurDocument: doc ? doc.clientHeight : 0,
                debordeHorizontalement: doc ? doc.scrollWidth > doc.clientWidth + 1 : false
            };
        }, LIBELLES_ACTIONS);

        const mesureGroupe = (libelles) => page.evaluate((ls) => {
            const carte = document.querySelector('[data-testid="saved-quote-detail"] .saved-quote-detail-card');
            return ls.filter((l) => {
                const b = carte?.querySelector(`button[aria-label="${l}"]`);
                if (!b) return false;
                const r = b.getBoundingClientRect();
                return r.width > 0 && r.height > 0;
            }).length;
        }, libelles);

        const avantDepli = await mesureActions();
        ok('Les actions du devis sont présentes dans le détail', avantDepli.presentes);
        const visiblesDemblee = await mesureGroupe(ACTIONS_TOUJOURS_VISIBLES);
        const repliesDemblee = await mesureGroupe(ACTIONS_REPLIEES);
        ok(`« Convertir en facture » et « Modifier » sont visibles sans rien déplier — ${visiblesDemblee}/2`,
            visiblesDemblee === ACTIONS_TOUJOURS_VISIBLES.length);
        ok(`Les variantes (révision, duplication, suppression) restent repliées — ${repliesDemblee}/3 visibles`,
            repliesDemblee === 0);
        ok(`Le document occupe une hauteur exploitable (≥ 180 px) — mesuré=${avantDepli.hauteurDocument}`, avantDepli.hauteurDocument >= 180);
        ok('L’aperçu ne déborde pas horizontalement', !avantDepli.debordeHorizontalement);
        await page.evaluate(() => document.querySelector('[data-testid="saved-quote-detail"] .saved-quote-action-label')?.click());
        await wait(220);
        const apresDepli = await mesureActions();
        ok(`Déplier « Plus d’actions » rend les cinq actions cliquables — visibles=${apresDepli.visibles}/5`,
            apresDepli.visibles === LIBELLES_ACTIONS.length);
        await page.evaluate(() => document.querySelector('[data-testid="saved-quote-detail"] .saved-quote-action-label')?.click());
        await wait(220);

        await page.type('input[aria-label="Rechercher dans les devis"]', 'NBB');
        await wait(180);
        const filteredQuoteVisible = await page.evaluate(() =>
            [...document.querySelectorAll('h3')].some(node => node.textContent.includes('Société Immobilière NBB'))
        );
        ok('La recherche des devis retrouve un client', filteredQuoteVisible);

        await page.select('select[aria-label="Filtrer les devis par statut"]', 'draft');
        await wait(120);
        ok('Le filtre de statut affiche un état vide explicite', (await page.evaluate(() => document.body.innerText)).includes('Aucun devis enregistré'));

        await clickVisibleButton(page, 'Factures', true);
        await page.waitForFunction(() => document.body.innerText.includes('Factures'));
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

        ok('Les paramètres proposent une section Facturation & envoi', await clickVisibleButton(page, 'Facturation & envoi'));
        await page.waitForSelector('#commercial_bank_name', { timeout: 3000 });
        ok('La section commerciale expose les coordonnées bancaires', await page.$('#commercial_bank_account') !== null);
        ok('La section commerciale expose les modèles de messages', await page.$('#commercial_quote_email_body') !== null && await page.$('#commercial_invoice_email_body') !== null);

        // Depuis la refonte des paramètres, l'ancienne modale a été remplacée
        // par une page master-detail pleine largeur. Garder le repli modal
        // permet à ce banc de rester compatible avec une ancienne build locale.
        const leftSettingsPage = await clickVisibleButton(page, 'Retour à l’application');
        if (!leftSettingsPage) await page.click('button[aria-label="Fermer la boîte de dialogue"]');
        await clickVisibleButton(page, 'Chiffrage');
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
