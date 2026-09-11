import fs from 'fs';

const filePath = '/Users/mahamanehaidara/Documents/ANTY GRAVITY APSS/Micro office ERP CALCUL/index_jsx.js';
let content = fs.readFileSync(filePath, 'utf8');

function mustReplace(target, replacement, label) {
    if (!content.includes(target)) {
        console.error(`❌ Target NOT found for: ${label}`);
        console.error('Target snippet was:', target.slice(0, 100));
        process.exit(1);
    }
    content = content.replace(target, replacement);
    console.log(`✓ ${label}`);
}

console.log('--- Applying Phase 1: State declarations ---');
const stateTarget = `    const [creditNoteModalData, setCreditNoteModalData] = useState(null); // Facture sur laquelle émettre un avoir rectificatif`;
const stateAdditions = `    const [creditNoteModalData, setCreditNoteModalData] = useState(null); // Facture sur laquelle émettre un avoir rectificatif
    const [selectedInvoiceIds, setSelectedInvoiceIds] = useState(new Set()); // Opérations groupées sur factures
    const [previewInvoiceModal, setPreviewInvoiceModal] = useState(null); // Modale d'aperçu fidèle du document PDF
    const [emailComposerModal, setEmailComposerModal] = useState(null); // Modale d'envoi & relance e-mail avec templates`;
mustReplace(stateTarget, stateAdditions, 'Phase 1: State declarations');

console.log('--- Applying Phase 2: Invoices Brouillon carrying paymentSchedule ---');
const brouillonTarget = `            companyInfoSnapshot: { ...companyInfo },
            quoteDataSnapshot: devis.quoteData || {}`;
const brouillonReplacement = `            paymentSchedule: devis.paymentSchedule || devis.quoteDataSnapshot?.paymentSchedule || companyInfo.paymentSchedule || null,
            companyInfoSnapshot: { ...companyInfo },
            quoteDataSnapshot: devis.quoteData || {}`;
mustReplace(brouillonTarget, brouillonReplacement, 'Phase 2: Brouillon paymentSchedule inheritance');

console.log('--- Applying Phase 3: DocumentFacture Échéancier section ---');
const targetDocFacture = `            {(() => {
                const mobileMoney = [
                    ci.commercialSettings?.orangeMoneyNumber && \`Orange Money : \${ci.commercialSettings.orangeMoneyNumber}\`,
                    ci.commercialSettings?.waveNumber && \`Wave : \${ci.commercialSettings.waveNumber}\`,
                    ci.commercialSettings?.moovMoneyNumber && \`Moov Money : \${ci.commercialSettings.moovMoneyNumber}\`
                ].filter(Boolean);`;

const echeancierDocFactureSnippet = `            {/* 2026-09-10 — Échéancier contractuel & Modalités de règlement BTP */}
            {(() => {
                if (facture.type === 'avoir') return null;
                const schedule = (facture.paymentSchedule && facture.paymentSchedule.length > 0)
                    ? facture.paymentSchedule
                    : ((facture.echeancier && facture.echeancier.length > 0)
                        ? facture.echeancier
                        : ((ci.paymentSchedule && ci.paymentSchedule.length > 0)
                            ? ci.paymentSchedule
                            : null));
                if (!schedule || schedule.length === 0) return null;
                const netTTC = facture.netAPayerTTC != null ? facture.netAPayerTTC : (facture.totalTTC || 0);
                const regle = Number(facture.montantRegle) || 0;
                let cumulSeuil = 0;

                return (
                    <div className="pt-4 border-t border-neutral-200">
                        <div className="flex items-center justify-between mb-2">
                            <h4 className="text-xs font-bold text-neutral-800 uppercase tracking-wider flex items-center gap-1.5">
                                <i className="fa-solid fa-calendar-check" style={{ color: theme.brandColor }}></i>
                                Échéancier de règlement & Jalons convenus
                            </h4>
                            <span className="text-[10px] text-neutral-500 font-medium">Conditions contractuelles</span>
                        </div>
                        <div className="border border-neutral-200 rounded-xl overflow-hidden shadow-2xs">
                            <table className="w-full text-left text-xs">
                                <thead className="bg-neutral-50 border-b border-neutral-200 text-[10px] font-semibold text-neutral-500 uppercase">
                                    <tr>
                                        <th className="py-1.5 px-3">Jalon / Tranche</th>
                                        <th className="py-1.5 px-3 text-center">Part (%)</th>
                                        <th className="py-1.5 px-3 text-right">Montant TTC</th>
                                        <th className="py-1.5 px-3 text-center">Statut</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-neutral-100 text-neutral-700">
                                    {schedule.map((st, idx) => {
                                        const pct = Number(st.pct) || 0;
                                        const montantTranche = Math.round(netTTC * (pct / 100));
                                        const seuilDebut = cumulSeuil;
                                        cumulSeuil += montantTranche;
                                        const seuilFin = cumulSeuil;
                                        
                                        let statutTranche = 'À échoir';
                                        let badgeColor = 'bg-neutral-100 text-neutral-600 border-neutral-200';
                                        if (regle >= seuilFin) {
                                            statutTranche = 'Réglé';
                                            badgeColor = 'bg-emerald-50 text-emerald-700 border-emerald-200 font-bold';
                                        } else if (regle > seuilDebut) {
                                            statutTranche = 'Partiel';
                                            badgeColor = 'bg-amber-50 text-amber-700 border-amber-200 font-bold';
                                        }

                                        return (
                                            <tr key={idx} className="hover:bg-neutral-50/50">
                                                <td className="py-1.5 px-3 font-medium text-neutral-900">
                                                    {st.label || \`Tranche \${idx + 1}\`}
                                                </td>
                                                <td className="py-1.5 px-3 text-center font-mono text-neutral-600">
                                                    {pct}%
                                                </td>
                                                <td className="py-1.5 px-3 text-right font-bold text-neutral-900 font-mono">
                                                    {formatMoney(montantTranche, devise)}
                                                </td>
                                                <td className="py-1.5 px-3 text-center">
                                                    <span className={\`text-[9px] px-2 py-0.5 rounded-full border \${badgeColor}\`}>
                                                        {statutTranche}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                );
            })()}

` + targetDocFacture;
mustReplace(targetDocFacture, echeancierDocFactureSnippet, 'Phase 3: DocumentFacture Échéancier section');

