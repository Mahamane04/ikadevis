// Banc d'essai — Audit UX du 2026-08-31, P1 « aucun accueil, et la démo ne
// montre jamais ses données ».
//
// L'écran d'arrivée était fixé à 'calculator' : on entrait en Mode Démo et on
// tombait sur un devis VIDE. Pendant ce temps la base de démonstration contient
// 2 clients, 2 chantiers, un devis approuvé, 33 matières, 20 postes de
// main-d'œuvre et une bibliothèque d'ouvrages complète — que personne ne voyait.
// Temps jusqu'à la valeur : quatre clics, à condition de deviner où aller.
//
// La démo ouvre désormais le devis d'exemple, déjà chiffré, dès l'entrée.
//
// Ce banc protège deux choses distinctes :
//   1. l'atterrissage lui-même (le devis d'exemple est bien à l'écran, avec ses
//      montants réels et son bandeau explicatif) ;
//   2. la FIDÉLITÉ de la reconstruction. adaptSavedQuoteToHybrid ne sait rouvrir
//      un devis que s'il porte un `hybridQuoteSnapshot` ou s'il est isMultiLot.
//      Le devis de démonstration n'en avait aucun : il retombait sur la branche
//      « ouvrage unique » et 14 750 000 FCFA TTC devenaient 40 268 FCFA — un
//      facteur 366. Le même défaut frappait le bouton « Modifier », et un
//      « Mettre à jour » ensuite écrasait l'original par cette ruine. Un
//      instantané fidèle a été ajouté au jeu de démonstration ; si quelqu'un le
//      retire, ce banc doit rougir.
import { pathToFileURL } from 'node:url';
import { launchApp, enterGuestMode } from './lib/harness.mjs';

const wait = (ms = 300) => new Promise((r) => setTimeout(r, ms));
const montant = (txt) => {
    const m = (txt || '').replace(/[   ]/g, '').match(/(\d+)/g);
    return m ? parseInt(m.join('').slice(0, 12), 10) : null;
};

