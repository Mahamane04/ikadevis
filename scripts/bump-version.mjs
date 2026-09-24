// Bump AUTOMATIQUE du cache-buster ?v= dans index.html, à partir d'un hash
// du contenu réellement produit par le build (tailwind.css, app.compiled.js
// et les modules js/ chargés à côté de lui).
//
// Jusqu'ici ce jeton était bumpé À LA MAIN (voir l'historique de ce
// commentaire dans index.html, P0.9 2026-08-17) — et ça a fini par sauter :
// le refactor barre de navigation du 2026-09-15 (suppression du burger
// d'en-tête, ajout du tiroir de recommandations en bas d'écran) a changé
// app.compiled.js ET tailwind.css sans toucher au jeton. Résultat : tout
// onglet ou installation PWA qui avait déjà une copie en cache a continué à
// servir l'ANCIEN bundle indéfiniment, sans le moindre signal d'erreur — le
// menu du bas restait absent pour ces sessions-là pendant que les sessions
// fraîches (cache vide) recevaient déjà le correctif. Exactement le bug déjà
// documenté pour tailwind.css seul le 2026-08-17, mais cette fois sur le JS.
// Un jeton dérivé du contenu ne peut pas être « oublié » : il change quand,
// et seulement quand, le contenu change réellement.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const hacher = (tampons) => createHash('sha256').update(Buffer.concat(tampons)).digest('hex').slice(0, 10);

// Les 4 fichiers JS sont toujours servis ensemble (calc-engine.js porte le
// parser AST, utils.js le formatage, quote-templates.js les modèles, et
// app.compiled.js les consomme tous) : un seul jeton partagé pour les 4,
// comme la convention manuelle précédente le faisait déjà.
const FICHIERS_JS = [
    'js/finance-core.js',
    'js/calc-engine.js',
    'js/utils.js',
    'js/quote-templates.js',
    'js/saspay-platform-config.js',
    'js/saspay-service.js',
    'js/subscription-service.js',
    'app.compiled.js'
];
const jetonJs = hacher(FICHIERS_JS.map((f) => readFileSync(path.join(racine, f))));
const jetonCss = hacher([readFileSync(path.join(racine, 'tailwind.css'))]);

const cheminHtml = path.join(racine, 'index.html');
let html = readFileSync(cheminHtml, 'utf-8');
let remplacements = 0;

for (const fichier of FICHIERS_JS) {
    const echappe = fichier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(${echappe}\\?v=)[0-9a-zA-Z]+`, 'g');
    html = html.replace(re, (_, prefixe) => { remplacements++; return prefixe + jetonJs; });
}
{
    const re = /(tailwind\.css\?v=)[0-9a-zA-Z]+/g;
    html = html.replace(re, (_, prefixe) => { remplacements++; return prefixe + jetonCss; });
}

writeFileSync(cheminHtml, html);
console.log(`  cache-buster dérivé — JS ${jetonJs} (${FICHIERS_JS.length} fichiers) · CSS ${jetonCss} · ${remplacements} référence(s) mise(s) à jour dans index.html`);
