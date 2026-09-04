// Banc d'essai — modèles préétablis, étape 4 (2026-09-04).
//
// Jusqu'ici « Nouveau modèle » ouvrait toujours le même document : celui déduit
// des réglages de l'entreprise. Autant dire une page blanche — il fallait
// connaître les vingt réglages pour obtenir autre chose.
//
// Un catalogue s'intercale désormais. Ce qui compte, et que ce banc protège :
//
//  1. Les sept modèles produisent des documents RÉELLEMENT différents. Une
//     galerie de sept vignettes identiques serait pire qu'une page blanche :
//     elle promettrait un choix qui n'existe pas. Chaque modèle est donc
//     vérifié sur la propriété qui le définit — densité, aplats, colonnes,
//     niveau de détail — et non sur son seul nom.
//
//  2. Un préétabli est un DELTA, pas une configuration complète : il se pose
//     sur l'identité de l'organisation. Choisir « Compact » ne doit pas effacer
//     au passage le logo, la police et la couleur déjà réglés.
//
//  3. La vignette montre le VRAI devis de l'utilisateur, réduit — pas un
//     exemple inventé. C'est la seule façon de juger une mise en page sur
//     pièce : avec ses intitulés d'ouvrage et ses montants.
import { pathToFileURL } from 'node:url';
import { launchApp, enterGuestMode } from './lib/harness.mjs';

const wait = (ms = 900) => new Promise((r) => setTimeout(r, ms));
const CATALOGUE = '[role="dialog"][aria-label="Choisir un modèle"]';
const EDITEUR = '[role="dialog"][aria-label*="Éditeur de modèle"]';

const cliquer = (page, motif) => page.evaluate((t) => {
    const b = [...document.querySelectorAll('button')]
        .filter((x) => x.getBoundingClientRect().width > 0)
        .find((x) => new RegExp(t, 'i').test(x.textContent || ''));
    if (b) b.click();
    return !!b;
}, motif);

