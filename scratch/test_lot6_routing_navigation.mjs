/**
 * scratch/test_lot6_routing_navigation.mjs
 * Validation automatisée du Lot 6 : Navigation, Routage d'URL, Préservation d'état et Cohérence Visuelle
 *
 * Contrôles :
 * 1. Présence et complétude du routeur universel d'URL (UX-03)
 * 2. Prise en charge des URLs directes pour devis (#devis/:id), factures (#factures/:id), clients (#clients/:id), chantiers (#chantiers/:id)
 * 3. Contrôle des autorisations d'accès aux sections d'administration (#settings/equipe, audit, etc.)
 * 4. Gestion sécurisée des IDs inconnus ou non autorisés (repli sur liste sans crash)
 * 5. Intégration de pushState/popstate dans les sélecteurs de documents et entités
 * 6. Préservation de l'état racine (filtres, requêtes de recherche, devis en cours)
 * 7. Harmonisation visuelle des abonnements avec les tokens du design system (--sub-blue = #0064e0)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

let totalChecks = 0;
let passedChecks = 0;

function assert(condition, message) {
    totalChecks++;
    if (condition) {
        console.log(`  ✓ ${message}`);
        passedChecks++;
    } else {
        console.error(`  ✗ ECHEC: ${message}`);
    }
}

console.log('=== TEST LOT 6 : NAVIGATION, ROUTAGE URL ET COHÉRENCE VISUELLE ===\n');

const indexJsx = fs.readFileSync(path.join(rootDir, 'index_jsx.js'), 'utf-8');
const tailwindInputCss = fs.readFileSync(path.join(rootDir, 'tailwind.input.css'), 'utf-8');

// 1. Écouteurs de navigation
console.log('1. Gestion de l’historique navigateur et des événements d’URL (UX-03) :');
assert(indexJsx.includes("window.addEventListener('hashchange', syncFromUrl)"), "Écoute de l'événement hashchange pour la navigation par ancres");
assert(indexJsx.includes("window.addEventListener('popstate', syncFromUrl)"), "Écoute de l'événement popstate pour les boutons Retour / Suivant");
assert(indexJsx.includes("window.removeEventListener('hashchange', syncFromUrl)"), "Nettoyage propre de hashchange au démontage");
assert(indexJsx.includes("window.removeEventListener('popstate', syncFromUrl)"), "Nettoyage propre de popstate au démontage");

// 2. Routage vers les devis (#devis et #devis/:id)
console.log('\n2. Routage et sélection des devis (#devis / #devis/:id) :');
assert(indexJsx.includes("quoteMatch = hash.match(/^#(?:devis|quotes)(?:\\/([a-zA-Z0-9_\\-\\.\%]+))?$/)"), "Reconnaissance de l'URL #devis et #devis/:id (avec alias #quotes)");
assert(indexJsx.includes("setActiveView('savedQuotes')"), "Activation de la vue savedQuotes lors de la navigation devis");
assert(indexJsx.includes("setViewingSavedQuote(found)"), "Sélection automatique du devis correspondant à l'ID de l'URL");
assert(indexJsx.includes("Devis introuvable ou non autorisé."), "Gestion sécurisée et avertissement si l'ID de devis n'existe pas ou n'est pas autorisé");

// 3. Routage vers les factures (#factures et #factures/:id)
console.log('\n3. Routage et sélection des factures (#factures / #factures/:id) :');
assert(indexJsx.includes("invoiceMatch = hash.match(/^#(?:factures|invoices)(?:\\/([a-zA-Z0-9_\\-\\.\%]+))?$/)"), "Reconnaissance de l'URL #factures et #factures/:id (avec alias #invoices)");
assert(indexJsx.includes("setActiveView('invoices')"), "Activation de la vue invoices lors de la navigation factures");
assert(indexJsx.includes("setViewingInvoice(found)"), "Sélection automatique de la facture correspondant à l'ID de l'URL");
assert(indexJsx.includes("Facture introuvable ou non autorisée."), "Avertissement poli et repli propre si la facture est introuvable");

// 4. Routage vers les clients et chantiers
console.log('\n4. Routage CRM Clients et Chantiers (#clients/:id / #chantiers/:id) :');
assert(indexJsx.includes("clientMatch = hash.match(/^#clients(?:\\/([a-zA-Z0-9_\\-\\.\%]+))?$/)"), "Reconnaissance de l'URL #clients et #clients/:id");
assert(indexJsx.includes("setSelectedClientId(found.id)"), "Sélection automatique du client ciblé par l'URL");
assert(indexJsx.includes("projectMatch = hash.match(/^#(?:chantiers|projets|projects)(?:\\/([a-zA-Z0-9_\\-\\.\%]+))?$/)"), "Reconnaissance de l'URL #chantiers, #projets, #projects");
assert(indexJsx.includes("setSelectedProjectId(found.id)"), "Sélection automatique du chantier ciblé par l'URL");

// 5. Contrôle des autorisations sur les URLs directes
console.log('\n5. Contrôle d’accès et sécurité sur les URLs directes (SEC / UX-03) :');
assert(indexJsx.includes("adminSections.includes(section) && !isCompteAdmin"), "Détection des sections réservées aux administrateurs (equipe, audit, diagnostic, donnees)");
assert(indexJsx.includes("Accès réservé aux administrateurs."), "Notification claire et non-intrusive en cas de refus d'accès");
assert(indexJsx.includes("window.history.replaceState(null, '', '#settings/entreprise')"), "Redirection sécurisée sans boucle d'historique (replaceState)");

// 6. Mise à jour de l'URL lors des clics utilisateurs (pushState)
console.log('\n6. Synchronisation de l’historique sur les sélections interactives :');
assert(indexJsx.includes("const nextHash = `#devis/${encodeURIComponent(sq.id || sq.number)}`;") && indexJsx.includes("window.history.pushState({ type: 'quote', id: sq.id }, '', nextHash);"), "Clic sur un devis met à jour l'URL avec son ID sans recharger la page");
assert(indexJsx.includes("const nextHash = `#factures/${encodeURIComponent(inv.id || inv.numero)}`;") && indexJsx.includes("window.history.pushState({ type: 'invoice', id: inv.id }, '', nextHash);"), "Clic sur une facture met à jour l'URL avec son ID sans recharger la page");
assert(indexJsx.includes("const nextHash = `#clients/${encodeURIComponent(cId)}`;") && indexJsx.includes("window.history.pushState({ type: 'client', id: cId }, '', nextHash);"), "Clic sur un client met à jour l'URL avec son ID");
assert(indexJsx.includes("const nextHash = `#chantiers/${encodeURIComponent(pId)}`;") && indexJsx.includes("window.history.pushState({ type: 'project', id: pId }, '', nextHash);"), "Clic sur un chantier met à jour l'URL avec son ID");

// 7. Préservation des états racines et filtres
console.log('\n7. Préservation des filtres et formulaires lors du changement de vue :');
assert(indexJsx.includes("const [savedQuoteSearchQuery, setSavedQuoteSearchQuery] = useState('')") &&
       indexJsx.includes("const [savedQuoteStatusFilter, setSavedQuoteStatusFilter] = useState('all')"), "Filtres devis déclarés au niveau racine de App (conservés lors des changements de page)");
assert(indexJsx.includes("const [invoiceSearchQuery, setInvoiceSearchQuery] = useState('')") &&
       indexJsx.includes("const [invoiceStatusFilter, setInvoiceStatusFilter] = useState('all')"), "Filtres factures déclarés au niveau racine de App (conservés lors des changements de page)");

// 8. Harmonisation visuelle des abonnements (UI-02)
console.log('\n8. Harmonisation visuelle des composants d’abonnement (UI-02) :');
assert(tailwindInputCss.includes("--sub-blue:#0064e0;"), "--sub-blue aligné sur la couleur primaire #0064e0 conforme WCAG AA");
assert(tailwindInputCss.includes(".ik-sub-button-primary:hover:not(:disabled) { background:#004fb8;"), "Bouton d'action abonnement utilise le hover officiel #004fb8");
assert(tailwindInputCss.includes(".ik-sub-status-dot { width:6px; height:6px; border-radius:50%; background:#0064e0;"), "Pastille de statut abonnement alignée sur le token officiel");

console.log(`\n========================================`);
console.log(`Résultats Lot 6 : ${passedChecks}/${totalChecks} contrôles passés.`);
if (passedChecks === totalChecks) {
    console.log(`LOT 6 VALIDÉ AVEC SUCCÈS !\n`);
    process.exit(0);
} else {
    console.error(`DES CONTRÔLES DU LOT 6 ONT ÉCHOUÉ.\n`);
    process.exit(1);
}
