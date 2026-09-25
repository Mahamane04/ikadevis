// Les écritures restent liées au compte, à l'entreprise et à la version lue.
// Une erreur RPC ne doit jamais acquitter l'outbox ni annoncer une sauvegarde.
(function (root) {
    class CatalogPersistence {
        constructor(client, storage, userId, writerId) {
            this.client = client;
            this.storage = storage;
            this.userId = userId;
            if (!writerId) {
                try {
                    writerId = root.sessionStorage?.getItem('ikadevis_catalog_writer');
                    if (!writerId) {
                        writerId = crypto.randomUUID();
                        root.sessionStorage?.setItem('ikadevis_catalog_writer', writerId);
                    }
                } catch (_) { writerId = crypto.randomUUID(); }
            }
            this.writerId = writerId;
            this.isReady = true;
            this.ready = Promise.resolve();
            if (root.navigator?.locks?.request) {
                // Un onglet dupliqué hérite du sessionStorage. Le verrou de vie
                // du document lui attribue une autre identité si elle est occupée.
                this.isReady = false;
                this.ready = new Promise(resolve => {
                    const claim = () => root.navigator.locks.request(
                        `ikadevis:catalog-writer:${this.userId}:${this.writerId}`,
                        { ifAvailable: true }, async lock => {
                            if (!lock) {
                                this.writerId = crypto.randomUUID();
                                root.sessionStorage?.setItem('ikadevis_catalog_writer', this.writerId);
                                return claim();
                            }
                            this.isReady = true;
                            resolve();
                            await new Promise(() => {}); // libéré à la fermeture du document
                        }).catch(error => { this.initError = error; this.isReady = true; resolve(); });
                    claim();
                });
            } else if (root.navigator) {
                // Sans Web Locks, ne jamais partager une file entre deux documents.
                // Les anciennes copies restent détectables/exportables.
                this.writerId = crypto.randomUUID();
            }
            this.versions = new Map();
            this.running = new Map();
        }
        prefix(org) { return `ikadevis:catalog:v1:${this.userId}:${org}:`; }
        key(org, table) { return `${this.prefix(org)}${table}:${this.writerId}`; }
        otherPending(org) {
            const entries = [];
            for (let i = 0; i < this.storage.length; i++) {
                const key = this.storage.key(i);
                if (key?.startsWith(this.prefix(org)) && !key.endsWith(':' + this.writerId)) {
                    // Ne pas rejouer une opération d'un autre onglet. Même un contenu
                    // illisible reste exportable pour récupération, sans être perdu.
                    entries.push({ key, raw: this.storage.getItem(key) });
                }
            }
            return entries;
        }
        pending(org, table) {
            const raw = this.storage.getItem(this.key(org, table));
            return raw ? JSON.parse(raw) : null;
        }
        async read(org, table) {
            await this.ready;
            if (this.initError) throw this.initError;
            const { data, error } = await this.client.rpc('catalog_snapshot_v1', { p_org_id: org, p_table: table });
            if (error) throw error;
            if (!data || !Array.isArray(data.rows) || !data.fingerprint) throw new Error('Catalogue indisponible.');
            this.versions.set(this.key(org, table), data.fingerprint);
            return { data: data.rows, error: null };
        }
        stage(org, table, rows) {
            if (!this.isReady || this.initError) throw new Error('La sauvegarde locale n’est pas prête.');
            const key = this.key(org, table);
            const previous = this.pending(org, table);
            const expected = previous?.expected || this.versions.get(key);
            if (!expected) throw new Error('Rechargez le catalogue de cette entreprise avant de le modifier.');
            const operation = { org, table, userId: this.userId, expected, rows,
                id: crypto.randomUUID() };
            this.storage.setItem(key, JSON.stringify(operation));
        }
        async flush(org, table) {
            await this.ready;
            if (this.initError) throw this.initError;
            const key = this.key(org, table);
            if (this.running.has(key)) return this.running.get(key);
            const task = this.drain(org, table);
            this.running.set(key, task);
            try { return await task; } finally { this.running.delete(key); }
        }
        async drain(org, table) {
            const key = this.key(org, table);
            for (;;) {
                const operation = this.pending(org, table);
                if (!operation) return;
                if (operation.org !== org || operation.table !== table || operation.userId !== this.userId) {
                    throw new Error('Reprise refusée : entreprise ou compte différent.');
                }
                const { data, error } = await this.client.rpc('replace_catalog_v1', {
                    p_org_id: org, p_table: table, p_expected: operation.expected, p_rows: operation.rows
                });
                if (error) throw error;
                if (!data?.fingerprint) throw new Error('La sauvegarde du catalogue n’a pas été confirmée.');
                this.versions.set(key, data.fingerprint);
                const latest = this.pending(org, table);
                if (latest?.id === operation.id) this.storage.removeItem(key);
                else if (latest && latest.expected === operation.expected) {
                    // Une saisie plus récente attend déjà : acquitter seulement l'ancienne.
                    this.storage.setItem(key, JSON.stringify({ ...latest, expected: data.fingerprint }));
                }
            }
        }
    }
    root.CatalogPersistence = CatalogPersistence;
})(typeof globalThis === 'undefined' ? window : globalThis);