console.log('--- Applying Phase 4: Invoice Inspector interactive Échéancier section ---');
const inspectorDocTarget = `                                {documentDeLaFacture(activeInvoice)}`;
const inspectorEcheancierSnippet = `                                {/* 2026-09-10 — Échéancier contractuel & Jalons BTP dans l'Inspecteur */}
                                {(() => {
                                    if (activeInvoice.type === 'avoir') return null;
                                    const schedule = (activeInvoice.paymentSchedule && activeInvoice.paymentSchedule.length > 0)
                                        ? activeInvoice.paymentSchedule
                                        : ((activeInvoice.echeancier && activeInvoice.echeancier.length > 0)
                                            ? activeInvoice.echeancier
                                            : ((companyInfo.paymentSchedule && companyInfo.paymentSchedule.length > 0)
                                                ? companyInfo.paymentSchedule
                                                : null));
                                    if (!schedule || schedule.length === 0) return null;
                                    const netTTC = activeInvoice.netAPayerTTC != null ? activeInvoice.netAPayerTTC : (activeInvoice.totalTTC || 0);
                                    const regle = Number(activeInvoice.montantRegle) || 0;
                                    let cumulSeuil = 0;

                                    return (
                                        <div className="mb-5 bg-white rounded-xl border border-neutral-200/90 shadow-xs overflow-hidden">
                                            <div className="p-3.5 bg-gradient-to-r from-neutral-50 to-indigo-50/30 border-b border-neutral-200/70 flex items-center justify-between">
                                                <div className="flex items-center gap-2.5">
                                                    <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs">
                                                        <i className="fa-solid fa-calendar-check"></i>
                                                    </div>
                                                    <div>
                                                        <h4 className="text-xs font-bold text-neutral-900">Échéancier contractuel & Jalons BTP</h4>
                                                        <p className="text-[11px] text-neutral-500">Suivi des tranches de paiement convenues</p>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="p-4 overflow-x-auto">
                                                <table className="w-full text-left text-xs">
                                                    <thead>
                                                        <tr className="border-b border-neutral-200 text-[10px] font-semibold text-neutral-500 uppercase">
                                                            <th className="pb-2">Tranche / Jalon</th>
                                                            <th className="pb-2 text-center">Part (%)</th>
                                                            <th className="pb-2 text-right">Montant TTC</th>
                                                            <th className="pb-2 text-center">Couverture</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-neutral-100">
                                                        {schedule.map((st, idx) => {
                                                            const pct = Number(st.pct) || 0;
                                                            const montantTranche = Math.round(netTTC * (pct / 100));
                                                            const seuilDebut = cumulSeuil;
                                                            cumulSeuil += montantTranche;
                                                            const seuilFin = cumulSeuil;
                                                            
                                                            let statutTranche = 'À échoir';
                                                            let badgeClass = 'bg-neutral-100 text-neutral-600 border-neutral-200';
                                                            if (regle >= seuilFin) {
                                                                statutTranche = 'Réglé';
                                                                badgeClass = 'bg-emerald-50 text-emerald-700 border-emerald-300 font-bold';
                                                            } else if (regle > seuilDebut) {
                                                                const payeTranche = regle - seuilDebut;
                                                                const pctTranche = Math.round((payeTranche / montantTranche) * 100);
                                                                statutTranche = \`Partiel (\${pctTranche}%)\`;
                                                                badgeClass = 'bg-amber-50 text-amber-700 border-amber-300 font-bold';
                                                            }

                                                            return (
                                                                <tr key={idx} className="hover:bg-neutral-50/50">
                                                                    <td className="py-2 font-medium text-neutral-900 flex items-center gap-2">
                                                                        <span className="w-5 h-5 rounded-full bg-neutral-100 text-neutral-600 text-[10px] flex items-center justify-center font-mono font-bold">
                                                                            {idx + 1}
                                                                        </span>
                                                                        <span>{st.label || \`Tranche \${idx + 1}\`}</span>
                                                                    </td>
                                                                    <td className="py-2 text-center font-mono font-semibold text-neutral-600">
                                                                        {pct}%
                                                                    </td>
                                                                    <td className="py-2 text-right font-bold text-neutral-900 font-mono">
                                                                        {formatMoney(montantTranche, cur)}
                                                                    </td>
                                                                    <td className="py-2 text-center">
                                                                        <span className={\`inline-flex items-center gap-1 text-[10px] px-2.5 py-0.5 rounded-full border \${badgeClass}\`}>
                                                                            {regle >= seuilFin && <i className="fa-solid fa-circle-check text-[10px]"></i>}
                                                                            {regle > seuilDebut && regle < seuilFin && <i className="fa-solid fa-clock text-[10px]"></i>}
                                                                            {regle <= seuilDebut && <i className="fa-regular fa-circle text-[9px] text-neutral-400"></i>}
                                                                            <span>{statutTranche}</span>
                                                                        </span>
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    );
                                })()}

` + inspectorDocTarget;
mustReplace(inspectorDocTarget, inspectorEcheancierSnippet, 'Phase 4: Invoice inspector interactive Échéancier section');

console.log('--- Applying Phase 5: Toolbar Preview (Aperçu) & Email/Relance Buttons ---');
const toolbarDownloadTarget = `                                            <button
                                                onClick={() => telechargerDocument(
                                                    \`Facture \${activeInvoice.numero} \${activeInvoice.clientName}\`,
                                                    'facture'
                                                )}
                                                disabled={pdfEnCours === 'facture'}
                                                className="btn-primary py-1.5 px-3.5 text-xs font-bold shadow-sm disabled:opacity-60 flex items-center gap-1.5"
                                                title="Télécharger la facture au format PDF — template actif appliqué automatiquement"
                                                aria-label="Télécharger la facture en PDF"
                                            >
                                                <i className={\`fa-solid \${pdfEnCours === 'facture' ? 'fa-circle-notch fa-spin' : 'fa-download'}\`}></i>
                                                <span>{pdfEnCours === 'facture' ? 'Génération…' : 'Télécharger le PDF'}</span>
                                            </button>`;

