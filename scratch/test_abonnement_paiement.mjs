// Abonnement SaaS : aucune activation sans paiement confirmé (§ 73, 2026-09-24)
//
// Ce banc garde l'incident du 2026-09-24, où un abonnement STANDARD s'est
// activé en production sans qu'un franc ne quitte le compte Mobile Money.
// Trois défauts s'étaient cumulés ; chacun a ici son test, pour qu'aucun ne
// puisse revenir discrètement :
//
//   1. Faute de clé API, saspay-service.js fabriquait des réponses
//      « success: true » sans jamais joindre api.saspay.me. Désormais il
//      refuse (SASPAY_NOT_CONFIGURED).
//   2. verifyPayment renvoyait success:true sur tout HTTP 200, PENDING
//      compris, et l'écran testait `|| verify.success`. Le contrat expose
//      maintenant un `paid` booléen et un `verdict` à trois valeurs.
//   3. Au bout de 20 s sans confirmation, l'écran s'accordait la formule
//      (`checks >= maxChecks` → applyPlanUpgrade). Les deux fonctions
//      d'auto-attribution ont été supprimées, pas corrigées.
//
// Les quatre derniers contrôles portent sur le code source plutôt que sur
// l'exécution : ils vérifient l'absence de constructions dangereuses que le
// mode invité, sans Supabase ni SasPay, ne peut pas exercer autrement.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launchApp, enterGuestMode } from './lib/harness.mjs';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Les contrôles statiques ci-dessous cherchent des constructions
// DANGEREUSES. Or le correctif du 2026-09-24 documente longuement, en
// commentaire, les lignes qu'il a supprimées — et un `grep` naïf retrouve
// donc ses propres explications et croit la faille intacte. Piège rencontré
// à la première exécution de ce banc : cinq faux rouges d'un coup.
// On lit donc le code amputé de ses commentaires.
const sansCommentaires = (txt) => txt
    .split('\n')
    .filter((l) => {
        const t = l.trim();
        return !(t.startsWith('//') || t.startsWith('*') || t.startsWith('/*'));
    })
    .join('\n');

const lire = (p) => sansCommentaires(fs.readFileSync(path.join(RACINE, p), 'utf8'));

