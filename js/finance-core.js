// Noyau financier — pur JS, aucune dépendance React/JSX/Supabase.
// Créé le 2026-09-17 pour le socle du module Finances.
// Chargé en script classique AVANT app.compiled.js (voir index.html), comme
// calc-engine.js / utils.js / quote-templates.js : tout est en portée globale,
// pas de import/export ES module.
//
// Pourquoi un fichier à part plutôt que 6 000 lignes de plus dans index_jsx.js :
// sans React ni DOM, ce code se teste en node:vm SANS Chromium. Une assertion
// numérique coûte alors des microsecondes au lieu d'un lancement Puppeteer de
// 3 à 8 secondes, ce qui rend réaliste d'écrire les centaines d'assertions que
// des calculs d'argent méritent.
//
// ⚠️ Si ce fichier est renommé ou dupliqué, mettre à jour FICHIERS_JS dans
// scripts/bump-version.mjs : un fichier js/ absent de cette liste n'entre pas
// dans le jeton ?v= et les navigateurs servent l'ancienne copie indéfiniment,
// sans la moindre erreur visible.

// ── Précision monétaire ───────────────────────────────────────────────────
//
// Nombre de décimales de la sous-unité, par code ISO 4217. Le franc CFA n'a
// pas de sous-unité en circulation : XOF et XAF valent 0, et c'est ce qui
// permet d'introduire les centimes pour l'euro sans déplacer d'un seul franc
// les montants des devis existants.
const MINOR_UNITS = {
    XOF: 0, XAF: 0, JPY: 0, KRW: 0, CLP: 0, ISK: 0, VND: 0,
    EUR: 2, USD: 2, MAD: 2, NGN: 2, GHS: 2, CAD: 2, GBP: 2, CHF: 2,
    CNY: 2, ZAR: 2, AUD: 2, SEK: 2, DKK: 2, NOK: 2,
    TND: 3, KWD: 3, BHD: 3, OMR: 3, JOD: 3, LYD: 3, IQD: 3
};

// Précision par défaut quand la devise est inconnue du référentiel.
// 0 et non 2 : le parc est en FCFA, et un défaut à 2 introduirait des centimes
// là où l'application n'en a jamais affiché.
const MINOR_UNIT_DEFAUT = 0;

// L'application manipule le libellé 'FCFA' (js/utils.js:6-11 et ~22 replis
// `|| 'FCFA'`). La base, elle, parle ISO. Ce pont évite de renommer quoi que
// ce soit dans les 29 000 lignes existantes.
const ALIAS_DEVISES = {
    FCFA: 'XOF', 'F CFA': 'XOF', CFA: 'XOF', 'FCFA BCEAO': 'XOF', 'FCFA BEAC': 'XAF',
    '€': 'EUR', EURO: 'EUR', EUROS: 'EUR',
    $: 'USD', DOLLAR: 'USD', DOLLARS: 'USD',
    DH: 'MAD', DIRHAM: 'MAD', '£': 'GBP'
};

// 'FCFA' → 'XOF'. Une devise déjà ISO ressort inchangée ; une devise inconnue
// ressort en majuscules, sans invention ni repli silencieux sur XOF.
function versIso(devise) {
    const brut = String(devise === null || devise === undefined ? '' : devise).trim();
    if (!brut) return 'XOF';
    const majuscule = brut.toUpperCase();
    return ALIAS_DEVISES[majuscule] || majuscule;
}

// Nombre de décimales à utiliser pour une devise donnée (libellé app ou ISO).
function decimalesDevise(devise) {
    const iso = versIso(devise);
    return Object.prototype.hasOwnProperty.call(MINOR_UNITS, iso)
        ? MINOR_UNITS[iso]
        : MINOR_UNIT_DEFAUT;
}

// Décale la virgule par manipulation de l'exposant plutôt que par
// multiplication : 1.005 * 100 vaut 100.49999999999999 en IEEE-754, ce qui
// arrondirait 1,005 € à 1,00 € au lieu de 1,01 €. En passant par la notation
// exponentielle, la mantisse n'est pas touchée et le centime est juste.
function decalerVirgule(valeur, decalage) {
    if (!Number.isFinite(valeur)) return NaN;
    const parts = String(valeur).split('e');
    const exposant = parts[1] ? Number(parts[1]) + decalage : decalage;
    return Number(`${parts[0]}e${exposant}`);
}

