// Banc d'essai — Étalon G (Villa R+1, 11 lots TCE), tolérance zéro.
//
// Recalibré le 2026-08-16 (voir PROJECT_MASTER_TRACKER.md § 12/§14). Les
// anciennes valeurs cibles (Déboursé 65 M, K=1.404, Net HT 91.26 M,
// TTC 107.68 M) dataient d'avant l'existence du vrai moteur de calcul pour
// ce modèle et se sont révélées irréconciliables avec lui : K=1.404 est
// mathématiquement impossible à atteindre avec margin=30%/reel +
// overheadRate=5% appliqués uniformément (netHT = débourse × 1.5 dès que
// TOUS les lots ont un déboursé réel en face — voir la note ci-dessous) ;
// seule une ligne à prix fixe sans coût calculé pouvait faire descendre le K
// affiché sous 1.5, ce qui était précisément le défaut structurel corrigé
// ci-dessous. Les nouvelles valeurs ci-dessous sont mesurées, pas inventées.
//
// Deux causes corrigées pour arriver à ce résultat :
// 1. Échelle ~2× trop petite. Les quantités/dimensions du modèle 1-clic
//    (terrassement 250 m³, structure 4m×2m...) ont été doublées lot par lot
//    (surfaces, volumes, nombre de baies vitrées) pour représenter une villa
//    R+1 de standing plausible plutôt que la villa modeste calibrée à
//    l'origine.
// 2. Lots Électricité et Plomberie sans déboursé. Contrairement à ce
//    qu'affirmait le § 12 ("aucune recette catalogue n'existe pour
//    l'électricité et la plomberie"), les solutions 15 et 16 existaient déjà
//    dans le catalogue avec de vraies recettes (matériaux + main d'œuvre,
//    voir index_jsx.js ~L6671-6679) — simplement jamais reliées au modèle
//    1-clic, qui utilisait des lignes `isCustom` à prix fixe (3 500 000 et
//    2 800 000 FCFA) sans aucun coût calculé en face. C'était la cause
//    directe de la distorsion du Coeff K documentée au § 12 : ces deux lots
//    gonflaient le Net HT sans jamais contribuer au Déboursé Sec. Reliés à
//    solutionId 15/16 (mode 'unit', 90 points électriques et 10 points
//    sanitaires pour la villa recalibrée) : ils ont maintenant un déboursé
//    réel, et le Coeff K global converge naturellement vers 1.51 — cohérent
//    avec margin=30%/reel + overheadRate=5% appliqués à un devis où tous les
//    lots ont un coût calculé (netHT = débourse × 1.05 / 0.7 = débourse ×
//    1.5, l'écart à 1.51 vs 1.50 pile venant des arrondis d'achat par
//    conditionnement sur les lots matériaux).
//
// Ceci ne remet pas en cause le correctif P0.4 (arrondi conditionnement) ni
// les Étalons A-F : aucune régression sur les 36 autres vérifications de
// `npm test` suite à ce changement.
//
// Recalibré une seconde fois le 2026-08-18 (chantier B2, test d'utilisabilité
// du 17/08). Le lot Maçonnerie (id 9, 176 m² dans ce modèle 1-clic) et le lot
// Carrelage (id 10) étaient tarifés en 'm²' à 3 500 / 4 000 FCFA, mais leurs
// recettes divisaient déjà ce tarif par un rendement m²/jour (formula
// 'SURFACE / RENDEMENT_MO', exactement le modèle de la peinture, id 5, unit
// 'j') — un maçon posant 176 m² ne touchait donc que 41 067 FCFA pour 11,7
// jours de travail, 3 500 FCFA/jour. Les deux ressources sont passées à
// unit 'j' avec un tarif journalier réaliste (12 000 / 13 000 FCFA, binôme
// maçon+aide / carreleur qualifié à Bamako) ; le rendement (15 et 12 m²/jour)
// était déjà juste et n'a pas changé. Voir index_jsx.js, initialLabor id 9/10.
//
// Écart mesuré sur ce devis (deux lots concernés, 640 m² maçonnerie +
// 440 m² carrelage dans le modèle recalibré) : +692 667 FCFA de déboursé,
// qui remonte à +1 039 000 FCFA de Net HT et +1 226 020 FCFA de TTC via le
// coefficient K — lui-même INCHANGÉ à 1.51, confirmant que K est une
// propriété structurelle du barème margin/overhead, indépendante de quelle
// ligne de coût a varié. Valeurs mesurées via ce test lui-même après le
// correctif, pas recalculées à la main.
import { pathToFileURL } from 'node:url';
import { launchApp, enterGuestMode, loadOneClickTemplate, readFinancials } from './lib/harness.mjs';