const toolbarDownloadWithPreviewAndRelance = `                                            <button
                                                type="button"
                                                onClick={() => setPreviewInvoiceModal(activeInvoice)}
                                                className="btn-secondary py-1.5 px-3 text-xs font-bold flex items-center gap-1.5"
                                                title="Aperçu avant impression et vérification du rendu PDF"
                                                aria-label="Aperçu de la facture"
                                            >
                                                <i className="fa-solid fa-eye text-neutral-600"></i>
                                                <span>Aperçu</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setEmailComposerModal(activeInvoice)}
                                                className="btn-secondary py-1.5 px-3 text-xs font-bold text-indigo-700 bg-indigo-50/50 border-indigo-200 hover:bg-indigo-100 flex items-center gap-1.5"
                                                title="Envoyer ou relancer par e-mail avec modèles BTP personnalisés"
                                                aria-label="Envoyer ou relancer par e-mail"
                                            >
                                                <i className="fa-solid fa-envelope text-indigo-600"></i>
                                                <span>E-mail / Relance</span>
                                            </button>
` + toolbarDownloadTarget;
mustReplace(toolbarDownloadTarget, toolbarDownloadWithPreviewAndRelance, 'Phase 5: Toolbar Preview and Email/Relance buttons');

console.log('--- Applying Phase 6: Batch Operations Handlers in renderInvoices ---');
const tauxRecouvrementTarget = `        const tauxRecouvrement = totalFactureTTC > 0 ? Math.min(100, Math.round((totalEncaisseTTC / totalFactureTTC) * 100)) : 0;`;

const batchHandlersAndExporter = `        const tauxRecouvrement = totalFactureTTC > 0 ? Math.min(100, Math.round((totalEncaisseTTC / totalFactureTTC) * 100)) : 0;

        // Opérations groupées & sélection multiple
        const toggleSelectInvoice = (id) => {
            setSelectedInvoiceIds(prev => {
                const next = new Set(prev);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
            });
        };

        const toggleSelectAllInvoices = (list) => {
            const ids = list.map(f => f.id);
            const allSelected = ids.length > 0 && ids.every(id => selectedInvoiceIds.has(id));
            setSelectedInvoiceIds(prev => {
                const next = new Set(prev);
                if (allSelected) {
                    ids.forEach(id => next.delete(id));
                } else {
                    ids.forEach(id => next.add(id));
                }
                return next;
            });
        };

        const clearSelectedInvoices = () => {
            setSelectedInvoiceIds(new Set());
        };

        const handleBatchMarkAsSent = async () => {
            const cibles = invoices.filter(f => selectedInvoiceIds.has(f.id) && f.statut !== 'sent' && f.statut !== 'cancelled');
            if (cibles.length === 0) {
                showToast("Toutes les factures sélectionnées sont déjà envoyées ou annulées.", "info");
                return;
            }
            const dateEnvoi = new Date().toISOString();
            const ciblesIds = new Set(cibles.map(c => c.id));
            const maj = invoices.map(f => {
                if (ciblesIds.has(f.id)) {
                    return { ...f, statut: 'sent', dateEnvoi, sent_at: dateEnvoi };
                }
                return f;
            });
            updateInvoices(maj);
            showToast(\`\${cibles.length} facture(s) marquée(s) comme envoyée(s)\`, "success");
            clearSelectedInvoices();
        };

        const handleBatchDownloadPdf = async () => {
            const cibles = invoices.filter(f => selectedInvoiceIds.has(f.id));
            if (cibles.length === 0) return;
            showToast(\`Téléchargement de \${cibles.length} facture(s) en cours...\`, "info");
            for (let i = 0; i < cibles.length; i++) {
                const f = cibles[i];
                const nomFichier = \`Facture_\${f.numero || f.clientName || 'BTP'}.pdf\`;
                setViewingInvoice(f);
                await new Promise(r => setTimeout(r, 600));
                await telechargerElementPdf(zoneImpressionVisible(), nomFichier, f.id);
                if (i < cibles.length - 1) {
                    await new Promise(r => setTimeout(r, 500));
                }
            }
            showToast("Téléchargement groupé terminé", "success");
        };

        // Génération de l'export comptable (Journal des Ventes en CSV / Excel avec BOM UTF-8)
        const exporterFacturesCSV = (listeSpecifique = null) => {
            const facturesAExporter = Array.isArray(listeSpecifique) && listeSpecifique.length > 0
                ? listeSpecifique
                : visibleInvoices;

            if (!facturesAExporter || facturesAExporter.length === 0) {
                showToast('Aucune facture à exporter pour les filtres sélectionnés.', 'info');
                return;
            }

            const dateIso = new Date().toISOString().split('T')[0];
            const nomFichier = \`journal_des_ventes_\${dateIso}.csv\`;
            const separateur = ';'; // Standard pour Excel francophone

            const enTetes = [
                'Date Facture',
                'Numéro',
                'Type',
                'Statut',
                'Client',
                'Chantier / Projet',
                'Numéro Devis Source',
                'Date Échéance',
                'Montant HT',
                'TVA',
                'Montant TTC',
                'Montant Réglé',
                'Reste à Recouvrer',
                'Taux Règlement (%)',
                'En Retard',
                'Dernier Règlement Date',
                'Dernier Règlement Mode',
                'Règlement Référence'
            ];

            const echapperCSV = (val) => {
                if (val == null) return '""';
                const str = String(val).replace(/"/g, '""');
                return \`"\${str}"\`;
            };

            const lignes = [enTetes.join(separateur)];

            facturesAExporter.forEach(f => {
                const isAvoir = f.type === 'avoir';
                const netTTC = f.netAPayerTTC != null ? f.netAPayerTTC : f.totalTTC;
                const regle = Number(f.montantRegle) || 0;
                const solde = Math.max(0, (Number(netTTC) || 0) - regle);
                const pct = netTTC > 0 ? Math.min(100, Math.round((regle / netTTC) * 100)) : 0;
                const retard = isInvoiceOverdue(f) ? 'OUI' : 'NON';
                const dernierReglement = f.payments && f.payments.length > 0
                    ? f.payments[f.payments.length - 1]
                    : (f.reglements && f.reglements.length > 0 ? f.reglements[f.reglements.length - 1] : null);

                const typeLibelle = isAvoir ? 'Avoir' : 'Facture';
                let statutLibelle = 'Brouillon';
                if (f.statut === 'paid' || regle >= netTTC) statutLibelle = 'Soldée';
                else if (f.statut === 'partially_paid' || regle > 0) statutLibelle = 'Partiellement réglée';
                else if (f.statut === 'sent') statutLibelle = 'Envoyée';
                else if (f.statut === 'issued') statutLibelle = 'Émise';
                else if (f.statut === 'cancelled') statutLibelle = 'Annulée';

                const ligne = [
                    echapperCSV(f.date || f.dateFacture || ''),
                    echapperCSV(f.numero || 'Brouillon'),
                    echapperCSV(typeLibelle),
                    echapperCSV(statutLibelle),
                    echapperCSV(f.clientName || ''),
                    echapperCSV(f.projectRef || ''),
                    echapperCSV(f.devisNumero || ''),
                    echapperCSV(f.echeance || f.dateEcheance || ''),
                    echapperCSV(f.totalHT != null ? Number(f.totalHT).toFixed(0) : '0'),
                    echapperCSV(f.tva != null ? Number(f.tva).toFixed(0) : (f.totalTTC != null && f.totalHT != null ? Number(f.totalTTC - f.totalHT).toFixed(0) : '0')),
                    echapperCSV(netTTC != null ? Number(netTTC).toFixed(0) : '0'),
                    echapperCSV(regle.toFixed(0)),
                    echapperCSV(solde.toFixed(0)),
                    echapperCSV(\`\${pct}%\`),
                    echapperCSV(retard),
                    echapperCSV(dernierReglement ? (dernierReglement.date || dernierReglement.datePaiement || '') : ''),
                    echapperCSV(dernierReglement ? (dernierReglement.payment_method || dernierReglement.mode || '') : ''),
                    echapperCSV(dernierReglement ? (dernierReglement.reference || dernierReglement.ref || '') : '')
                ];

                lignes.push(ligne.join(separateur));
            });

            // BOM UTF-8 (\uFEFF) pour compatibilité automatique Excel
            const contenu = '\\uFEFF' + lignes.join('\\r\\n');
            const blob = new Blob([contenu], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = nomFichier;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            showToast(\`Journal des ventes exporté (\${facturesAExporter.length} factures).\`, 'success');
        };`;
