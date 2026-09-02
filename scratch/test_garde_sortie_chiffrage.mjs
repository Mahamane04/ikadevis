// Banc d'essai — demandé le 2026-09-02 : « je voudrais qu'on ne quitte JAMAIS
// jamais chiffrage sans demander si on doit enregistrer le projet en cours ».
//
// Le drapeau « modifications non enregistrées » existait, mais ne gardait que
// deux sorties : la fermeture de l'onglet (beforeunload) et la déconnexion. Un
// clic sur « Mes devis » ou n'importe quelle entrée de la barre latérale
// emportait le chiffrage en cours sans un mot. C'est le seul écran dont le
// travail n'est pas encore persisté.
//
// Trois issues, et les trois comptent :
//   Annuler                    → on reste, rien n'est perdu ;
//   Quitter sans enregistrer   → on part, en le sachant ;
//   Enregistrer et continuer   → on enregistre POUR DE VRAI, puis on part.
//
// Ce dernier cas cache le piège : l'enregistrement peut être refusé (nom du
// client manquant, tarif événementiel incomplet). Naviguer quand même
// reviendrait à perdre le devis en prétendant l'avoir sauvé. L'atelier renvoie
// donc son issue — 'enregistre' | 'bloque' | 'confirmation' — et la garde ne
// navigue que sur la première.
//
// Défaut trouvé en éprouvant ce parcours, corrigé au passage : le champ Client
// ne validait sa saisie libre que sur un CLIC hors du champ. En sortant au
// clavier (Tab), le nom restait affiché mais n'atteignait jamais le devis, et
// l'enregistrement répondait « Nom du client manquant » devant un champ qui
// montrait pourtant le nom.
import { pathToFileURL } from 'node:url';
import { launchApp, enterGuestMode } from './lib/harness.mjs';

const wait = (ms = 800) => new Promise((r) => setTimeout(r, ms));

export async function run() {
    const results = [];
    const ok = (label, cond, detail = '') => results.push({ label, pass: !!cond, detail });

    const { page, close } = await launchApp();
    try {
        await page.setViewport({ width: 1440, height: 900 });
        await enterGuestMode(page, { demo: false });
        await wait(2500);

        const allerA = (nom) => page.evaluate((c) => {
            const b = [...document.querySelectorAll('aside button')].find((x) => (x.textContent || '').trim().startsWith(c));
            if (b) b.click();
        }, nom);
        const ecran = () => page.evaluate(() => (document.querySelector('h1') || {}).textContent || '?');
        const nbDevis = () => page.evaluate(() => JSON.parse(localStorage.getItem('costcalc:guest:savedQuotes') || '[]').length);
        const clicBoite = (motif) => page.evaluate((m) => {
            const d = document.querySelector('[role="dialog"][aria-modal="true"]');
            if (!d) return 'pas de boîte';
            const b = [...d.querySelectorAll('button')].find((x) => new RegExp(m).test(x.textContent || ''));
            if (!b) return 'bouton absent';
            b.click();
            return 'ok';
        }, motif);

        await allerA('Chiffrage');
        await wait(1600);
        const devisAvant = await nbDevis();
        await page.evaluate(() => {
            const b = [...document.querySelectorAll('button')].find((x) => /Ajouter une ligne libre/.test(x.textContent || ''));
            if (b) b.click();
        });
        await wait(1200);
        ok('Le devis est bien marqué « modifications non enregistrées »',
            await page.evaluate(() => /Modifications non enregistrées/.test(document.body.innerText)));

        // ── Tentative de sortie : la question doit être posée ──────────────
        await allerA('Mes devis');
        await wait(900);
        const boite = await page.evaluate(() => {
            const d = document.querySelector('[role="dialog"][aria-modal="true"]');
            return d ? { titre: d.innerText.split('\n')[0], boutons: [...d.querySelectorAll('button')].map((b) => (b.textContent || '').trim()) } : null;
        });
        ok('Quitter le chiffrage pose la question au lieu de partir',
            !!boite && /Enregistrer le devis en cours/.test(boite.titre), boite ? boite.titre : 'aucune boîte');
        ok(`Les trois issues sont proposées — ${JSON.stringify(boite && boite.boutons)}`,
            !!boite && boite.boutons.includes('Annuler')
            && boite.boutons.some((b) => /Quitter sans enregistrer/.test(b))
            && boite.boutons.some((b) => /Enregistrer et continuer/.test(b)));
        ok('On est toujours sur le chiffrage tant qu’on n’a pas répondu',
            (await ecran()) === 'Chiffrage');

        // ── Annuler : on reste ────────────────────────────────────────────
        await clicBoite('^Annuler$');
        await wait(900);
        ok('« Annuler » garde l’utilisateur sur le chiffrage', (await ecran()) === 'Chiffrage');

        // ── Enregistrer sans client : refusé, on reste ────────────────────
        await allerA('Mes devis');
        await wait(900);
        await clicBoite('Enregistrer et continuer');
        await wait(1800);
        ok('Un enregistrement refusé (client manquant) ne fait pas quitter l’écran',
            (await ecran()) === 'Chiffrage');
        ok('Et rien n’a été enregistré', (await nbDevis()) === devisAvant);

        // ── Avec un client saisi AU CLAVIER : enregistre puis navigue ─────
        // Après un refus, l'étiquette du champ devient « Client du devis —
        // requis » (marquage d'erreur voulu) : le sélecteur doit accepter les
        // deux, sans quoi le banc échoue sur son propre libellé.
        await page.click('input[aria-label^="Client du devis"]');
        await page.keyboard.type('Client Témoin', { delay: 20 });
        await page.keyboard.press('Tab');
        await wait(1200);
        await allerA('Mes devis');
        await wait(900);
        await clicBoite('Enregistrer et continuer');
        await wait(2500);
        ok(`« Enregistrer et continuer » enregistre — ${devisAvant} → ${await nbDevis()}`,
            (await nbDevis()) === devisAvant + 1);
        ok('…puis mène bien à l’écran demandé', (await ecran()) === 'Mes devis');

        // ── Quitter sans enregistrer ──────────────────────────────────────
        await allerA('Chiffrage');
        await wait(1500);
        await page.evaluate(() => {
            const b = [...document.querySelectorAll('button')].find((x) => /Ajouter une ligne libre/.test(x.textContent || ''));
            if (b) b.click();
        });
        await wait(1200);
        const avantAbandon = await nbDevis();
        await allerA('Clients');
        await wait(900);
        await clicBoite('Quitter sans enregistrer');
        await wait(1500);
        ok('« Quitter sans enregistrer » laisse partir', (await ecran()) === 'Clients');
        ok('…sans rien enregistrer', (await nbDevis()) === avantAbandon);
    } finally {
        await close();
    }

    return results;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    const results = await run();
    for (const r of results) console.log(`  ${r.pass ? '✅' : '❌'} ${r.label}${r.detail ? ' — ' + r.detail : ''}`);
    process.exit(results.every((r) => r.pass) ? 0 : 1);
}
