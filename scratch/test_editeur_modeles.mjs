// Banc d'essai — éditeur de modèles de document, étape 1 (2026-09-03).
//
// L'éditeur reprend la structure de Zoho Books — rail de sections, contrôles à
// gauche, document à droite — avec une différence assumée : l'aperçu est
// CONTINU. Zoho impose un bouton « Actualiser l'aperçu » parce qu'il rend le
// document côté serveur ; ikadevis le rend dans la page, rien n'oblige à
// l'aller-retour.
//
// Deux propriétés comptent plus que le reste, et ce banc les protège :
//
//  1. L'aperçu appelle le MÊME composant que le panneau de détail
//     (`DocumentDevisClient`). Un rendu séparé « pour l'aperçu » recréerait le
//     défaut relevé pendant l'audit : deux sources de vérité qui divergent, et
//     un aperçu qui promet autre chose que le PDF envoyé au client.
//
//  2. Enregistrer change RÉELLEMENT le document. Un éditeur dont on ressort
//     sans effet visible est pire qu'une absence d'éditeur.
//
// Ce que le banc ne couvre pas, et qui est volontaire : les réglages absents de
// l'étape 1 (titres, masquage des blocs, colonnes du tableau). Ils ne sont pas
// exposés comme des interrupteurs sans effet — chaque section le dit en clair.
import { pathToFileURL, fileURLToPath } from 'node:url';
import { launchApp, enterGuestMode } from './lib/harness.mjs';

const wait = (ms = 900) => new Promise((r) => setTimeout(r, ms));
// Viser « Éditeur » et non « modèle » : depuis l'étape 4, le catalogue de
// modèles préétablis s'intercale entre la galerie et l'éditeur, et son
// aria-label « Choisir un modèle » répondait au même sélecteur.
const SEL = '[role="dialog"][aria-label*="Éditeur de modèle"]';

const cliquer = (page, motif) => page.evaluate((t) => {
    const b = [...document.querySelectorAll('button')]
        .filter((x) => x.getBoundingClientRect().width > 0)
        .find((x) => new RegExp(t, 'i').test(x.textContent || ''));
    if (b) b.click();
    return !!b;
}, motif);

const couleurTitreDocument = (page, dansEditeur) => page.evaluate((sel) => {
    const racine = sel ? document.querySelector(sel) : document;
    if (!racine) return null;
    const t = [...racine.querySelectorAll('h2')].find((h) => /DEVIS|ÉTUDE/.test(h.textContent || ''));
    return t ? getComputedStyle(t).color : null;
}, dansEditeur ? SEL : null);