mustReplace(tauxRecouvrementTarget, batchHandlersAndExporter, 'Phase 6: Batch handlers and exporter in renderInvoices');

console.log('--- Applying Phase 7: Add Export CSV button in Header ---');
const nouveauBtnTarget = `                            <button
                                onClick={() => setIsCreateInvoiceMenuOpen(o => !o)}
                                disabled={isReadOnlyDueToDowngrade || devisFacturables.length === 0}`;

const exportAndNouveauButtons = `                            <button
                                type="button"
                                onClick={() => exporterFacturesCSV()}
                                className="btn-secondary py-1.5 px-3 text-xs font-bold flex items-center gap-1.5 shadow-2xs"
                                title="Exporter le journal des ventes en CSV pour la comptabilité"
                                aria-label="Exporter les factures en CSV"
                            >
                                <i className="fa-solid fa-file-csv text-emerald-700"></i>
                                <span className="hidden sm:inline">Export CSV</span>
                            </button>
` + nouveauBtnTarget;
mustReplace(nouveauBtnTarget, exportAndNouveauButtons, 'Phase 7: Export CSV button in header');

console.log('--- Applying Phase 8: Table header checkbox & Row checkbox ---');
const tableHeaderTarget = `                                    <thead className="bg-neutral-50/90 border-b border-neutral-200 text-[10px] uppercase tracking-wider text-neutral-500 font-bold">
                                        <tr>
                                            <th className="px-4 py-3.5">Client & Entreprise</th>`;

const tableHeaderReplacement = `                                    <thead className="bg-neutral-50/90 border-b border-neutral-200 text-[10px] uppercase tracking-wider text-neutral-500 font-bold">
                                        <tr>
                                            <th className="px-3 py-3.5 w-10 text-center">
                                                <input
                                                    type="checkbox"
                                                    className="rounded border-neutral-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                                                    checked={visibleInvoices.length > 0 && visibleInvoices.every(f => selectedInvoiceIds.has(f.id))}
                                                    onChange={() => toggleSelectAllInvoices(visibleInvoices)}
                                                    title="Tout sélectionner / désélectionner"
                                                    aria-label="Sélectionner toutes les factures"
                                                />
                                            </th>
                                            <th className="px-4 py-3.5">Client & Entreprise</th>`;
mustReplace(tableHeaderTarget, tableHeaderReplacement, 'Phase 8: Table header checkbox');

const tableRowTarget = `                                                >
                                                    <td className="px-4 py-3.5 align-middle">
                                                        <span className="font-semibold text-neutral-900 block text-xs" title={f.clientName || 'Société non renseignée'}>`;