export async function run() {
    const results = [];
    const ok = (label, cond, detail = '') => results.push({ label, pass: !!cond, detail });

    const { page, close } = await launchApp();
    try {
        await page.setViewport({ width: 1600, height: 1000 });
        await enterGuestMode(page, { demo: true });
        await wait(2400);

        await cliquer(page, 'Paramètres du Compte'); await wait(1700);
        await cliquer(page, 'Documents'); await wait(1700);
        await cliquer(page, 'Éditeur de modèles'); await wait(2200);

        // ── Le catalogue s'intercale avant l'éditeur ──────────────────────
        const ouvert = await page.evaluate(() => {
            const g = document.querySelector('[role="dialog"][aria-label*="Modèles"]');
            const b = g && [...g.querySelectorAll('button')]
                .find((x) => /Nouveau modèle|Choisir un modèle|Créer un premier modèle/.test(x.textContent || ''));
            if (b) { b.click(); return true; }
            return false;
        });
        await wait(2200);
        ok('« Nouveau modèle » est proposé dans la galerie', ouvert);
        ok('Il ouvre le catalogue, et non un document nu',
            await page.evaluate((s) => !!document.querySelector(s), CATALOGUE));
        ok('L’éditeur ne s’ouvre pas par-dessus',
            await page.evaluate((s) => !document.querySelector(s), EDITEUR));

        // ── Ce que le catalogue annonce ───────────────────────────────────
        const inventaire = await page.evaluate((s) => {
            const c = document.querySelector(s);
            if (!c) return null;
            return {
                familles: [...c.querySelectorAll('section > h3')].map((h) => h.textContent.trim()),
                cartes: [...c.querySelectorAll('article')].map((a) => ({
                    nom: (a.querySelector('h4') || {}).textContent || '',
                    descriptions: [...a.querySelectorAll('p')].map((p) => p.textContent.trim()).filter(Boolean).length,
                    bouton: [...a.querySelectorAll('button')].some((b) => /Utiliser ceci/.test(b.textContent || '')),
                    apercu: !!a.querySelector('[data-zone-impression]')
                })),
                repartirDeZero: [...c.querySelectorAll('button')].some((b) => /Repartir de zéro/.test(b.textContent || ''))
            };
        }, CATALOGUE);

        ok(`Sept modèles préétablis — ${(inventaire.cartes || []).length}`,
            (inventaire.cartes || []).length === 7);
        ok(`Trois familles — ${JSON.stringify(inventaire.familles)}`,
            (inventaire.familles || []).length === 3);
        ok('Chaque carte porte un nom, une description et « Utiliser ceci »',
            inventaire.cartes.every((c) => c.nom.length > 2 && c.descriptions >= 2 && c.bouton));
        ok('Chaque carte montre un aperçu du document, pas une icône',
            inventaire.cartes.every((c) => c.apercu));
        ok('Partir de ses propres réglages reste possible', inventaire.repartirDeZero);

        // ── La vignette rend le VRAI devis, pas un exemple ────────────────
        const attendu = await page.evaluate(() => {
            const l = JSON.parse(localStorage.getItem('costcalc:guest:savedQuotes') || '[]');
            return l[0] ? { numero: l[0].number, client: l[0].clientName } : null;
        });
        const vu = await page.evaluate((s) => {
            const a = document.querySelector(s + ' article');
            const z = a && a.querySelector('[data-zone-impression]');
            return z ? z.innerText : '';
        }, CATALOGUE);
        ok(`L’aperçu montre le devis de l’utilisateur — ${attendu ? attendu.numero : '(aucun)'}`,
            !!attendu && vu.includes(attendu.numero) && vu.includes(attendu.client));

        // ── Sept modèles, sept documents différents ───────────────────────
        // Le cœur du banc. Chaque modèle est mesuré sur ce qui le définit, dans
        // le DOM du document réduit — pas sur son libellé.
        const mesures = await page.evaluate((s) => {
            const c = document.querySelector(s);
            const sortie = {};
            [...c.querySelectorAll('article')].forEach((a) => {
                const nom = (a.querySelector('h4') || {}).textContent || '';
                const z = a.querySelector('[data-zone-impression]');
                if (!z) return;
                const t = z.querySelector('table');
                const th = t && t.querySelector('thead th');
                const td = t && t.querySelector('tbody td');
                const titre = z.querySelector('h2');
                const enteteLigne = t && t.querySelector('thead tr');
                sortie[nom.trim()] = {
                    colonnes: t ? t.querySelectorAll('thead th').length : 0,
                    lignesCorps: t ? t.querySelectorAll('tbody tr').length : 0,
                    padEntete: th ? getComputedStyle(th).paddingTop : null,
                    padCellule: td ? getComputedStyle(td).paddingTop : null,
                    fondEntete: enteteLigne ? getComputedStyle(enteteLigne).backgroundColor : null,
                    couleurTitre: titre ? getComputedStyle(titre).color : null,
                    hauteur: Math.round(z.getBoundingClientRect().height),
                    // La disposition centrée est la marque du modèle « Marque ».
                    enteteCentree: !!z.querySelector('.flex-col.items-center.text-center'),
                    // Les bandes de nature (Fournitures, Main-d'œuvre) n'existent
                    // que dans le gabarit détaillé.
                    bandesNature: t ? [...t.querySelectorAll('tbody td[colspan]')]
                        .filter((x) => /fourniture|main.d.œuvre|main.d.oeuvre/i.test(x.textContent || '')).length : 0
                };
            });
            return sortie;
        }, CATALOGUE);

        const m = (nom) => mesures[nom] || {};
        const standard = m('Standard');
        const compact = m('Compact');
        const recap = m('Récapitulatif');
        const sobre = m('Sobre');
        const marque = m('Marque');
        const sansPU = m('Sans prix unitaires');
        const detaille = m('Détaillé fournitures & main-d’œuvre');

        ok(`« Standard » sort quatre colonnes — ${standard.colonnes}`, standard.colonnes === 4);
        ok(`« Compact » resserre réellement les interlignes — ${standard.padCellule} → ${compact.padCellule}`,
            !!compact.padCellule && !!standard.padCellule
            && parseFloat(compact.padCellule) < parseFloat(standard.padCellule));
        ok(`« Compact » tient sur moins de hauteur — ${standard.hauteur}px → ${compact.hauteur}px`,
            compact.hauteur > 0 && compact.hauteur < standard.hauteur);
        ok(`« Compact » ne retire aucune ligne du bordereau — ${standard.lignesCorps} → ${compact.lignesCorps}`,
            compact.lignesCorps === standard.lignesCorps);
        ok(`« Récapitulatif » réduit le tableau à deux colonnes — ${recap.colonnes}`, recap.colonnes === 2);
        ok(`« Récapitulatif » ne montre plus les ouvrages — ${standard.lignesCorps} → ${recap.lignesCorps}`,
            recap.lignesCorps > 0 && recap.lignesCorps < standard.lignesCorps);
        ok(`« Sobre » retire l’aplat de l’en-tête — ${sobre.fondEntete}`,
            /rgba\(0, 0, 0, 0\)|transparent/.test(sobre.fondEntete || ''));
        ok(`« Standard » garde le sien — ${standard.fondEntete}`,
            !!standard.fondEntete && !/rgba\(0, 0, 0, 0\)|transparent/.test(standard.fondEntete));
        ok(`« Marque » centre l’en-tête`, marque.enteteCentree === true && standard.enteteCentree === false);
        ok(`« Sans prix unitaires » retire une colonne — ${sansPU.colonnes}`, sansPU.colonnes === 3);
        ok(`« Détaillé » fait apparaître les natures de dépense — ${detaille.bandesNature}`,
            detaille.bandesNature > 0 && standard.bandesNature === 0);

        // Un préétabli est un delta : la couleur de l'organisation survit.
        ok(`« Compact » conserve la couleur de l’organisation — ${compact.couleurTitre}`,
            compact.couleurTitre === standard.couleurTitre);
        ok(`« Sobre » est le seul à imposer la sienne — ${sobre.couleurTitre}`,
            sobre.couleurTitre === 'rgb(31, 41, 51)' && sobre.couleurTitre !== standard.couleurTitre);

        // ── « Utiliser ceci » remplit l'éditeur ───────────────────────────
        await page.evaluate((s) => {
            const c = document.querySelector(s);
            const a = [...c.querySelectorAll('article')]
                .find((x) => /^Compact$/.test(((x.querySelector('h4') || {}).textContent || '').trim()));
            const b = a && [...a.querySelectorAll('button')].find((x) => /Utiliser ceci/.test(x.textContent || ''));
            if (b) b.click();
        }, CATALOGUE);
        await wait(2200);

        const dansEditeur = await page.evaluate((s) => {
            const d = document.querySelector(s);
            if (!d) return { ouvert: false };
            const nom = d.querySelector('input[aria-label="Nom du modèle"]');
            const td = d.querySelector('[data-zone-impression] tbody td');
            return {
                ouvert: true,
                nom: nom ? nom.value : null,
                padCellule: td ? getComputedStyle(td).paddingTop : null,
                catalogueFerme: !document.querySelector('[role="dialog"][aria-label="Choisir un modèle"]')
            };
        }, EDITEUR);

        ok('« Utiliser ceci » ouvre l’éditeur', dansEditeur.ouvert);
        ok('Le catalogue se referme derrière lui', dansEditeur.catalogueFerme);
        ok(`Le modèle arrive nommé — « ${dansEditeur.nom} »`, dansEditeur.nom === 'Compact');
        ok(`L’éditeur montre déjà la mise en page choisie — ${dansEditeur.padCellule}`,
            dansEditeur.padCellule === compact.padCellule);

        // ── Enregistrer, et le document réel suit ─────────────────────────
        await page.evaluate((s) => {
            const d = document.querySelector(s);
            const b = [...d.querySelectorAll('button')].find((x) => /^Enregistrer$/.test(x.textContent.trim()));
            if (b) b.click();
        }, EDITEUR);
        await wait(2500);
        await page.evaluate(() => {
            const g = document.querySelector('[role="dialog"][aria-label*="Modèles"]');
            const b = g && [...g.querySelectorAll('button')].find((x) => /^Fermer$/.test(x.textContent.trim()));
            if (b) b.click();
        });
        await wait(1400);
        await page.evaluate(() => {
            const b = [...document.querySelectorAll('aside button')].find((x) => (x.textContent || '').trim().startsWith('Mes devis'));
            if (b) b.click();
        });
        await wait(1800);
        await page.evaluate(() => { const tr = document.querySelector('tbody tr'); if (tr) tr.click(); });
        await wait(2400);

        const documentReel = await page.evaluate(() => {
            const z = document.querySelector('[data-zone-impression]');
            const td = z && z.querySelector('table tbody td');
            return td ? getComputedStyle(td).paddingTop : null;
        });
        ok(`Le document envoyé au client prend la mise en page choisie — ${documentReel}`,
            documentReel === compact.padCellule);
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
