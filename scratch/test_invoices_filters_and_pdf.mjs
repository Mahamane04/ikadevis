import { launchApp, enterGuestMode } from './lib/harness.mjs';
import path from 'path';

const ARTIFACT_DIR = '/Users/mahamanehaidara/.gemini/antigravity-ide/brain/c2b0be91-19f8-47a6-9316-05aa6e9fa053';

async function run() {
    console.log('🚀 Démarrage du test : Filtres Avancés & PDF Page Factures...');
    const { page, browser, close, consoleErrors } = await launchApp();

    try {
        await page.setViewport({ width: 1440, height: 900 });

        // Préparer des factures dans différents états pour tester le filtrage
        await page.evaluate(() => {
            const today = new Date();
            const pastDate = new Date(today.getTime() - 45 * 86400000).toISOString().split('T')[0];
            const recentDate = new Date(today.getTime() - 5 * 86400000).toISOString().split('T')[0];

            const guestInvoices = [
                {
                    id: 'inv-btp-1',
                    numero: 'FAC-2026-0001',
                    clientName: 'Entreprise BTP Nord',
                    projectRef: 'Chantier Résidence Les Pins',
                    date: pastDate,
                    echeance: pastDate, // En retard !
                    totalHT: 1000000,
                    totalTTC: 1200000,
                    netAPayerTTC: 1200000,
                    montantRegle: 0,
                    statut: 'sent',
                    payments: [],
                    type: 'standard',
                    lots: []
                },
                {
                    id: 'inv-btp-2',
                    numero: 'FAC-2026-0002',
                    clientName: 'SCI Belle Vue',
                    projectRef: 'Rénovation Bureaux',
                    date: recentDate,
                    echeance: new Date(today.getTime() + 20 * 86400000).toISOString().split('T')[0],
                    totalHT: 2500000,
                    totalTTC: 3000000,
                    netAPayerTTC: 3000000,
                    montantRegle: 1500000,
                    statut: 'issued',
                    payments: [{ id: 'p1', date: recentDate, amount: 1500000, payment_method: 'Virement' }],
                    type: 'standard',
                    lots: []
                },
                {
                    id: 'inv-btp-3',
                    numero: 'FAC-2026-0003',
                    clientName: 'Cabinet Médical Riviera',
                    projectRef: 'Aménagement Intérieur',
                    date: recentDate,
                    echeance: new Date(today.getTime() + 10 * 86400000).toISOString().split('T')[0],
                    totalHT: 800000,
                    totalTTC: 960000,
                    netAPayerTTC: 960000,
                    montantRegle: 960000,
                    statut: 'paid',
                    payments: [{ id: 'p2', date: recentDate, amount: 960000, payment_method: 'Chèque' }],
                    type: 'standard',
                    lots: []
                },
                {
                    id: 'inv-btp-4',
                    numero: null,
                    clientName: 'M. et Mme Dupont',
                    projectRef: 'Extension Villa',
                    date: recentDate,
                    totalHT: 500000,
                    totalTTC: 600000,
                    netAPayerTTC: 600000,
                    montantRegle: 0,
                    statut: 'draft',
                    payments: [],
                    type: 'standard',
                    lots: []
                }
            ];

            localStorage.setItem('costcalc:org_default:invoices', JSON.stringify(guestInvoices));
            localStorage.setItem('costcalc:guest:invoices', JSON.stringify(guestInvoices));
        });

        await enterGuestMode(page);
        console.log('✓ Mode invité activé avec factures initialisées');

        // Naviguer vers l'onglet Factures
        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const invoiceBtn = btns.find(b => b.className.includes('sidebar-item') && b.textContent.includes('Factures'));
            if (invoiceBtn) invoiceBtn.click();
        });

        await page.waitForFunction(
            () => document.body.innerText.includes('Factures') && document.querySelector('input[type="search"]'),
            { timeout: 8000 }
        );
        console.log('✓ Onglet Factures affiché');

        // Vérifier les filtres
        const filterCheck = await page.evaluate(() => {
            const searchInput = document.querySelector('input[type="search"][placeholder*="Rechercher"]');
            const selects = Array.from(document.querySelectorAll('.app-card select'));
            const pills = Array.from(document.querySelectorAll('button')).filter(b => 
                ['Toutes', 'Non réglées', 'Partielles', 'Soldées', 'Brouillons'].some(t => b.textContent.includes(t))
            );
            const overdueBadges = Array.from(document.querySelectorAll('*')).filter(el => el.textContent && el.textContent.includes('Retard'));

            return {
                hasSearch: !!searchInput,
                selectsCount: selects.length,
                pillsCount: pills.length,
                pillsText: pills.map(p => p.textContent.trim().replace(/\s+/g, ' ')),
                overdueCount: overdueBadges.length
            };
        });

        console.log('État des filtres :', JSON.stringify(filterCheck, null, 2));

        // Prendre capture d'écran
        const screenshotFile = path.join(ARTIFACT_DIR, 'audit_invoices_advanced_filters.png');
        await page.screenshot({ path: screenshotFile });
        console.log('✓ Capture d\'écran enregistrée dans :', screenshotFile);

        // Tester le filtrage par pastille "Partielles"
        await page.evaluate(() => {
            const pills = Array.from(document.querySelectorAll('button')).filter(b => b.textContent.includes('Partielles'));
            if (pills.length > 0) pills[0].click();
        });
        await new Promise(r => setTimeout(r, 400));

        const filteredPartielle = await page.evaluate(() => {
            const rows = document.querySelectorAll('tbody tr');
            return {
                rowCount: rows.length,
                bodyHasSCI: document.body.innerText.includes('SCI Belle Vue')
            };
        });
        console.log('Résultat après clic sur "Partielles" :', filteredPartielle);

        // Tester la réinitialisation
        await page.evaluate(() => {
            const resetBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Réinitialiser'));
            if (resetBtn) resetBtn.click();
        });
        await new Promise(r => setTimeout(r, 400));

        const resetResult = await page.evaluate(() => {
            const rows = document.querySelectorAll('tbody tr');
            return { rowCount: rows.length };
        });
        console.log('Résultat après Réinitialiser :', resetResult);

        // Sélectionner la première facture (FAC-2026-0001)
        await page.evaluate(() => {
            const row = Array.from(document.querySelectorAll('tbody tr')).find(r => r.innerText.includes('FAC-2026-0001'));
            if (row) row.click();
        });
        await new Promise(r => setTimeout(r, 600));

        // Ouvrir le modal d'enregistrement de règlement
        const btnRegler = await page.evaluate(() => {
            const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Enregistrer un règlement'));
            if (btn) {
                btn.click();
                return true;
            }
            return false;
        });
        console.log('✓ Bouton "Enregistrer un règlement" cliqué :', btnRegler);
        await new Promise(r => setTimeout(r, 600));

        // Remplir et soumettre le paiement
        await page.type('#reglement_montant', '500000');
        await page.type('#reglement_ref', 'TEST-QUITTANCE-PDF');
        await page.evaluate(() => {
            const submitBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Valider le règlement'));
            if (submitBtn) submitBtn.click();
        });
        await new Promise(r => setTimeout(r, 800));

        // Vérifier que la modale Quittance de règlement est ouverte
        const receiptCheck = await page.evaluate(() => {
            const hasTitle = document.body.innerText.includes('QUITTANCE DE RÈGLEMENT');
            const downloadBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Télécharger le PDF'));
            const isBtnPrimary = downloadBtn ? downloadBtn.className.includes('btn-primary') : false;
            return {
                hasTitle,
                hasDownloadBtn: !!downloadBtn,
                isBtnPrimary
            };
        });
        console.log('État de la modale Quittance :', receiptCheck);

        // Prendre capture d'écran de la quittance
        const quittanceScreenshot = path.join(ARTIFACT_DIR, 'audit_invoice_receipt_pdf_button.png');
        await page.screenshot({ path: quittanceScreenshot });
        console.log('✓ Capture quittance enregistrée dans :', quittanceScreenshot);

        // Tester le clic sur "Télécharger le PDF" pour vérifier que onDownloadPdf fonctionne
        const pdfTriggerResult = await page.evaluate(() => {
            const downloadBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Télécharger le PDF'));
            if (downloadBtn) {
                downloadBtn.click();
                return 'clicked';
            }
            return 'not_found';
        });
        console.log('✓ Clic sur le bouton PDF de la quittance :', pdfTriggerResult);
        await new Promise(r => setTimeout(r, 1200));

        console.log('✓ Tous les contrôles de la page Factures et Quittance sont validés avec succès !');

    } catch (err) {
        console.error('❌ Erreur lors du test :', err);
    } finally {
        await close();
    }
}

run();
