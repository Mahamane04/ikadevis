// IKADEVIS — send-payment-reminders (item 7 du plan d'enrichissement des
// Paramètres, 2026-09-07)
//
// Rappels de paiement automatiques, entièrement dans l'écosystème
// Supabase/ikadevis — explicitement rejeté par l'utilisateur : pas de
// dépendance à l'instance n8n d'un autre projet pour une fonctionnalité
// cœur d'ikadevis (si ce n8n tombe, les rappels d'ikadevis ne doivent pas
// s'arrêter).
//
// Déclenchée quotidiennement par pg_cron (voir migrations_payment_reminders
// _2026-09-07.sql pour la planification), jamais par le client — cette
// fonction tourne avec la clé service_role en interne, ce qui est sûr
// puisqu'elle n'est jamais exposée côté client et que l'appelant est
// vérifié (le JWT doit porter le rôle service_role, pas juste être valide).
//
// Trois seuils, alignés sur le plan :
//   j-3 : rappel préventif, 3 jours avant l'échéance
//   j+3 : première relance, 3 jours de retard
//   j+7 : seconde relance, 7 jours de retard
//
// Déduplication stricte via invoice_reminders_sent(invoice_id, threshold) :
// un seuil n'est jamais envoyé deux fois pour la même facture, même si le
// cron tourne plusieurs fois le même jour (contrainte UNIQUE + on conflict
// do nothing avant l'envoi, pas après — voir plus bas).
//
// Fournisseur d'e-mail : Resend (choisi avec l'utilisateur le 2026-09-07 —
// le plus simple à intégrer depuis une Edge Function Deno, sans dépendance
// SMTP). Secrets requis (à définir avec `supabase secrets set`, staging
// PUIS production, jamais commités) :
//   RESEND_API_KEY        — clé API Resend
//   REMINDER_FROM_EMAIL   — expéditeur vérifié dans Resend, ex.
//                           "ikadevis <rappels@ikadevis.com>"
//
// Déploiement : `supabase functions deploy send-payment-reminders
// --project-ref <ref> --no-verify-jwt` n'est PAS utilisé ici : verify_jwt
// reste actif (le gateway Supabase exige un JWT valide), et le code vérifie
// en plus que ce JWT porte bien le rôle service_role — pg_cron l'appelle
// avec cette clé, jamais un utilisateur final.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SEUILS = ['j-3', 'j+3', 'j+7'] as const;
type Seuil = typeof SEUILS[number];

const DECALAGE_JOURS: Record<Seuil, number> = {
  'j-3': 3,   // due_date = aujourd'hui + 3 (rappel avant échéance)
  'j+3': -3,  // due_date = aujourd'hui - 3 (retard de 3 jours)
  'j+7': -7,  // due_date = aujourd'hui - 7 (retard de 7 jours)
};

function dateDecalee(joursDecalage: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + joursDecalage);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD, comparable à une colonne DATE
}

function formatMontant(n: number, devise: string): string {
  return `${Math.round(n).toLocaleString('fr-FR')} ${devise}`;
}

function sujetEtCorps(seuil: Seuil, facture: any, devise: string): { sujet: string; html: string } {
  const montant = formatMontant(facture.net_to_pay_ttc - facture.amount_paid, devise);
  const dateEcheance = new Date(facture.due_date).toLocaleDateString('fr-FR');
  const entete = facture.org_name ? `${facture.org_name}` : 'Votre prestataire';
  const contact = [facture.org_phone, facture.org_email].filter(Boolean).join(' · ');

  if (seuil === 'j-3') {
    return {
      sujet: `Rappel — facture ${facture.invoice_number} à régler le ${dateEcheance}`,
      html: `<p>Bonjour ${facture.client_name || ''},</p>
<p>Un petit rappel amical : votre facture <strong>${facture.invoice_number}</strong> d'un montant de <strong>${montant}</strong> arrive à échéance le <strong>${dateEcheance}</strong>.</p>
<p>Merci de votre confiance.</p>
<p>${entete}${contact ? ` — ${contact}` : ''}</p>`
    };
  }
  const joursRetard = seuil === 'j+3' ? 3 : 7;
  return {
    sujet: `Relance — facture ${facture.invoice_number} en retard de ${joursRetard} jours`,
    html: `<p>Bonjour ${facture.client_name || ''},</p>
<p>Votre facture <strong>${facture.invoice_number}</strong> d'un montant de <strong>${montant}</strong> était due le <strong>${dateEcheance}</strong> et reste impayée à ce jour.</p>
<p>Merci de procéder au règlement dans les meilleurs délais, ou de nous contacter si un délai est nécessaire.</p>
<p>${entete}${contact ? ` — ${contact}` : ''}</p>`
  };
}

