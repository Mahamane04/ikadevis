// Banc d'essai — deux défauts signalés en production le 2026-09-02, sur un
// compte comptant 23 devis. Aucun n'était visible avec le jeu de
// démonstration, qui n'en contient qu'un : c'est précisément le trou que ce
// banc comble — il travaille sur un VOLUME réaliste.
//
// 1. « Je ne vois pas tous les devis sur la page car ce n'est plus possible
//    de faire le scroll. »
//
//    Mécanisme, mesuré : la carte du tableau est un élément flex de la zone
//    défilante. Un élément flex a `min-height: auto`, ce qui l'empêche de
//    rétrécir sous la hauteur de son contenu — SAUF si son propre `overflow`
//    n'est pas `visible`. Il vaut `hidden` (pour arrondir les coins). Le
//    minimum retombe donc à zéro : la carte est comprimée à la hauteur de la
//    zone (669 px au lieu de 1388) et rogne elle-même son tableau. La zone,
//    ne voyant plus rien dépasser, n'affiche aucune barre — `scrollHeight`
//    valait exactement `clientHeight` alors que la dernière ligne se terminait
//    à 1688 px, bien au-delà de la fenêtre.
//
// 2. « Quand je supprime un devis il revient après rechargement de la page. »
//
//    `updateSavedQuotes` n'écrit que dans le navigateur. En mode connecté la
//    liste est relue depuis Supabase à chaque chargement : le devis
//    réapparaissait. Le banc tourne en mode invité, où la persistance est le
//    localStorage — il vérifie donc la propriété observable (la suppression
//    survit au rechargement) sans pouvoir éprouver le chemin Supabase, qui
//    demande un compte réel. Cette limite est réelle et assumée.
import { pathToFileURL } from 'node:url';
import { launchApp, enterGuestMode } from './lib/harness.mjs';

const wait = (ms = 600) => new Promise((r) => setTimeout(r, ms));
const NB = 23;

const allerAuxDevis = async (page) => {
    await page.evaluate(() => {
        const b = [...document.querySelectorAll('aside button')].find((x) => (x.textContent || '').trim().startsWith('Mes devis'));
        if (b) b.click();
    });
    await wait(1800);
};

export async function run() {
    const results = [];
    const ok = (label, cond, detail = '') => results.push({ label, pass: !!cond, detail });

    const { page, close } = await launchApp();
    try {
        await page.setViewport({ width: 1440, height: 900 });
        await enterGuestMode(page, { demo: true });
        await wait(2000);

        // Porter la liste à 23 devis, comme le compte qui a révélé le défaut.
        await page.evaluate((n) => {
            const l = JSON.parse(localStorage.getItem('costcalc:guest:savedQuotes') || '[]');
            if (!l.length) return;
            const base = l[0];
            const out = [];
            for (let i = n; i >= 1; i--) {
                out.push({ ...JSON.parse(JSON.stringify(base)), id: 'q' + i, number: 'DEV-2026-' + String(i).padStart(3, '0') });
            }
            localStorage.setItem('costcalc:guest:savedQuotes', JSON.stringify(out));
        }, NB);
        await page.reload({ waitUntil: 'networkidle0' });
        await wait(1500);
        await enterGuestMode(page, { demo: false });
        await wait(2000);
        await allerAuxDevis(page);

        const mesure = await page.evaluate(() => {
            const zone = document.querySelector('[data-testid="saved-quotes-list"] .overflow-y-auto');
            if (!zone) return { erreur: 'zone défilante introuvable' };
            const avant = zone.scrollTop;
            zone.scrollTop = 99999;
            const apres = zone.scrollTop;
            zone.scrollTop = avant;
            return {
                lignes: document.querySelectorAll('tbody tr').length,
                clientH: zone.clientHeight,
                scrollH: zone.scrollHeight,
                aDefile: apres > avant
            };
        });

        ok(`Les ${NB} devis sont tous rendus — ${mesure.lignes} lignes`, mesure.lignes === NB);
        ok(`Le contenu dépasse la zone : scrollHeight (${mesure.scrollH}) > clientHeight (${mesure.clientH})`,
            mesure.scrollH > mesure.clientH + 1);
        ok('La liste défile réellement', mesure.aDefile);

        // La dernière ligne doit être atteignable, pas seulement présente.
        const derniere = await page.evaluate(() => {
            const zone = document.querySelector('[data-testid="saved-quotes-list"] .overflow-y-auto');
            zone.scrollTop = 99999;
            const tr = [...document.querySelectorAll('tbody tr')].pop();
            const r = tr.getBoundingClientRect();
            const z = zone.getBoundingClientRect();
            return { dansLaZone: r.top >= z.top - 2 && r.bottom <= z.bottom + 2, texte: tr.innerText.split('\n')[0] };
        });
        ok(`Le dernier devis est atteignable en défilant — « ${derniere.texte} »`, derniere.dansLaZone);

        // Suppression : elle doit survivre au rechargement.
        const avantSuppr = await page.evaluate(() => document.querySelectorAll('tbody tr').length);
        const numero = await page.evaluate(() => {
            const b = document.querySelector('tbody tr button[aria-label^="Supprimer le devis"]');
            const n = b.getAttribute('aria-label').replace('Supprimer le devis ', '');
            b.click();
            return n;
        });
        await wait(700);
        await page.evaluate(() => {
            const b = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').trim() === 'Supprimer');
            if (b) b.click();
        });
        await wait(1500);
        const apresSuppr = await page.evaluate(() => document.querySelectorAll('tbody tr').length);
        ok(`Le devis ${numero} disparaît de la liste — ${avantSuppr} → ${apresSuppr}`, apresSuppr === avantSuppr - 1);

        await page.reload({ waitUntil: 'networkidle0' });
        await wait(1500);
        await enterGuestMode(page, { demo: false });
        await wait(2000);
        await allerAuxDevis(page);
        const apresRechargement = await page.evaluate((n) => ({
            lignes: document.querySelectorAll('tbody tr').length,
            revenu: [...document.querySelectorAll('tbody tr')].some((tr) => tr.innerText.includes(n))
        }), numero);

        ok(`Le devis supprimé ne revient pas après rechargement — ${apresRechargement.lignes} lignes`,
            apresRechargement.lignes === avantSuppr - 1 && !apresRechargement.revenu,
            `revenu=${apresRechargement.revenu}`);
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
