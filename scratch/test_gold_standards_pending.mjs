// Étalons B à G (Carrelage, Métallerie, Menuiserie, Enseigne LED, Façade ACM,
// Villa R+1) — PAS ENCORE implémentés en E2E, volontairement marqués "pending"
// plutôt que fabriqués pour passer artificiellement.
//
// Le Test A (voir test_gold_standard_a_peinture.mjs) a révélé que le calcul
// réel divergeait de la documentation (facteur de pertes 8% non documenté,
// pas d'arrondi à l'unité de conditionnement achetée). Il est probable que
// B, C, D, E, F, G aient le même type d'écart — mais on ne peut pas l'affirmer
// sans les rejouer un par un dans l'UI comme A, ce qui n'a pas été fait ici
// faute de temps dans cette passe.
//
// Pour compléter un étalon : dupliquer test_gold_standard_a_peinture.mjs,
// remplacer le terme de recherche catalogue et le mode de métré (voir
// PROJECT_MASTER_TRACKER.md § 5 pour les valeurs attendues et § "Modes" du
// catalogue pour le mode de métré correct : volume, rectangle, floor, etc.)
import { pathToFileURL } from 'node:url';

const PENDING = [
    { id: 'B', name: 'Carrelage Sol (120 m², cartons 1.44 m²)' },
    { id: 'C', name: 'Garde-Corps Métallerie (30 ml, plan de débit 1D)' },
    { id: 'D', name: 'Dressing Menuiserie (3.0×2.5 m, caissons)' },
    { id: 'E', name: 'Enseigne Lumineuse LED (6.0×1.2 m)' },
    { id: 'F', name: 'Façade Panneaux ACM (180 m²)' },
    { id: 'G', name: 'Villa R+1 (11 lots TCE)' },
];

export async function run() {
    return PENDING.map((t) => ({
        label: `Étalon ${t.id} — ${t.name}`,
        pass: null, // null = non exécuté, à ne pas confondre avec un succès
        detail: 'Non implémenté dans cette passe — voir commentaire en tête de fichier.'
    }));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    const results = await run();
    for (const r of results) console.log(`  ⏳ ${r.label} — ${r.detail}`);
    console.log(`\n  ${results.length} étalons en attente d'implémentation (non comptés dans le score pass/fail).`);
    process.exit(0);
}