export async function run() {
    const results = [];
    const ok = (label, cond, detail = '') => results.push({ label, pass: !!cond, detail });

    // ═══ PARTIE 1 — Contrats exercés dans le navigateur ═══════════════
    const { page, close, consoleErrors } = await launchApp();
    try {
        await enterGuestMode(page);

        const sonde = await page.evaluate(async () => {
            const r = {};
            const S = window.SasPayService;
            const A = window.SubscriptionService;

            r.servicesPresents = !!S && !!A;

            // (3) Plus aucune fonction capable d'accorder une formule.
            r.activatePlanAbsente = typeof A?.activatePlan === 'undefined';
            r.applyPlanUpgradeAbsente = typeof A?.applyPlanUpgrade === 'undefined';

            // (1) Sans clé, chaque appel doit ÉCHOUER, pas simuler.
            const refuse = async (fn) => {
                try { const v = await fn(); return { refuse: false, valeur: JSON.stringify(v).slice(0, 120) }; }
                catch (e) { return { refuse: true, code: e.code || null }; }
            };
            r.checkout = await refuse(() => S.createCheckoutSession({ amount: 75000, currency: 'XOF' }));
            r.softpay = await refuse(() => S.initiateSoftPay({
                amount: 50000, currency: 'XOF', network: 'orange_ml', customer: { phone: '+22370000000' }
            }));
            r.verify = await refuse(() => S.verifyPayment('pay_demo_123'));

            // (2) Verdict à trois valeurs, sans zone grise.
            r.verdicts = {
                paid: S.verdictPaiement('PAID'),
                success: S.verdictPaiement('SUCCESS'),
                pending: S.verdictPaiement('PENDING'),
                vide: S.verdictPaiement(''),
                inconnu: S.verdictPaiement('EN_COURS_DE_TRAITEMENT'),
                echoue: S.verdictPaiement('FAILED')
            };

            // Sans session Supabase, aucune souscription n'est possible.
            try {
                await A.startSubscriptionPayment({ planId: 'standard', billingCycle: 'monthly' });
                r.paiementSansSession = { refuse: false };
            } catch (e) {
                r.paiementSansSession = { refuse: true, code: e.code || null };
            }

            // L'état local ne doit jamais s'ouvrir tout seul sur une formule payante.
            const etat = A.getSubscription();
            r.etatInitial = { planId: etat.planId, status: etat.status };

            return r;
        });

        ok('Services SasPay et Abonnement chargés', sonde.servicesPresents);

        ok('activatePlan() n\'est plus exposée',
            sonde.activatePlanAbsente,
            'Une fonction d\'attribution de formule accessible depuis la console est une faille, pas une commodité.');
        ok('applyPlanUpgrade() n\'est plus exposée',
            sonde.applyPlanUpgradeAbsente);

        ok('createCheckoutSession refuse sans clé API',
            sonde.checkout.refuse && sonde.checkout.code === 'SASPAY_NOT_CONFIGURED',
            sonde.checkout.refuse ? `code=${sonde.checkout.code}` : `a renvoyé ${sonde.checkout.valeur}`);
        ok('initiateSoftPay refuse sans clé API',
            sonde.softpay.refuse && sonde.softpay.code === 'SASPAY_NOT_CONFIGURED',
            sonde.softpay.refuse ? `code=${sonde.softpay.code}` : `a renvoyé ${sonde.softpay.valeur}`);
        ok('verifyPayment refuse sans clé API (ne fabrique plus SUCCESS)',
            sonde.verify.refuse && sonde.verify.code === 'SASPAY_NOT_CONFIGURED',
            sonde.verify.refuse ? `code=${sonde.verify.code}` : `a renvoyé ${sonde.verify.valeur}`);

        const v = sonde.verdicts || {};
        ok('Verdict : PAID et SUCCESS valent « payé »', v.paid === 'paid' && v.success === 'paid', JSON.stringify(v));
        ok('Verdict : PENDING, vide et statut inconnu valent « en attente »',
            v.pending === 'pending' && v.vide === 'pending' && v.inconnu === 'pending',
            'Un statut que le service ne comprend pas ne doit jamais glisser vers « payé ».');
        ok('Verdict : FAILED vaut « échoué »', v.echoue === 'failed');

        ok('Aucune souscription sans session authentifiée',
            sonde.paiementSansSession.refuse && sonde.paiementSansSession.code === 'NO_SESSION',
            `code=${sonde.paiementSansSession.code}`);

        ok('L\'état initial est un essai Starter, jamais une formule payante',
            sonde.etatInitial.planId === 'starter' && sonde.etatInitial.status !== 'active',
            JSON.stringify(sonde.etatInitial));

        const erreursParasites = consoleErrors.filter((e) => !/favicon|manifest|sw\.js/i.test(e));
        ok('Aucune erreur JavaScript pendant le parcours',
            erreursParasites.length === 0,
            erreursParasites.slice(0, 3).join(' | '));
    } finally {
        await close();
    }

    // ═══ PARTIE 2 — Constructions interdites dans le code source ══════
    const vue = lire('index_jsx.js');
    const service = lire('js/saspay-service.js');
    const proxy = lire('supabase/functions/saspay-proxy/index.ts');

    ok('Plus d\'activation après expiration du délai de sondage',
        !/checks\s*>=\s*maxChecks/.test(vue) && !/applyPlanUpgrade\s*\(/.test(vue),
        'C\'est la ligne exacte qui a accordé la formule sans paiement le 2026-09-24.');

    ok('Plus de bouton « Simuler succès » sur une facture réelle',
        !/handleSimulateSuccess/.test(vue) && !/handleSimulateDemoSuccess/.test(vue),
        'Un clic y enregistrait un règlement réel sans mouvement d\'argent.');

    ok('saspay-service.js ne fabrique plus de session de démonstration',
        !/isDemo:\s*true/.test(service) && !/key\.includes\('demo'\)/.test(service),
        'Une passerelle non configurée est une panne, pas un succès.');

    ok('Le proxy n\'expose jamais la clé plateforme aux encaissements de factures',
        !/apiKey\s*\|\|\s*Deno\.env\.get\('SASPAY_API_KEY'\)/.test(proxy),
        'Ce repli aurait dirigé les règlements de factures de nos clients vers le compte SasPay d\'ikadevis.');

    ok('Le proxy fixe le montant depuis son propre catalogue',
        /CATALOGUE_FORMULES\[/.test(proxy) && /montant = formule\[cycle\]/.test(proxy),
        'Le montant ne doit jamais venir de la requête du navigateur.');

    ok('Le proxy n\'applique un règlement qu\'une seule fois',
        /\.is\('applied_at', null\)/.test(proxy),
        'Deux sondages simultanés ne doivent pas créditer deux périodes.');

    ok('Le proxy vérifie le montant réellement encaissé',
        /montantEncaisse/.test(proxy),
        'Un débit de 100 F ne doit pas débloquer une formule à 49 000 F.');

    return results;
}

// Exécution directe : node scratch/test_abonnement_paiement.mjs
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    run().then((r) => {
        r.forEach((x) => console.log(`${x.pass ? '✅' : '❌'} ${x.label}${x.detail ? ' — ' + x.detail : ''}`));
        const echecs = r.filter((x) => !x.pass).length;
        console.log(`\n${r.length - echecs}/${r.length} vérifications au vert`);
        process.exit(echecs ? 1 : 0);
    });
}
