// Étalons C et D (Garde-Corps Métallerie, Dressing Menuiserie) — PAS testables
// en l'état, pour une raison structurelle précise, pas un manque de temps :
//
// Le tracker (§ 5 et § 6) décrit ces deux étalons comme pilotés par des
// calculateurs dynamiques dédiés — "Plan de Débit 1D" pour la métallerie
// (30 ml → 31 poteaux, 3 lisses → 22 barres optimisées) et "Calepinage 2D"
// pour le dressing (3.0×2.5 m → 28.5 m² → 6 panneaux mélaminé). Les modèles
// "1-clic" du même nom dans l'Assistant Intelligent (METALLERIE_PRO_TEMPLATE_QUOTE
// et MENUISERIE_PRO_TEMPLATE_QUOTE, index_jsx.js) portent bien ces noms, mais
// sont entièrement composés de lignes libres figées (isCustom: true, qty/prix
// écrits en dur) — PAS d'un calcul paramétrable par ml ou m². Charger ces
// modèles donne des chiffres complètement différents (36 barres de 50x50mm à
// 18 500 FCFA, 8 plaques mélaminé 2.80×2.07m...) qui ne correspondent à aucun
// des deux scénarios documentés dans le tracker.
//
// Autrement dit : le calculateur "Plan de Débit 1D" / "Calepinage 2D" décrit
// dans le tracker comme fonctionnel n'existe pas en tant que fonctionnalité
// paramétrable dans l'app livrée — seul un nom de modèle de démo identique
// existe, avec un contenu sans rapport. Un test ne peut pas combler cet écart :
// soit la fonctionnalité reste à construire, soit le tracker doit être corrigé
// pour ne plus la présenter comme acquise (§ 6, Bloc 4 "7 assistants métiers
// spécialisés" — 2 des 7 semblent donc être des démos statiques, pas des
// générateurs réels).
//
// (Étalon G — Villa R+1 — utilise lui un vrai calcul dynamique solutionId/
// calcForm par lot ; voir test_gold_standard_g_villa.mjs, qui est implémenté
// et échoue pour une raison différente : écart de calibrage des quantités.)
import { pathToFileURL } from 'node:url';

const PENDING = [
    {
        id: 'C',
        name: 'Garde-Corps Métallerie (30 ml, plan de débit 1D)',
        reason: 'Le modèle "Métallerie, Châssis Acier & Plan de Débit" est une démo à lignes figées, pas un calculateur paramétrable par ml.'
    },
    {
        id: 'D',
        name: 'Dressing Menuiserie (3.0×2.5 m, caissons)',
        reason: 'Le modèle "Menuiserie, Dressing & Caissons Meuble" est une démo à lignes figées, pas un calculateur paramétrable par m².'
    },
];

export async function run() {
    return PENDING.map((t) => ({
        label: `Étalon ${t.id} — ${t.name}`,
        pass: null, // null = non testable en l'état, à ne pas confondre avec un succès
        detail: t.reason
    }));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    const results = await run();
    for (const r of results) console.log(`  ⏳ ${r.label} — ${r.detail}`);
    console.log(`\n  ${results.length} étalons non testables en l'état (écart structurel documenté, pas un TODO de test).`);
    process.exit(0);
}