export async function run() {
    const results = [];
    const ok = (label, cond, detail = '') => results.push({ label, pass: !!cond, detail });

    const { page, close } = await launchApp();
    try {
        await page.setViewport({ width: 1440, height: 900 });
        // demo: true — on veut précisément le comportement de premier lancement.
        await enterGuestMode(page, { demo: true });
        await wait(1500);

        const etat = await page.evaluate(() => {
            const barre = document.querySelector('.quote-totals-bar');
            const texte = document.body.innerText;
            const champ = (label) => document.querySelector(`input[aria-label="${label}"]`)?.value ?? '';
            return {
                bandeauExemple: texte.includes('devis d’exemple') || texte.includes("devis d'exemple"),
                boutonCreerLeMien: [...document.querySelectorAll('button')].some((b) => /Créer mon devis/.test(b.textContent || '')),
                client: champ('Client du devis'),
                projet: champ('Projet du devis'),
                totauxBruts: barre ? barre.innerText.replace(/\n+/g, ' | ') : ''
            };
        });

        ok('La démo ouvre un devis d\'exemple au lieu d\'un écran vide', etat.bandeauExemple);
        ok('Le bandeau propose de démarrer son propre devis', etat.boutonCreerLeMien);
        ok('Le client de l\'exemple est renseigné', etat.client.length > 0, `client="${etat.client}"`);
        ok('Le chantier de l\'exemple est renseigné', etat.projet.length > 0, `chantier="${etat.projet}"`);

        // Fidélité : le total à l'écran doit être celui de la fiche enregistrée.
        const attendu = await page.evaluate(() => {
            const liste = JSON.parse(localStorage.getItem('costcalc:guest:savedQuotes') || '[]');
            const exemple = liste[liste.length - 1];
            return exemple ? exemple.quoteData?.totalTTCConsomme : null;
        });
        const affiche = montant((etat.totauxBruts.split('TOTAL TTC')[1] || '').split('|')[1] || '');

        ok('Le devis d\'exemple porte un montant non nul', attendu > 0, `enregistré=${attendu}`);
        ok('Le montant affiché est celui du devis enregistré (reconstruction fidèle)',
            attendu > 0 && affiche !== null && Math.abs(affiche - attendu) / attendu < 0.02,
            `affiché=${affiche} enregistré=${attendu}`);

        // Audit UX P1-7, seconde moitié (2026-09-01) — l'atterrissage était bien
        // en place, mais l'exemple était un forfait d'une seule ligne libre :
        // déboursé 0, K=1, marge 0 %, astérisque d'avertissement. On voyait un
        // total, jamais la chaîne de calcul — or c'est elle, dit l'audit, qui est
        // le moment de bascule du produit. L'exemple porte désormais deux ouvrages
        // réellement chiffrés du catalogue. Ce banc protège cette propriété :
        // sans elle, l'atterrissage retomberait dans le défaut d'origine.
        const chaine = await page.evaluate(() => {
            const barre = document.querySelector('.quote-totals-bar');
            const texte = barre ? barre.innerText : '';
            const nombre = (etiquette) => {
                const apres = texte.split(etiquette)[1];
                if (!apres) return null;
                const brut = apres.split('\n').find((l) => /\d/.test(l));
                return brut ? parseFloat(brut.replace(/[^\d.,]/g, '').replace(/\s/g, '').replace(',', '.')) : null;
            };
            return {
                debourse: nombre('DÉBOURSÉ SEC'),
                coeffK: nombre('COEFF K'),
                margePct: (texte.match(/\((\d+(?:[.,]\d+)?)%\)/) || [])[1],
                asterisque: /\*/.test(texte),
                // Le badge porté par une LIGNE du tableau — pas le bouton
                // « Ajouter une ligne libre », qui doit évidemment rester offert.
                ligneLibre: [...document.querySelectorAll('tbody tr')].some((tr) => /LIGNE LIBRE/.test(tr.innerText)),
                lignesCalculees: [...document.querySelectorAll('tbody tr')]
                    .filter((tr) => /Calculé selon le métrage/.test(tr.innerText)).length
            };
        });
        ok(`L'exemple montre un déboursé sec réel, pas zéro — ${chaine.debourse}`, chaine.debourse > 0);
        ok(`L'exemple montre un coefficient de vente réel, pas K=1 — K=${chaine.coeffK}`, chaine.coeffK > 1);
        ok(`L'exemple montre une marge réelle, pas 0 % — ${chaine.margePct}%`, parseFloat(chaine.margePct) > 0);
        ok('L\'exemple ne contient aucune ligne libre à compléter', !chaine.ligneLibre);
        ok('La barre des totaux n\'affiche aucun avertissement d\'astérisque', !chaine.asterisque);
        ok(`L'exemple repose sur des ouvrages calculés au métré — ${chaine.lignesCalculees} ligne(s)`, chaine.lignesCalculees >= 2);
    } finally {
        await close();
    }

    // Deuxième session : l'atterrissage ne doit se produire qu'une fois par
    // navigateur, sinon il réécraserait le travail d'un utilisateur habitué.
    {
        const { page, close } = await launchApp();
        try {
            await page.setViewport({ width: 1440, height: 900 });
            await enterGuestMode(page, { demo: true });
            await wait(1200);
            await page.evaluate(() => {
                const b = [...document.querySelectorAll('button')].find((x) => /Créer mon devis/.test(x.textContent || ''));
                if (b) b.click();
            });
            await wait(800);
            await page.reload({ waitUntil: 'networkidle0' });
            await wait(1200);
            await page.evaluate(() => {
                const b = [...document.querySelectorAll('button')]
                    .find((x) => /Essayer sans compte/.test(x.textContent || '')
                        || (x.textContent.includes('Mode Démo') && x.textContent.includes('Invité')));
                if (b) b.click();
            });
            await wait(2000);
            const reproposé = await page.evaluate(() => {
                const t = document.body.innerText;
                return t.includes('devis d’exemple') || t.includes("devis d'exemple");
            });
            ok('L\'exemple n\'est pas re-imposé au lancement suivant', !reproposé);
        } finally {
            await close();
        }
    }

    return results;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    const results = await run();
    for (const r of results) console.log(`  ${r.pass ? '✅' : '❌'} ${r.label}${r.detail ? ' — ' + r.detail : ''}`);
    process.exit(results.every((r) => r.pass) ? 0 : 1);
}
