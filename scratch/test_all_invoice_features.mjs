import { launchApp, enterGuestMode } from './lib/harness.mjs';
import path from 'path';

const ARTIFACT_DIR = '/Users/mahamanehaidara/.gemini/antigravity-ide/brain/c2b0be91-19f8-47a6-9316-05aa6e9fa053';

async function run() {
    console.log('🚀 Starting Invoice Features End-to-End Test Suite...');
    const { page, browser, close } = await launchApp();
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

    try {
        // 1. Seed quotes and multiple invoices with paymentSchedule into localStorage
        await page.evaluate(() => {
            const guestQuotes = [
                {
                    id: 'quote-btp-1',
                    number: 'DEV-2026-001',
                    clientName: 'BTP Prestige SARL',
                    projectRef: 'Construction Villa Duplex Cocody',
                    statut: 'accepted',
                    paymentSchedule: [
                        { label: 'Acompte au démarrage', pct: 40 },
                        { label: 'Situation Gros Œuvre', pct: 30 },
                        { label: 'Second Œuvre & Finitions', pct: 20 },
                        { label: 'Solde à la Réception', pct: 10 }
                    ],
                    quoteData: {
                        totalTTCConsomme: 5000000,
                        lots: [
                            { id: 'lot1', name: 'Gros Œuvre & Fondations', totalHT: 3000000 },
                            { id: 'lot2', name: 'Second Œuvre & Finitions', totalHT: 2000000 }
                        ]
                    }
                }
            ];

            const guestInvoices = [
                {
                    id: 'inv-btp-1',
                    numero: 'FAC-2026-0001',
                    devisId: 'quote-btp-1',
                    devisNumero: 'DEV-2026-001',
                    clientName: 'BTP Prestige SARL',
                    projectRef: 'Construction Villa Duplex Cocody',
                    totalHT: 4237288,
                    totalTTC: 5000000,
                    netAPayerTTC: 5000000,
                    montantRegle: 2500000, // 50% paid: covers tranche 1 (40%) and half of tranche 2 (30%)
                    statut: 'partially_paid',
                    payments: [
                        { id: 'p1', montant: 2000000, date: '2026-09-01', mode: 'virement', reference: 'VIR-9021', note: 'Acompte de démarrage' },
                        { id: 'p2', montant: 500000, date: '2026-09-05', mode: 'wave', reference: 'WAVE-4431', note: 'Avancement gros œuvre' }
                    ],
                    paymentSchedule: [
                        { label: 'Acompte au démarrage', pct: 40 },
                        { label: 'Situation Gros Œuvre', pct: 30 },
                        { label: 'Second Œuvre & Finitions', pct: 20 },
                        { label: 'Solde à la Réception', pct: 10 }
                    ],
                    type: 'standard',
                    date: '2026-09-01',
                    echeance: '2026-09-30',
                    tvaTaux: 18,
                    lignes: [
                        { designation: 'Gros Œuvre & Fondations', unite: 'lot', quantite: 1, totalHT: 2500000 },
                        { designation: 'Second Œuvre & Électricité', unite: 'lot', quantite: 1, totalHT: 1737288 }
                    ]
                },
                {
                    id: 'inv-btp-2',
                    numero: 'FAC-2026-0002',
                    devisId: 'quote-btp-1',
                    devisNumero: 'DEV-2026-001',
                    clientName: 'Société Ivoirienne de Promotion',
                    projectRef: 'Résidence Les Palmiers Plateau',
                    totalHT: 1694915,
                    totalTTC: 2000000,
                    netAPayerTTC: 2000000,
                    montantRegle: 0,
                    statut: 'issued', // Émise, non encore envoyée
                    payments: [],
                    type: 'standard',
                    date: '2026-09-08',
                    echeance: '2026-09-10', // En retard
                    tvaTaux: 18,
                    lignes: [
                        { designation: 'Menuiserie Alu & Vitrerie', unite: 'ens', quantite: 1, totalHT: 1694915 }
                    ]
                }
            ];

            localStorage.setItem('costcalc:org_default:savedQuotes', JSON.stringify(guestQuotes));
            localStorage.setItem('costcalc:org_default:invoices', JSON.stringify(guestInvoices));
            localStorage.setItem('costcalc:guest:savedQuotes', JSON.stringify(guestQuotes));
            localStorage.setItem('costcalc:guest:invoices', JSON.stringify(guestInvoices));
        });

        await enterGuestMode(page);
        console.log('✓ Guest mode entered with seeded invoices');

        // 2. Navigate to Factures page
        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const invoiceBtn = btns.find(b => b.className.includes('sidebar-item') && b.textContent.includes('Factures'));
            if (invoiceBtn) invoiceBtn.click();
        });
        await new Promise(r => setTimeout(r, 800));

        // 3. Verify the Export CSV button is in the header
        const hasExportBtn = await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            return !!btns.find(b => b.textContent.includes('Export CSV'));
        });
        console.log('✓ "Export CSV" button visible in header:', hasExportBtn);
        if (!hasExportBtn) throw new Error('"Export CSV" button not found');

        // 4. Test Batch Selection (Checkboxes & Floating Bar)
        const batchCheckResult = await page.evaluate(() => {
            const checkboxes = Array.from(document.querySelectorAll('input[type="checkbox"]'));
            if (checkboxes.length < 2) return { success: false, reason: 'Checkboxes not found' };
            // Click header checkbox or first row checkbox
            checkboxes[1].click(); // click first invoice row checkbox
            checkboxes[2].click(); // click second invoice row checkbox
            return { success: true, count: checkboxes.length };
        });
        await new Promise(r => setTimeout(r, 500));

        // Check if floating batch bar appeared
        const batchBarInfo = await page.evaluate(() => {
            const bar = document.querySelector('.bg-neutral-900.text-white.rounded-xl');
            if (!bar) return null;
            return {
                text: bar.innerText,
                hasMarkSent: bar.innerText.includes('Marquer envoyées'),
                hasDownloadPdf: bar.innerText.includes('Télécharger PDF'),
                hasExportCsv: bar.innerText.includes('Exporter CSV')
            };
        });
        console.log('✓ Floating Batch Bar visible:', batchBarInfo);
        if (!batchBarInfo || !batchBarInfo.hasMarkSent) {
            throw new Error('Floating Batch Bar did not appear on row selection');
        }

        await page.screenshot({ path: path.join(ARTIFACT_DIR, 'audit_invoices_batch_actions.png') });

        // Click "Marquer envoyées" on batch bar
        await page.evaluate(() => {
            const bar = document.querySelector('.bg-neutral-900.text-white.rounded-xl');
            const btn = Array.from(bar.querySelectorAll('button')).find(b => b.textContent.includes('Marquer envoyées'));
            if (btn) btn.click();
        });
        await new Promise(r => setTimeout(r, 800));

        // 5. Open First Invoice Detail (inspecting Échéancier)
        await page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll('tr[role="button"], div[role="button"]'));
            const targetRow = rows.find(r => r.innerText.includes('FAC-2026-0001')) || rows[0];
            if (targetRow) targetRow.click();
        });
        await new Promise(r => setTimeout(r, 800));

        // Verify Échéancier Section in Inspector
        const echeancierCheck = await page.evaluate(() => {
            const text = document.body.innerText;
            return {
                hasEcheancierTitle: text.includes('Échéancier contractuel & Jalons BTP'),
                hasTranche1: text.includes('Acompte au démarrage'),
                hasTranche2: text.includes('Situation Gros Œuvre'),
                hasCouvertureRegle: text.includes('Réglé')
            };
        });
        console.log('✓ Échéancier BTP Check:', echeancierCheck);
        if (!echeancierCheck.hasEcheancierTitle || !echeancierCheck.hasTranche1) {
            throw new Error('Échéancier section missing from invoice inspector');
        }

        await page.screenshot({ path: path.join(ARTIFACT_DIR, 'audit_invoice_echeancier_inspector.png') });

        // 6. Test "Aperçu" (PDF Preview Modal)
        const apercuBtnFound = await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const btn = btns.find(b => b.textContent.includes('Aperçu'));
            if (btn) {
                btn.click();
                return true;
            }
            return false;
        });
        console.log('✓ Clicked "Aperçu" button:', apercuBtnFound);
        if (!apercuBtnFound) throw new Error('"Aperçu" button not found');
        await new Promise(r => setTimeout(r, 800));

        const previewModalInfo = await page.evaluate(() => {
            const modal = document.querySelector('[role="dialog"][aria-labelledby="preview_modal_title"]');
            if (!modal) return null;
            return {
                title: modal.querySelector('h3')?.innerText,
                hasPrint: !!Array.from(modal.querySelectorAll('button')).find(b => b.textContent.includes('Imprimer')),
                hasDownload: !!Array.from(modal.querySelectorAll('button')).find(b => b.textContent.includes('Télécharger le PDF')),
                hasZoom: modal.innerText.includes('100%')
            };
        });
        console.log('✓ Preview Modal Check:', previewModalInfo);
        if (!previewModalInfo || !previewModalInfo.hasDownload) {
            throw new Error('Preview Modal did not open or missing download button');
        }

        await page.screenshot({ path: path.join(ARTIFACT_DIR, 'audit_invoice_preview_modal.png') });

        // Close preview modal
        await page.evaluate(() => {
            const closeBtn = document.querySelector('[aria-label="Fermer l\'aperçu"]');
            if (closeBtn) closeBtn.click();
        });
        await new Promise(r => setTimeout(r, 600));

        // 7. Test "Relancer / E-mail" (Email Composer Modal)
        const emailBtnFound = await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const btn = btns.find(b => b.textContent.includes('Relancer') || b.textContent.includes('E-mail'));
            if (btn) {
                btn.click();
                return true;
            }
            return false;
        });
        console.log('✓ Clicked "Relancer / E-mail" button:', emailBtnFound);
        if (!emailBtnFound) throw new Error('"Relancer / E-mail" button not found');
        await new Promise(r => setTimeout(r, 800));

        const emailModalInfo = await page.evaluate(() => {
            const modal = document.querySelector('[role="dialog"][aria-labelledby="email_modal_title"]');
            if (!modal) return null;
            return {
                title: modal.querySelector('h3')?.innerText,
                hasEnvoi: modal.innerText.includes('Envoi Facture'),
                hasRappel: modal.innerText.includes('Rappel Amiable'),
                hasRelance: modal.innerText.includes('Relance Ferme'),
                hasQuittance: modal.innerText.includes('Quittance')
            };
        });
        console.log('✓ Email Composer Modal Check:', emailModalInfo);
        if (!emailModalInfo || !emailModalInfo.hasRelance) {
            throw new Error('Email Composer Modal did not open or missing templates');
        }

        // Switch to "Relance Ferme" template
        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const relanceBtn = btns.find(b => b.textContent.includes('Relance Ferme'));
            if (relanceBtn) relanceBtn.click();
        });
        await new Promise(r => setTimeout(r, 500));

        await page.screenshot({ path: path.join(ARTIFACT_DIR, 'audit_invoice_email_relance_modal.png') });

        // Close email modal
        await page.evaluate(() => {
            const closeBtn = document.querySelector('[aria-label="Fermer la fenêtre"]');
            if (closeBtn) closeBtn.click();
        });
        await new Promise(r => setTimeout(r, 500));

        console.log('🎉 ALL 4 FEATURES TESTED & VALIDATED SUCCESSFULLY!');

    } finally {
        await close();
    }
}

run().catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
});
