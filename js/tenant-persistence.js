// ═══════════════════════════════════════════════════════════════════════════
// LOT 2 : PERSISTANCE MULTI-TENANT, CACHES ET REPRISE APRÈS INCIDENT (P1)
// Conforme SEC-05 et complément REL-01
// ═══════════════════════════════════════════════════════════════════════════

(function (root) {
    'use strict';

    class TenantPersistence {
        constructor(storage, userId, activeOrgId) {
            this.storage = storage || (typeof window !== 'undefined' ? window.localStorage : null);
            this.userId = userId || 'guest';
            this.activeOrgId = activeOrgId || null;
            this.pendingRequests = new Map(); // Pour neutraliser les réponses tardives A -> B
        }

        setContext(userId, activeOrgId) {
            this.userId = userId || 'guest';
            this.activeOrgId = activeOrgId || null;
        }

        // ─────────────────────────────────────────────────────────────────────
        // 1. ISOLATION DES CLÉS (USER + ORGANISATION)
        // ─────────────────────────────────────────────────────────────────────
        getKey(resourceKey, userId, orgId) {
            const uid = userId || this.userId;
            const oid = orgId || this.activeOrgId;

            if (!uid || uid === 'guest') {
                return `costcalc:guest:${resourceKey}`;
            }

            if (oid && oid !== 'guest') {
                return `costcalc:${uid}:${oid}:${resourceKey}`;
            }

            // Clé globale de l'utilisateur (non rattachée à une organisation spécifique)
            return `costcalc:${uid}:global:${resourceKey}`;
        }

        get(resourceKey, userId, orgId) {
            if (!this.storage) return null;
            try {
                const k = this.getKey(resourceKey, userId, orgId);
                const raw = this.storage.getItem(k);
                if (raw === null) return null;
                const parsed = JSON.parse(raw);
                const cleaner = (typeof root.PaymentDataSafety !== 'undefined' && root.PaymentDataSafety)
                    ? (root.PaymentDataSafety.cleanObject || root.PaymentDataSafety.withoutPaymentSecrets)
                    : null;
                return cleaner ? cleaner(parsed) : parsed;
            } catch (e) {
                return null;
            }
        }

        set(resourceKey, value, userId, orgId) {
            if (!this.storage) return false;
            try {
                const k = this.getKey(resourceKey, userId, orgId);
                const cleaner = typeof root.PaymentDataSafety !== 'undefined'
                    ? (root.PaymentDataSafety.cleanObject || root.PaymentDataSafety.withoutPaymentSecrets)
                    : null;
                const safeValue = cleaner ? cleaner(value) : value;

                this.storage.setItem(k, JSON.stringify(safeValue));
                return true;
            } catch (e) {
                return false;
            }
        }

        remove(resourceKey, userId, orgId) {
            if (!this.storage) return;
            const k = this.getKey(resourceKey, userId, orgId);
            this.storage.removeItem(k);
        }

        // ─────────────────────────────────────────────────────────────────────
        // 2. OUTBOX MULTI-TENANT TRANSACTIONNELLE ET IDEMPOTENTE
        //    Chaque écriture porte explicitement son organisation cible.
        // ─────────────────────────────────────────────────────────────────────
        getOutboxKey(userId, orgId) {
            const uid = userId || this.userId;
            const oid = orgId || this.activeOrgId;
            if (!uid || uid === 'guest' || !oid) return null;
            return `costcalc:${uid}:${oid}:outbox:v2`;
        }

        getOutbox(userId, orgId) {
            const key = this.getOutboxKey(userId, orgId);
            if (!key || !this.storage) return {};
            try {
                const raw = this.storage.getItem(key);
                return raw ? JSON.parse(raw) : {};
            } catch (e) {
                return {};
            }
        }

        stageOutbox(resourceKey, data, expectedVersion, userId, orgId) {
            const uid = userId || this.userId;
            const oid = orgId || this.activeOrgId;
            const key = this.getOutboxKey(uid, oid);
            if (!key || !this.storage) {
                throw new Error('Impossible d’enregistrer : compte ou organisation manquante.');
            }

            const outbox = this.getOutbox(uid, oid);
            const entryId = crypto.randomUUID ? crypto.randomUUID() : ('op_' + Date.now() + '_' + Math.random());
            const cleaner = typeof root.PaymentDataSafety !== 'undefined'
                ? (root.PaymentDataSafety.cleanObject || root.PaymentDataSafety.withoutPaymentSecrets)
                : null;
            const safeData = cleaner ? cleaner(data) : data;


            outbox[resourceKey] = {
                id: entryId,
                resourceKey,
                organizationId: oid,
                userId: uid,
                expectedVersion: expectedVersion || null,
                payload: safeData,
                stagedAt: new Date().toISOString()
            };

            this.storage.setItem(key, JSON.stringify(outbox));
            return entryId;
        }

        acknowledgeOutbox(resourceKey, entryId, userId, orgId) {
            const uid = userId || this.userId;
            const oid = orgId || this.activeOrgId;
            const key = this.getOutboxKey(uid, oid);
            if (!key || !this.storage) return;

            const outbox = this.getOutbox(uid, oid);
            const entry = outbox[resourceKey];
            if (!entry) return;

            // N'acquitter que si l'identifiant d'opération correspond exactement
            if (!entryId || entry.id === entryId) {
                delete outbox[resourceKey];
                if (Object.keys(outbox).length === 0) {
                    this.storage.removeItem(key);
                } else {
                    this.storage.setItem(key, JSON.stringify(outbox));
                }
            }
        }

        // Vérification de sécurité avant rejeu : interdit toute destination incohérente
        assertOutboxIntegrity(entry, targetOrgId) {
            if (!entry || typeof entry !== 'object') {
                throw new Error('Entrée d’outbox invalide.');
            }
            if (entry.organizationId !== targetOrgId) {
                throw new Error(
                    `Violation d’isolation : l’opération appartient à l’organisation ${entry.organizationId}, pas à ${targetOrgId}. Rejeu refusé.`
                );
            }
            if (entry.userId !== this.userId) {
                throw new Error('Violation d’isolation : compte utilisateur non concordant.');
            }
            return true;
        }

        // ─────────────────────────────────────────────────────────────────────
        // 3. GARDE ANTI-COURSE (ANTI-RACE CONDITION LORS DE CHANGEMENT D'ORG)
        //    Empêche une réponse réseau retardée de l'organisation A d'écraser B.
        // ─────────────────────────────────────────────────────────────────────
        createRequestGuard(resourceName, orgId) {
            const expectedOrgId = orgId || this.activeOrgId;
            const requestId = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())) + '_' + Math.random();
            this.pendingRequests.set(resourceName, { requestId, expectedOrgId });

            return {
                requestId,
                expectedOrgId,
                isValid: () => {
                    const current = this.pendingRequests.get(resourceName);
                    if (!current) return false;
                    // Valide uniquement si l'organisation n'a pas changé et s'il s'agit de la dernière requête
                    return current.requestId === requestId && current.expectedOrgId === this.activeOrgId;
                }
            };
        }

        // ─────────────────────────────────────────────────────────────────────
        // 4. MIGRATION CONSERVATRICE DES ANCIENNES DONNÉES LOCALES
        //    Aucune réaffectation automatique en cas d'ambiguïté.
        // ─────────────────────────────────────────────────────────────────────
        detectLegacyData() {
            if (!this.storage) return [];
            const ambiguousEntries = [];

            for (let i = 0; i < this.storage.length; i++) {
                const k = this.storage.key(i);
                if (!k) continue;

                // Ancien format non scopé par organisation : costcalc:<userId>:<resource>
                const match = k.match(/^costcalc:([^:]+):([a-zA-Z0-9_-]+)$/);
                if (match) {
                    const [_, uid, res] = match;
                    if (uid !== 'guest' && res !== 'outbox' && res !== 'lastRev') {
                        ambiguousEntries.push({
                            originalKey: k,
                            userId: uid,
                            resource: res,
                            isAmbiguous: true // Ne pas assigner arbitrairement à une entreprise
                        });
                    }
                }
            }

            return ambiguousEntries;
        }

        // Export de secours d'une entrée orpheline avant mise en quarantaine
        quarantineLegacyEntry(key) {
            if (!this.storage) return null;
            const val = this.storage.getItem(key);
            if (!val) return null;
            const quarantineKey = `ikadevis:quarantine:${key}`;
            this.storage.setItem(quarantineKey, val);
            this.storage.removeItem(key);
            return quarantineKey;
        }

        // ─────────────────────────────────────────────────────────────────────
        // 5. GESTION DES CONFLITS (COMPARAISON DE VERSIONS & RAPPROCHEMENT)
        // ─────────────────────────────────────────────────────────────────────
        buildConflictResolutionPlan(resourceKey, localPayload, serverPayload, expectedFingerprint, currentServerFingerprint) {
            return {
                resourceKey,
                detectedAt: new Date().toISOString(),
                fingerprints: {
                    expected: expectedFingerprint,
                    serverCurrent: currentServerFingerprint
                },
                localSummary: {
                    itemCount: Array.isArray(localPayload) ? localPayload.length : (localPayload ? 1 : 0),
                    data: localPayload
                },
                serverSummary: {
                    itemCount: Array.isArray(serverPayload) ? serverPayload.length : (serverPayload ? 1 : 0),
                    data: serverPayload
                },
                options: [
                    { id: 'keep_server', label: 'Conserver la version du serveur (recommandé)' },
                    { id: 'force_local', label: 'Remplacer le serveur par ma copie locale' },
                    { id: 'export_local', label: 'Télécharger ma copie locale en fichier de secours' }
                ]
            };
        }
    }

    root.TenantPersistence = TenantPersistence;
})(typeof globalThis === 'undefined' ? window : globalThis);
