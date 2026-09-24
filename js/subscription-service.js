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
            badge: 'Essentiel',
            price: 9900,
            period: '/ mois',
            isTrial: false,
            maxDevis: Infinity,
            maxProjects: 10,
            maxUsers: 2,
            description: 'Pour les artisans et petites équipes en activité régulière.',
            features: [
                'Devis & facturation illimités',
                'Jusqu’à 10 projets actifs',
                'Catalogue complet & calcul des marges',
                'Jusqu’à 2 utilisateurs',
                'Exports PDF & devis professionnels',
                'Support standard par email et WhatsApp'
            ]
        },
        pro: {
            id: 'pro',
            name: 'Pro',
            badge: 'Le plus populaire',
            isPopular: true,
            price: 14500,
            period: '/ mois',
            isTrial: false,
            maxDevis: Infinity,
            maxProjects: Infinity,
            maxUsers: 5,
            description: 'Pour les professionnels du BTP qui veulent structurer leur croissance.',
            features: [
                'Tout le plan Standard',
                'Projets & chantiers illimités',
                'Personnalisation complète (Logo, entête, CGV)',
                'Jusqu’à 5 collaborateurs',
                'Calculs avancés & calepinage automatique',
                'Historique et suivi des paiements',
                'Support prioritaire dédié'
            ]
        },
        business: {
            id: 'business',
            name: 'Business',
            badge: 'Option IA incluse',
            hasAiBadge: true,
            price: 29500,
            period: '/ mois',
            isTrial: false,
            maxDevis: Infinity,
            maxProjects: Infinity,
            maxUsers: Infinity,
            description: 'Pour les entreprises BTP et PME exigeant puissance et automatisation.',
            features: [
                'Tout le plan Pro en illimité',
                'Utilisateurs & équipes illimités',
                'Gestion d’affaires & suivi analytique chantier',
                '🤖 Option Assistant IA BTP intégrée',
                'Génération de devis assistée par IA',
                'Rapports d’activité et bilans financiers',
                'Accompagnement & onboarding personnalisé'
            ]
        }
    };

    const SubscriptionService = {
        PLANS,

        /**
         * Récupère l'état actuel de l'abonnement du compte.
         * Initialise un essai Starter de 14 jours si aucun abonnement n'existe.
         */
        getSubscription: function () {
            let data = null;
            try {
                const raw = localStorage.getItem(STORAGE_KEY);
                if (raw) data = JSON.parse(raw);
            } catch (e) {
                console.error('[SubscriptionService] Erreur lecture localStorage', e);
            }

            if (!data || !data.planId) {
                const now = Date.now();
                data = {
                    planId: 'starter',
                    status: 'trial', // 'trial' | 'active' | 'expired'
                    trialStartedAt: now,
                    trialEndsAt: now + (14 * 24 * 60 * 60 * 1000), // +14 jours
                    expiresAt: now + (14 * 24 * 60 * 60 * 1000),
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
                localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
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
            const sub = this.getSubscription();
            return PLANS[sub.planId] || PLANS.starter;
        },

        /**
         * Calcule le nombre de jours restants sur l'essai ou l'abonnement
         */
        getDaysRemaining: function () {
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
            const sub = this.getSubscription();
            const plan = PLANS[sub.planId] || PLANS.starter;

            // Si expiré
            if (sub.status === 'expired') {
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
            const sub = this.getSubscription();
            const plan = PLANS[sub.planId] || PLANS.starter;

            if (sub.status === 'expired') {
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
         * Initie un paiement SasPay pour un abonnement SaaS.
         * Utilise la clé API plateforme (Master).
         */
        initiateSubscriptionCheckout: async function (planId, userDetails = {}) {
            const plan = PLANS[planId];
            if (!plan || plan.price <= 0) {
                throw new Error('Plan invalide ou gratuit.');
            }

            if (typeof window.SasPayService === 'undefined') {
                throw new Error('Le service SasPay n\'est pas disponible.');
            }

            // Récupération de la clé API plateforme
            const platformConfig = window.SASPAY_PLATFORM_CONFIG || {};
            const apiKey = platformConfig.getApiKey ? platformConfig.getApiKey() : (platformConfig.apiKey || '');

            const origin = window.location.origin;
            const pathname = window.location.pathname;
            const returnUrl = `${origin}${pathname}?subscription=success&plan=${planId}`;

            const sessionParams = {
                amount: plan.price,
                currency: 'XOF',
                description: `Abonnement ikadevis ${plan.name} (1 mois)`,
                customer: {
                    name: userDetails.name || 'Utilisateur ikadevis',
                    email: userDetails.email || 'contact@ikadevis.com',
                    phone: userDetails.phone || ''
                },
                return_url: returnUrl,
                metadata: {
                    type: 'saas_subscription',
                    planId: plan.id,
                    planName: plan.name,
                    timestamp: Date.now()
                }
            };

            const configOverride = {
                apiKey: apiKey,
                environment: platformConfig.environment || 'live',
                defaultCountry: platformConfig.defaultCountry || 'ML'
            };

            return await window.SasPayService.createCheckoutSession(sessionParams, configOverride);
        },

        /**
         * Initie un paiement push Mobile Money direct (SoftPay) pour l'abonnement
         */
        initiateSubscriptionSoftPay: async function (planId, phone, network, userDetails = {}) {
            const plan = PLANS[planId];
            if (!plan || plan.price <= 0) {
                throw new Error('Plan invalide ou gratuit.');
            }

            if (typeof window.SasPayService === 'undefined') {
                throw new Error('Le service SasPay n\'est pas disponible.');
            }

            const platformConfig = window.SASPAY_PLATFORM_CONFIG || {};
            const apiKey = platformConfig.getApiKey ? platformConfig.getApiKey() : (platformConfig.apiKey || '');

            const softpayParams = {
                amount: plan.price,
                currency: 'XOF',
                phone: phone,
                network: network,
                description: `Abonnement ikadevis ${plan.name}`,
                customer: {
                    name: userDetails.name || 'Client ikadevis',
                    email: userDetails.email || ''
                },
                metadata: {
                    type: 'saas_subscription',
                    planId: plan.id,
                    planName: plan.name,
                    timestamp: Date.now()
                }
            };

            const configOverride = {
                apiKey: apiKey,
                environment: platformConfig.environment || 'live',
                defaultCountry: platformConfig.defaultCountry || 'ML'
            };

            return await window.SasPayService.initiateSoftPay(softpayParams, configOverride);
        },

        /**
         * Active ou prolonge l'abonnement suite à la confirmation d'un paiement SasPay.
         */
        activatePlan: function (planId, paymentInfo = {}) {
            const plan = PLANS[planId];
            if (!plan) return false;

            const now = Date.now();
            const sub = this.getSubscription();

            // Si déjà actif, on ajoute 30 jours à l'échéance existante, sinon 30 jours à partir de maintenant
            const baseTime = (sub.status === 'active' && sub.expiresAt && sub.expiresAt > now)
                ? sub.expiresAt
                : now;
            const newExpiresAt = baseTime + (30 * 24 * 60 * 60 * 1000); // +30 jours

            sub.planId = planId;
            sub.status = 'active';
            sub.activatedAt = now;
            sub.expiresAt = newExpiresAt;

            if (!sub.paymentHistory) sub.paymentHistory = [];
            sub.paymentHistory.unshift({
                id: paymentInfo.id || `pay_${now}`,
                planId: planId,
                planName: plan.name,
                amount: plan.price,
                currency: 'XOF',
                date: new Date().toISOString(),
                reference: paymentInfo.reference || `SASPAY-${now}`,
                mode: paymentInfo.mode || 'saspay'
            });

            this.saveSubscription(sub);
            return sub;
        }
    };

    window.SubscriptionService = SubscriptionService;
})();
