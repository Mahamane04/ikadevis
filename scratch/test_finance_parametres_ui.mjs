// Paramètres › Finances (§ 71) : parcours réel dans Chromium, en mode invité.
//
// Ce qu'il prouve, par l'interface et non par des appels de fonction :
//   - la section est atteignable, et par lien direct #settings/finances ;
//   - un compte « Caisse » se crée avec un solde initial, et son solde s'affiche ;
//   - une saisie invalide est refusée avec une phrase lisible, sans rien créer ;
//   - « taux normal à 0 % » est refusé et renvoie vers « Taux zéro » ;
//   - une catégorie en doublon est refusée ;
//   - activer l'euro persiste après rechargement de la page ;
//   - supprimer passe par la fenêtre de confirmation de l'application, qui
//     reçoit bien son rôle de dialogue (piège § 68 : mesuré, pas supposé) ;
//   - aucune erreur JavaScript pendant tout le parcours.

import { pathToFileURL } from 'node:url';
import { launchApp, enterGuestMode } from './lib/harness.mjs';

const wait = (ms = 500) => new Promise((r) => setTimeout(r, ms));

export async function run() {
    const results = [];
    const ok = (label, cond, detail = '') => results.push({ label, pass: !!cond, detail });

    const { page, close, consoleErrors } = await launchApp();
    const cliquerTexte = (motif, racine = '[data-finance-settings]') => page.evaluate((t, r) => {
        const zone = document.querySelector(r) || document;
        const b = [...zone.querySelectorAll('button')]
            .filter((x) => x.getBoundingClientRect().width > 0)
            .find((x) => {
                // Texte visible et libellé accessible testés SÉPARÉMENT : les
                // concaténer ajoutait une espace qui faisait échouer toute
                // ancre de fin (« ^Enregistrer$ ») sans le moindre signal.
                const re = new RegExp(t, 'i');
                return re.test((x.textContent || '').trim()) || re.test(x.getAttribute('aria-label') || '');
            });
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
    // Le triple clic ne vide pas un <input type="number"> : « 0 » prérempli +
    // « 150000 » donnait « 0150000 », que Number() lisait 150 000 — le test
    // passait par chance. Setter natif + événement « input », puis relecture.
    const saisir = async (sel, valeur) => {
        await page.$eval(sel, (n, v) => {
            n.focus();
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(n, v);
            n.dispatchEvent(new Event('input', { bubbles: true }));
        }, valeur);
        await wait(50);
        const lu = await page.$eval(sel, (n) => n.value);
        if (lu !== valeur) throw new Error(`Saisie de ${sel} : « ${lu} » au lieu de « ${valeur} »`);
    };
    const texte = () => page.evaluate(() => document.querySelector('[data-finance-settings]')?.innerText || '');

    try {
        await page.setViewport({ width: 1440, height: 950 });
        await enterGuestMode(page);
        await wait(1200);

        // ── Accès ─────────────────────────────────────────────────────────
        await page.evaluate(() => { window.location.hash = '#settings/finances'; });
        await page.waitForSelector('[data-finance-settings]', { timeout: 8000 }).catch(() => null);
        const present = await page.$('[data-finance-settings]');
        ok('La section Finances s\'ouvre par le lien direct #settings/finances', !!present);
        if (!present) return results;
        ok('Mode invité : les réglages sont locaux', await page.$eval('[data-finance-settings]', (n) => n.dataset.financeMode) === 'local');
        const entree = await page.evaluate(() => [...document.querySelectorAll('button, [role="option"], a')].some((b) => /^\s*Finances/.test(b.textContent || '')));
        ok('Une entrée « Finances » figure dans la navigation des Paramètres', entree);

        // ── Comptes : saisie invalide ─────────────────────────────────────
        ok('Bouton « Ajouter un compte » présent', await cliquerTexte('Ajouter un compte'));
        await wait(200);
        await saisir('#fin_compte_solde', '150000');
        await page.click('form[aria-label="Nouveau compte"] button[type="submit"]');
        await wait(250);
        const erreurNom = await page.evaluate(() => document.querySelector('[data-finance-settings] [role="alert"]')?.innerText || '');
        ok('Un compte sans nom est refusé avec une phrase claire', /Donnez un nom au compte/.test(erreurNom), erreurNom);

        // ── Comptes : création d'une caisse ───────────────────────────────
        await page.type('#fin_compte_nom', 'Caisse atelier');
        ok('Type « Caisse » sélectionnable', await choisir('Type de compte', 'Caisse'));
        await wait(150);
        const champsBancaires = await page.$('#fin_compte_iban');
        ok('Une caisse ne demande aucun identifiant bancaire', !champsBancaires);
        await page.click('form[aria-label="Nouveau compte"] button[type="submit"]');
        await wait(400);
        const carte = await page.evaluate(() => {
            const li = document.querySelector('[data-compte="Caisse atelier"]');
            return li ? { solde: li.querySelector('[data-solde-compte]')?.textContent || '', texte: li.innerText } : null;
        });
        ok('La caisse apparaît dans la liste', !!carte, JSON.stringify(carte));
        ok('Son solde calculé s\'affiche : 150 000 FCFA', carte && carte.solde.replace(/[\s  ]/g, ' ') === '150 000 FCFA', carte && carte.solde);

        // ── Taxes ─────────────────────────────────────────────────────────
        await cliquerTexte('^\\s*Taxes', '[role="tablist"]');
        await wait(250);
        const taxes = await page.$$eval('[data-taxe]', (l) => l.map((x) => x.dataset.taxe));
        ok('Les taxes sont reprises des taux de l\'entreprise', taxes.length >= 2 && taxes.includes('Exonéré'), taxes.join(', '));
        await cliquerTexte('Ajouter une taxe');
        await wait(200);
        await page.type('#fin_taxe_nom', 'Taxe test');
        await saisir('#fin_taxe_taux', '0');
        await page.click('form[aria-label="Nouvelle taxe"] button[type="submit"]');
        await wait(250);
        const erreurTaxe = await page.evaluate(() => document.querySelector('[data-finance-settings] [role="alert"]')?.innerText || '');
        ok('Un taux normal à 0 % est refusé et renvoie vers « Taux zéro »', /Taux zéro/.test(erreurTaxe), erreurTaxe);
        ok('…et rien n\'est créé', !(await page.$('[data-taxe="Taxe test"]')));
        await cliquerTexte('^\\s*Annuler$');

        // ── Catégories ────────────────────────────────────────────────────
        await cliquerTexte('^\\s*Catégories', '[role="tablist"]');
        await wait(250);
        await page.type('#fin_cat_nom', 'Carburant');
        await page.click('form[aria-label="Nouvelle catégorie"] button[type="submit"]');
        await wait(300);
        ok('Une catégorie « Carburant » s\'ajoute', !!(await page.$('[data-categorie="Carburant"]')));
        await page.type('#fin_cat_nom', '  carburant ');
        await page.click('form[aria-label="Nouvelle catégorie"] button[type="submit"]');
        await wait(250);
        ok('Le doublon « carburant » est refusé', /déjà ce nom/.test(await texte()));
        const nbCarburant = await page.$$eval('[data-categorie]', (l) => l.filter((x) => /carburant/i.test(x.dataset.categorie)).length);
        ok('…et la liste ne contient toujours qu\'une seule « Carburant »', nbCarburant === 1, `${nbCarburant}`);

        // ── Devises : activer l'euro, puis recharger ──────────────────────
        await cliquerTexte('^\\s*Devises', '[role="tablist"]');
        await wait(250);
        const base = await page.$eval('[data-devise-base]', (n) => n.textContent);
        ok('La devise de base est reprise de l\'entreprise', /^XOF/.test(base), base);
        const baseVerrouillee = await page.$eval('#fin_devise_XOF', (n) => n.disabled && n.checked);
        ok('La devise de base ne peut pas être décochée', baseVerrouillee);
        await page.click('#fin_devise_EUR');
        await cliquerTexte('^\\s*Enregistrer$');
        await wait(400);

        await page.reload({ waitUntil: 'networkidle0' });
        await wait(1500);
        // Après rechargement, l'invité doit rentrer : le lien direct doit
        // ramener sur la section.
        const encoreConnecte = await page.$('[data-finance-settings]');
        if (!encoreConnecte) {
            await enterGuestMode(page);
            await wait(1200);
            await page.evaluate(() => { window.location.hash = ''; window.location.hash = '#settings/finances'; });
            await page.waitForSelector('[data-finance-settings]', { timeout: 8000 }).catch(() => null);
        }
        await cliquerTexte('^\\s*Devises', '[role="tablist"]');
        await wait(250);
        const euroActive = await page.$eval('#fin_devise_EUR', (n) => n.checked).catch(() => false);
        ok('L\'euro activé survit au rechargement de la page', euroActive);
        await cliquerTexte('^\\s*Comptes', '[role="tablist"]');
        await wait(250);
        ok('La caisse survit au rechargement', !!(await page.$('[data-compte="Caisse atelier"]')));

        // ── Suppression : fenêtre de confirmation de l'application ────────
        await cliquerTexte('Supprimer Caisse atelier');
        const dialogue = await page.waitForFunction(() => {
            const d = [...document.querySelectorAll('[role="dialog"]')].find((n) => /Supprimer « Caisse atelier »/.test(n.innerText));
            return d && getComputedStyle(d).opacity !== '0' ? d.getAttribute('aria-modal') : null;
        }, { timeout: 3000 }).then((h) => h.jsonValue()).catch(() => null);
        ok('La suppression demande confirmation dans une vraie fenêtre de dialogue (role + aria-modal)', dialogue === 'true', String(dialogue));
        await page.evaluate(() => {
            const d = [...document.querySelectorAll('[role="dialog"]')].find((n) => /Supprimer « Caisse atelier »/.test(n.innerText));
            const b = d && [...d.querySelectorAll('button')].find((x) => /^\s*Supprimer\s*$/.test(x.textContent));
            if (b) b.click();
        });
        await wait(500);
        ok('Après confirmation, la caisse a disparu', !(await page.$('[data-compte="Caisse atelier"]')));

        const erreursJs = consoleErrors.filter((e) => !/favicon|net::ERR|Failed to load resource|supabase/i.test(e));
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
