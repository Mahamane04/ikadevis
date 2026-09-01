// Banc d'essai — Audit UX du 2026-08-31, P0 « Aperçu Client & PDF inerte ».
//
// Depuis l'éditeur, le bouton « Aperçu Client & PDF » ne produisait RIEN
// au-dessus de 1024 px : ni fenêtre, ni message, ni erreur. Le livrable du
// produit — le document que l'on envoie au client — était inatteignable par
// son propre bouton sur un écran d'ordinateur. En dessous de 1024 px, le même
// clic ouvrait l'aperçu complet : c'est ce qui rendait le défaut invisible en
// développement mobile-first.
//
// Deux causes superposées, toutes deux nécessaires au correctif :
//   1. `onPreviewQuote` appelait setViewingSavedQuote SANS setActiveView :
//      or en desktop la modale est mobile-only (`lg:hidden`, et elle doit le
//      rester — la retirer superpose la modale au panneau de la vue
//      'savedQuotes' et recouvre toute l'application). Le panneau desktop
//      n'était donc jamais monté.
//   2. `activeQuote` ne cherchait QUE dans savedQuotes. Un devis en cours
//      d'édition n'y figure pas : même en arrivant sur la bonne vue, le
//      panneau affichait « Sélectionnez un devis pour l'afficher ».
//
// Ce banc vérifie le résultat visible par l'utilisateur, pas le mécanisme :
// après le clic, un document de devis lisible est à l'écran, à trois largeurs
// desktop courantes.
import { pathToFileURL } from 'node:url';
import { launchApp, enterGuestMode, addCatalogItemBySearch } from './lib/harness.mjs';

const LARGEURS = [1280, 1440, 1920];
const wait = (ms = 200) => new Promise((r) => setTimeout(r, ms));

export async function run() {
    const results = [];
    const ok = (label, cond, detail = '') => results.push({ label, pass: !!cond, detail });

    for (const largeur of LARGEURS) {
        const { page, close } = await launchApp();
        try {
            await page.setViewport({ width: largeur, height: 900 });
            await enterGuestMode(page);
            await addCatalogItemBySearch(page, 'Maçonnerie');
            await wait(700);

            const clique = await page.evaluate(() => {
                const b = [...document.querySelectorAll('button')]
                    .find((x) => (x.textContent || '').includes('Aperçu Client'));
                if (!b) return false;
                b.click();
                return true;
            });
            ok(`${largeur} px — le bouton « Aperçu Client & PDF » est présent`, clique);
            await wait(1500);

            const vu = await page.evaluate(() => {
                const cartes = [...document.querySelectorAll('.saved-quote-detail-card')].filter((c) => {
                    const cs = getComputedStyle(c);
                    const r = c.getBoundingClientRect();
                    return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 200 && r.height > 200;
                });
                const texte = document.body.innerText;
                return {
                    cartes: cartes.length,
                    document: texte.includes('DEVIS COMMERCIAL'),
                    telecharger: texte.includes('Télécharger le PDF')
                };
            });

            ok(
                `${largeur} px — un aperçu réellement visible s'ouvre (pas un nœud à display:none)`,
                vu.cartes >= 1,
                `cartes visibles=${vu.cartes}`
            );
            ok(
                `${largeur} px — le document client est affiché, pas un état vide`,
                vu.document,
                vu.document ? '' : '« DEVIS COMMERCIAL » absent — panneau probablement retombé sur activeQuote=null'
            );
            ok(`${largeur} px — le téléchargement PDF est proposé`, vu.telecharger);
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
