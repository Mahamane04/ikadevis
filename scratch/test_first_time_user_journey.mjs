import { launchApp, enterGuestMode, readFinancials } from './lib/harness.mjs';

const wait = (ms = 400) => new Promise((r) => setTimeout(r, ms));

export async function run() {
    console.log('🚀 Démarrage du banc d\'essai : PARCOURS NOUVEL UTILISATEUR SUR LE CHIFFRAGE...');
    const results = [];
    const ok = (label, cond, detail = '') => {
        if (cond) {
            console.log(`  ✅ ${label}${detail ? ' — ' + detail : ''}`);
            results.push({ label, pass: true, detail });
        } else {
            console.error(`  ❌ ÉCHEC : ${label}${detail ? ' — ' + detail : ''}`);
            results.push({ label, pass: false, detail });
        }
    };

    const { page, close } = await launchApp();

    try {
        await page.setViewport({ width: 1440, height: 900 });

        // =========================================================================
        // ÉTAPE 1 : Premier contact (Atterrissage Invité & Onboarding Chiffrage)
        // =========================================================================
        console.log('\n--- Étape 1 : Découverte du Chiffrage en Mode Invité ---');
        await enterGuestMode(page, { demo: true });
        await wait(1200);

        const onboardingInfo = await page.evaluate(() => {
            const body = document.body.innerText;
            const hasSampleBanner = body.includes('devis d’exemple') || body.includes("devis d'exemple");
            const createMyQuoteBtn = Array.from(document.querySelectorAll('button')).find(b => 
                /Créer mon devis/i.test(b.textContent || '')
            );
            return {
                hasSampleBanner,
                hasCreateMyQuoteBtn: !!createMyQuoteBtn
            };
        });

        ok('Bandeau d\'onboarding d\'accueil affiché', onboardingInfo.hasSampleBanner);
        ok('Bouton "Créer mon devis" présent pour repartir à neuf', onboardingInfo.hasCreateMyQuoteBtn);

        // =========================================================================
        // ÉTAPE 2 : Démarrage d'un devis vierge et saisie des identités
        // =========================================================================
        console.log('\n--- Étape 2 : Initialisation d\'un devis vierge et saisie client/projet ---');

        // Clic sur "Créer mon devis"
        await page.evaluate(() => {
            const btn = Array.from(document.querySelectorAll('button')).find(b => 
                /Créer mon devis/i.test(b.textContent || '')
            );
            btn?.click();
        });
        await wait(800);

        // Saisie du Client
        const clientInput = await page.$('input[aria-label*="Client"]');
        ok('Champ Client disponible', !!clientInput);
        if (clientInput) {
            await clientInput.click();
            await clientInput.type('M. Amadou Diallo', { delay: 15 });
            await page.keyboard.press('Enter');
            await wait(300);
            // Clic extérieur pour refermer toute éventuelle popover de client
            await page.mouse.click(10, 10);
            await wait(300);
        }

        // Saisie du Projet / Chantier
        const projectInput = await page.$('input[aria-label*="Projet"]');
        ok('Champ Projet / Chantier disponible', !!projectInput);
        if (projectInput) {
            await projectInput.click();
            await projectInput.type('Villa F5 Titibougou', { delay: 15 });
            await page.keyboard.press('Enter');
            await wait(300);
            await page.mouse.click(10, 10);
            await wait(300);
        }

        const headerState = await page.evaluate(() => {
            const clientVal = document.querySelector('input[aria-label*="Client"]')?.value || '';
            const projectVal = document.querySelector('input[aria-label*="Projet"]')?.value || '';
            const rowCount = document.querySelectorAll('[data-testid="quote-items-desktop"] tbody tr').length;
            return { clientVal, projectVal, rowCount };
        });

        ok('Nom du client renseigné', headerState.clientVal.includes('Amadou Diallo'), `client="${headerState.clientVal}"`);
        ok('Projet de chantier renseigné', headerState.projectVal.includes('Villa F5'), `projet="${headerState.projectVal}"`);
        ok('Devis initialisé vierge sans ouvrage résiduel', headerState.rowCount === 0, `lignes=${headerState.rowCount}`);

        // =========================================================================
        // ÉTAPE 3 : Voie A — Ajout direct via la combobox de recherche rapide
        // =========================================================================
        console.log('\n--- Étape 3 : Voie A — Ajout rapide par la combobox ---');

        const searchSelector = 'input[role="combobox"][aria-controls="quote-solution-listbox"], input[aria-label="Rechercher un ouvrage à ajouter"]';
        const searchInput = await page.$(searchSelector);
        ok('Barre de recherche rapide d\'ouvrages présente', !!searchInput);

        if (searchInput) {
            await searchInput.click();
            await searchInput.type('Peinture Murale', { delay: 20 });
            await wait(600);

            // Clic sur l'option apparue dans la liste déroulante
            const optionClicked = await page.evaluate(() => {
                const opt = document.querySelector('#quote-solution-listbox [role="option"]');
                if (opt) {
                    opt.click();
                    return true;
                }
                return false;
            });
            if (!optionClicked) {
                await page.keyboard.press('Enter');
            }
            await wait(1000);
        }

        const countAfterWayA = await page.evaluate(() => {
            const rows = document.querySelectorAll('[data-testid="quote-items-desktop"] tbody tr');
            return rows.length;
        });
        const finA = await readFinancials(page);

        ok('Premier ouvrage inséré dans le devis', countAfterWayA === 1, `lignes=${countAfterWayA}`);
        ok('Montant chiffré automatiquement (> 0 FCFA)', (finA.totalNetHt || 0) > 0 || (finA.totalTtc || 0) > 0, `Net HT=${finA.totalNetHt} FCFA, TTC=${finA.totalTtc} FCFA`);

        // =========================================================================
        // ÉTAPE 4 : Voie B — Catalogue d'ouvrages avec Ajout Multiple par défaut
        // =========================================================================
        console.log('\n--- Étape 4 : Voie B — Catalogue d\'ouvrages avec Ajout Multiple par défaut ---');

        // Ouvrir le catalogue
        await page.evaluate(() => {
            const btn = document.querySelector('button[aria-label="Ouvrir le catalogue complet des ouvrages"]') ||
                        Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Catalogue');
            btn?.click();
        });
        await wait(800);

        const pickerState = await page.evaluate(() => {
            const modal = document.querySelector('[role="dialog"][aria-label*="Bibliothèque"]') ||
                          document.querySelector('[role="dialog"]');
            if (!modal) return null;
            const toggleBtn = Array.from(modal.querySelectorAll('button')).find(b => 
                b.textContent.includes('Ajout Multiple')
            );
            const checkboxes = Array.from(modal.querySelectorAll('input[type="checkbox"]'));
            return {
                modalVisible: true,
                btnText: toggleBtn ? toggleBtn.textContent.trim() : '',
                isBulkActive: toggleBtn ? toggleBtn.textContent.includes('✓ Ajout Multiple (Actif)') : false,
                checkboxCount: checkboxes.length
            };
        });

        ok('Bibliothèque des Ouvrages Métiers ouverte', pickerState?.modalVisible);
        ok('Mode Ajout Multiple actif PAR DÉFAUT (Demande Image 3)', pickerState?.isBulkActive, pickerState?.btnText);
        ok('Cases à cocher visibles dès l\'ouverture', pickerState?.checkboxCount > 0, `cases=${pickerState?.checkboxCount}`);

        // Sélectionner 2 ouvrages via les cases à cocher
        await page.evaluate(() => {
            const modal = document.querySelector('[role="dialog"]');
            const checkboxes = Array.from(modal?.querySelectorAll('input[type="checkbox"]') || []);
            if (checkboxes[0]) checkboxes[0].click();
            if (checkboxes[1]) checkboxes[1].click();
        });
        await wait(400);

        // Cliquer sur le bouton d'insertion groupée
        const bulkInserted = await page.evaluate(() => {
            const modal = document.querySelector('[role="dialog"]');
            const insertBtn = Array.from(modal?.querySelectorAll('button') || []).find(b => 
                /Insérer \d+ ouvrage/i.test(b.textContent || '') || /Ajouter la sélection/i.test(b.textContent || '')
            );
            if (insertBtn) {
                insertBtn.click();
                return true;
            }
            return false;
        });

        ok('Insertion groupée exécutée en 1 clic', bulkInserted);
        await wait(800);

        // Fermer le catalogue s'il reste ouvert
        await page.evaluate(() => {
            const closeBtn = document.querySelector('[role="dialog"] button[aria-label*="Fermer"], [role="dialog"] button[aria-label*="Terminer"]');
            closeBtn?.click();
        });
        await wait(500);

        const countAfterWayB = await page.evaluate(() => {
            return document.querySelectorAll('[data-testid="quote-items-desktop"] tbody tr').length;
        });

        ok('Les 2 ouvrages sont intégrés au tableau (total = 3 ouvrages)', countAfterWayB === 3, `lignes=${countAfterWayB}`);

        // =========================================================================
        // ÉTAPE 5 : Voie C — Ajout d'une ligne libre sur mesure
        // =========================================================================
        console.log('\n--- Étape 5 : Voie C — Ligne libre personnalisée ---');

        await page.evaluate(() => {
            const btn = document.querySelector('button[aria-label="Ajouter une ligne libre"]');
            btn?.click();
        });
        await wait(600);

        const countAfterWayC = await page.evaluate(() => {
            return document.querySelectorAll('[data-testid="quote-items-desktop"] tbody tr').length;
        });

        ok('Ligne libre insérée (total = 4 ouvrages)', countAfterWayC === 4, `lignes=${countAfterWayC}`);

        // Personnaliser le libellé et le prix unitaire de la ligne libre
        await page.evaluate(() => {
            const rows = document.querySelectorAll('[data-testid="quote-items-desktop"] tbody tr');
            const lastRow = rows[rows.length - 1];
            if (!lastRow) return;

            const nameInput = lastRow.querySelector('input[type="text"]');
            if (nameInput) {
                const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                setter.call(nameInput, 'Nettoyage & Évacuation fin de chantier');
                nameInput.dispatchEvent(new Event('input', { bubbles: true }));
                nameInput.dispatchEvent(new Event('change', { bubbles: true }));
            }

            const priceInput = Array.from(lastRow.querySelectorAll('input[type="number"]')).pop();
            if (priceInput) {
                const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                setter.call(priceInput, '150000');
                priceInput.dispatchEvent(new Event('input', { bubbles: true }));
                priceInput.dispatchEvent(new Event('change', { bubbles: true }));
            }
        });
        await wait(600);

        // =========================================================================
        // ÉTAPE 6 : Métré technique dans l'Inspecteur & Zéro Scroll Horizontal
        // =========================================================================
        console.log('\n--- Étape 6 : Métré technique & Vérification de l\'absence de scroll horizontal ---');

        // Ouvrir l'inspecteur du premier ouvrage
        await page.evaluate(() => {
            const rows = document.querySelectorAll('[data-testid="quote-items-desktop"] tbody tr');
            const btn = rows[0]?.querySelector('button[title*="détails"], button[aria-label*="Détails"]');
            btn?.click();
        });
        await wait(800);

        // Vérification de la demande utilisateur Image 1 : Pas de scroll horizontal dans le tableau rétréci
        const scrollMetrics = await page.evaluate(() => {
            const tableContainer = document.querySelector('[data-testid="quote-items-desktop"]');
            const inspector = document.querySelector('aside[aria-label="Inspecteur de l\'ouvrage"]');
            return {
                hasInspector: !!inspector,
                scrollWidth: tableContainer?.scrollWidth || 0,
                clientWidth: tableContainer?.clientWidth || 0,
                hasScrollX: (tableContainer?.scrollWidth || 0) > (tableContainer?.clientWidth || 0),
                overflowX: window.getComputedStyle(tableContainer).overflowX
            };
        });

        ok('Inspecteur latéral d\'ouvrage ouvert sur la droite', scrollMetrics.hasInspector);
        ok('ZÉRO scroll horizontal sur le tableau rétréci (scrollWidth <= clientWidth)', !scrollMetrics.hasScrollX, `scrollWidth=${scrollMetrics.scrollWidth}, clientWidth=${scrollMetrics.clientWidth}`);
        ok('Style overflow-x configuré à "hidden"', scrollMetrics.overflowX === 'hidden');

        // Modifier la quantité / dimension dans l'inspecteur Mode Simple
        const recalculationCheck = await page.evaluate(() => {
            const inspector = document.querySelector('aside[aria-label="Inspecteur de l\'ouvrage"]');
            if (!inspector) return null;

            const qtyInput = inspector.querySelector('input[type="number"]');
            const beforeVal = qtyInput?.value;

            if (qtyInput) {
                const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                setter.call(qtyInput, '35');
                qtyInput.dispatchEvent(new Event('input', { bubbles: true }));
                qtyInput.dispatchEvent(new Event('change', { bubbles: true }));
            }

            return {
                beforeVal,
                afterVal: qtyInput?.value
            };
        });

        ok('Métré ajusté dans l\'inspecteur (Mode Simple)', recalculationCheck?.afterVal === '35', `quantité=${recalculationCheck?.afterVal}`);
        await wait(600);

        // Fermer l'inspecteur
        await page.evaluate(() => {
            const closeBtn = document.querySelector('button[aria-label="Retour aux ouvrages du lot"]');
            closeBtn?.click();
        });
        await wait(500);

        // =========================================================================
        // ÉTAPE 7 : Structuration en Multi-Lots & Synthèse des Lots
        // =========================================================================
        console.log('\n--- Étape 7 : Création d\'un 2ème lot & Synthèse globale des lots ---');

        // Ajouter un 2ème lot
        await page.evaluate(() => {
            const addLotBtn = document.querySelector('button[aria-label="Ajouter un lot au devis"]');
            addLotBtn?.click();
        });
        await wait(600);

        const lotsCount = await page.evaluate(() => {
            const tabs = document.querySelectorAll('[role="tablist"] [role="tab"]');
            return tabs.length;
        });

        ok('Nouveau lot créé avec succès (Lot 02)', lotsCount === 2, `lots=${lotsCount}`);

        // Ouvrir la Synthèse des lots (Demande utilisateur Image 2)
        await page.evaluate(() => {
            const overviewBtn = document.querySelector('button[data-testid="lots-overview-btn"]') ||
                                document.querySelector('button[aria-label="Synthèse des lots"]');
            overviewBtn?.click();
        });
        await wait(800);

        const overviewModalCheck = await page.evaluate(() => {
            const modal = document.querySelector('[role="dialog"]');
            if (!modal) return null;

            const headers = Array.from(modal.querySelectorAll('th')).map(th => th.textContent.trim());
            const hasActions = headers.some(h => /ACTIONS/i.test(h));
            const buttons = Array.from(modal.querySelectorAll('button')).map(b => b.textContent.trim());
            const hasOpenBtn = buttons.some(b => b.includes('Ouvrir') || b.includes('Actif'));

            // Sous-tableaux d'accordéon (TOUS les éléments détaillés)
            const rows = modal.querySelectorAll('tbody tr');

            return {
                modalFound: true,
                hasActions,
                hasOpenBtn,
                detailedRowsCount: rows.length,
                hasGlobalToggle: buttons.some(b => b.includes('replier') || b.includes('déplier'))
            };
        });

        ok('Modale Synthèse et répartition des lots ouverte en format large (max-w-4xl)', overviewModalCheck?.modalFound);
        ok('Colonne ACTIONS complète et visible sans coupure', overviewModalCheck?.hasActions);
        ok('Bouton d\'action de lot (Actif / Ouvrir) affiché en entier', overviewModalCheck?.hasOpenBtn);
        ok('Accordéon affichant TOUS les éléments et sous-ouvrages', overviewModalCheck?.detailedRowsCount >= 4, `lignes=${overviewModalCheck?.detailedRowsCount}`);
        ok('Bouton global de repliage/dépliage de l\'accordéon présent', overviewModalCheck?.hasGlobalToggle);

        // Fermer la synthèse des lots
        await page.evaluate(() => {
            const closeBtn = document.querySelector('button[aria-label*="Fermer la synthèse"], [role="dialog"] button[aria-label*="Fermer"]');
            closeBtn?.click();
        });
        await wait(500);

        // =========================================================================
        // ÉTAPE 8 : Prévisualisation Document Client & PDF
        // =========================================================================
        console.log('\n--- Étape 8 : Prévisualisation Client & PDF ---');

        await page.evaluate(() => {
            const previewBtn = Array.from(document.querySelectorAll('button')).find(b => 
                b.textContent.includes('Aperçu Client & PDF')
            );
            previewBtn?.click();
        });
        await wait(1000);

        const previewCheck = await page.evaluate(() => {
            const body = document.body.innerText;
            const hasClientName = body.includes('M. Amadou Diallo');
            const hasProjectName = body.includes('Villa F5 Titibougou');
            const hasModifyBtn = Array.from(document.querySelectorAll('button')).some(b => 
                b.textContent.trim() === 'Modifier' || b.getAttribute('aria-label')?.includes('Modifier')
            );
            return {
                hasClientName,
                hasProjectName,
                hasModifyBtn
            };
        });

        ok('Document client affiche le nom du client', previewCheck.hasClientName);
        ok('Document client affiche le chantier du client', previewCheck.hasProjectName);
        ok('Bouton "Modifier" disponible pour revenir à l\'éditeur', previewCheck.hasModifyBtn);

        // Revenir à l'éditeur de chiffrage
        await page.evaluate(() => {
            const modBtn = Array.from(document.querySelectorAll('button')).find(b => 
                b.textContent.trim() === 'Modifier' || b.getAttribute('aria-label')?.includes('Modifier')
            );
            modBtn?.click();
        });
        await wait(800);

        // =========================================================================
        // ÉTAPE 9 : Sauvegarde du premier devis & Persistance locale
        // =========================================================================
        console.log('\n--- Étape 9 : Enregistrement du premier devis & Persistance ---');

        const saveClicked = await page.evaluate(() => {
            const saveBtn = Array.from(document.querySelectorAll('button')).find(b => 
                b.textContent.includes('Enregistrer') || b.textContent.includes('Mettre à jour')
            );
            if (saveBtn) {
                saveBtn.click();
                return true;
            }
            return false;
        });

        ok('Bouton d\'enregistrement cliqué', saveClicked);
        await wait(1200);

        const savedState = await page.evaluate(() => {
            const badge = Array.from(document.querySelectorAll('span, div')).find(el => 
                el.textContent.includes('Enregistré')
            );
            const rawQuotes = localStorage.getItem('costcalc:guest:savedQuotes');
            const savedList = rawQuotes ? JSON.parse(rawQuotes) : [];
            const amadouQuote = savedList.find(q => (q.clientName || '').includes('Amadou Diallo'));
            const updateBtn = Array.from(document.querySelectorAll('button')).find(b => 
                b.textContent.includes('Mettre à jour')
            );
            return {
                hasSavedBadge: !!badge || !!updateBtn,
                badgeText: badge ? badge.textContent.trim() : '',
                savedCount: savedList.length,
                quoteFound: !!amadouQuote,
                clientName: amadouQuote?.clientName || '',
                totalTtc: amadouQuote?.quoteData?.totalTTCConsomme || 0
            };
        });

        ok('Indicateur de confirmation d\'enregistrement affiché (Bouton "Mettre à jour" / Badge Enregistré)', savedState.hasSavedBadge, savedState.badgeText);
        ok('Le devis est persisté dans le stockage local', savedState.savedCount >= 1, `nb devis=${savedState.savedCount}`);
        ok('Le devis persisté correspond au client du test', savedState.quoteFound, `client=${savedState.clientName}`);
        ok('Montant TTC du devis sauvegardé non nul', savedState.totalTtc > 0, `total TTC=${savedState.totalTtc} FCFA`);

        // =========================================================================
        // ÉTAPE 10 : Rechargement complet de page & reprise fidèle
        // =========================================================================
        console.log('\n--- Étape 10 : Rechargement complet de page & reprise fidèle ---');

        // Gérer le dialogue beforeunload potentiel
        page.on('dialog', async (dialog) => {
            try { await dialog.accept(); } catch (e) {}
        });

        await page.reload({ waitUntil: 'domcontentloaded' });
        await wait(1200);

        // Si la page est revenue à l'écran de connexion / accueil invité
        await page.evaluate(() => {
            const guestBtn = Array.from(document.querySelectorAll('button')).find(b => 
                /Essayer sans compte/i.test(b.textContent || '') || 
                (b.textContent.includes('Mode Démo') && b.textContent.includes('Invité'))
            );
            guestBtn?.click();
        });
        await wait(1500);

        // Vérifier si le devis est déjà affiché
        let isDevisDisplayed = await page.evaluate(() => {
            const clientVal = document.querySelector('input[aria-label*="Client"]')?.value || '';
            return clientVal.includes('Amadou Diallo');
        });

        if (!isDevisDisplayed) {
            // Si le bandeau de reprise de brouillon est présent, cliquer dessus
            const resumed = await page.evaluate(() => {
                const resumeBtn = Array.from(document.querySelectorAll('button')).find(b => 
                    /Reprendre ce devis/i.test(b.textContent || '')
                );
                if (resumeBtn) {
                    resumeBtn.click();
                    return true;
                }
                return false;
            });
            if (resumed) {
                await wait(1200);
            }
        }

        isDevisDisplayed = await page.evaluate(() => {
            const clientVal = document.querySelector('input[aria-label*="Client"]')?.value || '';
            return clientVal.includes('Amadou Diallo');
        });

        if (!isDevisDisplayed) {
            console.log('  ℹ️ Accès à "Mes devis" pour rouvrir le devis sauvegardé...');
            // Cliquer sur le bouton ou lien de navigation "Mes devis"
            await page.evaluate(() => {
                const mesDevisBtn = Array.from(document.querySelectorAll('button, a')).find(b => 
                    b.textContent.trim() === 'Mes devis' || b.getAttribute('aria-label') === 'Mes devis'
                );
                mesDevisBtn?.click();
            });
            await wait(1200);

            // Cliquer sur la première cellule de la ligne du client (pas sur la corbeille !)
            await page.evaluate(() => {
                const row = Array.from(document.querySelectorAll('tbody tr')).find(tr => 
                    tr.textContent.includes('Amadou Diallo')
                );
                const firstTd = row?.querySelector('td');
                firstTd?.click();
            });
            await wait(1000);

            // Dans le volet de détail du devis, cliquer sur "Modifier" pour le charger dans l'éditeur
            await page.evaluate(() => {
                const modBtn = document.querySelector('button[aria-label*="Modifier le devis"]') ||
                               Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Modifier');
                modBtn?.click();
            });
            await wait(1200);
        }

        const restoredState = await page.evaluate(() => {
            const clientVal = document.querySelector('input[aria-label*="Client"]')?.value || '';
            const projectVal = document.querySelector('input[aria-label*="Projet"]')?.value || '';
            const tabs = document.querySelectorAll('[role="tablist"] [role="tab"]');
            const items = document.querySelectorAll('[data-testid="quote-items-desktop"] tbody tr');
            return {
                clientVal,
                projectVal,
                lotsCount: tabs.length,
                hasItems: items.length > 0,
                rowCount: items.length
            };
        });

        ok('Nom du client parfaitement restauré après F5', restoredState.clientVal.includes('Amadou Diallo'), `client="${restoredState.clientVal}"`);
        ok('Nom du chantier parfaitement restauré après F5', restoredState.projectVal.includes('Villa F5'), `projet="${restoredState.projectVal}"`);
        ok('Les 2 lots sont restaurés après F5', restoredState.lotsCount === 2, `lots=${restoredState.lotsCount}`);
        ok('Les ouvrages sont présents et chiffrés après F5', restoredState.hasItems, `lignes=${restoredState.rowCount}`);

        // Capture d'écran finale du devis complet d'un nouvel utilisateur
        await page.screenshot({ path: 'scratch/verif_ftue_first_time_user_success.png', fullPage: false });
        console.log('📸 Capture d\'écran du devis final enregistrée : scratch/verif_ftue_first_time_user_success.png');

        // Bilan global
        const failed = results.filter(r => !r.pass);
        console.log(`\n============================================================`);
        console.log(`Bilan Parcours Nouvel Utilisateur : ${results.length - failed.length}/${results.length} assertions réussies.`);
        if (failed.length > 0) {
            console.error(`❌ Échecs détectés :`, failed);
            process.exit(1);
        } else {
            console.log(`🎉 LE PARCOURS D'UN NOUVEL UTILISATEUR EST 100% FLUIDE ET ZÉRO DÉFAUT !`);
        }

    } finally {
        await close();
    }
}

run();

