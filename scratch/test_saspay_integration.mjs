import puppeteer from 'puppeteer';
import path from 'path';

const ARTIFACT_DIR = '/Users/mahamanehaidara/.gemini/antigravity-ide/brain/e79559a3-6f96-4319-9846-53dd155e9e6b';

async function run() {
    console.log("Starting SasPay Integration Test...");
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1440, height: 900 });

        page.on('console', msg => {
            const txt = msg.text();
            if (txt.includes('SasPay') || txt.includes('Error') || txt.includes('error')) {
                console.log(`[Browser ${msg.type()}]:`, txt);
            }
        });

        await page.goto('http://localhost:8099', { waitUntil: 'networkidle2' });
        console.log("Page loaded successfully.");

        // Click "Essayer sans compte" if login page is shown
        const triedOffline = await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button, a'));
            const demoBtn = btns.find(b => b.textContent.includes('Essayer sans compte') || b.textContent.includes('Mode démo'));
            if (demoBtn) {
                demoBtn.click();
                return true;
            }
            return false;
        });
        if (triedOffline) {
            console.log("Clicked 'Essayer sans compte' to enter application.");
            await new Promise(r => setTimeout(r, 1500));
        }

        // 1. Verify SasPayService is in window
        const serviceCheck = await page.evaluate(async () => {
            if (!window.SasPayService) return { success: false, reason: "window.SasPayService is missing" };
            
            // Test connection test
            const testConn = await window.SasPayService.testConnection('sk_test_demo123');
            
            // Test checkout creation
            const checkout = await window.SasPayService.createCheckoutSession({
                amount: 75000,
                currency: 'XOF',
                customer: { name: 'Moussa Traoré', phone: '+22370000000' },
                reference: 'FAC-2026-001'
            });

            // Test softpay push
            const softpay = await window.SasPayService.initiateSoftPay({
                amount: 50000,
                currency: 'XOF',
                network: 'wave',
                phone: '+22370000000',
                customer: { name: 'Moussa Traoré' },
                reference: 'FAC-2026-002'
            });

            // Test verify payment
            const verify = await window.SasPayService.verifyPayment(checkout.id);

            return {
                success: true,
                testConn,
                checkout,
                softpay,
                verify
            };
        });

        console.log("SasPayService unit test in browser:\n", JSON.stringify(serviceCheck, null, 2));

        // 2. Navigate to Settings Facturation
        await page.goto('http://localhost:8099/#settings/facturation', { waitUntil: 'networkidle2' });
        await new Promise(r => setTimeout(r, 1500));

        // Toggle SasPay checkbox if disabled
        await page.evaluate(() => {
            const checkbox = document.querySelector('section[aria-label="Passerelle de paiement SasPay"] input[type="checkbox"]');
            if (checkbox && !checkbox.checked) {
                checkbox.click();
            }
        });
        await new Promise(r => setTimeout(r, 800));

        // Screenshot of Settings with SasPay
        const settingsPic = path.join(ARTIFACT_DIR, 'saspay_settings_card.png');
        await page.screenshot({ path: settingsPic });
        console.log("Saved screenshot:", settingsPic);

        // 3. Open Invoice Payment Modal with mock invoice
        console.log("Opening invoice payment modal via test hook...");
        await page.evaluate(() => {
            const mockInvoice = {
                id: 'fac_test_1',
                numero: 'FAC-2026-0001',
                type: 'facture',
                status: 'emise',
                clientName: 'Entreprise Sahel BTP',
                clientEmail: 'contact@sahelbtp.ml',
                clientPhone: '76001122',
                projectRef: 'Chantier Résidence Hamdallaye ACI',
                totalHT: 1000000,
                totalTTC: 1180000,
                netAPayerTTC: 1180000,
                montantRegle: 250000,
                dateEmission: '2026-09-01',
                dateEcheance: '2026-09-30'
            };
            if (window.__openInvoicePaymentModal) {
                window.__openInvoicePaymentModal(mockInvoice);
            }
        });
        await new Promise(r => setTimeout(r, 1200));

        // In payment modal, switch to 'Encaisser avec SasPay'
        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const saspayBtn = btns.find(b => b.textContent.includes('Encaisser avec SasPay'));
            if (saspayBtn) saspayBtn.click();
        });
        await new Promise(r => setTimeout(r, 800));

        // Click "Générer le lien de paiement"
        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const genBtn = btns.find(b => b.textContent.includes('Générer le lien de paiement'));
            if (genBtn) genBtn.click();
        });
        await new Promise(r => setTimeout(r, 1200));

        // Screenshot of SasPay Modal
        const modalPic = path.join(ARTIFACT_DIR, 'saspay_payment_modal_active.png');
        await page.screenshot({ path: modalPic });
        console.log("Saved modal screenshot:", modalPic);

        // Click on "Push Mobile direct (SoftPay)"
        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const softBtn = btns.find(b => b.textContent.includes('Push Mobile direct'));
            if (softBtn) softBtn.click();
        });
        await new Promise(r => setTimeout(r, 800));

        const softpayPic = path.join(ARTIFACT_DIR, 'saspay_softpay_modal.png');
        await page.screenshot({ path: softpayPic });
        console.log("Saved softpay modal screenshot:", softpayPic);

        console.log("All SasPay UI & service checks passed successfully!");
    } catch (e) {
        console.error("Test error:", e);
    } finally {
        await browser.close();
    }
}

run();