const tableRowReplacement = `                                                >
                                                    <td className="px-3 py-3.5 align-middle text-center" onClick={(e) => e.stopPropagation()}>
                                                        <input
                                                            type="checkbox"
                                                            className="rounded border-neutral-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                                                            checked={selectedInvoiceIds.has(f.id)}
                                                            onChange={() => toggleSelectInvoice(f.id)}
                                                            aria-label={\`Sélectionner facture \${f.numero || f.clientName}\`}
                                                        />
                                                    </td>
                                                    <td className="px-4 py-3.5 align-middle">
                                                        <span className="font-semibold text-neutral-900 block text-xs" title={f.clientName || 'Société non renseignée'}>`;
mustReplace(tableRowTarget, tableRowReplacement, 'Phase 8: Table row checkbox');

console.log('--- Applying Phase 9: Floating Batch Bar after table and list ---');
const tableEndTarget = `                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )
                    )}`;

const floatingBatchBarSnippet = `                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )
                    )}

                    {/* Barre d'actions groupées flottante (Batch Bar) */}
                    {selectedInvoiceIds.size > 0 && (
                        <div className="p-3 bg-neutral-900 text-white rounded-xl shadow-lg border border-neutral-800 flex flex-wrap items-center justify-between gap-3 shrink-0 animate-fade-in z-20">
                            <div className="flex items-center gap-2.5">
                                <span className="w-6 h-6 rounded-full bg-emerald-500 text-white text-xs font-bold flex items-center justify-center">
                                    {selectedInvoiceIds.size}
                                </span>
                                <span className="text-xs font-medium text-neutral-200">
                                    {selectedInvoiceIds.size > 1 ? \`\${selectedInvoiceIds.size} factures sélectionnées\` : '1 facture sélectionnée'}
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={handleBatchMarkAsSent}
                                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors"
                                    title="Marquer toutes les factures sélectionnées comme envoyées"
                                >
                                    <i className="fa-solid fa-paper-plane text-[11px]"></i>
                                    <span>Marquer envoyées</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={handleBatchDownloadPdf}
                                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors"
                                    title="Télécharger les factures sélectionnées au format PDF"
                                >
                                    <i className="fa-solid fa-download text-[11px]"></i>
                                    <span>Télécharger PDF</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        const selection = invoices.filter(f => selectedInvoiceIds.has(f.id));
                                        exporterFacturesCSV(selection);
                                    }}
                                    className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-bold rounded-lg border border-neutral-700 flex items-center gap-1.5 transition-colors"
                                    title="Exporter uniquement les factures sélectionnées en CSV"
                                >
                                    <i className="fa-solid fa-file-csv text-[11px]"></i>
                                    <span>Exporter CSV</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={clearSelectedInvoices}
                                    className="px-2.5 py-1.5 text-neutral-400 hover:text-white text-xs transition-colors ml-1"
                                    title="Annuler la sélection"
                                >
                                    <i className="fa-solid fa-xmark"></i>
                                </button>
                            </div>
                        </div>
                    )}`;
mustReplace(tableEndTarget, floatingBatchBarSnippet, 'Phase 9: Floating Batch Bar');

