import fs from 'fs';

const filePath = '/Users/mahamanehaidara/Documents/ANTY GRAVITY APSS/Micro office ERP CALCUL/index_jsx.js';
let content = fs.readFileSync(filePath, 'utf8');

// 1. In DocumentFacture (around line 11391), add Échéancier de règlement printable section
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

if (!content.includes(targetDocFacture)) {
    console.error('Target for DocumentFacture not found!');
    process.exit(1);
}

content = content.replace(targetDocFacture, echeancierDocFactureSnippet);
console.log('✓ DocumentFacture updated with printable Échéancier section');

fs.writeFileSync(filePath, content, 'utf8');
console.log('Done!');