export async function run() {
    const results = [];
    const ok = (label, cond, detail = '') => results.push({ label, pass: !!cond, detail });

    const { page, close } = await launchApp();
    try {
        await page.setViewport({ width: 1600, height: 960 });
        await enterGuestMode(page, { demo: true });
        await wait(2400);

        ok('Les paramètres s’ouvrent', await cliquer(page, 'Paramètres du Compte'));
        await wait(1700);
        ok('L’onglet Documents existe', await cliquer(page, 'Documents'));
        await wait(1700);
        ok('L’éditeur de modèles est proposé', await cliquer(page, 'Éditeur de modèles'));
        await wait(2200);

        // Depuis l'étape 3, ce bouton ouvre la GALERIE : atterrir directement
        // dans un modèle cacherait les autres. On y entre par « Nouveau ».
        // Étape 4 : « Nouveau modèle » ouvre le CATALOGUE de préétablis, pas
        // directement l'éditeur. « Repartir de zéro » y reproduit l'ancien
        // chemin — le document tel qu'il sort des réglages, sans mise en page
        // imposée — que le reste de ce banc suppose.
        const passerParLeCatalogue = async () => {
            const clique = await page.evaluate(() => {
                const c = document.querySelector('[role="dialog"][aria-label="Choisir un modèle"]');
                if (!c) return false;
                const b = [...c.querySelectorAll('button')].find((x) => /Repartir de zéro/.test(x.textContent || ''));
                if (b) { b.click(); return true; }
                return false;
            });
            await wait(1800);
            return clique;
        };

        const entrerDansLEditeur = async () => {
            const dejaOuvert = await page.evaluate((sel) => !!document.querySelector(sel), SEL);
            if (dejaOuvert) return true;
            const clique = await page.evaluate(() => {
                const g = document.querySelector('[role="dialog"][aria-label*="Modèles"]');
                if (!g) return false;
                const b = [...g.querySelectorAll('button')]
                    .find((x) => /Nouveau modèle|Choisir un modèle|Créer un premier modèle/.test(x.textContent || ''));
                if (b) { b.click(); return true; }
                return false;
            });
            await wait(1800);
            await passerParLeCatalogue();
            return clique;
        };
        ok('La galerie mène à l’éditeur', await entrerDansLEditeur());
        await wait(1200);

        const ouverture = await page.evaluate((sel) => {
            const d = document.querySelector(sel);
            if (!d) return { ouvert: false };
            return {
                ouvert: true,
                sections: [...d.querySelectorAll('nav button')].map((b) => b.innerText.trim()),
                documentRendu: !!d.querySelector('[data-zone-impression]'),
                aBoutonActualiser: /Actualiser l’aperçu|Actualiser l'aperçu/i.test(d.innerText)
            };
        }, SEL);

        ok('L’éditeur s’ouvre en plein écran', ouverture.ouvert);
        ok(`Le rail porte les six sections — ${JSON.stringify(ouverture.sections)}`,
            (ouverture.sections || []).length === 6);
        ok('L’aperçu rend le VRAI document, pas une vignette', ouverture.documentRendu);
        ok('Aucun bouton « Actualiser l’aperçu » : le rendu est continu', !ouverture.aBoutonActualiser);

        // ── Continuité : le document suit la frappe ───────────────────────
        const avant = await couleurTitreDocument(page, true);
        await page.evaluate((sel) => {
            // Le sélecteur DOIT être celui de l'éditeur : un autre existe dans
            // les paramètres, derrière l'overlay — s'y tromper fait conclure à
            // tort que l'aperçu est inerte.
            const d = document.querySelector(sel);
            const i = [...d.querySelectorAll('input[type="color"]')][0];
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            setter.call(i, '#0f766e');
            i.dispatchEvent(new Event('input', { bubbles: true }));
        }, SEL);
        await wait(900);
        const apres = await couleurTitreDocument(page, true);
        ok(`L’aperçu suit la couleur sans bouton — ${avant} → ${apres}`,
            apres === 'rgb(15, 118, 110)' && apres !== avant);

        // ── L'enregistrement change le document réel ──────────────────────
        await page.evaluate((sel) => {
            const d = document.querySelector(sel);
            const b = [...d.querySelectorAll('button')].find((x) => /^Enregistrer$/.test(x.textContent.trim()));
            if (b) b.click();
        }, SEL);
        await wait(2500);
        ok('L’éditeur se ferme après enregistrement',
            await page.evaluate((sel) => !document.querySelector(sel), SEL));

        await cliquer(page, 'Fermer');
        await wait(1200);
        await page.evaluate(() => {
            const b = [...document.querySelectorAll('aside button')].find((x) => (x.textContent || '').trim().startsWith('Mes devis'));
            if (b) b.click();
        });
        await wait(1800);
        await page.evaluate(() => { const tr = document.querySelector('tbody tr'); if (tr) tr.click(); });
        await wait(2500);

        const reel = await couleurTitreDocument(page, false);
        ok(`Le document réel a pris la couleur enregistrée — ${reel}`, reel === 'rgb(15, 118, 110)');

        // ── Étape 2 : le document LIT le modèle ───────────────────────────
        await cliquer(page, 'Paramètres du Compte');
        await wait(1700);
        await cliquer(page, 'Documents');
        await wait(1700);
        // Charger un logo AVANT d'ouvrir l'éditeur : `afficherLogo` est calculé
        // à l'ouverture depuis les réglages de l'entreprise. Chargé après, le
        // modèle en cours resterait sur « pas de logo ».
        const champLogo = await page.$('input[type="file"]');
        if (champLogo) {
            await champLogo.uploadFile(fileURLToPath(new URL('./fixtures/logo_test.png', import.meta.url)));
            await wait(2000);
        }
        await cliquer(page, 'Éditeur de modèles');
        await wait(2200);
        await entrerDansLEditeur();
        await wait(1200);
        await page.evaluate((sel) => {
            const d = document.querySelector(sel);
            const b = [...d.querySelectorAll('nav button')].find((x) => /Tableau/.test(x.innerText));
            if (b) b.click();
        }, SEL);
        await wait(1500);

        const lireTableau = () => page.evaluate((sel) => {
            const d = document.querySelector(sel);
            const t = d.querySelector('[data-zone-impression] table');
            if (!t) return { absent: true };
            return {
                entetes: [...t.querySelectorAll('thead th')].map((h) => h.textContent.trim()),
                colSpans: [...new Set([...t.querySelectorAll('tbody td[colspan]')].map((c) => +c.getAttribute('colspan')))].sort()
            };
        }, SEL);

        const avantColonne = await lireTableau();
        ok(`Le tableau part de quatre colonnes — ${JSON.stringify(avantColonne.entetes)}`,
            (avantColonne.entetes || []).length === 4);

        await page.evaluate((sel) => {
            const d = document.querySelector(sel);
            const cb = [...d.querySelectorAll('input[type="checkbox"]')]
                .find((x) => /Prix Unitaire/i.test(x.getAttribute('aria-label') || ''));
            if (cb) cb.click();
        }, SEL);
        await wait(1200);
        const apresColonne = await lireTableau();
        ok(`Masquer une colonne la retire du document — ${(apresColonne.entetes || []).length} colonnes`,
            (apresColonne.entetes || []).length === 3);
        // Le point qui casse en silence : les lignes pleine largeur (en-tête de
        // lot, sous-total) portent un colSpan. Figé à 4, il déborde du tableau
        // dès qu'une colonne disparaît.
        ok(`Les colSpan suivent — ${JSON.stringify(avantColonne.colSpans)} → ${JSON.stringify(apresColonne.colSpans)}`,
            JSON.stringify(apresColonne.colSpans) === JSON.stringify([2, 3]));

        // ── Le focus ne doit pas sauter à chaque frappe ───────────────────
        await page.evaluate((sel) => {
            const d = document.querySelector(sel);
            const b = [...d.querySelectorAll('nav button')].find((x) => /Document/.test(x.innerText));
            if (b) b.click();
        }, SEL);
        await wait(1400);
        await page.evaluate((sel) => {
            const d = document.querySelector(sel);
            const i = [...d.querySelectorAll('input[type="text"]')].find((x) => /DEVIS COMMERCIAL/.test(x.placeholder || ''));
            if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
        }, SEL);
        await page.keyboard.type(' MODIFIÉ', { delay: 80 });
        await wait(700);
        const saisie = await page.evaluate((sel) => {
            const d = document.querySelector(sel);
            const i = [...d.querySelectorAll('input[type="text"]')].find((x) => /DEVIS COMMERCIAL/.test(x.placeholder || ''));
            return { champ: i.value, focusConserve: document.activeElement === i,
                     apercu: (d.querySelector('[data-zone-impression] h2') || {}).textContent };
        }, SEL);
        // Avant correction, taper « ABC » ne laissait que « A » : les fabriques
        // Bascule/Texte étaient déclarées dans le rendu, donc React créait un
        // TYPE de composant neuf à chaque frappe et remontait le champ.
        ok(`La saisie n’est pas coupée au premier caractère — « ${saisie.champ} »`,
            saisie.champ === 'DEVIS COMMERCIAL MODIFIÉ');
        ok('Le champ garde le focus pendant la frappe', saisie.focusConserve);
        ok(`Le titre saisi apparaît dans le document — « ${saisie.apercu} »`,
            saisie.apercu === 'DEVIS COMMERCIAL MODIFIÉ');

        // ── La taille du logo : un réglage qui ne pilotait rien ───────────
        // `tailleLogo` figurait dans la configuration par défaut depuis
        // l'étape 1 sans être ni exposé ni lu — le document rendait le logo à
        // une taille fixe. Ce banc protège les deux bouts : le contrôle existe
        // dans l'éditeur, et il déplace réellement le logo du document.
        await page.evaluate((sel) => {
            const d = document.querySelector(sel);
            const b = [...d.querySelectorAll('nav button')].find((x) => /En-tête/.test(x.innerText));
            if (b) b.click();
        }, SEL);
        await wait(1200);
        const logo = await page.evaluate((sel) => {
            const d = document.querySelector(sel);
            const img = d.querySelector('[data-zone-impression] img');
            const curseur = [...d.querySelectorAll('input[type="range"]')]
                .find((x) => /Taille du logo/i.test(x.getAttribute('aria-label') || ''));
            return {
                logoRendu: !!img,
                hauteur: img ? Math.round(img.getBoundingClientRect().height) : 0,
                curseur: !!curseur
            };
        }, SEL);
        ok('Un logo chargé apparaît dans le document', logo.logoRendu);
        ok('Le curseur de taille du logo est proposé', logo.curseur);

        await page.evaluate((sel) => {
            const d = document.querySelector(sel);
            const r = [...d.querySelectorAll('input[type="range"]')]
                .find((x) => /Taille du logo/i.test(x.getAttribute('aria-label') || ''));
            if (!r) return;
            Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(r, '200');
            r.dispatchEvent(new Event('input', { bubbles: true }));
        }, SEL);
        await wait(1000);
        const logoAgrandi = await page.evaluate((sel) => {
            const img = document.querySelector(sel + ' [data-zone-impression] img');
            return img ? Math.round(img.getBoundingClientRect().height) : 0;
        }, SEL);
        ok(`Le curseur agrandit réellement le logo — ${logo.hauteur}px → ${logoAgrandi}px`,
            logo.hauteur > 0 && logoAgrandi > logo.hauteur);

        // ── Étape 3 : galerie et filigrane de statut ──────────────────────
        await page.evaluate((sel) => {
            const d = document.querySelector(sel);
            const b = [...d.querySelectorAll('button')].find((x) => /^Fermer$/.test(x.textContent.trim()));
            if (b) b.click();
        }, SEL);
        await wait(1600);

        const galerie = await page.evaluate(() => {
            const d = document.querySelector('[role="dialog"][aria-label*="Modèles"]');
            if (!d) return { ouverte: false };
            return {
                ouverte: true,
                titre: /Modèles de devis/.test(d.innerText),
                nouveau: [...d.querySelectorAll('button')].some((b) => /Nouveau modèle/.test(b.textContent))
            };
        });
        ok('Fermer l’éditeur ramène à la galerie, pas au néant', galerie.ouverte);
        ok('La galerie annonce les modèles de devis', galerie.titre && galerie.nouveau);

        await page.evaluate(() => {
            const d = document.querySelector('[role="dialog"][aria-label*="Modèles"]');
            const b = [...d.querySelectorAll('button')].find((x) => /^Fermer$/.test(x.textContent.trim()));
            if (b) b.click();
        });
        await wait(1200);

        // Le filigrane : rien sur un devis approuvé, un bandeau sur un brouillon.
        // C'est la règle qui compte — un tampon décoratif sur tous les documents
        // n'alerterait plus personne.
        // 2026-09-04 — Le tampon était un bandeau pleine largeur encadré de
        // tirets, posé entre l'en-tête et le bloc client. Signalé sur capture :
        // « enlève-moi ce badge, ce n'est pas professionnel pour le client de
        // voir ça ». Il est devenu un tag d'angle, hors du flux et absent du
        // papier. On mesure donc sa PART de largeur : un bandeau prenait toute
        // la colonne, un tag en prend quelques pour cent.
        // 2026-09-04 — Le tampon était un bandeau pleine largeur encadré de
        // tirets, posé entre l'en-tête et le bloc client. Signalé sur capture :
        // « enlève-moi ce badge, ce n'est pas professionnel pour le client de
        // voir ça ». Il est devenu un RUBAN d'angle, repris de Zoho Books :
        // carré rogné au coin, bande tournée de -45°, gris neutre.
        //
        // Ce qui compte le plus ne se voit pas à l'écran : le ruban porte
        // `data-hors-pdf`, qui le fait retirer du clone de capture. Le PDF
        // envoyé au client n'en garde aucune trace.
        const tampon = (page) => page.evaluate(() => {
            const z = document.querySelector('[data-zone-impression]');
            const t = z && z.querySelector('.ruban-statut');
            if (!t) return { present: false, libelle: null };
            const r = t.getBoundingClientRect();
            const bande = t.querySelector('span');
            return {
                present: true,
                libelle: t.innerText.trim(),
                part: r.width / z.getBoundingClientRect().width,
                position: getComputedStyle(t).position,
                rogne: getComputedStyle(t).overflow,
                rotation: bande ? getComputedStyle(bande).transform : null,
                horsPdf: t.hasAttribute('data-hors-pdf')
            };
        });

        const ouvrirPremierDevis = async () => {
            await page.evaluate(() => {
                const b = [...document.querySelectorAll('aside button')].find((x) => (x.textContent || '').trim().startsWith('Mes devis'));
                if (b) b.click();
            });
            await wait(1800);
            await page.evaluate(() => { const tr = document.querySelector('tbody tr'); if (tr) tr.click(); });
            await wait(2400);
        };

        await ouvrirPremierDevis();
        const approuve = await tampon(page);
        ok('Un devis approuvé ne porte aucun filigrane', !approuve.present);

        await page.evaluate(() => {
            const l = JSON.parse(localStorage.getItem('costcalc:guest:savedQuotes') || '[]');
            if (l[0]) { l[0].status = 'draft'; localStorage.setItem('costcalc:guest:savedQuotes', JSON.stringify(l)); }
        });
        await page.reload({ waitUntil: 'networkidle0' });
        await wait(1500);
        await enterGuestMode(page, { demo: false });
        await wait(2400);
        await ouvrirPremierDevis();
        const brouillon = await tampon(page);
        ok(`Un brouillon porte son statut — « ${brouillon.libelle} »`,
            brouillon.present && brouillon.libelle === 'BROUILLON');
        ok(`…en ruban d’angle et non en bandeau — ${Math.round(brouillon.part * 100)} % de la largeur`,
            brouillon.part < 0.25 && brouillon.position === 'absolute' && brouillon.rogne === 'hidden');
        // matrix(0.707107, -0.707107, …) = rotation de -45°, la diagonale de Zoho.
        ok(`La bande est tournée en diagonale — ${brouillon.rotation}`,
            /^matrix\(0\.7071/.test(brouillon.rotation || ''));

        // LE point de la demande : « sur Zoho le badge n'apparaît pas en
        // exportant le PDF ni en l'imprimant ». On vérifie les deux chemins de
        // suppression plutôt que le résultat du PDF, qu'un banc ne peut pas
        // ouvrir : le marquage `data-hors-pdf`, et le fait que le clone de
        // capture le retire réellement.
        ok('Le ruban est marqué hors PDF', brouillon.horsPdf === true);
        const survitAuClone = await page.evaluate(() => {
            const z = document.querySelector('[data-zone-impression]');
            const copie = z.cloneNode(true);
            copie.querySelectorAll('[data-hors-pdf]').forEach((n) => n.remove());
            return {
                avant: z.querySelectorAll('.ruban-statut').length,
                apres: copie.querySelectorAll('.ruban-statut').length
            };
        });
        ok(`Le clone de capture ne le garde pas — ${survitAuClone.avant} → ${survitAuClone.apres}`,
            survitAuClone.avant === 1 && survitAuClone.apres === 0);
        ok('…et il est retiré du papier à l’impression',
            await page.evaluate(() => [...document.styleSheets].some((f) => {
                try {
                    return [...f.cssRules].some((r) => r.media && /print/.test(r.media.mediaText)
                        && [...(r.cssRules || [])].some((x) => /ruban-statut/.test(x.selectorText || '')));
                } catch (e) { return false; }
            })));

        // 2026-09-04 — Le statut ne se changeait que depuis Chiffrage, sur une
        // pastille posée près des flèches Annuler / Rétablir. C'est pourtant
        // ICI qu'on télécharge et qu'on envoie, et un devis naît « brouillon » :
        // tous les devis le restaient, et le tampon s'imprimait sur 100 % des
        // documents envoyés aux clients.
        const selecteurStatut = await page.evaluate(() =>
            !!document.querySelector('select[aria-label="Statut du devis"]'));
        ok('Le statut se change depuis l’écran d’où l’on envoie', selecteurStatut);

        await page.evaluate(() => {
            const sel = document.querySelector('select[aria-label="Statut du devis"]');
            if (!sel) return;
            Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set.call(sel, 'ready');
            sel.dispatchEvent(new Event('change', { bubbles: true }));
        });
        await wait(1400);
        const pret = await tampon(page);
        // Le tampon excluait « accepté » et « approuvé » seulement : un devis
        // marqué « Prêt » sortait tamponné « PRÊT », ce qui n'alerte de rien.
        ok(`Un devis marqué « Prêt » ne porte plus aucun tampon — ${pret.libelle || 'aucun'}`,
            pret.present === false);

        // Le chemin hors ligne écrivait `documentTemplates` dans localStorage
        // sans que rien ne le relise : le modèle réglé sans réseau disparaissait
        // au premier rechargement, en silence. La page vient d'être rechargée —
        // le document doit encore porter la couleur enregistrée.
        const apresRechargement = await couleurTitreDocument(page, false);
        ok(`Un modèle enregistré hors ligne survit au rechargement — ${apresRechargement}`,
            apresRechargement === 'rgb(15, 118, 110)');

        // ── Plusieurs modèles coexistent, un seul par défaut ──────────────
        // La première version du chemin hors ligne remplaçait la liste entière
        // par le modèle en cours : créer un second écrasait le premier, sans
        // un mot. C'est le genre de perte qu'on ne remarque qu'après.
        await cliquer(page, 'Paramètres du Compte');
        await wait(1700);
        await cliquer(page, 'Documents');
        await wait(1700);
        await cliquer(page, 'Éditeur de modèles');
        await wait(2000);

        const creerModele = async (nom, couleur) => {
            await page.evaluate(() => {
                const g = document.querySelector('[role="dialog"][aria-label*="Modèles"]');
                if (!g) return;
                const b = [...g.querySelectorAll('button')]
                    .find((x) => /Nouveau modèle|Choisir un modèle|Créer un premier modèle/.test(x.textContent || ''));
                if (b) b.click();
            });
            await wait(1800);
            await passerParLeCatalogue();
            await page.evaluate(({ nom, couleur }) => {
                const d = document.querySelector('[role="dialog"][aria-label*="Éditeur de modèle"]');
                if (!d) return;
                const set = (el, v) => {
                    if (!el) return;
                    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, v);
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                };
                set(d.querySelector('input[aria-label="Nom du modèle"]'), nom);
                set([...d.querySelectorAll('input[type="color"]')][0], couleur);
            }, { nom, couleur });
            await wait(1100);
            await page.evaluate(() => {
                const d = document.querySelector('[role="dialog"][aria-label*="Éditeur de modèle"]');
                if (!d) return;
                const b = [...d.querySelectorAll('button')].find((x) => /^Enregistrer$/.test(x.textContent.trim()));
                if (b) b.click();
            });
            await wait(2400);
        };

        await creerModele('Devis standard', '#2f3fa8');
        await creerModele('Appel d’offres', '#b45309');

        const parc = await page.evaluate(() => {
            const g = document.querySelector('[role="dialog"][aria-label*="Modèles"]');
            if (!g) return { galerie: false };
            return {
                galerie: true,
                modeles: [...g.querySelectorAll('h3')].map((h) => h.textContent.trim()),
                nbParDefaut: [...g.querySelectorAll('span')].filter((x) => /PAR DÉFAUT/i.test(x.textContent)).length
            };
        });
        ok('Enregistrer ramène à la galerie, y compris hors ligne', parc.galerie);
        ok(`Trois modèles coexistent — ${JSON.stringify(parc.modeles)}`,
            (parc.modeles || []).length === 3);
        ok(`Un seul modèle porte le badge « par défaut » — ${parc.nbParDefaut}`, parc.nbParDefaut === 1);

        // ── Supprimer un modèle rend la mise en page d'avant ──────────────
        // Jusqu'au 2026-09-04, l'éditeur reportait ses valeurs dans les
        // réglages de l'entreprise pour avoir un effet réel. Le report allait
        // dans un seul sens : supprimer un modèle ne défaisait pas ce qu'il
        // avait écrit. Constaté sur un compte réel — la couleur d'un modèle de
        // test supprimé était restée en place, et les documents avec.
        //
        // Le document lit maintenant le modèle directement. Ce banc protège le
        // cycle complet : sans modèle → avec → sans, et la couleur doit revenir.
        const couleurDuDocumentReel = async () => {
            await page.evaluate(() => {
                const b = [...document.querySelectorAll('aside button')].find((x) => (x.textContent || '').trim().startsWith('Mes devis'));
                if (b) b.click();
            });
            await wait(1800);
            await page.evaluate(() => { const tr = document.querySelector('tbody tr'); if (tr) tr.click(); });
            await wait(2400);
            return couleurTitreDocument(page, false);
        };

        const fermerGalerie = async () => {
            await page.evaluate(() => {
                const g = document.querySelector('[role="dialog"][aria-label*="Modèles"]');
                if (!g) return;
                const b = [...g.querySelectorAll('button')].find((x) => /^Fermer$/.test(x.textContent.trim()));
                if (b) b.click();
            });
            await wait(1400);
        };

        await fermerGalerie();
        const avecModele = await couleurDuDocumentReel();
        // Créer un modèle ne doit RIEN changer aux documents émis : le premier
        // enregistré porte le défaut, les suivants attendent qu'on le leur
        // donne. `modeleDepuisReglages` renvoyait par_defaut:true pour tous —
        // en base, le second heurtait l'index unique ; hors ligne, il volait
        // silencieusement le défaut au premier.
        ok(`Créer un modèle ne change pas les documents émis — ${avecModele}`,
            avecModele === 'rgb(15, 118, 110)');

        await cliquer(page, 'Paramètres du Compte'); await wait(1700);
        await cliquer(page, 'Documents'); await wait(1700);
        await cliquer(page, 'Éditeur de modèles'); await wait(2000);
        await page.evaluate(() => {
            const g = document.querySelector('[role="dialog"][aria-label*="Modèles"]');
            const b = g && [...g.querySelectorAll('button')]
                .find((x) => /^Utiliser Appel d’offres par défaut$/.test(x.getAttribute('aria-label') || ''));
            if (b) b.click();
        });
        await wait(1600);
        await fermerGalerie();
        const apresBascule = await couleurDuDocumentReel();
        ok(`Désigner un autre modèle par défaut change le document — ${apresBascule}`,
            apresBascule === 'rgb(180, 83, 9)');

        await cliquer(page, 'Paramètres du Compte'); await wait(1700);
        await cliquer(page, 'Documents'); await wait(1700);
        await cliquer(page, 'Éditeur de modèles'); await wait(2000);
        // Supprimer TOUS les modèles pour revenir à l'état sans modèle.
        for (let i = 0; i < 6; i++) {
            const reste = await page.evaluate(() => {
                const g = document.querySelector('[role="dialog"][aria-label*="Modèles"]');
                if (!g) return false;
                const b = [...g.querySelectorAll('button')].find((x) => /^Supprimer le modèle /.test(x.getAttribute('aria-label') || ''));
                if (b) { b.click(); return true; }
                return false;
            });
            if (!reste) break;
            await wait(1200);
            await page.evaluate(() => {
                const d = [...document.querySelectorAll('[role="dialog"]')].filter((x) => x.getBoundingClientRect().width > 0).pop();
                const c = d && [...d.querySelectorAll('button')].find((x) => /^Supprimer$/.test(x.textContent.trim()));
                if (c) c.click();
            });
            await wait(2400);
        }
        // 2026-09-04 — La galerie n'est plus jamais vide : toute organisation
        // part du préétabli « Standard », implicite tant qu'aucun modèle n'est
        // enregistré. Supprimer les modèles enregistrés y ramène, au lieu de
        // laisser un écran sans rien et un document sans mise en page.
        const apresSuppressions = await page.evaluate(() => {
            const g = document.querySelector('[role="dialog"][aria-label*="Modèles"]');
            if (!g) return null;
            const titres = [...g.querySelectorAll('h3')].map((h) => h.textContent.trim());
            return {
                titres,
                supprimable: [...g.querySelectorAll('button')]
                    .some((b) => /^Supprimer le modèle /.test(b.getAttribute('aria-label') || ''))
            };
        });
        ok(`Tous les modèles enregistrés peuvent être supprimés — il reste ${JSON.stringify(apresSuppressions.titres)}`,
            apresSuppressions && apresSuppressions.titres.length === 1
            && apresSuppressions.titres[0] === 'Standard');
        // Le Standard implicite n'existe pas en base : le supprimer laisserait
        // l'organisation sans aucune mise en page.
        ok('Le Standard implicite ne peut pas être supprimé', apresSuppressions.supprimable === false);

        await fermerGalerie();
        const sansModele = await couleurDuDocumentReel();
        ok(`Revenu au Standard implicite, le document reprend la couleur de l’organisation — ${sansModele}`,
            sansModele === 'rgb(59, 91, 219)');
    } finally {
        await close();
    }

    return results;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    const results = await run();
    for (const r of results) console.log(`  ${r.pass ? '✅' : '❌'} ${r.label}${r.detail ? ' — ' + r.detail : ''}`);
    process.exit(results.every((r) => r.pass) ? 0 : 1);
}