// LE point d'arrondi monétaire unique.
//
// Invariant non négociable : pour decimales === 0, cette fonction EST
// Math.round — pas un équivalent, la même expression. C'est ce qui garantit
// que les 7 devis étalons (tous en FCFA, donc 0 décimale) rendent exactement
// les mêmes chaînes qu'avant l'introduction de la précision par devise.
// Toute réécriture de cette branche doit être considérée comme un changement
// de comportement sur des montants réels.
//
// Ne PAS faire passer la valeur par cleanFloatNoise (js/calc-engine.js:22-25)
// au passage : un 47 797,4999999 nettoyé à 6 décimales devient 47 797,5 et
// bascule alors à 47 798. Le nettoyage de bruit sert aux paliers de
// conditionnement, pas aux montants.
function arrondiMonetaire(valeur, decimales = 0) {
    const nombre = Number(valeur);
    if (!Number.isFinite(nombre)) return 0;
    if (!decimales) return Math.round(nombre);
    return decalerVirgule(Math.round(decalerVirgule(nombre, decimales)), -decimales);
}

// Arrondi dans la précision d'une devise, sans avoir à passer les décimales.
function arrondiDevise(valeur, devise) {
    return arrondiMonetaire(valeur, decimalesDevise(devise));
}

// ── Répartition d'un montant ──────────────────────────────────────────────
//
// Répartit `total` selon des poids, en garantissant que la somme des parts
// retombe EXACTEMENT sur arrondiMonetaire(total, decimales).
//
// Méthode des plus forts restes (Hamilton) : chaque part reçoit sa valeur
// entière, puis les unités restantes vont aux parts dont la fraction perdue
// est la plus grande. L'alternative — verser tout le reliquat sur la dernière
// tranche — produit un échéancier 40/30/20/10 dont la dernière ligne affiche
// un pourcentage visiblement faux, et toujours la même.
//
// Le tri se fait à fraction égale par index croissant : le résultat est
// déterministe, donc testable à tolérance zéro.
function repartirMontant(total, poids, decimales = 0) {
    const listePoids = Array.isArray(poids) ? poids : [];
    if (listePoids.length === 0) return [];

    const totalNombre = Number(total);
    if (!Number.isFinite(totalNombre)) return listePoids.map(() => 0);

    // Un poids négatif ou non numérique ne veut rien dire ici : il ne prend
    // rien, plutôt que de retirer du montant aux autres.
    const poidsSains = listePoids.map((p) => {
        const valeur = Number(p);
        return Number.isFinite(valeur) && valeur > 0 ? valeur : 0;
    });

    let sommePoids = poidsSains.reduce((a, b) => a + b, 0);
    let poidsEffectifs = poidsSains;
    // Aucun poids exploitable : on répartit à parts égales plutôt que de
    // renvoyer des zéros, ce qui romprait l'invariant Σ = total.
    if (sommePoids <= 0) {
        poidsEffectifs = listePoids.map(() => 1);
        sommePoids = poidsEffectifs.length;
    }

    // On travaille en unités mineures entières : c'est là que l'exactitude se
    // gagne. Le signe est mis de côté puis réappliqué, pour que la troncature
    // se comporte identiquement sur un remboursement et sur un encaissement.
    const signe = totalNombre < 0 ? -1 : 1;
    const totalArrondi = Math.abs(arrondiMonetaire(totalNombre, decimales));
    const totalEnEntiers = Math.round(decalerVirgule(totalArrondi, decimales));

    const parts = poidsEffectifs.map((p, index) => {
        const exact = (totalEnEntiers * p) / sommePoids;
        const base = Math.floor(exact);
        return { index, base, fraction: exact - base };
    });

    let reliquat = totalEnEntiers - parts.reduce((a, p) => a + p.base, 0);

    const ordre = parts
        .slice()
        .sort((a, b) => (b.fraction - a.fraction) || (a.index - b.index));

    for (let i = 0; i < ordre.length && reliquat > 0; i++) {
        ordre[i].base += 1;
        reliquat -= 1;
    }

    return parts.map((p) => signe * decalerVirgule(p.base, -decimales));
}

// ── Conversion de devise ──────────────────────────────────────────────────
//
// Sens du taux, énoncé ici et nulle part ailleurs :
//   `taux` = nombre d'unités de la DEVISE DE BASE de l'organisation pour
//            UNE unité de la devise étrangère.
//   Base XOF, taux 655.957 pour EUR  →  1 EUR = 655,957 FCFA.
//
// C'est le sens que l'utilisateur lit sur un panneau de change, et il ne
// s'inverse donc pas par inattention.
function versBase(montantEtranger, taux, deviseBase) {
    const montant = Number(montantEtranger);
    const tauxNombre = Number(taux);
    if (!Number.isFinite(montant) || !Number.isFinite(tauxNombre)) return 0;
    return arrondiDevise(montant * tauxNombre, deviseBase);
}

