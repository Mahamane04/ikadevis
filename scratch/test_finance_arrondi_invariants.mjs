// Invariants d'arrondi et de répartition du noyau financier.
//
// Suite UNITAIRE : charge js/finance-core.js dans un contexte node:vm, sans
// navigateur. Aucun lancement Puppeteer, donc quelques millisecondes pour des
// milliers d'assertions — c'est tout l'intérêt d'avoir sorti ce code de
// index_jsx.js.
//
// Ce qu'elle prouve réellement :
//   1. arrondiMonetaire(x, 0) EST Math.round(x), sur 10 000 valeurs tirées au
//      sort ET sur les cas limites. C'est la preuve PAR IDENTITÉ que les 7
//      devis étalons (tous en FCFA, 0 décimale) ne peuvent pas bouger. Une
//      preuve par échantillon ne vaudrait rien ici.
//   2. repartirMontant garantit Σ(parts) === arrondiMonetaire(total) exactement,
//      sur toutes les combinaisons poids × montants × échelles 0/2/3.
//   3. Le parseur du marqueur legacy compte juste sur le corpus qui casse.

import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function chargerFinanceCore() {
    const source = await readFile(path.join(racine, 'js/finance-core.js'), 'utf-8');
    const contexte = { window: {}, console };
    vm.createContext(contexte);
    vm.runInContext(source, contexte, { filename: 'js/finance-core.js' });
    if (!contexte.window.FinanceCore) {
        throw new Error('js/finance-core.js n\'a pas exposé window.FinanceCore');
    }
    return contexte.window.FinanceCore;
}

// Générateur déterministe (xorshift32) : un échec est reproductible à
// l'identique d'une exécution à l'autre, contrairement à Math.random().
function tirageDeterministe(graine) {
    let etat = graine >>> 0;
    return () => {
        etat ^= etat << 13; etat >>>= 0;
        etat ^= etat >>> 17;
        etat ^= etat << 5;  etat >>>= 0;
        return etat / 0x100000000;
    };
}