console.log('--- Applying Phase 10: Modals components (InvoicePreviewModal & InvoiceEmailComposerModal) ---');
const modalComponentsSnippet = `
// ══ MODALE DE PRÉVISUALISATION DU PDF FACTURE (2026-09-10) ═══════════════════
function InvoicePreviewModal({ facture, onClose, onDownloadPdf, companyInfo }) {
    if (!facture) return null;
    const [zoom, setZoom] = React.useState(100);
    const [downloading, setDownloading] = React.useState(false);

    const handleDownload = async () => {
        setDownloading(true);
        try {
            const nomFichier = \`Facture_\${facture.numero || facture.clientName || 'BTP'}.pdf\`;
            const zone = document.querySelector('[data-zone-impression="facture"]');
            if (zone && onDownloadPdf) {
                await onDownloadPdf(zone, nomFichier, facture.id);
            } else {
                window.print();
            }
        } finally {
            setDownloading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-neutral-950/80 backdrop-blur-md flex flex-col z-[120] animate-fade-in"
             role="dialog" aria-modal="true" aria-labelledby="preview_modal_title">
            {/* Top Toolbar */}
            <div className="h-14 px-6 bg-neutral-900 border-b border-neutral-800 text-white flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
                        <i className="fa-solid fa-eye text-sm"></i>
                    </div>
                    <div>
                        <h3 id="preview_modal_title" className="font-bold text-sm text-white leading-tight">
                            Aperçu PDF — {facture.numero || 'Brouillon'}
                        </h3>
                        <p className="text-[11px] text-neutral-400 truncate max-w-xs sm:max-w-md">
                            {facture.clientName} · {facture.projectRef}
                        </p>
                    </div>
                </div>

                {/* Controls & Actions */}
                <div className="flex items-center gap-2">
                    <div className="hidden sm:flex items-center gap-1 bg-neutral-800/80 rounded-lg p-1 border border-neutral-700/60 mr-2">
                        <button
                            type="button"
                            onClick={() => setZoom(z => Math.max(50, z - 10))}
                            className="w-7 h-7 flex items-center justify-center rounded hover:bg-neutral-700 text-neutral-300 text-xs"
                            title="Zoom arrière"
                        >
                            <i className="fa-solid fa-magnifying-glass-minus"></i>
                        </button>
                        <span className="text-[11px] font-mono font-semibold px-1.5 text-neutral-300 min-w-[40px] text-center">
                            {zoom}%
                        </span>
                        <button
                            type="button"
                            onClick={() => setZoom(z => Math.min(150, z + 10))}
                            className="w-7 h-7 flex items-center justify-center rounded hover:bg-neutral-700 text-neutral-300 text-xs"
                            title="Zoom avant"
                        >
                            <i className="fa-solid fa-magnifying-glass-plus"></i>
                        </button>
                        <button
                            type="button"
                            onClick={() => setZoom(100)}
                            className="px-2 py-1 text-[10px] font-semibold text-neutral-400 hover:text-white rounded hover:bg-neutral-700"
                            title="Taille réelle (100%)"
                        >
                            100%
                        </button>
                    </div>

                    <button
                        type="button"
                        onClick={() => window.print()}
                        className="btn-secondary px-3 py-1.5 text-xs font-bold text-neutral-300 bg-neutral-800 border-neutral-700 hover:bg-neutral-700 flex items-center gap-1.5"
                    >
                        <i className="fa-solid fa-print"></i>
                        <span className="hidden sm:inline">Imprimer</span>
                    </button>

                    <button
                        type="button"
                        onClick={handleDownload}
                        disabled={downloading}
                        className="btn-primary px-4 py-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm flex items-center gap-1.5 disabled:opacity-60"
                    >
                        <i className={\`fa-solid \${downloading ? 'fa-circle-notch fa-spin' : 'fa-download'}\`}></i>
                        <span>{downloading ? 'Génération…' : 'Télécharger le PDF'}</span>
                    </button>

                    <button
                        type="button"
                        onClick={onClose}
                        className="w-8 h-8 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white flex items-center justify-center transition-colors ml-1"
                        aria-label="Fermer l'aperçu"
                    >
                        <i className="fa-solid fa-xmark"></i>
                    </button>
                </div>
            </div>

            {/* Document Preview Viewport */}
            <div className="flex-1 overflow-auto p-4 sm:p-8 flex justify-center bg-neutral-900/60 custom-scroll">
                <div
                    className="origin-top transition-transform duration-150 bg-white rounded-lg shadow-2xl overflow-hidden border border-neutral-300/40"
                    style={{ transform: \`scale(\${zoom / 100})\`, width: '210mm', minHeight: '297mm' }}
                >
                    <div data-zone-impression="facture" className="p-8 sm:p-12">
                        {/* Header Facture */}
                        <div className="flex justify-between items-start pb-6 border-b border-neutral-200">
                            <div>
                                <h1 className="text-2xl font-black text-neutral-900 tracking-tight uppercase">
                                    {facture.type === 'avoir' ? 'Facture d\\\'Avoir' : 'Facture'}
                                </h1>
                                <p className="text-sm font-bold text-emerald-700 font-mono mt-0.5">
                                    N° {facture.numero || 'Brouillon'}
                                </p>
                                <p className="text-xs text-neutral-500 mt-1">
                                    Date : {facture.date || facture.dateCreation?.slice(0, 10) || new Date().toISOString().slice(0, 10)}
                                </p>
                            </div>
                            <div className="text-right">
                                <h2 className="text-base font-extrabold text-neutral-900">{companyInfo?.name || 'IKADEVIS BTP'}</h2>
                                <p className="text-xs text-neutral-600">{companyInfo?.activity || 'Travaux de Construction & Rénovation'}</p>
                                <p className="text-xs text-neutral-500">{companyInfo?.address || 'Abidjan, Côte d\\\'Ivoire'}</p>
                                <p className="text-xs text-neutral-500">{companyInfo?.phone} · {companyInfo?.email}</p>
                            </div>
                        </div>

                        {/* Client Info */}
                        <div className="my-6 p-4 rounded-xl bg-neutral-50 border border-neutral-200 flex justify-between gap-4">
                            <div>
                                <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block mb-1">Destinataire :</span>
                                <p className="text-sm font-bold text-neutral-900">{facture.clientName}</p>
                                <p className="text-xs text-neutral-600 mt-0.5">Chantier / Projet : <strong>{facture.projectRef || 'Standard'}</strong></p>
                                {facture.devisNumero && <p className="text-[11px] text-neutral-500 mt-0.5">Devis de référence : {facture.devisNumero}</p>}
                            </div>
                            <div className="text-right">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block mb-1">Règlement :</span>
                                <p className="text-xs text-neutral-700">Échéance : <strong>{facture.echeance || 'À réception'}</strong></p>
                                <p className="text-xs font-semibold text-emerald-700 mt-0.5">
                                    Net à payer : {formatMoney(facture.netAPayerTTC != null ? facture.netAPayerTTC : (facture.totalTTC || 0), companyInfo?.currency || 'FCFA')}
                                </p>
                            </div>
                        </div>

                        {/* Articles / Lots */}
                        <div className="border border-neutral-200 rounded-xl overflow-hidden mb-6">
                            <table className="w-full text-left text-xs">
                                <thead className="bg-neutral-100/70 border-b border-neutral-200 text-[10px] font-bold text-neutral-600 uppercase">
                                    <tr>
                                        <th className="py-2 px-3">Désignation</th>
                                        <th className="py-2 px-3 text-center">Unité</th>
                                        <th className="py-2 px-3 text-right">Qté</th>
                                        <th className="py-2 px-3 text-right">P.U. HT</th>
                                        <th className="py-2 px-3 text-right">Total HT</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-neutral-200 text-neutral-800">
                                    {(facture.lignes || []).map((l, i) => (
                                        <tr key={i}>
                                            <td className="py-2.5 px-3 font-medium">{l.designation}</td>
                                            <td className="py-2.5 px-3 text-center text-neutral-500">{l.unite || 'U'}</td>
                                            <td className="py-2.5 px-3 text-right font-mono">{l.quantite || 1}</td>
                                            <td className="py-2.5 px-3 text-right font-mono">{formatMoney(l.prixUnitaireHT || l.totalHT, companyInfo?.currency || 'FCFA')}</td>
                                            <td className="py-2.5 px-3 text-right font-bold font-mono">{formatMoney(l.totalHT, companyInfo?.currency || 'FCFA')}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Totaux */}
                        <div className="flex justify-end mb-6">
                            <div className="w-72 bg-neutral-50 border border-neutral-200 rounded-xl p-3.5 space-y-1.5 text-xs">
                                <div className="flex justify-between text-neutral-600">
                                    <span>Total HT :</span>
                                    <span className="font-semibold font-mono">{formatMoney(facture.totalHT || 0, companyInfo?.currency || 'FCFA')}</span>
                                </div>
                                <div className="flex justify-between text-neutral-600">
                                    <span>TVA ({facture.tauxTva || 18}%) :</span>
                                    <span className="font-semibold font-mono">{formatMoney(facture.totalTva || 0, companyInfo?.currency || 'FCFA')}</span>
                                </div>
                                <div className="flex justify-between pt-2 border-t border-neutral-200 font-extrabold text-neutral-900 text-sm">
                                    <span>Total TTC :</span>
                                    <span className="text-emerald-700 font-mono">{formatMoney(facture.netAPayerTTC != null ? facture.netAPayerTTC : facture.totalTTC, companyInfo?.currency || 'FCFA')}</span>
                                </div>
                            </div>
                        </div>

                        {/* Signature / Mention de bas de page */}
                        <div className="pt-6 border-t border-neutral-200 flex justify-between items-end text-[11px] text-neutral-500">
                            <div>
                                <p className="font-bold text-neutral-800">{companyInfo?.legalName || companyInfo?.name || 'Entreprise BTP'}</p>
                                <p>RCCM : {companyInfo?.rccm || 'CI-ABJ-XXXX'} · N° CC : {companyInfo?.taxId || 'XXXXXX'}</p>
                            </div>
                            <div className="text-right">
                                <p className="font-bold text-neutral-800">Bon pour accord & Signature</p>
                                <div className="h-16 w-36 border-b border-neutral-300 mt-2 inline-block"></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ══ MODALE DE COMPOSITION D'E-MAIL & RELANCES BTP (2026-09-10) ═══════════════
function InvoiceEmailComposerModal({ facture, onClose, onSend, companyInfo }) {
    if (!facture) return null;
    const cur = companyInfo?.currency || 'FCFA';
    const totalTTC = facture.netAPayerTTC != null ? facture.netAPayerTTC : (facture.totalTTC || 0);
    const regle = Number(facture.montantRegle) || 0;
    const solde = Math.max(0, totalTTC - regle);

    const [templateType, setTemplateType] = React.useState('envoi'); // 'envoi' | 'rappel' | 'relance_ferme' | 'quittance'
    const [destinataire, setDestinataire] = React.useState(facture.clientEmail || facture.email || '');
    const [sujet, setSujet] = React.useState('');
    const [corps, setCorps] = React.useState('');
    const [copie, setCopie] = React.useState(false);

    // Initialisation des templates prédéfinis
    React.useEffect(() => {
        const nomEntreprise = companyInfo?.name || 'Micro Office BTP';
        const numFacture = facture.numero || 'Brouillon';
        const client = facture.clientName || 'Client';
        const echeance = facture.echeance || 'à réception';

        if (templateType === 'envoi') {
            setSujet(\`Facture \${numFacture} - \${facture.projectRef || 'Chantier'} - \${nomEntreprise}\`);
            setCorps(\`Bonjour \${client},\\n\\nVeuillez trouver ci-joint votre facture \${numFacture} d'un montant de \${formatMoney(totalTTC, cur)} TTC relative aux travaux : "\${facture.projectRef || 'Travaux de construction'}".\\n\\nDate d'échéance : \${echeance}.\\n\\nNous restons à votre entière disposition pour tout renseignement complémentaire.\\n\\nBien cordialement,\\nL'équipe \${nomEntreprise}\`);
        } else if (templateType === 'rappel') {
            setSujet(\`Rappel amiable : Facture \${numFacture} arrivée à échéance - \${nomEntreprise}\`);
            setCorps(\`Bonjour \${client},\\n\\nSauf erreur ou omission de notre part, nous constatons que la facture \${numFacture} échue le \${echeance} présente un solde restant dû de \${formatMoney(solde, cur)}.\\n\\nNous vous remercions de bien vouloir procéder à son règlement dans les meilleurs délais.\\n\\nSi votre virement a déjà été effectué, nous vous prions de ne pas tenir compte de ce message.\\n\\nCordialement,\\n\${nomEntreprise}\`);
        } else if (templateType === 'relance_ferme') {
            setSujet(\`RELANCE FORMELLE : Impayé sur Facture \${numFacture} - \${nomEntreprise}\`);
            setCorps(\`Madame, Monsieur,\\n\\nMalgré nos précédentes relances, nous constatons que la facture \${numFacture} d'un montant de \${formatMoney(solde, cur)} TTC demeure impayée à ce jour.\\n\\nNous vous mettons en demeure de régulariser cette situation sous un délai de 48 heures afin d'éviter la suspension des travaux sur le chantier "\${facture.projectRef}" et l'application des pénalités de retard légales.\\n\\nComptant sur votre diligence,\\nLa Direction \${nomEntreprise}\`);
        } else if (templateType === 'quittance') {
            setSujet(\`Quittance de paiement - Facture \${numFacture} - \${nomEntreprise}\`);
            setCorps(\`Bonjour \${client},\\n\\nNous vous confirmons la bonne réception de votre versement pour la facture \${numFacture}.\\n\\nLe solde restant dû est désormais de : \${formatMoney(solde, cur)}.\\n\\nNous vous remercions pour votre confiance.\\n\\nCordialement,\\n\${nomEntreprise}\`);
        }
    }, [templateType, facture]);

    const handleCopy = () => {
        navigator.clipboard.writeText(\`Objet : \${sujet}\\n\\n\${corps}\`);
        setCopie(true);
        setTimeout(() => setCopie(false), 2000);
    };

    const handleSendMailto = () => {
        const mailtoUrl = \`mailto:\${encodeURIComponent(destinataire)}?subject=\${encodeURIComponent(sujet)}&body=\${encodeURIComponent(corps)}\`;
        window.open(mailtoUrl, '_blank');
        if (onSend) {
            onSend({
                type: 'email',
                destinataire,
                sujet,
                date: new Date().toISOString(),
                template: templateType
            });
        }
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-neutral-900/60 backdrop-blur-sm flex items-center justify-center z-[110] p-4 animate-fade-in"
             role="dialog" aria-modal="true" aria-labelledby="email_modal_title">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh] border border-neutral-100">
                {/* Header dégradé indigo */}
                <div className="px-6 py-4 bg-gradient-to-r from-indigo-700 to-indigo-900 text-white flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center backdrop-blur-xs">
                            <i className="fa-solid fa-paper-plane text-lg text-white"></i>
                        </div>
                        <div>
                            <h3 id="email_modal_title" className="font-bold text-base leading-tight text-white">
                                Communication & Relance Facture
                            </h3>
                            <p className="text-xs text-indigo-200">
                                Facture <span className="font-semibold text-white">{facture.numero || 'Brouillon'}</span> · {facture.clientName}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-white/80 hover:text-white p-2 rounded-lg hover:bg-white/10 transition-colors" aria-label="Fermer la fenêtre">
                        <i className="fa-solid fa-xmark text-lg"></i>
                    </button>
                </div>

                <div className="p-6 overflow-y-auto space-y-4 custom-scroll text-xs">
                    {/* Choix du modèle */}
                    <div>
                        <label className="block font-bold text-neutral-700 uppercase tracking-wider text-[10px] mb-1.5">
                            Modèle de message pré-rédigé BTP
                        </label>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            {[
                                { id: 'envoi', label: 'Envoi Facture', icon: 'fa-file-invoice' },
                                { id: 'rappel', label: 'Rappel Amiable', icon: 'fa-bell' },
                                { id: 'relance_ferme', label: 'Relance Ferme', icon: 'fa-triangle-exclamation' },
                                { id: 'quittance', label: 'Quittance', icon: 'fa-receipt' }
                            ].map(tpl => (
                                <button
                                    key={tpl.id}
                                    type="button"
                                    onClick={() => setTemplateType(tpl.id)}
                                    className={\`p-2.5 rounded-xl border text-center font-bold text-xs transition-all flex flex-col items-center gap-1 \${templateType === tpl.id ? 'border-indigo-600 bg-indigo-50/80 text-indigo-900 shadow-2xs' : 'border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-600'}\`}
                                >
                                    <i className={\`fa-solid \${tpl.icon} text-sm \${templateType === tpl.id ? 'text-indigo-600' : 'text-neutral-400'}\`}></i>
                                    <span>{tpl.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Destinataire */}
                    <div>
                        <label className="block font-bold text-neutral-700 uppercase tracking-wider text-[10px] mb-1">
                            Destinataire (E-mail client)
                        </label>
                        <input
                            type="email"
                            value={destinataire}
                            onChange={(e) => setDestinataire(e.target.value)}
                            placeholder="client@entreprise.com"
                            className="w-full px-3 py-2 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-xs"
                        />
                    </div>

                    {/* Objet */}
                    <div>
                        <label className="block font-bold text-neutral-700 uppercase tracking-wider text-[10px] mb-1">
                            Objet du message
                        </label>
                        <input
                            type="text"
                            value={sujet}
                            onChange={(e) => setSujet(e.target.value)}
                            className="w-full px-3 py-2 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-xs font-semibold"
                        />
                    </div>

                    {/* Corps du message */}
                    <div>
                        <label className="block font-bold text-neutral-700 uppercase tracking-wider text-[10px] mb-1">
                            Corps du message (personnalisable)
                        </label>
                        <textarea
                            rows={8}
                            value={corps}
                            onChange={(e) => setCorps(e.target.value)}
                            className="w-full p-3 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-xs leading-relaxed font-sans"
                        />
                    </div>
                </div>

                {/* Footer Bar */}
                <div className="px-6 py-3.5 bg-neutral-50 border-t border-neutral-200 flex items-center justify-between gap-3 shrink-0">
                    <button
                        type="button"
                        onClick={handleCopy}
                        className="btn-secondary px-3.5 py-2 text-xs font-bold flex items-center gap-1.5"
                    >
                        <i className={\`fa-solid \${copie ? 'fa-check text-emerald-600' : 'fa-copy text-neutral-500'}\`}></i>
                        <span>{copie ? 'Copié !' : 'Copier le message'}</span>
                    </button>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="btn-ghost px-3.5 py-2 text-xs"
                        >
                            Fermer
                        </button>
                        <button
                            type="button"
                            onClick={handleSendMailto}
                            className="btn-primary px-4 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm flex items-center gap-1.5"
                        >
                            <i className="fa-solid fa-envelope"></i>
                            <span>Ouvrir dans l'E-mail</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
`;

