// Écran Dépenses (§ 72) : parcours réel dans Chromium, en mode invité.
//
// Ce qu'il prouve, par l'interface :
//   - l'écran est atteignable par le menu et par le lien direct #depenses ;
//   - une dépense « déjà payée » calcule HT / taxe / TTC et fait baisser le
//     solde de la caisse AFFICHÉ DANS Paramètres › Finances (les deux écrans
//     disent la même chose) ;
//   - une facture « à payer » répartie entre deux chantiers est refusée si la
//     répartition ne retombe pas sur le total, acceptée sinon ;
//   - un règlement partiel laisse le bon reste à payer ;
//   - une avance personnelle ne touche aucun compte et se filtre à part ;
//   - supprimer (via la fenêtre de confirmation) rend l'argent au solde ;
//   - à 390 px : pas de débordement horizontal, et la liste défile À LA
//     MOLETTE (seule preuve valable, CLAUDE.md § Tests) ;
//   - aucune erreur JavaScript.

import { pathToFileURL } from 'node:url';
import { launchApp, enterGuestMode } from './lib/harness.mjs';

const wait = (ms = 400) => new Promise((r) => setTimeout(r, ms));
const espaces = (t) => String(t || '').replace(/[\s  ]+/g, ' ').trim();

export async function run() {
    const results = [];
    const ok = (label, cond, detail = '') => results.push({ label, pass: !!cond, detail });
    const { page, close, consoleErrors } = await launchApp();

    const cliquer = (motif, racine = 'body') => page.evaluate((t, r) => {
        const re = new RegExp(t, 'i');
        const b = [...(document.querySelector(r) || document).querySelectorAll('button')]
            .filter((x) => x.getBoundingClientRect().width > 0)
            .find((x) => re.test((x.textContent || '').trim()) || re.test(x.getAttribute('aria-label') || ''));
        if (b) b.click();
        return !!b;
    }, motif, racine);
    const choisir = async (ariaLabel, libelle) => {
        await page.click(`button[aria-label="${ariaLabel}"][aria-haspopup="listbox"]`);
        await wait(150);
        return page.evaluate((l) => {
            const o = [...document.querySelectorAll('[role="option"]')].find((x) => x.textContent.trim() === l);
            if (o) o.click();
            return !!o;
        }, libelle);
    };
    // Le triple clic ne sélectionne PAS le contenu d'un <input type="number"> :
    // le texte tapé s'ajoutait derrière l'ancien (« 30000 » + « 40000 »).
    const saisir = async (sel, valeur) => {
        // Ni le triple clic ni Ctrl/Cmd+A ne vident un champ numérique dans ce
        // Chromium sans fenêtre : on écrit par le setter natif puis on émet
        // l'événement « input », exactement ce que React écoute.
        await page.$eval(sel, (n, v) => {
            n.focus();
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(n, v);
            n.dispatchEvent(new Event('input', { bubbles: true }));
        }, valeur);
        await wait(50);
        const lu = await page.$eval(sel, (n) => n.value);
        if (lu !== valeur) throw new Error(`Saisie de ${sel} : « ${lu} » au lieu de « ${valeur} »`);
    };
    const aller = async (hash) => {
        await page.evaluate((h) => { window.location.hash = ''; window.location.hash = h; }, hash);
        await wait(700);
    };
    const alerte = () => page.evaluate(() => document.querySelector('[data-depenses] [role="alert"]')?.innerText || '');
    const soldeCaisse = async () => {
        await aller('#settings/finances');
        await page.waitForSelector('[data-compte="Caisse chantier"]', { timeout: 5000 }).catch(() => null);
        const t = await page.$eval('[data-compte="Caisse chantier"] [data-solde-compte]', (n) => n.textContent).catch(() => null);
        await aller('#depenses');
        await page.waitForSelector('[data-depenses]', { timeout: 5000 }).catch(() => null);
        return espaces(t);
    };
    const statut = (desc) => page.$eval(`[data-depense="${desc}"]`, (n) => n.dataset.statut).catch(() => null);

    try {
        await page.setViewport({ width: 1440, height: 950 });
        // Jeu d'essai local : une caisse de 500 000, une TVA 18 % par défaut,
        // deux chantiers.
        await page.evaluate(() => {
            const aujourd = new Date().toISOString().slice(0, 10);
            localStorage.setItem('costcalc:org_default:finance', JSON.stringify({
                settings: { base_currency: 'XOF', enabled_currencies: ['XOF'], default_payment_terms_days: 30, fiscal_year_start_month: 1 },
                taxes: [{ id: 't18', name: 'TVA 18 %', kind: 'standard', rate: 18, scope: 'both', is_inclusive: false, is_recoverable: true, is_default: true, is_active: true }],
                categories: [{ id: 'c1', name: 'Matériaux', kind: 'material', sort_order: 10, is_active: true }],
                accounts: [{ id: 'caisse', name: 'Caisse chantier', kind: 'cash', currency: 'XOF', opening_balance: 500000, opening_date: aujourd, is_default: true, is_active: true }]
            }));
            localStorage.setItem('costcalc:org_default:projects', JSON.stringify([
                { id: 'prj-1', name: 'Villa Cocody' }, { id: 'prj-2', name: 'Immeuble Plateau' }
            ]));
        });
        await enterGuestMode(page);
        await wait(1200);

        // ── Accès ─────────────────────────────────────────────────────────
        const entreeMenu = await page.evaluate(() => [...document.querySelectorAll('button')]
            .some((b) => b.getBoundingClientRect().width > 0 && /^\s*Dépenses\s*$/.test(b.textContent || '')));
        ok('Une entrée « Dépenses » est visible dans la navigation', entreeMenu);
        await aller('#depenses');
        await page.waitForSelector('[data-depenses]', { timeout: 8000 }).catch(() => null);
        ok('L\'écran Dépenses s\'ouvre par le lien direct #depenses', !!(await page.$('[data-depenses]')));
        ok('Mode invité : dépenses locales', await page.$eval('[data-depenses]', (n) => n.dataset.depensesMode).catch(() => null) === 'local');
        ok('Solde initial de la caisse : 500 000 FCFA', (await soldeCaisse()) === '500 000 FCFA');

        // ── Dépense déjà payée ────────────────────────────────────────────
        await cliquer('^Nouvelle dépense$', '[data-depenses]');
        await wait(250);
        await page.click('form[aria-label="Nouvelle dépense"] button[type="submit"]');
        await wait(200);
        ok('Une dépense sans objet ni montant est refusée', /Décrivez la dépense/.test(await alerte()), await alerte());
        await page.type('#dep_description', 'Ciment 50 sacs');
        await page.type('#dep_montant', '100000');
        await wait(150);
        const ttc = espaces(await page.$eval('[data-dep-ttc]', (n) => n.textContent));
        ok('Montant 100 000 HT + TVA 18 % → 118 000 FCFA TTC', ttc === '118 000 FCFA', ttc);
        await page.click('form[aria-label="Nouvelle dépense"] button[type="submit"]');
        await wait(400);
        ok('La dépense apparaît « Payée »', (await statut('Ciment 50 sacs')) === 'paid', String(await statut('Ciment 50 sacs')));
        ok('Le solde de la caisse dans Paramètres › Finances passe à 382 000 FCFA', (await soldeCaisse()) === '382 000 FCFA');

        // ── Facture à payer répartie entre deux chantiers ─────────────────
        await cliquer('^Nouvelle dépense$', '[data-depenses]');
        await wait(250);
        await page.evaluate(() => [...document.querySelectorAll('[role="radio"]')].find((b) => /À payer/.test(b.textContent))?.click());
        await wait(150);
        ok('« À payer » propose une échéance pré-remplie', !!(await page.$eval('#dep_echeance', (n) => n.value).catch(() => '')));
        await page.type('#dep_description', 'Location grue');
        await page.type('#dep_montant', '100000');
        await page.click('#dep_repartir');
        await wait(150);
        ok('Chantier de la part 1', await choisir('Chantier de la part 1', 'Villa Cocody'));
        ok('Chantier de la part 2', await choisir('Chantier de la part 2', 'Immeuble Plateau'));
        await saisir('input[aria-label="Montant de la part 1"]', '60000');
        await saisir('input[aria-label="Montant de la part 2"]', '30000');
        await page.click('form[aria-label="Nouvelle dépense"] button[type="submit"]');
        await wait(250);
        ok('Répartition 60 000 + 30 000 ≠ 100 000 : refusée', /exactement/.test(await alerte()), await alerte());
        await saisir('input[aria-label="Montant de la part 2"]', '40000');
        await page.click('form[aria-label="Nouvelle dépense"] button[type="submit"]');
        await wait(400);
        ok('Répartition exacte : facture enregistrée « À payer »', (await statut('Location grue')) === 'to_pay', String(await statut('Location grue')));
        ok('Elle n\'a pas touché la caisse (toujours 382 000)', (await soldeCaisse()) === '382 000 FCFA');

        // ── Règlement partiel ─────────────────────────────────────────────
        await page.click('[data-depense="Location grue"] > button');
        await wait(250);
        await cliquer('^Régler$', '[data-depense="Location grue"]');
        await wait(200);
        await saisir('#dep_regl_montant', '50000');
        await page.click('form[aria-label="Régler la dépense"] button[type="submit"]');
        await wait(400);
        const reste = espaces(await page.$eval('[data-depense="Location grue"] [data-depense-reste]', (n) => n.textContent).catch(() => ''));
        ok('Règlement de 50 000 : « partiellement payée », reste 68 000 FCFA',
            (await statut('Location grue')) === 'partially_paid' && reste === 'reste 68 000 FCFA', `${await statut('Location grue')} / ${reste}`);
        ok('La caisse a décaissé ces 50 000 (332 000)', (await soldeCaisse()) === '332 000 FCFA');

        // ── Avance personnelle ────────────────────────────────────────────
        await cliquer('^Nouvelle dépense$', '[data-depenses]');
        await wait(250);
        await page.type('#dep_description', 'Carburant groupe');
        await page.type('#dep_montant', '25000');
        await choisir('Taxe de la dépense', 'Aucune taxe');
        await page.evaluate(() => [...document.querySelectorAll('[role="radio"]')].find((b) => /Avancée par quelqu/.test(b.textContent))?.click());
        await wait(150);
        await page.type('#dep_avance', 'Moussa Traoré');
        await page.click('form[aria-label="Nouvelle dépense"] button[type="submit"]');
        await wait(400);
        const badgeAvance = await page.$eval('[data-depense="Carburant groupe"]', (n) => n.innerText).catch(() => '');
        ok('Avance personnelle : affichée « À rembourser »', /À rembourser/.test(badgeAvance), badgeAvance.slice(0, 80));
        ok('…et aucun compte de l\'entreprise n\'a bougé (332 000)', (await soldeCaisse()) === '332 000 FCFA');
        await cliquer('^Avances à rembourser$', '[data-depenses]');
        await wait(200);
        const filtrees = await page.$$eval('[data-depense]', (l) => l.map((x) => x.dataset.depense));
        ok('Le filtre « Avances à rembourser » ne montre que l\'avance', filtrees.join() === 'Carburant groupe', filtrees.join());
        await cliquer('^Toutes$', '[data-depenses]');
        await wait(200);

        // ── Suppression : l'argent revient ────────────────────────────────
        await page.click('[data-depense="Ciment 50 sacs"] > button');
        await wait(250);
        await cliquer('Supprimer', '[data-depense="Ciment 50 sacs"]');
        const dialogue = await page.waitForFunction(() => {
            const d = [...document.querySelectorAll('[role="dialog"]')].find((n) => /Ciment 50 sacs/.test(n.innerText));
            return d ? d.getAttribute('aria-modal') : null;
        }, { timeout: 3000 }).then((h) => h.jsonValue()).catch(() => null);
        ok('La suppression passe par la fenêtre de confirmation (role + aria-modal)', dialogue === 'true', String(dialogue));
        await page.evaluate(() => {
            const d = [...document.querySelectorAll('[role="dialog"]')].find((n) => /Ciment 50 sacs/.test(n.innerText));
            [...(d?.querySelectorAll('button') || [])].find((x) => /^\s*Supprimer\s*$/.test(x.textContent))?.click();
        });
        await wait(400);
        ok('La dépense a disparu', !(await page.$('[data-depense="Ciment 50 sacs"]')));
        ok('…et ses 118 000 reviennent dans la caisse (450 000)', (await soldeCaisse()) === '450 000 FCFA');

        // ── Mobile ────────────────────────────────────────────────────────
        await page.setViewport({ width: 390, height: 700 });
        for (let i = 0; i < 12; i++) {
            await page.evaluate((n) => {
                const cle = 'costcalc:org_default:depenses';
                const l = JSON.parse(localStorage.getItem(cle) || '[]');
                l.push({ id: `rempl-${n}`, kind: 'supplier_invoice', description: `Facture remplissage ${n}`, expense_date: '2026-09-01', due_date: '2026-10-01',
                    currency: 'XOF', base_currency: 'XOF', fx_rate: 1, amount_ht: 1000, tax_rate: 0, tax_amount: 0, amount_ttc: 1000, amount_base: 1000, reglements: [] });
                localStorage.setItem(cle, JSON.stringify(l));
            }, i);
        }
        await aller('#settings/finances');
        await aller('#depenses');
        await page.waitForSelector('[data-depenses]', { timeout: 5000 }).catch(() => null);
        await wait(400);
        const debord = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
        ok('À 390 px : aucun débordement horizontal', !debord);
        const zone = await page.$eval('[data-depenses]', (n) => { const r = n.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + Math.min(r.height / 2, 300), avant: n.scrollTop }; });
        await page.mouse.move(zone.x, zone.y);
        await page.mouse.wheel({ deltaY: 1500 });
        await wait(500);
        const apres = await page.$eval('[data-depenses]', (n) => n.scrollTop);
        ok('À 390 px, la liste défile réellement à la molette', apres > zone.avant + 200, `${zone.avant} → ${apres}`);

        const erreursJs = consoleErrors.filter((x) => !/favicon|net::ERR|Failed to load resource|supabase/i.test(x));
        ok('Aucune erreur JavaScript pendant le parcours', erreursJs.length === 0, erreursJs.slice(0, 3).join(' | '));
    } finally {
        await close();
    }
    return results;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    const results = await run();
    for (const r of results) console.log(`  ${r.pass ? '✅' : '❌'} ${r.label}${r.detail ? ' — ' + r.detail : ''}`);
    const echecs = results.filter((r) => !r.pass).length;
    console.log(`\n  ${results.length - echecs}/${results.length} vérifications`);
    process.exit(echecs === 0 ? 0 : 1);
}