// Recalibré une troisième fois le 2026-08-26 — audit métier de l'utilisateur.
// Deux décisions de moteur déplacent la base de ce devis, de −271 723 FCFA
// (−0,45 %) sur le déboursé :
//   1. Le devis impute désormais le CONSOMMÉ, plus le conditionnement entier
//      acheté : un reliquat (plaque entamée, modules LED en trop) est du stock
//      réutilisable, pas une charge du premier chantier.
//   2. La perte en % n'est plus appliquée aux ressources DÉNOMBRABLES : on ne
//      consomme pas 1,05 module. Elle reste appliquée aux ressources continues.
// L'écart est faible ici parce que la villa est surtout composée de matières
// achetées « au réel » (m³ de béton, kg d'acier), où consommé et acheté
// coïncident déjà — ce sont les lots à conditionnement fixe qui bougent.
//
// Les nouvelles valeurs sont MESURÉES, et leur cohérence interne est vérifiée :
// netHT / debourseSec = coeffK affiché, et totalTTC = netHT × 1,18 au franc près.
//
// Recalibré une QUATRIÈME fois le 2026-08-26, quelques heures après, sur un bug
// autrement plus grave signalé par l'utilisateur — et que cet étalon laissait
// passer depuis l'origine (02e177d, 2026-08-16) :
//
//   En modes 'rectangle' et 'volume', SURFACE et VOLUME ne comptaient qu'UN
//   exemplaire de l'ouvrage, jamais la quantité. Ici, le lot « Menuiserie
//   Aluminium & Serrurerie » (12 baies de 2,40 × 2,20 m) était chiffré sur
//   5,28 m² au lieu de 63,36 m² — douze fois trop peu. D'où +34 % sur le
//   déboursé de la villa : ce devis était SOUS-FACTURÉ, pas surfacturé.
//
// Pourquoi l'étalon ne l'a jamais vu : il ne vérifiait que des totaux, jamais la
// quantité d'un lot précis, et les étalons A–F n'utilisent que des ouvrages en
// quantité 1 ou des modes ('surface', 'floor', 'linear') qui, eux, appliquaient
// bien la quantité. L'anomalie était donc invisible à 7 étalons sur 7.
// Le coefficient K passe de 1,510 à 1,507 : ce n'est pas un changement de
// politique, seulement la nouvelle répartition entre lots à conditionnement
// (arrondis d'achat) et lots au réel.
const EXPECTED = { debourseSec: 80716652, coeffK: 1.507, netHT: 121674978, totalTTC: 143576474 };
const TOLERANCE = 0;

export async function run() {
    const results = [];
    const ok = (label, cond, detail = '') => results.push({ label, pass: !!cond, detail });

    const { page, close } = await launchApp();
    try {
        await enterGuestMode(page);
        await loadOneClickTemplate(page, 'Construction Villa Duplex R+1');

        const f = await readFinancials(page);

        ok(
            `Déboursé Sec = ${EXPECTED.debourseSec.toLocaleString('fr-FR')} FCFA (tolérance ${TOLERANCE})`,
            f.debourseSec === EXPECTED.debourseSec,
            `mesuré=${f.debourseSec} FCFA`
        );
        ok(
            `Coefficient K = ${EXPECTED.coeffK}`,
            f.coeffK === EXPECTED.coeffK,
            `mesuré=K${f.coeffK}`
        );
        ok(
            `Total Net HT = ${EXPECTED.netHT.toLocaleString('fr-FR')} FCFA (tolérance ${TOLERANCE})`,
            f.totalNetHt === EXPECTED.netHT,
            `mesuré=${f.totalNetHt} FCFA`
        );
        ok(
            `Total TTC = ${EXPECTED.totalTTC.toLocaleString('fr-FR')} FCFA (tolérance ${TOLERANCE})`,
            f.totalTtc === EXPECTED.totalTTC,
            `mesuré=${f.totalTtc} FCFA`
        );
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