function depuisBase(montantBase, taux, deviseEtrangere) {
    const montant = Number(montantBase);
    const tauxNombre = Number(taux);
    // Un taux absent ou nul ne vaut JAMAIS 1 : il doit être demandé.
    // Renvoyer 1 silencieusement fabriquerait une contre-valeur fausse et
    // invisible, ce que le cahier des charges interdit explicitement.
    if (!Number.isFinite(montant) || !Number.isFinite(tauxNombre) || tauxNombre <= 0) return null;
    return arrondiDevise(montant / tauxNombre, deviseEtrangere);
}

// ── Marqueur de paiements legacy ──────────────────────────────────────────
//
// Jusqu'au socle Finances, le détail des règlements n'avait aucune table : il
// était sérialisé dans un commentaire HTML à l'intérieur de invoices.notes,
// écrit par index_jsx.js:10196-10198 sous la forme
//     <!--PAYMENTS:{encodeURIComponent(JSON.stringify(tableau))}-->
//
// Ce parseur sert au contrôle à blanc (p_dry_run) du backfill : il doit
// compter juste, y compris sur les cas que le parc contient réellement
// (accents, apostrophes typographiques, JSON tronqué par une écriture
// interrompue, marqueur écrit deux fois).
const MARQUEUR_PAIEMENTS = /<!--PAYMENTS:(.*?)-->/g;

function parserMarqueurPaiements(notes) {
    const texte = typeof notes === 'string' ? notes : '';
    const resultat = { paiements: [], marqueursTrouves: 0, illisible: false, raison: null };
    if (!texte) return resultat;

    MARQUEUR_PAIEMENTS.lastIndex = 0;
    const charges = [];
    let trouve;
    while ((trouve = MARQUEUR_PAIEMENTS.exec(texte)) !== null) {
        resultat.marqueursTrouves += 1;
        charges.push(trouve[1]);
    }
    if (resultat.marqueursTrouves === 0) return resultat;

    // index_jsx.js:14906 lit le marqueur avec .match(), qui ne renvoie que la
    // PREMIÈRE occurrence : l'application n'a jamais honoré les suivantes.
    // Le backfill doit reproduire ce comportement à l'identique, sinon il
    // ferait apparaître des règlements que l'utilisateur n'a jamais vus.
    const charge = charges[0];
    if (resultat.marqueursTrouves > 1) {
        resultat.raison = 'marqueurs_multiples_seul_le_premier_lu';
    }

    let json;
    try {
        json = decodeURIComponent(charge);
    } catch (e) {
        // Une séquence %XX incomplète fait lever decodeURIComponent.
        resultat.illisible = true;
        resultat.raison = 'url_decode_impossible';
        return resultat;
    }

    let tableau;
    try {
        tableau = JSON.parse(json);
    } catch (e) {
        resultat.illisible = true;
        resultat.raison = 'json_invalide';
        return resultat;
    }

    if (!Array.isArray(tableau)) {
        resultat.illisible = true;
        resultat.raison = 'charge_non_tableau';
        return resultat;
    }

    resultat.paiements = tableau.filter((p) => p && typeof p === 'object');
    if (resultat.paiements.length !== tableau.length) {
        resultat.raison = resultat.raison || 'entrees_non_objet_ignorees';
    }
    return resultat;
}

// Somme des règlements d'un marqueur, dans la précision de la devise. Sert à
// comparer la charge parsée avec invoices.amount_paid : un écart non nul
// interdit de passer du contrôle à blanc au backfill réel.
function sommeMarqueurPaiements(notes, devise) {
    const { paiements } = parserMarqueurPaiements(notes);
    const somme = paiements.reduce((total, p) => {
        const montant = Number(p && p.montant);
        return total + (Number.isFinite(montant) ? montant : 0);
    }, 0);
    return arrondiDevise(somme, devise);
}

// ── État de règlement d'une facture ───────────────────────────────────────
//
// Dérive le statut des MONTANTS, jamais d'une case cochée à part — c'est
// l'exigence du cahier des charges, et ce sera aussi la règle du trigger
// sync_invoice_payment_state() côté Postgres. Les deux doivent donner le même
// résultat : cette fonction est la référence testable des deux.
function etatReglement(netAPayer, montantRegle, devise) {
    const du = arrondiDevise(Number(netAPayer) || 0, devise);
    const regle = arrondiDevise(Number(montantRegle) || 0, devise);
    const solde = arrondiDevise(du - regle, devise);

    let statut;
    if (regle <= 0) statut = 'issued';
    else if (solde > 0) statut = 'partially_paid';
    else statut = 'paid';

    // Un trop-perçu ne rend pas la facture « plus que payée » : le surplus est
    // un montant à imputer ailleurs ou à rembourser, pas une réduction de
    // créance. On le signale plutôt que de le noyer dans un solde négatif.
    return { du, regle, solde: solde > 0 ? solde : 0, tropPercu: solde < 0 ? -solde : 0, statut };
}

