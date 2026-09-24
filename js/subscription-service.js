/**
 * Subscription Service - ikadevis BTP SaaS
 * Gère les plans d'abonnements, les quotas de l'essai Starter (14 jours, 3 devis, 1 projet)
 * et les paiements d'abonnement via la passerelle SasPay.
 */

(function () {
    'use strict';

    const STORAGE_KEY = 'ikadevis_subscription';

    const PLANS = {
        starter: {
            id: 'starter',
            name: 'Starter',
            badge: 'Essai gratuit',
            price: 0,
            priceMonthly: 0,
            priceYearly: 0,
            period: '14 jours d’essai',
            trialDays: 14,
            isTrial: true,
            maxDevis: 3,
            maxProjects: 1,
            maxUsers: 1,
            description: 'Idéal pour tester et explorer ikadevis sans engagement.',
            features: [
                '14 jours d’essai gratuit complet',
                'Création de 3 devis maximum',
                '1 projet / chantier actif',
                'Catalogue et calculs de base',
                'Export PDF standard'
            ]
        },
        standard: {
            id: 'standard',
            name: 'Standard',
            badge: 'Recommandée',
            isPopular: true,
            price: 19900,
            priceMonthly: 19900,
            priceYearly: 191000,
            period: '/ mois',
            isTrial: false,
            maxDevis: Infinity,
            maxProjects: Infinity,
            maxUsers: 5,
            description: 'Idéal pour les PME et entreprises BTP en croissance.',
            features: [
                'Devis & Factures illimités',
                'Jusqu’à 5 utilisateurs',
                'Export PDF Pro sans filigrane',
                'Suivi chantiers & marges réelles',
                'Module SasPay Mobile Money & Carte',
                'Support prioritaire WhatsApp'
            ]
        },
        entreprise: {
            id: 'entreprise',
            name: 'Entreprise',
            badge: 'Performance & Équipe',
            price: 49000,
            priceMonthly: 49000,
            priceYearly: 470000,
            period: '/ mois',
            isTrial: false,
            maxDevis: Infinity,
            maxProjects: Infinity,
            maxUsers: Infinity,
            description: 'Multi-chantiers, équipes multiples & gros volumes.',
            features: [
                'Utilisateurs illimités',
                'Multi-équipes & permissions avancées',
                'Analytique & rentabilité BTP complète',
                'Situations de travaux & acomptes',
                'Passerelle SasPay gros volume',
                'Onboarding & accompagnement dédié'
            ]
        },
        // Alias de compatibilité
        pro: {
            id: 'pro',
            name: 'Pro',
            badge: 'Standard Pro',
            price: 19900,
            priceMonthly: 19900,
            priceYearly: 191000,
            period: '/ mois',
            isTrial: false,
            maxDevis: Infinity,
            maxProjects: Infinity,
            maxUsers: 5,
            features: ['Devis illimités', '5 utilisateurs']
        },
        business: {
            id: 'business',
            name: 'Business',
            badge: 'Entreprise',
            price: 49000,
            priceMonthly: 49000,
            priceYearly: 470000,
            period: '/ mois',
            isTrial: false,
            maxDevis: Infinity,
            maxProjects: Infinity,
            maxUsers: Infinity,
            features: ['Tout illimité', 'Multi-équipes']
        }
    };

    // Liste des administrateurs bénéficiant d'un accès total Entreprise permanent
    const SUPER_ADMIN_EMAILS = ['officemicro89@gmail.com'];

    const SubscriptionService = {
        PLANS,
        SUPER_ADMIN_EMAILS,
        _organizationId: null,
        _userId: null,
        _userEmail: null,
        _generation: 0,
        _storageKey: function () {
            return `${STORAGE_KEY}:${this._userId || 'guest'}:${this._organizationId || 'local'}`;
        },
        /**
         * Vérifie si l'utilisateur actuel est le super-administrateur de contrôle.
         */
        isSuperAdmin: function () {
            let email = (this._userEmail || '').toLowerCase().trim();
            if (SUPER_ADMIN_EMAILS.includes(email)) return true;
            // Vérification de secours via le token de session Supabase stocké
            if (typeof window !== 'undefined' && window.localStorage) {
                try {
                    for (let i = 0; i < localStorage.length; i++) {
                        const k = localStorage.key(i);
                        if (k && k.startsWith('sb-') && k.endsWith('-auth-token')) {
                            const raw = localStorage.getItem(k);
                            if (raw) {
                                const parsed = JSON.parse(raw);
                                const cand = parsed?.user?.email;
                                if (cand && SUPER_ADMIN_EMAILS.includes(String(cand).toLowerCase().trim())) {
                                    this._userEmail = String(cand).toLowerCase().trim();
                                    return true;
                                }
                            }
                        }
                    }
                } catch (_) {}
            }
            return false;
        },
        setContext: function (userId, organizationId, userEmail) {
            const user = userId && userId !== 'guest' ? userId : null;
            const org = user ? organizationId || null : null;
            const email = userEmail ? String(userEmail).toLowerCase().trim() : (this._userEmail || null);
            if (user === this._userId && org === this._organizationId && email === this._userEmail) return;
            this._userId = user;
            this._organizationId = org;
            this._userEmail = email;
            this._generation++;
            // L'ancien cache global n'est jamais repris : son entreprise est inconnue.
            const state = this.getSubscription();
            if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('ikadevis:subscription_updated', { detail: state }));
        },

        /**
         * Récupère l'état actuel de l'abonnement du compte.
         * Pour l'admin officemicro89@gmail.com, confère automatiquement un accès total Entreprise.
         * Initialise un essai Starter de 14 jours si aucun abonnement n'existe pour les autres comptes.
         */
        getSubscription: function () {
            if (this.isSuperAdmin()) {
                return {
                    planId: 'entreprise',
                    name: 'Entreprise',
                    badge: 'Accès Contrôle Admin',
                    status: 'active',
                    billingCycle: 'yearly',
                    trialStartedAt: null,
                    trialEndsAt: null,
                    expiresAt: null,
                    isTrial: false,
                    isAdminAccess: true,
                    source: 'platform_admin',
                    paymentHistory: []
                };
            }

            let data = null;
            try {
                const raw = localStorage.getItem(this._storageKey());
                if (raw) data = JSON.parse(raw);
            } catch (e) {
                console.error('[SubscriptionService] Erreur lecture localStorage', e);
            }

            if (!data || !data.planId) {
                const now = Date.now();
                // Essai provisoire, en attendant la reponse du serveur.
                // Jamais 'active' : seul refreshFromServer() peut ouvrir une
                // formule payante, et lui seul lit la table subscriptions.
                data = {
                    planId: 'starter',
                    status: 'trial', // 'trial' | 'active' | 'expired'
                    trialStartedAt: now,
                    trialEndsAt: now + (14 * 24 * 60 * 60 * 1000), // +14 jours
                    expiresAt: now + (14 * 24 * 60 * 60 * 1000),
                    source: 'local',
                    paymentHistory: []
                };
                this.saveSubscription(data);
            }

            // Vérification expiration de l'essai
            const now = Date.now();
            if (data.status === 'trial' && now > data.trialEndsAt) {
                data.status = 'expired';
            } else if (data.status === 'active' && data.expiresAt && now > data.expiresAt) {
                data.status = 'expired';
            }

            return data;
        },

        /**
         * Sauvegarde l'état de l'abonnement et notifie l'application.
         */
        saveSubscription: function (data) {
            try {
                localStorage.setItem(this._storageKey(), JSON.stringify(data));
                if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('ikadevis:subscription_updated', { detail: data }));
                }
            } catch (e) {
                console.error('[SubscriptionService] Erreur sauvegarde localStorage', e);
            }
        },

        /**
         * Retourne le plan actif courant
         */
        getCurrentPlan: function () {
            if (this.isSuperAdmin()) return PLANS.entreprise;
            const sub = this.getSubscription();
            return PLANS[sub.planId] || PLANS.starter;
        },

        /**
         * Calcule le nombre de jours restants sur l'essai ou l'abonnement
         */
        getDaysRemaining: function () {
            if (this.isSuperAdmin()) return Infinity;
            const sub = this.getSubscription();
            const now = Date.now();
            const target = sub.status === 'trial' ? sub.trialEndsAt : sub.expiresAt;
            if (!target || target < now) return 0;
            return Math.max(0, Math.ceil((target - now) / (1000 * 60 * 60 * 24)));
        },

        /**
         * Vérifie si l'utilisateur a le droit de créer un nouveau devis.
         * @param {number} currentCount Nombre actuel de devis créés.
         */
        canCreateDevis: function (currentCount = 0) {
            if (this.isSuperAdmin()) {
                return {
                    allowed: true,
                    limit: Infinity,
                    current: currentCount,
                    remaining: Infinity,
                    plan: PLANS.entreprise,
                    sub: this.getSubscription()
                };
            }

            const sub = this.getSubscription();
            const plan = PLANS[sub.planId] || PLANS.starter;

            // Si expiré
            if (!['trial', 'active'].includes(sub.status)) {
                return {
                    allowed: false,
                    reason: 'trial_expired',
                    message: 'Votre période d’essai ou abonnement a expiré. Veuillez choisir une formule pour continuer à créer des devis.',
                    plan,
                    sub
                };
            }

            // Si quota Starter atteint
            if (sub.planId === 'starter' && currentCount >= plan.maxDevis) {
                return {
                    allowed: false,
                    reason: 'quota_reached',
                    limit: plan.maxDevis,
                    current: currentCount,
                    message: `Vous avez atteint la limite de ${plan.maxDevis} devis de l’offre Starter gratuite. Passez à l'offre Standard ou Pro pour créer des devis illimités.`,
                    plan,
                    sub
                };
            }

            return {
                allowed: true,
                limit: plan.maxDevis,
                current: currentCount,
                remaining: Math.max(0, plan.maxDevis - currentCount),
                plan,
                sub
            };
        },

        /**
         * Vérifie si l'utilisateur a le droit de créer un nouveau projet.
         */
        canCreateProject: function (currentCount = 0) {
            if (this.isSuperAdmin()) {
                return { allowed: true, limit: Infinity, current: currentCount };
            }

            const sub = this.getSubscription();
            const plan = PLANS[sub.planId] || PLANS.starter;

            if (!['trial', 'active'].includes(sub.status)) {
                return {
                    allowed: false,
                    reason: 'expired',
                    message: 'Votre abonnement a expiré.'
                };
            }

            if (currentCount >= plan.maxProjects) {
                return {
                    allowed: false,
                    reason: 'quota_reached',
                    limit: plan.maxProjects,
                    current: currentCount,
                    message: `Limite de ${plan.maxProjects} projet(s) atteinte pour votre forfait actuel.`
                };
            }

            return { allowed: true, limit: plan.maxProjects, current: currentCount };
        },

        /**
         * ═══════════════════════════════════════════════════════════════
         * PAIEMENT D'ABONNEMENT — TOUT PASSE PAR LE SERVEUR
         * ═══════════════════════════════════════════════════════════════
         *
         * Réécrit le 2026-09-24. Les anciennes méthodes `activatePlan()` et
         * `applyPlanUpgrade()` ont été SUPPRIMÉES, pas corrigées : tant
         * qu'une fonction capable d'accorder une formule reste accessible
         * depuis `window.SubscriptionService`, il suffit d'une ligne dans
         * la console — ou d'un `else if (checks >= maxChecks)` malheureux,
         * ce qui est précisément arrivé — pour s'offrir l'abonnement.
         *
         * Désormais l'Edge Function `saspay-proxy` est seule à écrire dans
         * la table `subscriptions`, et seulement après que SasPay a
         * confirmé PAID sur un paiement qu'elle a elle-même créé. Le
         * navigateur demande, affiche, et rien de plus.
         */

        /** Client Supabase injecté par l'application au démarrage. */
        _supabase: null,

        setSupabaseClient: function (client) {
            this._supabase = client || null;
        },

        _client: function () {
            if (this._supabase) return this._supabase;
            if (typeof window !== 'undefined' && window.ikadevisSupabase) return window.ikadevisSupabase;
            return null;
        },

        /**
         * Traduit une ligne `subscriptions` du serveur vers la forme
         * attendue par l'interface. Le serveur reste la référence : c'est
         * lui qui dit `status`, on ne le recalcule pas ici.
         */
        _depuisLigneServeur: function (ligne) {
            if (!ligne) return null;
            const finEssai = ligne.trial_ends_at ? new Date(ligne.trial_ends_at).getTime() : 0;
            const finPeriode = ligne.current_period_end ? new Date(ligne.current_period_end).getTime() : 0;
            const maintenant = Date.now();

            let statut = ligne.status;
            // Une période échue vaut expiration, même si le serveur n'a pas
            // encore repassé la ligne (aucun cron ne le fait aujourd'hui).
            if (statut === 'active' && (!finPeriode || maintenant > finPeriode)) statut = 'expired';
            if (statut === 'trial' && (!finEssai || maintenant > finEssai)) statut = 'expired';

            return {
                planId: ligne.plan_id || 'starter',
                status: statut,
                billingCycle: ligne.billing_cycle || null,
                trialStartedAt: ligne.trial_started_at ? new Date(ligne.trial_started_at).getTime() : null,
                trialEndsAt: finEssai || null,
                expiresAt: finPeriode || finEssai || null,
                source: 'server',
                fetchedAt: maintenant,
                paymentHistory: []
            };
        },

        /**
         * Relit l'abonnement depuis le serveur et écrase le cache local.
         *
         * Le serveur gagne toujours, y compris à la baisse : un cache
         * falsifié en « entreprise / active » est ramené à son état réel
         * dès la première synchronisation réussie.
         */
        refreshFromServer: async function () {
            if (this.isSuperAdmin()) {
                const etatAdmin = this.getSubscription();
                this.saveSubscription(etatAdmin);
                // Synchronisation de confort avec la table subscriptions via saspay-proxy
                const client = this._client();
                if (client && this._organizationId) {
                    try {
                        await client.functions.invoke('saspay-proxy', {
                            body: { action: 'subscription-status', payload: { organizationId: this._organizationId } }
                        });
                    } catch (_) {}
                }
                return etatAdmin;
            }

            const client = this._client();
            if (!client || !this._organizationId) return null;
            const generation = this._generation;
            const organizationId = this._organizationId;
            try {
                const { data, error } = await client.functions.invoke('saspay-proxy', {
                    body: { action: 'subscription-status', payload: { organizationId } }
                });
                if (generation !== this._generation || error || !data || data.subscription?.organization_id !== organizationId) return null;

                const etat = this._depuisLigneServeur(data.subscription);
                if (etat) this.saveSubscription(etat);
                return etat;
            } catch (e) {
                // Hors ligne : on garde le cache, sans jamais l'améliorer.
                console.warn('[SubscriptionService] Synchronisation impossible, cache local conservé.', e);
                return null;
            }
        },

        /**
         * Demande un débit réel à SasPay, via le serveur.
         *
         * Ne renvoie JAMAIS de succès de paiement : seulement une référence
         * à sonder. Le montant n'est pas transmis — le serveur l'établit
         * d'après son propre catalogue, pour qu'un navigateur ne puisse pas
         * s'offrir la formule Entreprise à 100 F.
         *
         * @returns {{paymentRef: string, checkoutUrl: ?string, amount: number}}
         */
        startSubscriptionPayment: async function (params = {}) {
            const client = this._client();
            const sansSession = () => {
                const err = new Error('Vous devez être connecté à votre compte pour souscrire un abonnement.');
                err.code = 'NO_SESSION';
                return err;
            };
            if (!client) throw sansSession();

            // La présence d'un client Supabase ne prouve pas qu'on est
            // connecté : en Mode Démo / Invité le client existe, sans
            // session. Sans ce contrôle, l'appel partait quand même et
            // revenait en erreur réseau opaque (CORS), là où l'utilisateur
            // doit lire « connectez-vous ».
            let session = null;
            try {
                const { data } = await client.auth.getSession();
                session = data ? data.session : null;
            } catch (e) {
                session = null;
            }
            if (!session || session.user?.id !== this._userId) throw sansSession();
            if (!this._organizationId) throw new Error('Sélectionnez une entreprise avant de souscrire.');
            const organizationId = this._organizationId;

            const planId = params.planId;
            if (!PLANS[planId] || !(PLANS[planId].priceMonthly > 0)) {
                throw new Error('Formule invalide ou gratuite.');
            }

            const { data, error } = await client.functions.invoke('saspay-proxy', {
                body: {
                    action: 'subscription-initiate',
                    payload: {
                        organizationId,
                        planId: planId,
                        billingCycle: params.billingCycle === 'yearly' ? 'yearly' : 'monthly',
                        mode: params.mode === 'checkout' ? 'checkout' : 'softpay',
                        network: params.network || null,
                        phone: params.phone || null,
                        country: params.country || 'ML',
                        customerName: params.customerName || '',
                        returnUrl: params.returnUrl || null
                    }
                }
            });

            // supabase-js range le corps de la réponse d'erreur dans
            // error.context ; sans cette lecture on perdrait le message
            // métier (« passerelle non configurée ») au profit d'un
            // « Edge Function returned a non-2xx status code » opaque.
            if (error) {
                let message = error.message || 'Échec de la demande de paiement.';
                let code = null;
                try {
                    const corps = await error.context.json();
                    if (corps && corps.error) message = corps.error;
                    if (corps && corps.code) code = corps.code;
                } catch (e) {}
                const err = new Error(message);
                if (code) err.code = code;
                throw err;
            }
            if (!data || !data.ok || !data.paymentRef) {
                throw new Error((data && data.error) || 'La passerelle n’a pas confirmé la demande de débit.');
            }

            return data;
        },

        /**
         * Interroge le serveur sur l'issue d'un règlement.
         *
         * @returns {{status: 'paid'|'pending'|'failed', subscription: ?Object, reason: ?string}}
         *
         * Trois états, jamais deux. « pending » n'est pas un échec et ne
         * doit surtout pas devenir un succès après N tentatives : c'est
         * l'erreur qui a causé l'incident du 2026-09-24.
         */
        verifySubscriptionPayment: async function (paymentRef) {
            const client = this._client();
            if (!client || !this._organizationId) throw new Error('Sélectionnez votre entreprise.');
            const generation = this._generation;
            const organizationId = this._organizationId;

            const { data, error } = await client.functions.invoke('saspay-proxy', {
                body: { action: 'subscription-verify', payload: { paymentRef: paymentRef, organizationId } }
            });

            if (error) {
                // Une erreur de transport ne tranche rien : on reste en attente.
                return { status: 'pending', subscription: null, reason: error.message };
            }
            if (!data || !data.ok) {
                return { status: 'pending', subscription: null, reason: (data && data.error) || null };
            }

            if (generation !== this._generation) return { status: 'pending', subscription: null, reason: 'Entreprise active modifiée. Consultez son historique de paiements.' };
            if (data.status === 'paid' && data.subscription?.organization_id === organizationId) {
                const etat = this._depuisLigneServeur(data.subscription);
                if (etat) this.saveSubscription(etat);
                return { status: 'paid', subscription: etat, reason: null };
            }

            return { status: data.status === 'paid' ? 'pending' : data.status || 'pending', subscription: null, reason: data.reason || null };
        },

        /**
         * Historique des règlements d'abonnement (lecture seule, RLS
         * réservée aux rôles owner/admin).
         */
        getPaymentHistory: async function () {
            const client = this._client();
            if (!client || !this._organizationId) return [];
            const generation = this._generation;
            try {
                const { data, error } = await client
                    .from('subscription_payments')
                    .select('id, plan_id, billing_cycle, amount, currency, status, network, created_at, paid_at')
                    .eq('organization_id', this._organizationId)
                    .order('created_at', { ascending: false })
                    .limit(50);
                if (error || generation !== this._generation) return [];
                return data || [];
            } catch (e) {
                return [];
            }
        }
    };

    if (typeof window !== 'undefined') {
        window.SubscriptionService = SubscriptionService;
    }
    if (typeof globalThis !== 'undefined') {
        globalThis.SubscriptionService = SubscriptionService;
    }
})();