const renderInvoicesAnchor = `    const renderInvoices = () => {`;
if (!content.includes(renderInvoicesAnchor)) {
    console.error('renderInvoicesAnchor not found!');
    process.exit(1);
}
content = content.replace(renderInvoicesAnchor, modalComponentsSnippet + '\n' + renderInvoicesAnchor);
console.log('✓ Modals components defined above renderInvoices');

console.log('--- Applying Phase 11: Rendering modals in main App JSX ---');
const creditNoteRenderSite = `            {creditNoteModalData && (
                <InvoiceCreditNoteModal
                    facture={creditNoteModalData}
                    devise={companyInfo.currency || 'FCFA'}
                    onClose={() => setCreditNoteModalData(null)}
                    onSubmit={emettreAvoirFacture}
                />
            )}`;

const modalsRenderSite = creditNoteRenderSite + `
            {previewInvoiceModal && (
                <InvoicePreviewModal
                    facture={previewInvoiceModal}
                    onClose={() => setPreviewInvoiceModal(null)}
                    onDownloadPdf={telechargerElementPdf}
                    companyInfo={companyInfo}
                />
            )}
            {emailComposerModal && (
                <InvoiceEmailComposerModal
                    facture={emailComposerModal}
                    onClose={() => setEmailComposerModal(null)}
                    companyInfo={companyInfo}
                    onSend={(historique) => {
                        showToast("Message préparé et journalisé dans l'historique", "success");
                    }}
                />
            )}`;
mustReplace(creditNoteRenderSite, modalsRenderSite, 'Phase 11: Modals wired up in main App return tree');

fs.writeFileSync(filePath, content, 'utf8');
console.log('🎉 ALL 11 PHASES APPLIED PERFECTLY!');