// ── Lecture des règlements depuis la table (temps T4) ─────────────────────
//
// Convertit les lignes de payment_allocations (avec leur règlement joint par
// PostgREST : payments(...)) au format que l'application manipule depuis le
// 2026-09-10 — {id, date, montant, mode, reference, note, createdAt} — et les
// regroupe par facture.
//
// `id` reprend legacy_payment_key quand il existe : c'est l'identifiant que
// l'utilisateur a manipulé jusqu'ici, et celui que supprimerReglement cherche.
// `montant` est le montant IMPUTÉ à cette facture, pas le montant total du
// règlement : un virement qui solde deux factures apparaît pour sa part sur
// chacune. Seuls les règlements confirmés comptent (un chèque rejeté non).
function reglementsDepuisImputations(lignes) {
    const parFacture = {};
    (Array.isArray(lignes) ? lignes : []).forEach((l) => {
        if (!l || !l.invoice_id) return;
        const p = l.payments || {};
        if (p.status && p.status !== 'confirmed') return;
        const montant = Number(l.amount);
        if (!Number.isFinite(montant) || montant <= 0) return;
        (parFacture[l.invoice_id] = parFacture[l.invoice_id] || []).push({
            id: p.legacy_payment_key || p.id,
            date: p.payment_date || null,
            montant,
            mode: p.method_detail || null,
            reference: p.reference || '',
            note: p.note || '',
            createdAt: p.created_at || null
        });
    });
    Object.values(parFacture).forEach((liste) =>
        liste.sort((a, b) => String(a.date || '').localeCompare(String(b.date || ''))));
    return parFacture;
}

// ── Paramètres Finances et comptes (§ 71) ─────────────────────────────────
//
// Référentiels d'affichage. DEVISES_CATALOGUE doit rester aligné sur la
// table public.currencies (migrations_finance_socle_2026-09-18.sql).
const DEVISES_CATALOGUE = [
    { code: 'XOF', nom: 'Franc CFA BCEAO', symbole: 'FCFA' },
    { code: 'XAF', nom: 'Franc CFA BEAC', symbole: 'FCFA' },
    { code: 'EUR', nom: 'Euro', symbole: '€' },
    { code: 'USD', nom: 'Dollar américain', symbole: '$' },
    { code: 'MAD', nom: 'Dirham marocain', symbole: 'DH' },
    { code: 'NGN', nom: 'Naira', symbole: '₦' },
    { code: 'GHS', nom: 'Cedi ghanéen', symbole: 'GH₵' },
    { code: 'CAD', nom: 'Dollar canadien', symbole: '$' },
    { code: 'GBP', nom: 'Livre sterling', symbole: '£' },
    { code: 'CHF', nom: 'Franc suisse', symbole: 'CHF' },
    { code: 'TND', nom: 'Dinar tunisien', symbole: 'DT' }
];

const TYPES_COMPTE = {
    bank: 'Compte bancaire',
    cash: 'Caisse',
    mobile_money: 'Mobile money',
    card: 'Carte',
    other: 'Autre'
};

const NATURES_TAXE = {
    standard: 'Taux normal',
    zero: 'Taux zéro',
    exempt: 'Exonéré'
};

const PORTEES_TAXE = {
    both: 'Ventes et achats',
    sale: 'Ventes',
    purchase: 'Achats'
};

// Nature comptable d'une catégorie : elle dira plus tard au moteur d'écritures
// si une sortie d'argent est une charge, un équipement, du stock ou une
// avance — une avance fournisseur n'est pas une charge du chantier.
const NATURES_CATEGORIE = {
    material: 'Matériaux',
    labor: 'Main-d’œuvre',
    subcontract: 'Sous-traitance',
    transport: 'Transport',
    rental: 'Location',
    supplies: 'Fournitures',
    rent: 'Loyer',
    subscription: 'Abonnement',
    bank_fees: 'Frais bancaires',
    equipment: 'Équipement (immobilisation)',
    stock: 'Stock',
    advance: 'Avance fournisseur',
    operating: 'Frais généraux',
    other: 'Autre'
};