Deno.serve(async (req) => {
  try {
    // ── Vérification : seul service_role peut déclencher cette fonction ───
    // verify_jwt (actif côté gateway) garantit un JWT valide, mais accepte
    // aussi bien anon/authenticated que service_role. Le rôle est vérifié
    // ici en plus, pour qu'aucun utilisateur final ne puisse déclencher un
    // envoi de masse en rejouant simplement son propre token.
    const authHeader = req.headers.get('Authorization') || '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '');
    const payload = jwt.split('.')[1];
    const decoded = payload ? JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) : null;
    if (!decoded || decoded.role !== 'service_role') {
      return new Response(JSON.stringify({ error: 'Réservé au déclenchement interne (pg_cron).' }), { status: 403 });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const resendKey = Deno.env.get('RESEND_API_KEY');
    const fromEmail = Deno.env.get('REMINDER_FROM_EMAIL');
    const supabase = createClient(supabaseUrl, serviceKey);

    if (!resendKey || !fromEmail) {
      // Config incomplète : on log clairement plutôt que d'échouer en
      // silence — utile tant que RESEND_API_KEY / REMINDER_FROM_EMAIL ne
      // sont pas encore posés en secret sur ce projet.
      console.warn('[send-payment-reminders] RESEND_API_KEY ou REMINDER_FROM_EMAIL absent — aucun envoi.');
      return new Response(JSON.stringify({ sent: 0, skipped: 'email_not_configured' }), { status: 200 });
    }

    let envoyes = 0;
    let echecs = 0;
    const details: any[] = [];
    const erreursRequete: any[] = [];

    for (const seuil of SEUILS) {
      const dateCible = dateDecalee(DECALAGE_JOURS[seuil]);

      // company_settings n'a pas de FK directe vers invoices — seulement vers
      // organizations (organization_id). PostgREST ne peut embarquer une
      // table que via une relation directe : on l'imbrique donc sous
      // organizations plutôt qu'au même niveau que clients.
      const { data: factures, error } = await supabase
        .from('invoices')
        .select(`
          id, invoice_number, due_date, total_ttc, net_to_pay_ttc, amount_paid,
          organization_id, client_id,
          clients ( name, email ),
          organizations ( name, company_settings ( phone, email, currency ) )
        `)
        .in('status', ['issued', 'partially_paid'])
        .eq('due_date', dateCible);

      if (error) {
        console.error(`[send-payment-reminders] Requête factures (${seuil}) impossible :`, error.message);
        erreursRequete.push({ seuil, erreur: error.message });
        continue;
      }

      for (const f of factures || []) {
        const resteAPayer = Number(f.net_to_pay_ttc) - Number(f.amount_paid);
        if (resteAPayer <= 0) continue; // déjà soldée entre-temps
        const clientEmail = f.clients?.email;
        if (!clientEmail) continue; // pas de coordonnée exploitable

        // Déduplication stricte : on tente l'INSERT du seuil AVANT l'envoi,
        // avec ON CONFLICT DO NOTHING. Si la ligne existe déjà, l'insert ne
        // renvoie rien : on saute l'envoi sans jamais relancer un seuil déjà
        // traité, même si le cron tourne deux fois le même jour.
        const { data: dedupRow, error: dedupErr } = await supabase
          .from('invoice_reminders_sent')
          .insert({ invoice_id: f.id, organization_id: f.organization_id, threshold: seuil })
          .select('id')
          .maybeSingle();

        if (dedupErr) {
          if (!/duplicate key|unique constraint/i.test(dedupErr.message || '')) {
            console.error(`[send-payment-reminders] Déduplication (${f.id}, ${seuil}) impossible :`, dedupErr.message);
          }
          continue; // déjà envoyé pour ce seuil, ou erreur — jamais renvoyé deux fois
        }
        if (!dedupRow) continue;

        const devise = f.organizations?.company_settings?.currency || 'FCFA';
        const { sujet, html } = sujetEtCorps(seuil, {
          invoice_number: f.invoice_number,
          due_date: f.due_date,
          net_to_pay_ttc: f.net_to_pay_ttc,
          amount_paid: f.amount_paid,
          client_name: f.clients?.name,
          org_name: f.organizations?.name,
          org_phone: f.organizations?.company_settings?.phone,
          org_email: f.organizations?.company_settings?.email,
        }, devise);

        try {
          const resp = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ from: fromEmail, to: [clientEmail], subject: sujet, html }),
          });
          if (!resp.ok) throw new Error(`Resend a répondu ${resp.status} : ${await resp.text()}`);
          envoyes++;
          details.push({ invoice: f.invoice_number, seuil, statut: 'envoyé' });
        } catch (e) {
          echecs++;
          details.push({ invoice: f.invoice_number, seuil, statut: 'échec', erreur: (e as Error).message });
          // La ligne de déduplication reste posée volontairement : en cas
          // d'échec réseau ponctuel, mieux vaut manquer un rappel que
          // risquer d'en spammer un client si Resend accepte réellement le
          // message malgré une erreur réseau côté client sur la réponse.
        }
      }
    }

    return new Response(JSON.stringify({ sent: envoyes, failed: echecs, details, query_errors: erreursRequete }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[send-payment-reminders] Erreur inattendue :', err);
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500 });
  }
});