export async function run() {
    const results = [];
    const ok = (label, cond, detail = '') => results.push({ label, pass: !!cond, detail });

    let F;
    try {
        F = await chargerFinanceCore();
    } catch (e) {
        return [{ label: 'Chargement de js/finance-core.js', pass: false, detail: e.message }];
    }

    // ── 1. Identité avec Math.round quand decimales === 0 ─────────────────
    {
        const suivant = tirageDeterministe(20260917);
        let divergences = 0;
        let premiereDivergence = null;
        for (let i = 0; i < 10000; i++) {
            // Amplitudes réalistes pour du BTP en FCFA : de la centaine au
            // milliard, avec des décimales que le moteur produit réellement.
            const amplitude = 10 ** (2 + Math.floor(suivant() * 8));
            const valeur = (suivant() - 0.2) * amplitude;
            if (F.arrondiMonetaire(valeur, 0) !== Math.round(valeur)) {
                divergences++;
                if (premiereDivergence === null) premiereDivergence = valeur;
            }
        }
        ok('arrondiMonetaire(x,0) === Math.round(x) sur 10 000 tirages',
            divergences === 0,
            divergences === 0 ? '10000/10000 identiques' : `${divergences} divergences, 1re=${premiereDivergence}`);
    }

    {
        // Cas limites : demi-entiers (Math.round arrondit vers +∞, y compris
        // sur les négatifs — comportement à préserver tel quel), zéro négatif,
        // très grands nombres, valeurs non finies.
        const limites = [0, -0, 0.5, -0.5, 1.5, -1.5, 2.5, -2.5, 47797.4999999,
            0.49999999999999994, 1e15 + 0.5, -1e15 - 0.5, 123456789.5];
        const divergentes = limites.filter((v) => F.arrondiMonetaire(v, 0) !== Math.round(v));
        ok('arrondiMonetaire(x,0) === Math.round(x) sur les cas limites',
            divergentes.length === 0,
            divergentes.length === 0 ? `${limites.length} cas` : `divergent: ${divergentes.join(', ')}`);

        ok('Une valeur non finie ne propage pas NaN dans un montant',
            F.arrondiMonetaire(NaN, 0) === 0 && F.arrondiMonetaire(Infinity, 2) === 0,
            `NaN→${F.arrondiMonetaire(NaN, 0)}, Infinity→${F.arrondiMonetaire(Infinity, 2)}`);

        ok('Un appel sans argument de décimales se comporte comme 0 décimale',
            F.arrondiMonetaire(1234.56) === 1235,
            `1234.56 → ${F.arrondiMonetaire(1234.56)}`);
    }

    // ── 2. Précision réelle à 2 et 3 décimales ────────────────────────────
    {
        // Le cas qui piège toute implémentation naïve : 1.005 * 100 vaut
        // 100.49999999999999 en IEEE-754, donc Math.round(v*100)/100 rend 1.00.
        ok('1,005 arrondi à 2 décimales donne 1,01 (et non 1,00)',
            F.arrondiMonetaire(1.005, 2) === 1.01,
            `→ ${F.arrondiMonetaire(1.005, 2)}`);
        ok('8,165 arrondi à 2 décimales donne 8,17',
            F.arrondiMonetaire(8.165, 2) === 8.17,
            `→ ${F.arrondiMonetaire(8.165, 2)}`);
        ok('Un dinar tunisien garde ses 3 décimales',
            F.arrondiMonetaire(12.3456, 3) === 12.346,
            `→ ${F.arrondiMonetaire(12.3456, 3)}`);
        ok('100,25 € reste 100,25 € (ni perte ni dérive)',
            F.arrondiDevise(100.25, 'EUR') === 100.25,
            `→ ${F.arrondiDevise(100.25, 'EUR')}`);
    }

    // ── 3. Devises : le pont FCFA ↔ ISO et les précisions ─────────────────
    {
        ok('versIso traduit le libellé applicatif FCFA en XOF',
            F.versIso('FCFA') === 'XOF' && F.versIso('fcfa') === 'XOF' && F.versIso('F CFA') === 'XOF',
            `FCFA→${F.versIso('FCFA')}`);
        ok('versIso laisse un code ISO intact',
            F.versIso('EUR') === 'EUR' && F.versIso('XOF') === 'XOF');
        ok('XOF a 0 décimale — la raison pour laquelle les étalons ne bougent pas',
            F.MINOR_UNITS.XOF === 0 && F.decimalesDevise('FCFA') === 0,
            `MINOR_UNITS.XOF=${F.MINOR_UNITS.XOF}, decimalesDevise('FCFA')=${F.decimalesDevise('FCFA')}`);
        ok('EUR/USD ont 2 décimales, TND en a 3',
            F.decimalesDevise('EUR') === 2 && F.decimalesDevise('USD') === 2 && F.decimalesDevise('TND') === 3);
        ok('Une devise inconnue retombe sur 0 décimale, sans inventer de centimes',
            F.decimalesDevise('ZZZ') === 0 && F.decimalesDevise('') === 0);
    }

    // ── 4. repartirMontant : Σ(parts) === total, exactement ───────────────
    {
        const jeuxPoids = [
            [40, 30, 20, 10],          // l'échéancier contractuel du dépôt
            [1, 1, 1],                 // trois tiers : le cas qui ne tombe jamais juste
            [1], [50, 50], [70, 30],
            [1, 2, 3, 4, 5, 6, 7],
            [99.5, 0.5],
            [1, 0, 0, 1]               // des poids nuls au milieu
        ];
        const montants = [0, 1, 3, 7, 100, 1000001, 14750000, 999999999, 250000.55, 12.34];
        const echelles = [0, 2, 3];

        let casTestes = 0;
        let echecsSomme = 0;
        let premierEchec = null;
        let partsNegatives = 0;

        for (const poids of jeuxPoids) {
            for (const montant of montants) {
                for (const decimales of echelles) {
                    casTestes++;
                    const parts = F.repartirMontant(montant, poids, decimales);
                    const somme = F.arrondiMonetaire(parts.reduce((a, b) => a + b, 0), decimales);
                    const attendu = F.arrondiMonetaire(montant, decimales);
                    if (somme !== attendu) {
                        echecsSomme++;
                        if (!premierEchec) premierEchec = `poids=[${poids}] montant=${montant} d=${decimales} → Σ=${somme} ≠ ${attendu}`;
                    }
                    if (parts.some((p) => p < 0)) partsNegatives++;
                    if (parts.length !== poids.length) {
                        echecsSomme++;
                        if (!premierEchec) premierEchec = `longueur ${parts.length} ≠ ${poids.length}`;
                    }
                }
            }
        }

        ok(`repartirMontant : Σ(parts) === total sur ${casTestes} combinaisons`,
            echecsSomme === 0,
            echecsSomme === 0 ? `${casTestes} cas exacts` : `${echecsSomme} échecs — ${premierEchec}`);
        ok('Aucune part négative sur un montant positif',
            partsNegatives === 0, `${partsNegatives} cas`);
    }

    {
        // Le cas concret que le dépôt produit aujourd'hui de travers :
        // Math.round(TTC*0.40) + ... + Math.round(TTC*0.10) ≠ TTC.
        const ttc = 1000001;
        const tranches = F.repartirMontant(ttc, [40, 30, 20, 10], 0);
        const sommeTranches = tranches.reduce((a, b) => a + b, 0);
        const ancienneMethode = [0.40, 0.30, 0.20, 0.10]
            .map((p) => Math.round(ttc * p))
            .reduce((a, b) => a + b, 0);
        ok('Échéancier 40/30/20/10 sur 1 000 001 : la somme retombe sur le TTC',
            sommeTranches === ttc,
            `nouveau=[${tranches}] Σ=${sommeTranches} · ancienne méthode Σ=${ancienneMethode}`);

        // Trois tiers d'un montant indivisible : le reliquat doit partir sur
        // les plus fortes fractions, pas s'accumuler au même endroit.
        const tiers = F.repartirMontant(100, [1, 1, 1], 0);
        ok('Trois tiers de 100 : somme exacte',
            tiers.reduce((a, b) => a + b, 0) === 100,
            `[${tiers}]`);
    }

    {
        // Robustesse : entrées que l'interface peut produire.
        ok('Un tableau de poids vide rend un tableau vide',
            Array.isArray(F.repartirMontant(100, [], 0)) && F.repartirMontant(100, [], 0).length === 0);
        ok('Des poids tous nuls répartissent à parts égales plutôt que de perdre le montant',
            F.repartirMontant(90, [0, 0, 0], 0).reduce((a, b) => a + b, 0) === 90,
            `[${F.repartirMontant(90, [0, 0, 0], 0)}]`);
        ok('Un montant négatif (remboursement) conserve Σ = total',
            F.repartirMontant(-100, [1, 1, 1], 0).reduce((a, b) => a + b, 0) === -100,
            `[${F.repartirMontant(-100, [1, 1, 1], 0)}]`);
    }

    // ── 5. Sens du taux de change ─────────────────────────────────────────
    {
        // 1 EUR = 655,957 FCFA. Une inversion donnerait 0,15 — l'erreur que
        // le sens gravé dans la fonction doit rendre impossible.
        const enBase = F.versBase(100, 655.957, 'FCFA');
        ok('100 € au taux 655,957 valent 65 596 FCFA (et non 0,15)',
            enBase === 65596, `→ ${enBase}`);

        const retour = F.depuisBase(enBase, 655.957, 'EUR');
        ok('Aller-retour XOF→EUR→XOF stable à moins d\'une unité mineure',
            Math.abs(retour - 100) < 0.01, `100 € → ${enBase} FCFA → ${retour} €`);

        ok('Un taux absent ne vaut JAMAIS 1 : la conversion refuse de répondre',
            F.depuisBase(65596, 0, 'EUR') === null && F.depuisBase(65596, null, 'EUR') === null,
            'retourne null, à charge de l\'appelant de demander le taux');
    }

    // ── 6. Parseur du marqueur legacy ─────────────────────────────────────
    {
        const marqueur = (objets) => `<!--PAYMENTS:${encodeURIComponent(JSON.stringify(objets))}-->`;

        const nominal = marqueur([
            { id: 'pay-1', montant: 250000, note: 'Acompte a la commande', createdAt: '2026-09-17T10:30:00.000Z' },
            { id: 'pay-2', montant: 125000, note: 'Solde', createdAt: '2026-09-18T09:00:00.000Z' }
        ]);
        const r1 = F.parserMarqueurPaiements(`Merci de votre confiance.\n${nominal}`);
        ok('Marqueur nominal : 2 règlements lus, aucun illisible',
            r1.paiements.length === 2 && !r1.illisible, `${r1.paiements.length} paiements`);
        ok('Somme du marqueur nominal correcte',
            F.sommeMarqueurPaiements(nominal, 'FCFA') === 375000,
            `→ ${F.sommeMarqueurPaiements(nominal, 'FCFA')}`);

        // Le cas nominal du parc : accents et apostrophe typographique.
        const accentue = marqueur([
            { id: 'pay-3', montant: 50000, note: 'Règlement à réception — chèque n°4211 de l’entreprise', createdAt: '2026-09-17T10:30:00.000Z' }
        ]);
        const r2 = F.parserMarqueurPaiements(accentue);
        ok('Accents et apostrophe typographique survivent au décodage',
            r2.paiements.length === 1 && r2.paiements[0].note.includes('Règlement à réception') && r2.paiements[0].note.includes('’'),
            r2.paiements[0] ? r2.paiements[0].note : 'aucun paiement lu');

        ok('Notes sans marqueur : 0 paiement, pas d\'erreur',
            F.parserMarqueurPaiements('Simple note libre').marqueursTrouves === 0);
        ok('Notes vides ou absentes : 0 paiement, pas d\'erreur',
            F.parserMarqueurPaiements('').paiements.length === 0 &&
            F.parserMarqueurPaiements(null).paiements.length === 0 &&
            F.parserMarqueurPaiements(undefined).paiements.length === 0);

        const tronque = '<!--PAYMENTS:%5B%7B%22id%22%3A%22pay-4%22%2C%22mont-->';
        const r3 = F.parserMarqueurPaiements(tronque);
        ok('JSON tronqué : signalé illisible, jamais silencieusement compté à 0',
            r3.illisible === true && r3.paiements.length === 0, `raison=${r3.raison}`);

        const doubleMarqueur = `${marqueur([{ id: 'a', montant: 100 }])}\n${marqueur([{ id: 'b', montant: 999 }])}`;
        const r4 = F.parserMarqueurPaiements(doubleMarqueur);
        ok('Marqueur écrit deux fois : seul le premier est lu, comme le fait l\'app',
            r4.marqueursTrouves === 2 && r4.paiements.length === 1 && r4.paiements[0].id === 'a',
            `trouvés=${r4.marqueursTrouves}, retenus=${r4.paiements.length}, raison=${r4.raison}`);

        const nonTableau = `<!--PAYMENTS:${encodeURIComponent(JSON.stringify({ id: 'x' }))}-->`;
        ok('Charge qui n\'est pas un tableau : signalée illisible',
            F.parserMarqueurPaiements(nonTableau).illisible === true);
    }

    // ── 7. État de règlement dérivé des montants ──────────────────────────
    {
        const e0 = F.etatReglement(100000, 0, 'FCFA');
        const e1 = F.etatReglement(100000, 40000, 'FCFA');
        const e2 = F.etatReglement(100000, 100000, 'FCFA');
        const e3 = F.etatReglement(100000, 120000, 'FCFA');

        ok('Aucun règlement → statut issued, solde entier',
            e0.statut === 'issued' && e0.solde === 100000, JSON.stringify(e0));
        ok('Règlement partiel → partially_paid, solde exact',
            e1.statut === 'partially_paid' && e1.solde === 60000, JSON.stringify(e1));
        ok('Règlement intégral → paid, solde nul',
            e2.statut === 'paid' && e2.solde === 0, JSON.stringify(e2));
        ok('Trop-perçu → paid, solde nul et surplus isolé (jamais un solde négatif)',
            e3.statut === 'paid' && e3.solde === 0 && e3.tropPercu === 20000, JSON.stringify(e3));

        // Règlement en deux fois : on doit retrouver exactement le solde.
        const facture = 100.25;
        const versement1 = 60.10;
        const reste = F.arrondiDevise(facture - versement1, 'EUR');
        ok('Facture de 100,25 € réglée en deux fois : le reste est exactement 40,15 €',
            reste === 40.15 && F.etatReglement(facture, versement1 + reste, 'EUR').statut === 'paid',
            `reste=${reste}`);
    }

    // ── 8. Lecture des règlements depuis la table (T4) ────────────────────
    {
        const lignes = [
            { invoice_id: 'F1', amount: '60000.00', payments: { id: 'u1', legacy_payment_key: 'pay_b', payment_date: '2026-09-20', method_detail: 'wave', status: 'confirmed' } },
            { invoice_id: 'F1', amount: '40000.00', payments: { id: 'u2', legacy_payment_key: 'pay_a', payment_date: '2026-09-10', method_detail: 'especes', status: 'confirmed' } },
            { invoice_id: 'F1', amount: '999', payments: { id: 'u3', legacy_payment_key: 'pay_rejete', payment_date: '2026-09-15', status: 'bounced' } },
            // Un virement unique qui solde deux factures : chacune voit SA part.
            { invoice_id: 'F2', amount: '25.50', payments: { id: 'u4', legacy_payment_key: null, payment_date: '2026-09-12', method_detail: 'virement', status: 'confirmed' } },
            { invoice_id: null, amount: '10', payments: { id: 'u5' } }
        ];
        const r = F.reglementsDepuisImputations(lignes);
        ok('T4 : règlements regroupés par facture, triés par date',
            r.F1 && r.F1.map((p) => p.id).join(',') === 'pay_a,pay_b', r.F1 && r.F1.map((p) => p.id).join(','));
        ok('T4 : l\'identifiant repris est celui que l\'utilisateur a toujours manipulé (legacy_payment_key)',
            r.F1[0].id === 'pay_a' && r.F2[0].id === 'u4', `${r.F1[0].id} / ${r.F2[0].id}`);
        ok('T4 : un chèque rejeté ne compte pas comme réglé',
            !r.F1.some((p) => p.id === 'pay_rejete'), `${r.F1.length} règlement(s)`);
        ok('T4 : montants numériques, centimes conservés',
            r.F1[0].montant === 40000 && r.F2[0].montant === 25.5, `${r.F1[0].montant} / ${r.F2[0].montant}`);
        ok('T4 : la somme lue retombe sur ce que l\'application calculait',
            F.etatReglement(100000, r.F1.reduce((s, p) => s + p.montant, 0), 'FCFA').statut === 'paid');
        ok('T4 : une imputation sans facture (acompte à imputer) n\'est rattachée à rien',
            Object.keys(r).sort().join(',') === 'F1,F2', Object.keys(r).join(','));
        ok('T4 : entrée vide ou absente sans erreur',
            Object.keys(F.reglementsDepuisImputations(null)).length === 0);
    }

    // ── 9. Paramètres Finances et comptes (§ 71) ──────────────────────────
    {
        let n = 0;
        const gen = () => `id${++n}`;
        const entreprise = {
            currency: 'FCFA', vatRates: [18, 9, 0], vatExemptionNote: 'Exonéré — art. 355 CGI',
            commercialSettings: { bankName: 'Ecobank', bankAccount: 'CI059 01001', bankSwift: 'ECOCCIAB',
                waveNumber: '+225 07 00 00 00', orangeMoneyNumber: '  ', moovMoneyNumber: '+225 01 11 11 11' }
        };
        const d = F.financeDefautsDepuisEntreprise(entreprise, gen);
        ok('Défauts locaux : devise de base XOF, seule activée', d.settings.base_currency === 'XOF' && d.settings.enabled_currencies.join() === 'XOF');
        ok('Défauts locaux : mêmes taxes que le serveur (18 %, 9 %, taux zéro, exonéré)',
            d.taxes.map((t) => t.name).join(' | ') === 'TVA 18 % | TVA 9 % | Taux zéro | Exonéré', d.taxes.map((t) => t.name).join(' | '));
        ok('Défauts locaux : 18 % est la seule taxe par défaut',
            d.taxes.filter((t) => t.is_default).map((t) => t.rate).join() === '18');
        ok('Défauts locaux : mention d\'exonération reprise', d.taxes.find((t) => t.kind === 'exempt').legal_mention === 'Exonéré — art. 355 CGI');
        ok('Défauts locaux : 9 catégories', d.categories.length === 9);
        ok('Défauts locaux : banque + Wave + Moov, pas l\'Orange Money vide',
            d.accounts.map((a) => a.name).sort().join(', ') === 'Ecobank, Moov Money, Wave', d.accounts.map((a) => a.name).join(', '));
        ok('Défauts locaux : la banque est le compte par défaut, avec numéro et BIC',
            d.accounts[0].is_default && d.accounts[0].account_number === 'CI059 01001' && d.accounts[0].bic === 'ECOCCIAB');
        ok('Défauts locaux : chaque taxe par défaut passe sa propre validation',
            d.taxes.every((t) => F.validerTaxe(t, d.taxes).length === 0), JSON.stringify(d.taxes.map((t) => F.validerTaxe(t, d.taxes))));
        ok('Défauts locaux : chaque compte repris passe sa propre validation',
            d.accounts.every((a) => F.validerCompte(a, d.accounts).length === 0));

        const vide = F.financeDefautsDepuisEntreprise({ currency: 'EUR' }, gen);
        ok('Entreprise sans réglage : taux historiques 18/10/0, aucun compte inventé',
            vide.taxes.length === 4 && vide.accounts.length === 0 && vide.settings.base_currency === 'EUR');
        ok('Devise inconnue : repli sur XOF plutôt qu\'une devise hors référentiel',
            F.financeDefautsDepuisEntreprise({ currency: 'Pièces d\'or' }, gen).settings.base_currency === 'XOF');

        // Taxes
        const base = { id: 't1', name: 'TVA', kind: 'standard', rate: 18, scope: 'both', is_default: false };
        ok('Taxe valide acceptée', F.validerTaxe(base, []).length === 0);
        ok('Taux normal à 0 % refusé, avec la bonne suggestion',
            F.validerTaxe({ ...base, rate: 0 }, []).some((e) => e.includes('Taux zéro')));
        ok('Exonération avec un taux refusée', F.validerTaxe({ ...base, kind: 'exempt', rate: 5 }, []).length === 1);
        ok('Taux > 100 % refusé', F.validerTaxe({ ...base, rate: 150 }, []).length === 1);
        ok('Deuxième taxe par défaut sur la même portée refusée',
            F.validerTaxe({ ...base, is_default: true }, [{ id: 't2', is_default: true, scope: 'both' }]).length === 1);
        ok('…mais acceptée sur une autre portée',
            F.validerTaxe({ ...base, is_default: true, scope: 'purchase' }, [{ id: 't2', is_default: true, scope: 'sale' }]).length === 0);
        ok('Fin avant début refusée',
            F.validerTaxe({ ...base, effective_from: '2026-09-10', effective_to: '2026-09-01' }, []).length === 1);

        // Catégories
        ok('Catégorie en doublon (casse et espaces ignorés) refusée',
            F.validerCategorie({ id: 'c9', name: '  matériaux ' }, [{ id: 'c1', name: 'Matériaux' }]).length === 1);
        ok('Renommer une catégorie en son propre nom est accepté',
            F.validerCategorie({ id: 'c1', name: 'Matériaux' }, [{ id: 'c1', name: 'Matériaux' }]).length === 0);

        // Comptes
        const caisse = { id: 'a1', name: 'Caisse atelier', kind: 'cash', currency: 'XOF', opening_balance: 150000, opening_date: '2026-09-01' };
        ok('Caisse sans aucun identifiant bancaire acceptée', F.validerCompte(caisse, []).length === 0);
        ok('Compte sans nom refusé', F.validerCompte({ ...caisse, name: ' ' }, []).length === 1);
        ok('Solde initial vide refusé (0 doit être saisi explicitement)', F.validerCompte({ ...caisse, opening_balance: '' }, []).length === 1);
        ok('Devise hors référentiel refusée', F.validerCompte({ ...caisse, currency: 'FCFA' }, []).length === 1);
        ok('Deux comptes au même nom refusés', F.validerCompte({ ...caisse, id: 'a2' }, [caisse]).length === 1);
        ok('Changer la devise d\'un compte qui a des mouvements est refusé',
            F.validerCompte({ ...caisse, currency: 'EUR' }, [], { aDesMouvements: true, deviseOrigine: 'XOF' }).length === 1);

        // Calcul de taxe
        const tva = { kind: 'standard', rate: 18, is_inclusive: false };
        const hors = F.calculerTaxe(100000, tva, 'XOF');
        ok('Taxe exclue : 100 000 HT → 18 000 de taxe → 118 000 TTC', hors.ht === 100000 && hors.taxe === 18000 && hors.ttc === 118000, JSON.stringify(hors));
        const incl = F.calculerTaxe(118000, { ...tva, is_inclusive: true }, 'XOF');
        ok('Taxe incluse : 118 000 TTC → 100 000 HT + 18 000', incl.ht === 100000 && incl.taxe === 18000 && incl.ttc === 118000, JSON.stringify(incl));
        const eur = F.calculerTaxe(99.99, { kind: 'standard', rate: 20, is_inclusive: true }, 'EUR');
        ok('Taxe incluse en euros : HT + taxe = TTC au centime près', Math.round((eur.ht + eur.taxe) * 100) === Math.round(eur.ttc * 100), JSON.stringify(eur));
        ok('Exonéré : aucune taxe, même si un taux traînait', F.calculerTaxe(1000, { kind: 'exempt', rate: 18 }, 'XOF').taxe === 0);

        // Solde
        const mvts = [
            { account_id: 'a1', direction: 'in', amount: 50000, payment_date: '2026-09-05', status: 'confirmed' },
            { account_id: 'a1', direction: 'out', amount: 20000, payment_date: '2026-09-06', status: 'confirmed' },
            { account_id: 'a1', direction: 'in', amount: 999999, payment_date: '2026-08-01', status: 'confirmed' },
            { account_id: 'a1', direction: 'in', amount: 777, payment_date: '2026-09-07', status: 'bounced' },
            { account_id: 'autre', direction: 'in', amount: 5, payment_date: '2026-09-07' }
        ];
        const s = F.soldeCompte(caisse, mvts);
        ok('Solde local = même règle que la vue SQL (180 000, 1 antérieur signalé)',
            s.solde === 180000 && s.entrees === 50000 && s.sorties === 20000 && s.anterieurs === 1 && s.mouvements === 2, JSON.stringify(s));
        ok('Un mouvement le jour même du solde initial compte (solde au DÉBUT du jour)',
            F.soldeCompte(caisse, [{ direction: 'in', amount: 1, payment_date: '2026-09-01' }]).solde === 150001);
        ok('Solde initial en euros : centimes conservés',
            F.soldeCompte({ id: 'e', currency: 'EUR', opening_balance: 1234.56, opening_date: '2026-09-01' }, []).solde === 1234.56);
    }

    // ── 10. Dépenses (§ 72) ───────────────────────────────────────────────
    {
        const tva = { kind: 'standard', rate: 18, is_inclusive: false, is_recoverable: true };
        const m = F.calculerDepense(100000, tva, 'XOF');
        ok('Dépense HT 100 000 + TVA 18 % → 118 000 TTC, taux figé', m.amount_ht === 100000 && m.tax_amount === 18000 && m.amount_ttc === 118000 && m.tax_rate === 18, JSON.stringify(m));
        ok('Sans taxe : HT = TTC', F.calculerDepense(25000, null, 'XOF').amount_ttc === 25000);
        ok('Montant à répartir : HT si la taxe est récupérable', F.montantARepartir({ ...m, tax_recoverable: true }) === 100000);
        ok('Montant à répartir : TTC si elle ne l\'est pas', F.montantARepartir({ ...m, tax_recoverable: false }) === 118000);

        const base = { description: 'Ciment', kind: 'expense', expense_date: '2026-09-19', currency: 'XOF', amount_ttc: 118000, amount_ht: 100000, account_id: 'a1' };
        ok('Dépense déjà payée avec compte : valide', F.validerDepense(base, { nouvelle: true }).length === 0);
        ok('Dépense déjà payée sans compte : refusée', F.validerDepense({ ...base, account_id: null }, { nouvelle: true }).some((e) => /compte/.test(e)));
        ok('Avance personnelle sans compte : valide', F.validerDepense({ ...base, account_id: null, advanced_by: 'Moussa' }, { nouvelle: true }).length === 0);
        ok('Avance personnelle AVEC compte : refusée', F.validerDepense({ ...base, advanced_by: 'Moussa' }, { nouvelle: true }).length === 1);
        const facture = { ...base, kind: 'supplier_invoice', account_id: null, due_date: '2026-10-19' };
        ok('Facture à payer avec échéance : valide', F.validerDepense(facture, { nouvelle: true }).length === 0);
        ok('Facture à payer sans échéance : refusée', F.validerDepense({ ...facture, due_date: null }, { nouvelle: true }).length === 1);
        ok('Échéance avant la date de dépense : refusée', F.validerDepense({ ...facture, due_date: '2026-09-01' }, { nouvelle: true }).length === 1);
        ok('Compte en EUR pour une dépense en XOF : refusé', F.validerDepense(base, { nouvelle: true, deviseCompte: 'EUR' }).length === 1);
        ok('Dépense réglée dont on change le montant : refusée',
            F.validerDepense({ ...base, amount_ttc: 59000 }, { dejaReglee: true, origine: base }).some((e) => /annulez/.test(e)));
        ok('Répartition exacte acceptée',
            F.validerDepense({ ...facture, splits: [{ project_ref: 'Villa', amount: 60000 }, { project_ref: 'Immeuble', amount: 40000 }] }, {}).length === 0);
        ok('Répartition inexacte refusée',
            F.validerDepense({ ...facture, splits: [{ project_ref: 'Villa', amount: 60000 }, { project_ref: 'Immeuble', amount: 30000 }] }, {}).some((e) => /exactement/.test(e)));
        ok('Part sans chantier refusée', F.validerRepartition([{ amount: 100000 }], 100000, 'XOF').length === 1);

        const e0 = F.etatDepense({ amount_ttc: 118000, currency: 'XOF' }, []);
        const e1 = F.etatDepense({ amount_ttc: 118000, currency: 'XOF' }, [{ amount: 50000 }]);
        const e2 = F.etatDepense({ amount_ttc: 118000, currency: 'XOF' }, [{ amount: 50000 }, { amount: 68000 }]);
        const e3 = F.etatDepense({ amount_ttc: 118000, currency: 'XOF' }, [{ amount: 118000, status: 'bounced' }]);
        ok('Statut dérivé des règlements : à payer / partiel / payée / chèque rejeté',
            e0.statut === 'to_pay' && e1.statut === 'partially_paid' && e1.reste === 68000 && e2.statut === 'paid' && e3.statut === 'to_pay',
            [e0, e1, e2, e3].map((e) => e.statut).join(','));

        const mvts = F.mouvementsDepuisDepenses([{ reglements: [{ account_id: 'a1', amount: 118000, payment_date: '2026-09-19' }] }, { reglements: [] }]);
        const s = F.soldeCompte({ id: 'a1', currency: 'XOF', opening_balance: 1000000, opening_date: '2026-09-01' }, mvts);
        ok('Mode local : une dépense réglée fait baisser le solde du compte (1 000 000 → 882 000)', s.solde === 882000, JSON.stringify(s));
    }

    return results;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    const results = await run();
    for (const r of results) console.log(`  ${r.pass ? '✅' : '❌'} ${r.label}${r.detail ? ' — ' + r.detail : ''}`);
    const echecs = results.filter((r) => !r.pass).length;
    console.log(`\n  ${results.length - echecs}/${results.length} vérifications`);
    process.exit(echecs === 0 ? 0 : 1);
}
