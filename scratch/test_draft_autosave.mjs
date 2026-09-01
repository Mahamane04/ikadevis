// Banc d'essai — Audit UX du 2026-08-31, P0 « un rafraîchissement détruit le
// devis en cours ».
//
// Rien n'écrivait le devis en cours sur le disque tant qu'on n'avait pas cliqué
// « Enregistrer », alors même que le Mode Démo est intégralement local.
// Reproduit pendant l'audit : un devis de 11 lots à 146 392 386 FCFA, généré
// par l'assistant, effacé par un simple rechargement de page — retour à l'écran
// de connexion, aucune trace, rien à récupérer.
//
// Un garde `beforeunload` existe (QuoteWorkspace) mais ne couvre QUE la
// fermeture volontaire : ni un onglet tué par le système, ni un téléphone qui
// recycle la mémoire, ni un utilisateur qui confirme le dialogue trop vite. Le
// commentaire de ce garde documente d'ailleurs qu'il a déjà été neutralisé une
// fois par un remontage de composant.
//
// Quatre propriétés sont vérifiées ici, et la dernière compte autant que les
// autres :
//   0. le garde beforeunload se déclenche bien — l'audit n'avait pas pu le
//      constater, le pilotage automatisé du navigateur le contournant ;
//   1. le devis en cours est bien écrit sur le disque, sans enregistrement ;
//   2. il est proposé à la reprise après rechargement, et restauré à
//      l'identique — jamais restauré en silence : l'utilisateur doit
//      reconnaître son travail avant qu'on écrase son écran ;
//   3. le devis repris est marqué NON ENREGISTRÉ. QuoteWorkspace tient son
//      propre `hasUnsavedChanges`, initialisé au montage puis mis à jour par
//      ses seules éditions : un setHybridQuote venu du parent ne le marque pas
//      sale. Sans remontage forcé, un devis restauré s'annonçait donc
//      « Enregistré localement » alors qu'il n'avait jamais été enregistré —
//      exactement le mensonge d'indicateur que documente le garde beforeunload,
//      et le plus dangereux des trois : il désarme la protection suivante.
import { pathToFileURL } from 'node:url';
import { launchApp, enterGuestMode, addCatalogItemBySearch } from './lib/harness.mjs';

const wait = (ms = 400) => new Promise((r) => setTimeout(r, ms));
const CLE = 'costcalc:guest:draftQuote';

export async function run() {
    const results = [];
    const ok = (label, cond, detail = '') => results.push({ label, pass: !!cond, detail });

    const { page, close } = await launchApp();
    try {
        await page.setViewport({ width: 1440, height: 900 });
        await enterGuestMode(page);
        await page.evaluate((cle) => { try { localStorage.removeItem(cle); } catch (e) {} }, CLE);

        // Aucun brouillon au départ : aucune bannière de reprise ne doit
        // apparaître, sinon chaque démarrage poserait une question inutile.
        const banniereAuDepart = await page.evaluate(() =>
            [...document.querySelectorAll('button')].some((b) => /Reprendre ce devis/.test(b.textContent || '')));
        ok('Sans brouillon, aucune reprise n\'est proposée', !banniereAuDepart);

        await addCatalogItemBySearch(page, 'Maçonnerie');
        await wait(1600); // anti-rebond d'écriture : 800 ms

        const ecrit = await page.evaluate((cle) => {
            const brut = localStorage.getItem(cle);
            if (!brut) return null;
            const d = JSON.parse(brut);
            return {
                nbOuvrages: (d.quote?.lots || []).reduce((n, l) => n + (l.items || []).length, 0),
                aUnHorodatage: typeof d.at === 'number'
            };
        }, CLE);
        ok('Le devis en cours est écrit sur le disque sans enregistrement', ecrit !== null);
        ok('Le brouillon contient bien l\'ouvrage ajouté', ecrit && ecrit.nbOuvrages > 0, `ouvrages=${ecrit && ecrit.nbOuvrages}`);
        ok('Le brouillon porte un horodatage (affiché à la reprise)', ecrit && ecrit.aUnHorodatage);

        const avant = await page.evaluate(() => {
            const barre = document.querySelector('.quote-totals-bar');
            const m = barre.innerText.replace(/[\s  ]/g, '').match(/TOTALNETHT(\d+)FCFA/);
            return m ? parseInt(m[1], 10) : null;
        });
        ok('Le devis en cours a un montant non nul', avant > 0, `netHT=${avant}`);

        // Rechargement — le geste qui détruisait tout.
        //
        // Le garde `beforeunload` intercepte : Chrome ouvre son dialogue natif
        // « Quitter le site ? » et la navigation reste bloquée tant que
        // personne ne répond. On l'accepte (c'est le cas que l'on veut
        // éprouver : l'utilisateur quitte quand même), et on en profite pour
        // vérifier que ce garde se déclenche bien — l'audit n'avait pas pu le
        // constater, le pilotage automatisé du navigateur le contournant.
        let gardeDeclenche = false;
        page.on('dialog', async (d) => {
            if (d.type() === 'beforeunload') gardeDeclenche = true;
            await d.accept();
        });
        await page.reload({ waitUntil: 'networkidle0' });
        ok('Le garde « Quitter le site ? » se déclenche avant de perdre le devis', gardeDeclenche);
        await wait(1500);
        await page.evaluate(() => {
            const b = [...document.querySelectorAll('button')]
                .find((x) => /Essayer sans compte/.test(x.textContent || '') || (x.textContent.includes('Mode Démo') && x.textContent.includes('Invité')));
            if (b) b.click();
        });
        await wait(2500);

        const apresRechargement = await page.evaluate(() => {
            const barre = document.querySelector('.quote-totals-bar');
            const m = barre ? barre.innerText.replace(/[\s  ]/g, '').match(/TOTALNETHT(\d+)FCFA/) : null;
            return {
                montant: m ? parseInt(m[1], 10) : null,
                reprisePropose: [...document.querySelectorAll('button')].some((b) => /Reprendre ce devis/.test(b.textContent || ''))
            };
        });
        ok('Après rechargement, la reprise est proposée', apresRechargement.reprisePropose);
        ok('Rien n\'est restauré tant que l\'utilisateur n\'a pas accepté',
            apresRechargement.montant !== avant,
            `montant à l'écran=${apresRechargement.montant}`);

        await page.evaluate(() => {
            const b = [...document.querySelectorAll('button')].find((x) => /Reprendre ce devis/.test(x.textContent || ''));
            if (b) b.click();
        });
        await wait(1800);

        const apresReprise = await page.evaluate(() => {
            const barre = document.querySelector('.quote-totals-bar');
            const m = barre.innerText.replace(/[\s  ]/g, '').match(/TOTALNETHT(\d+)FCFA/);
            const etats = [...document.querySelectorAll('*')]
                .filter((e) => e.children.length === 0 && /Enregistré localement|Modifications non enregistrées/.test(e.innerText || ''))
                .map((e) => e.innerText.trim());
            return { montant: m ? parseInt(m[1], 10) : null, etats };
        });
        ok('Le devis repris affiche exactement le montant d\'avant le rechargement',
            apresReprise.montant === avant, `avant=${avant} après=${apresReprise.montant}`);
        ok('Le devis repris est bien signalé NON ENREGISTRÉ (pas « Enregistré localement »)',
            apresReprise.etats.includes('Modifications non enregistrées')
            && !apresReprise.etats.includes('Enregistré localement'),
            `indicateurs=${JSON.stringify(apresReprise.etats)}`);
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