// Liste initiale du cahier des charges. Même contenu, même ordre que
// seed_finance_defaults_v1 côté SQL.
const CATEGORIES_DEPENSE_DEFAUT = [
    { name: 'Matériaux', kind: 'material', sort_order: 10 },
    { name: 'Prestations et sous-traitance', kind: 'subcontract', sort_order: 20 },
    { name: 'Main-d’œuvre', kind: 'labor', sort_order: 30 },
    { name: 'Transport', kind: 'transport', sort_order: 40 },
    { name: 'Location', kind: 'rental', sort_order: 50 },
    { name: 'Fournitures', kind: 'supplies', sort_order: 60 },
    { name: 'Loyers', kind: 'rent', sort_order: 70 },
    { name: 'Abonnements', kind: 'subscription', sort_order: 80 },
    { name: 'Frais bancaires', kind: 'bank_fees', sort_order: 90 }
];

const aujourdhuiIso = () => new Date().toISOString().slice(0, 10);
const texteOuNull = (v) => {
    const t = String(v === null || v === undefined ? '' : v).trim();
    return t ? t : null;
};
const libelleTaux = (taux) => `${String(Number(taux)).replace('.', ',')} %`;

// Valeurs initiales reprises des réglages existants de l'entreprise, pour le
// mode local. Miroir de seed_finance_defaults_v1 (SQL) : mêmes taxes, mêmes
// catégories, mêmes comptes repris de « Facturation & envoi ».
function financeDefautsDepuisEntreprise(companyInfo, genId) {
    const info = companyInfo || {};
    const cs = info.commercialSettings || {};
    const id = typeof genId === 'function' ? genId : (() => `fin_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
    let base = versIso(info.currency || 'FCFA');
    if (!DEVISES_CATALOGUE.some((d) => d.code === base)) base = 'XOF';

    const tauxSaisis = Array.isArray(info.vatRates) && info.vatRates.length > 0;
    const taux = (tauxSaisis ? info.vatRates : [18, 10, 0])
        .map(Number)
        .filter((t) => Number.isFinite(t) && t >= 0 && t <= 100);
    const uniques = [...new Set(taux)].sort((a, b) => b - a);
    const defaut = !tauxSaisis || uniques.includes(18) ? 18 : null;
    let premier = true;
    const taxe = (champs) => ({
        id: id(), scope: 'both', is_inclusive: false, is_recoverable: true, legal_mention: null,
        effective_from: aujourdhuiIso(), effective_to: null, is_default: false, is_active: true, ...champs
    });
    const taxes = [];
    uniques.forEach((t) => {
        if (t > 0) {
            taxes.push(taxe({
                name: `TVA ${libelleTaux(t)}`, kind: 'standard', rate: t,
                is_default: defaut !== null ? t === defaut : premier
            }));
            premier = false;
        } else {
            taxes.push(taxe({ name: 'Taux zéro', kind: 'zero', rate: 0 }));
        }
    });
    taxes.push(taxe({ name: 'Exonéré', kind: 'exempt', rate: 0, legal_mention: texteOuNull(info.vatExemptionNote) }));

    const categories = CATEGORIES_DEPENSE_DEFAUT.map((c) => ({ id: id(), ...c, is_active: true }));

    const compte = (champs) => ({
        id: id(), kind: 'other', currency: base, institution: null, holder: null,
        account_number: null, iban: null, bic: null, mobile_number: null,
        opening_balance: 0, opening_date: aujourdhuiIso(), show_on_documents: false,
        is_default: false, is_active: true, notes: null, legacy_source: null, ...champs
    });
    const accounts = [];
    if (texteOuNull(cs.bankName) || texteOuNull(cs.bankAccount)) {
        accounts.push(compte({
            name: texteOuNull(cs.bankName) || 'Compte bancaire', kind: 'bank',
            institution: texteOuNull(cs.bankName), account_number: texteOuNull(cs.bankAccount),
            bic: texteOuNull(cs.bankSwift), show_on_documents: true, is_default: true,
            legacy_source: 'commercial_settings.bank'
        }));
    }
    [['orangeMoneyNumber', 'Orange Money', 'orange_money'],
     ['waveNumber', 'Wave', 'wave'],
     ['moovMoneyNumber', 'Moov Money', 'moov_money']].forEach(([champ, nom, source]) => {
        if (texteOuNull(cs[champ])) {
            accounts.push(compte({
                name: nom, kind: 'mobile_money', institution: nom, mobile_number: texteOuNull(cs[champ]),
                show_on_documents: true, legacy_source: `commercial_settings.${source}`
            }));
        }
    });

    return {
        settings: {
            base_currency: base, enabled_currencies: [base],
            default_payment_terms_days: 30, fiscal_year_start_month: 1
        },
        taxes, categories, accounts
    };
}

const memeNom = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

// Validations : les mêmes règles que les contraintes SQL, pour que
// l'utilisateur lise une phrase claire AVANT l'aller-retour serveur, et pour
// que le mode local (invité) applique exactement les mêmes règles.
function validerTaxe(taxe, autres) {
    const t = taxe || {};
    const erreurs = [];
    const nom = String(t.name || '').trim();
    const taux = Number(t.rate);
    if (!nom) erreurs.push('Donnez un nom à la taxe.');
    else if (nom.length > 60) erreurs.push('Le nom de la taxe est trop long (60 caractères au plus).');
    if (!['standard', 'zero', 'exempt'].includes(t.kind)) erreurs.push('Choisissez la nature de la taxe.');
    if (!Number.isFinite(taux) || taux < 0 || taux > 100) erreurs.push('Le taux doit être compris entre 0 et 100 %.');
    else if (t.kind === 'standard' && taux <= 0) erreurs.push('Un taux normal doit être supérieur à 0 %. Pour 0 %, choisissez « Taux zéro ».');
    else if (t.kind !== 'standard' && taux !== 0) erreurs.push('Un taux zéro ou une exonération ne porte pas de taux.');
    if (t.effective_to && t.effective_from && String(t.effective_to) < String(t.effective_from)) {
        erreurs.push('La date de fin doit suivre la date de début.');
    }
    const autresTaxes = (Array.isArray(autres) ? autres : []).filter((a) => a.id !== t.id);
    if (t.is_default && t.is_active !== false && autresTaxes.some((a) =>
        a.is_default && a.is_active !== false && (a.scope || 'both') === (t.scope || 'both'))) {
        erreurs.push('Une autre taxe est déjà la taxe par défaut pour cette portée.');
    }
    return erreurs;
}

function validerCategorie(categorie, autres) {
    const c = categorie || {};
    const erreurs = [];
    const nom = String(c.name || '').trim();
    if (!nom) erreurs.push('Donnez un nom à la catégorie.');
    else if (nom.length > 60) erreurs.push('Le nom de la catégorie est trop long (60 caractères au plus).');
    if ((Array.isArray(autres) ? autres : []).some((a) => a.id !== c.id && memeNom(a.name, nom))) {
        erreurs.push('Une catégorie porte déjà ce nom.');
    }
    return erreurs;
}

// `contexte.aDesMouvements` : le compte porte déjà des mouvements, sa devise
// d'origine (`contexte.deviseOrigine`) ne peut plus changer.
function validerCompte(compte, autres, contexte) {
    const c = compte || {};
    const ctx = contexte || {};
    const erreurs = [];
    const nom = String(c.name || '').trim();
    if (!nom) erreurs.push('Donnez un nom au compte.');
    else if (nom.length > 80) erreurs.push('Le nom du compte est trop long (80 caractères au plus).');
    if (!Object.prototype.hasOwnProperty.call(TYPES_COMPTE, c.kind)) erreurs.push('Choisissez le type de compte.');
    if (!DEVISES_CATALOGUE.some((d) => d.code === c.currency)) erreurs.push('Choisissez la devise du compte.');
    if (String(c.opening_balance).trim() === '' || !Number.isFinite(Number(c.opening_balance))) erreurs.push('Le solde initial doit être un montant.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(c.opening_date || ''))) erreurs.push('Indiquez la date du solde initial.');
    const autresComptes = (Array.isArray(autres) ? autres : []).filter((a) => a.id !== c.id);
    if (nom && autresComptes.some((a) => memeNom(a.name, nom))) erreurs.push('Un compte porte déjà ce nom.');
    if (c.is_default && c.is_active !== false && autresComptes.some((a) => a.is_default && a.is_active !== false)) {
        erreurs.push('Un autre compte est déjà le compte par défaut.');
    }
    if (ctx.aDesMouvements && ctx.deviseOrigine && c.currency !== ctx.deviseOrigine) {
        erreurs.push('Ce compte porte déjà des mouvements : sa devise ne peut plus être changée.');
    }
    return erreurs;
}

// Calcul d'une taxe sur un montant saisi. Si la taxe est « incluse », le
// montant saisi est TTC et l'on en extrait la taxe ; sinon il est HT. Les
// trois montants sont arrondis dans la devise, et ht + taxe === ttc exactement.
function calculerTaxe(montant, taxe, devise) {
    const m = Number(montant);
    const taux = taxe && taxe.kind === 'standard' ? Number(taxe.rate) || 0 : 0;
    if (!Number.isFinite(m)) return { ht: 0, taxe: 0, ttc: 0 };
    if (taxe && taxe.is_inclusive) {
        const ttc = arrondiDevise(m, devise);
        const ht = arrondiDevise(ttc / (1 + taux / 100), devise);
        return { ht, taxe: arrondiDevise(ttc - ht, devise), ttc };
    }
    const ht = arrondiDevise(m, devise);
    const montantTaxe = arrondiDevise(ht * taux / 100, devise);
    return { ht, taxe: montantTaxe, ttc: arrondiDevise(ht + montantTaxe, devise) };
}

// Solde d'un compte : même règle que la vue v_financial_account_balances.
// Solde initial au DÉBUT du jour opening_date ; les mouvements confirmés à
// partir de cette date s'ajoutent ; les antérieurs sont déjà dans le solde
// initial et sont seulement comptés.
function soldeCompte(compte, mouvements) {
    const c = compte || {};
    const devise = c.currency;
    const initial = arrondiDevise(Number(c.opening_balance) || 0, devise);
    let entrees = 0; let sorties = 0; let anterieurs = 0; let nombre = 0;
    (Array.isArray(mouvements) ? mouvements : []).forEach((m) => {
        if (!m || (m.account_id && m.account_id !== c.id)) return;
        if (m.status && m.status !== 'confirmed') return;
        const montant = Number(m.amount) || 0;
        if (String(m.payment_date || '') < String(c.opening_date || '')) { anterieurs += 1; return; }
        nombre += 1;
        if (m.direction === 'out') sorties += montant; else entrees += montant;
    });
    entrees = arrondiDevise(entrees, devise);
    sorties = arrondiDevise(sorties, devise);
    return {
        soldeInitial: initial, entrees, sorties,
        solde: arrondiDevise(initial + entrees - sorties, devise),
        mouvements: nombre, anterieurs
    };
}

// ── Dépenses et factures fournisseurs (§ 72) ──────────────────────────────
//
// Mêmes règles que migrations_finance_expenses_2026-09-19.sql, pour le mode
// local et pour que l'utilisateur lise la règle AVANT l'aller-retour serveur.

// Montants d'une dépense à partir du montant saisi et de la taxe choisie.
// Taxe « incluse » : le montant saisi est TTC ; sinon il est HT. Les taux
// sont figés dans la dépense (tax_rate, tax_recoverable) : ils ne changeront
// pas si la taxe est modifiée plus tard.
function calculerDepense(montantSaisi, taxe, devise) {
    const t = taxe || null;
    const m = calculerTaxe(montantSaisi, t, devise);
    return {
        amount_ht: m.ht,
        tax_amount: m.taxe,
        amount_ttc: m.ttc,
        tax_rate: t && t.kind === 'standard' ? Number(t.rate) || 0 : 0,
        tax_recoverable: t ? t.is_recoverable !== false : true
    };
}

// Montant à répartir entre chantiers = coût réel : HT si la taxe est
// récupérable, TTC sinon (une taxe non récupérable augmente le coût).
function montantARepartir(depense) {
    const d = depense || {};
    return d.tax_recoverable === false ? Number(d.amount_ttc) || 0 : Number(d.amount_ht) || 0;
}

function validerRepartition(parts, total, devise) {
    const liste = Array.isArray(parts) ? parts : [];
    if (liste.length === 0) return [];
    const erreurs = [];
    if (liste.some((p) => !p || (!p.project_id && !String(p.project_ref || '').trim()))) {
        erreurs.push('Chaque part doit indiquer un chantier.');
    }
    if (liste.some((p) => !(Number(p && p.amount) > 0))) erreurs.push('Chaque part doit avoir un montant positif.');
    const somme = arrondiDevise(liste.reduce((s, p) => s + (Number(p && p.amount) || 0), 0), devise);
    const attendu = arrondiDevise(total, devise);
    if (somme !== attendu) {
        erreurs.push(`La répartition (${somme}) doit retomber exactement sur le montant à répartir (${attendu}).`);
    }
    return erreurs;
}

// `contexte.nouvelle` : création (le compte est alors exigé pour une dépense
// déjà payée) ; `contexte.dejaReglee` : la dépense a un règlement, son
// montant, sa devise et sa nature sont figés.
function validerDepense(depense, contexte) {
    const d = depense || {};
    const ctx = contexte || {};
    const erreurs = [];
    const description = String(d.description || '').trim();
    if (!description) erreurs.push('Décrivez la dépense (ex. « Ciment 50 sacs »).');
    else if (description.length > 200) erreurs.push('La description est trop longue (200 caractères au plus).');
    if (!['expense', 'supplier_invoice'].includes(d.kind)) erreurs.push('Indiquez si la dépense est déjà payée ou à payer.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d.expense_date || ''))) erreurs.push('Indiquez la date de la dépense.');
    if (!(Number(d.amount_ttc) > 0)) erreurs.push('Le montant doit être supérieur à zéro.');
    if (!DEVISES_CATALOGUE.some((c) => c.code === d.currency)) erreurs.push('Choisissez la devise de la dépense.');
    const avance = String(d.advanced_by || '').trim();
    if (d.kind === 'supplier_invoice') {
        if (!d.due_date) erreurs.push('Une facture à payer doit avoir une date d’échéance.');
        if (d.account_id) erreurs.push('Une facture à payer n’a pas encore de compte : il sera choisi au règlement.');
    }
    if (d.due_date && d.expense_date && String(d.due_date) < String(d.expense_date)) {
        erreurs.push('L’échéance ne peut pas précéder la date de la dépense.');
    }
    if (d.kind === 'expense') {
        if (avance && d.account_id) erreurs.push('Une dépense avancée personnellement ne sort d’aucun compte de l’entreprise.');
        if (ctx.nouvelle && !avance && !d.account_id) erreurs.push('Indiquez le compte d’où l’argent est sorti.');
        if (ctx.nouvelle && !avance && d.account_id && ctx.deviseCompte && ctx.deviseCompte !== d.currency) {
            erreurs.push(`Le compte est en ${ctx.deviseCompte}, la dépense en ${d.currency} : choisissez un compte dans la même devise.`);
        }
    }
    if (ctx.dejaReglee && ctx.origine) {
        const o = ctx.origine;
        if (Number(o.amount_ttc) !== Number(d.amount_ttc) || o.currency !== d.currency || o.kind !== d.kind
            || String(o.advanced_by || '').trim() !== avance) {
            erreurs.push('Cette dépense a déjà un règlement : annulez-le avant de changer son montant, sa devise ou sa nature.');
        }
    }
    return erreurs.concat(validerRepartition(d.splits, montantARepartir(d), d.currency));
}

// Statut d'une dépense, dérivé de ses règlements (même règle que
// recalculer_reglement_depense côté SQL).
function etatDepense(depense, reglements) {
    const d = depense || {};
    const devise = d.currency;
    const regle = arrondiDevise((Array.isArray(reglements) ? reglements : [])
        .filter((r) => !r.status || r.status === 'confirmed')
        .reduce((s, r) => s + (Number(r.amount) || 0), 0), devise);
    const du = arrondiDevise(Number(d.amount_ttc) || 0, devise);
    let statut = 'to_pay';
    if (d.status === 'cancelled') statut = 'cancelled';
    else if (regle >= du && du > 0) statut = 'paid';
    else if (regle > 0) statut = 'partially_paid';
    return { regle, reste: Math.max(0, arrondiDevise(du - regle, devise)), statut };
}

// En mode local, les règlements des dépenses sont les mouvements de sortie
// des comptes : ce qui permet à soldeCompte de donner le même solde que la
// vue SQL.
function mouvementsDepuisDepenses(depenses) {
    const mouvements = [];
    (Array.isArray(depenses) ? depenses : []).forEach((d) => {
        (Array.isArray(d && d.reglements) ? d.reglements : []).forEach((r) => {
            mouvements.push({
                account_id: r.account_id, direction: 'out', amount: Number(r.amount) || 0,
                payment_date: r.payment_date, status: r.status || 'confirmed'
            });
        });
    });
    return mouvements;
}

// Exposition explicite, comme js/calc-engine.js:546-548 et 662-665.
if (typeof window !== 'undefined') {
    window.FinanceCore = {
        MINOR_UNITS,
        versIso,
        decimalesDevise,
        arrondiMonetaire,
        arrondiDevise,
        repartirMontant,
        versBase,
        depuisBase,
        parserMarqueurPaiements,
        sommeMarqueurPaiements,
        etatReglement,
        reglementsDepuisImputations,
        DEVISES_CATALOGUE,
        TYPES_COMPTE,
        NATURES_TAXE,
        PORTEES_TAXE,
        NATURES_CATEGORIE,
        CATEGORIES_DEPENSE_DEFAUT,
        financeDefautsDepuisEntreprise,
        validerTaxe,
        validerCategorie,
        validerCompte,
        calculerTaxe,
        soldeCompte,
        calculerDepense,
        montantARepartir,
        validerRepartition,
        validerDepense,
        etatDepense,
        mouvementsDepuisDepenses
    };
}
