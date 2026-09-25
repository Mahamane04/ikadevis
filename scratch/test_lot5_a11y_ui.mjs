/**
 * scratch/test_lot5_a11y_ui.mjs
 * Validation automatisée du Lot 5 : Composants UI, Accessibilité WCAG AA et Fluidité
 *
 * Contrôles :
 * 1. Ratio de contraste WCAG AA (.btn-primary >= 4.5:1 sur blanc)
 * 2. Suppression des délais artificiels (DUREE_TRANSITION_PAGE_MS === 0 et DUREE_TRANSITION_DETAIL_MS === 0)
 * 3. Support de la touche Escape et focus sur les modales de facturation/paiement/avoirs
 * 4. Présence des attributs d'accessibilité ARIA (role="dialog", aria-modal="true")
 * 5. Typage sémantique et annonce du Toast (info, warning, error, success)
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

// Calcul de luminance relative et ratio de contraste WCAG
function parseHexColor(hex) {
    const cleaned = hex.replace('#', '');
    const num = parseInt(cleaned, 16);
    return {
        r: (num >> 16) & 255,
        g: (num >> 8) & 255,
        b: num & 255
    };
}

function getRelativeLuminance({ r, g, b }) {
    const sRGB = [r, g, b].map(val => {
        const v = val / 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * sRGB[0] + 0.7152 * sRGB[1] + 0.0722 * sRGB[2];
}

function getContrastRatio(hex1, hex2) {
    const lum1 = getRelativeLuminance(parseHexColor(hex1));
    const lum2 = getRelativeLuminance(parseHexColor(hex2));
    const brightest = Math.max(lum1, lum2);
    const darkest = Math.min(lum1, lum2);
    return (brightest + 0.05) / (darkest + 0.05);
}

console.log('=== TEST LOT 5 : UI & ACCESSIBILITÉ WCAG AA ===\n');

// 1. Contraste .btn-primary
console.log('1. Contrôle des contrastes couleur (A11Y-01) :');
const indexHtml = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf-8');
const btnPrimaryMatch = indexHtml.match(/\.btn-primary\s*\{[^}]*background-color:\s*(#[0-9a-fA-F]{6})/);
assert(btnPrimaryMatch !== null, 'Définition CSS de .btn-primary trouvée dans index.html');
if (btnPrimaryMatch) {
    const primaryBg = btnPrimaryMatch[1];
    const ratioOnWhite = getContrastRatio(primaryBg, '#ffffff');
    console.log(`     Couleur .btn-primary: ${primaryBg}, Ratio sur blanc: ${ratioOnWhite.toFixed(2)}:1`);
    assert(ratioOnWhite >= 4.5, `Ratio de contraste >= 4.5:1 conforme WCAG AA texte normal (${ratioOnWhite.toFixed(2)}:1)`);
}

// 2. Délais de transition (UX-04)
console.log('\n2. Contrôle de fluidité et suppression des latences artificielles (UX-04) :');
const indexJsx = fs.readFileSync(path.join(rootDir, 'index_jsx.js'), 'utf-8');

const pageTransMatch = indexJsx.match(/const\s+DUREE_TRANSITION_PAGE_MS\s*=\s*(\d+);/);
assert(pageTransMatch !== null && parseInt(pageTransMatch[1], 10) === 0, 'DUREE_TRANSITION_PAGE_MS est fixé à 0 ms (navigation fluide instantanée)');

const detailTransMatch = indexJsx.match(/const\s+DUREE_TRANSITION_DETAIL_MS\s*=\s*(\d+);/);
assert(detailTransMatch !== null && parseInt(detailTransMatch[1], 10) === 0, 'DUREE_TRANSITION_DETAIL_MS est fixé à 0 ms (sélection ouvrage/matière instantanée)');

// 3. Gestion du clavier Escape sur les modales
console.log('\n3. Clavier et fermeture accessible Escape sur les modales (A11Y-02 / UI-01) :');
const escapeInPaymentModal = indexJsx.includes("function InvoicePaymentModal") && indexJsx.slice(indexJsx.indexOf("function InvoicePaymentModal"), indexJsx.indexOf("function InvoicePaymentReceiptModal")).includes("e.key === 'Escape'");
assert(escapeInPaymentModal, "InvoicePaymentModal intercepte 'Escape' pour fermer la modale");

const escapeInReceiptModal = indexJsx.includes("function InvoicePaymentReceiptModal") && indexJsx.slice(indexJsx.indexOf("function InvoicePaymentReceiptModal"), indexJsx.indexOf("function InvoiceCreditNoteModal")).includes("e.key === 'Escape'");
assert(escapeInReceiptModal, "InvoicePaymentReceiptModal intercepte 'Escape' pour fermer la modale");

const escapeInCreditNoteModal = indexJsx.includes("function InvoiceCreditNoteModal") && indexJsx.slice(indexJsx.indexOf("function InvoiceCreditNoteModal"), indexJsx.indexOf("function InvoicePreviewModal")).includes("e.key === 'Escape'");
assert(escapeInCreditNoteModal, "InvoiceCreditNoteModal intercepte 'Escape' pour fermer la modale");

const escapeInPreviewModal = indexJsx.includes("function InvoicePreviewModal") && indexJsx.slice(indexJsx.indexOf("function InvoicePreviewModal"), indexJsx.indexOf("function InvoiceEmailComposerModal")).includes("e.key === 'Escape'");
assert(escapeInPreviewModal, "InvoicePreviewModal intercepte 'Escape' pour fermer la modale");

const escapeInComposerModal = indexJsx.includes("function InvoiceEmailComposerModal") && indexJsx.slice(indexJsx.indexOf("function InvoiceEmailComposerModal"), indexJsx.indexOf("function InvoiceEmailComposerModal") + 2500).includes("e.key === 'Escape'");
assert(escapeInComposerModal, "InvoiceEmailComposerModal intercepte 'Escape' pour fermer la modale");

// 4. Attributs ARIA pour modales
console.log('\n4. Attributs ARIA pour modales (A11Y-02) :');
assert(indexJsx.includes('role="dialog"') && indexJsx.includes('aria-modal="true"'), 'Présence de role="dialog" et aria-modal="true" sur les conteneurs modaux');

// 5. Toast sémantique
console.log('\n5. Typage et annonce sémantique du Toast (UX-02) :');
const hasInfoToast = indexJsx.includes("const estInfo = toast.type === 'info'");
assert(hasInfoToast, "Toast supporte le type 'info'");

const hasSkyPastille = indexJsx.includes("estInfo ? 'bg-sky-500/20 text-sky-400'");
assert(hasSkyPastille, "Toast 'info' dispose d'une pastille visuelle dédiée (bleu ciel)");

const hasInfoIcon = indexJsx.includes("estInfo ? 'fa-circle-info'");
assert(hasInfoIcon, "Toast 'info' utilise l'icône fa-circle-info");

const hasAriaPolite = indexJsx.includes("role={estErreur ? 'alert' : 'status'}") && indexJsx.includes("aria-live={estErreur ? 'assertive' : 'polite'}");
assert(hasAriaPolite, "Toast différencie les erreurs (alert/assertive) et les notifications normales (status/polite)");

console.log(`\n========================================`);
console.log(`Résultats Lot 5 : ${passedChecks}/${totalChecks} contrôles passés.`);
if (passedChecks === totalChecks) {
    console.log(`LOT 5 VALIDÉ AVEC SUCCÈS !\n`);
    process.exit(0);
} else {
    console.error(`DES CONTRÔLES DU LOT 5 ONT ÉCHOUÉ.\n`);
    process.exit(1);
}
