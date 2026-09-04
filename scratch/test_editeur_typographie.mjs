// Banc d'essai — taille du texte, encre, marges et aperçu PDF (2026-09-04).
//
// L'éditeur déclarait quatre réglages qui ne pilotaient rien (marges,
// orientation, numéro de page, titre d'étude) et n'offrait AUCUN contrôle de
// taille — un bordereau de 80 lignes et une proposition de 6 postes sortaient
// au même corps. Ce banc protège les quatre points qui comptent :
//
//  1. À 100 %, le document ne bouge pas d'un pixel. C'est la condition pour
//     livrer ce réglage sans retoucher les devis déjà émis.
//
//  2. Les tailles ne se COMPOSENT pas. Première version écrite en `em` : le
//     tableau porte `text-xs`, la bande d'en-tête de lot qu'il contient porte
//     `text-[11px]`, et deux `em` imbriqués la faisaient sortir à 8,25 px au
//     lieu de 11. Le rapport entre les deux doit rester constant à toutes les
//     échelles — c'est ce qui distingue une variable d'un `em`.
//
//  3. L'encre ne repeint que les textes forts. Repeindre aussi les gris
//     secondaires permettrait de produire un document illisible en un clic.
//
//  4. Les marges existent dans le PDF, donc l'aperçu doit les montrer : sans
//     cadre, on les réglerait à l'aveugle.
import { pathToFileURL, fileURLToPath } from 'node:url';
import { launchApp, enterGuestMode } from './lib/harness.mjs';

const wait = (ms = 900) => new Promise((r) => setTimeout(r, ms));
const ED = '[role="dialog"][aria-label*="Éditeur de modèle"]';
const GAL = '[role="dialog"][aria-label*="Modèles"]';

const cliquer = (page, motif) => page.evaluate((t) => {
    const b = [...document.querySelectorAll('button')]
        .filter((x) => x.getBoundingClientRect().width > 0)
        .find((x) => new RegExp(t, 'i').test(x.textContent || ''));
    if (b) b.click();
    return !!b;
}, motif);

const typographie = (page, racine) => page.evaluate((sel) => {
    const hote = sel ? document.querySelector(sel) : document;
    const z = hote && hote.querySelector('[data-zone-impression]');
    if (!z) return null;
    const px = (el) => (el ? parseFloat(getComputedStyle(el).fontSize) : null);
    const couleur = (el) => (el ? getComputedStyle(el).color : null);
    const cellules = [...z.querySelectorAll('table tbody td')];
    return {
        titre: px(z.querySelector('h2')),
        tableau: px(z.querySelector('table')),
        bandeLot: px(cellules.find((t) => t.hasAttribute('colspan'))),
        cellule: px(cellules.find((t) => !t.hasAttribute('colspan'))),
        mentions: px([...z.querySelectorAll('p')].find((p) => /NIF:/.test(p.textContent || ''))),
        couleurForte: couleur([...z.querySelectorAll('.text-neutral-900')][0]),
        couleurFaible: couleur([...z.querySelectorAll('.text-neutral-500')][0]),
        cadre: getComputedStyle(z).borderTopWidth,
        rayon: getComputedStyle(z).borderTopLeftRadius,
        // Le blanc AVANT chaque lot : mesuré sur la deuxième bande, la première
        // ne devant jamais en porter. Les bandes sont repérées par
        // `data-entete-lot` — le libellé diffère entre synthèse et détaillé.
        espaceLot1: (() => {
            const b = z.querySelector('[data-entete-lot="0"]');
            return b ? getComputedStyle(b).paddingTop : null;
        })(),
        espaceLot2: (() => {
            const b = z.querySelector('[data-entete-lot="1"]');
            return b ? getComputedStyle(b).paddingTop : null;
        })(),
        // Le tampon de statut : bandeau pleine largeur avant le 2026-09-04,
        // tag d'angle discret depuis. On mesure sa LARGEUR : un bandeau occupe
        // toute la colonne, un tag quelques dizaines de pixels.
        tagStatut: (() => {
            const t = [...z.querySelectorAll('div')]
                .find((d) => /^Statut du document/.test(d.getAttribute('aria-label') || ''));
            if (!t) return null;
            const r = t.getBoundingClientRect();
            const zr = z.getBoundingClientRect();
            return { largeur: Math.round(r.width), part: r.width / zr.width, position: getComputedStyle(t).position };
        })(),
        fond: getComputedStyle(z).backgroundColor,
        imageFond: getComputedStyle(z).backgroundImage,
        positionFond: getComputedStyle(z).backgroundSize,
        etiquette: (() => {
            const e = [...z.querySelectorAll('.text-neutral-500')][0];
            return e ? getComputedStyle(e).color : null;
        })(),
        papier: { format: z.getAttribute('data-format-papier'), orientation: z.getAttribute('data-orientation') },
        piedGras: (() => {
            const p = [...z.querySelectorAll('div')].find((d) => /whitespace-pre-line/.test(d.className || ''));
            return p ? { gras: p.querySelectorAll('strong').length, aligne: getComputedStyle(p).textAlign,
                         texte: p.innerText.trim().slice(0, 60) } : null;
        })(),
        numeroPage: {
            actif: z.getAttribute('data-numeroter-pages'),
            position: z.getAttribute('data-position-numero'),
            format: z.getAttribute('data-format-numero'),
            document: z.getAttribute('data-numero-document')
        },
        rayonEntete: (() => {
            const th = z.querySelector('table thead th');
            return th ? getComputedStyle(th).borderTopLeftRadius : null;
        })(),
        separateurs: (() => {
            const tb = z.querySelector('table tbody');
            if (!tb) return null;
            const lignes = [...tb.querySelectorAll('tr')].filter((t) => !t.querySelector('td[colspan]'));
            return {
                filets: tb.className.includes('divide-y'),
                fonds: [...new Set(lignes.slice(0, 6).map((t) => getComputedStyle(t).backgroundColor))].length
            };
        })(),
        celluleHaut: (() => {
            const td = [...z.querySelectorAll('table tbody td')].find((t) => !t.hasAttribute('colspan'));
            return td ? getComputedStyle(td).paddingTop : null;
        })(),
        margesAttribut: z.getAttribute('data-marges-mm'),
        numerotation: z.getAttribute('data-numeroter-pages'),
        cadreHaut: z.parentElement ? getComputedStyle(z.parentElement).paddingTop : null
    };
}, racine || null);

export async function run() {
    const results = [];
    const ok = (label, cond, detail = '') => results.push({ label, pass: !!cond, detail });
    const proche = (a, b, tol = 0.6) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tol;

    const { page, close } = await launchApp();
    try {
        await page.setViewport({ width: 1600, height: 1000 });
        await enterGuestMode(page, { demo: true });
        await wait(2400);

        // ── Le document tel qu'il sort aujourd'hui, sans aucun modèle ─────
        await page.evaluate(() => {
            const b = [...document.querySelectorAll('aside button')]
                .find((x) => (x.textContent || '').trim().startsWith('Mes devis'));
            if (b) b.click();
        });
        await wait(1800);
        await page.evaluate(() => { const tr = document.querySelector('tbody tr'); if (tr) tr.click(); });
        await wait(2500);
        const reference = await typographie(page, null);

        ok(`Sans modèle, la typographie est celle d’avant — titre ${reference.titre}px, tableau ${reference.tableau}px, bande ${reference.bandeLot}px`,
            proche(reference.titre, 24) && proche(reference.tableau, 12)
            && proche(reference.bandeLot, 11) && proche(reference.mentions, 11));
        ok(`Le document annonce ses marges de page — ${reference.margesAttribut}`,
            /"haut":8/.test(reference.margesAttribut || ''));
        ok('Aucune numérotation par défaut : un devis déjà émis ne change pas d’apparence',
            reference.numerotation === null);

        // ── Dans l'éditeur ────────────────────────────────────────────────
        await cliquer(page, 'Paramètres du Compte'); await wait(1700);
        await cliquer(page, 'Documents'); await wait(1700);
        await cliquer(page, 'Éditeur de modèles'); await wait(2200);
        await page.evaluate((sel) => {
            const g = document.querySelector(sel);
            const b = g && [...g.querySelectorAll('button')]
                .find((x) => /Nouveau modèle|Choisir un modèle|Créer un premier/.test(x.textContent || ''));
            if (b) b.click();
        }, GAL);
        await wait(2000);
        await page.evaluate(() => {
            const c = document.querySelector('[role="dialog"][aria-label="Choisir un modèle"]');
            const b = c && [...c.querySelectorAll('button')].find((x) => /Repartir de zéro/.test(x.textContent || ''));
            if (b) b.click();
        });
        await wait(2000);

        const cent = await typographie(page, ED);
        ok(`À 100 %, l’aperçu reproduit le document de référence — ${cent.titre}/${cent.tableau}/${cent.bandeLot}`,
            proche(cent.titre, reference.titre) && proche(cent.tableau, reference.tableau)
            && proche(cent.bandeLot, reference.bandeLot));

        const reglerEchelle = async (valeur) => {
            await page.evaluate((v) => {
                const d = document.querySelector('[role="dialog"][aria-label*="Éditeur de modèle"]');
                const r = [...d.querySelectorAll('input[type="range"]')]
                    .find((x) => /Taille du texte/i.test(x.getAttribute('aria-label') || ''));
                if (!r) return;
                Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(r, String(v));
                r.dispatchEvent(new Event('input', { bubbles: true }));
            }, valeur);
            await wait(900);
            return typographie(page, ED);
        };

        ok('Le curseur de taille du texte est proposé',
            await page.evaluate((sel) => [...document.querySelector(sel).querySelectorAll('input[type="range"]')]
                .some((x) => /Taille du texte/i.test(x.getAttribute('aria-label') || '')), ED));

        const grand = await reglerEchelle(130);
        ok(`130 % agrandit tout le document — titre ${cent.titre} → ${grand.titre}px, tableau ${cent.tableau} → ${grand.tableau}px`,
            proche(grand.titre, cent.titre * 1.3) && proche(grand.tableau, cent.tableau * 1.3));

        const petit = await reglerEchelle(80);
        ok(`80 % le resserre — tableau ${cent.tableau} → ${petit.tableau}px`,
            proche(petit.tableau, cent.tableau * 0.8));

        // LE point de régression : en `em`, la bande d'en-tête de lot héritait
        // deux fois de l'échelle et sortait à 8,25 px au lieu de 11.
        const rapport = (t) => t.bandeLot / t.tableau;
        ok(`Les tailles ne se composent pas — rapport bande/tableau ${rapport(cent).toFixed(4)} · ${rapport(grand).toFixed(4)} · ${rapport(petit).toFixed(4)}`,
            Math.abs(rapport(cent) - rapport(grand)) < 0.02 && Math.abs(rapport(cent) - rapport(petit)) < 0.02
            && Math.abs(rapport(cent) - 11 / 12) < 0.02);

        await reglerEchelle(100);

        // ── L'encre ───────────────────────────────────────────────────────
        const avantEncre = await typographie(page, ED);
        await page.evaluate((sel) => {
            const d = document.querySelector(sel);
            const champ = [...d.querySelectorAll('input[type="color"]')]
                .find((x) => /Couleur du texte/i.test(x.getAttribute('aria-label') || ''));
            if (!champ) return;
            Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(champ, '#7c2d12');
            champ.dispatchEvent(new Event('input', { bubbles: true }));
        }, ED);
        await wait(900);
        const apresEncre = await typographie(page, ED);
        ok(`L’encre repeint les textes forts — ${avantEncre.couleurForte} → ${apresEncre.couleurForte}`,
            apresEncre.couleurForte === 'rgb(124, 45, 18)');
        ok(`…et laisse les mentions secondaires en gris — ${apresEncre.couleurFaible}`,
            apresEncre.couleurFaible === avantEncre.couleurFaible);

        // ── Les marges ────────────────────────────────────────────────────
        const cadreAvant = parseFloat(avantEncre.cadreHaut);
        await page.evaluate((sel) => {
            const d = document.querySelector(sel);
            const champ = [...d.querySelectorAll('input[type="number"]')]
                .find((x) => /Marge haut/i.test(x.getAttribute('aria-label') || ''));
            if (!champ) return;
            Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(champ, '30');
            champ.dispatchEvent(new Event('input', { bubbles: true }));
        }, ED);
        await wait(900);
        const apresMarge = await typographie(page, ED);
        ok(`L’aperçu montre le cadre des marges — ${cadreAvant}px → ${parseFloat(apresMarge.cadreHaut)}px`,
            parseFloat(apresMarge.cadreHaut) > cadreAvant * 2);
        ok(`Le document emporte ses marges vers le PDF — ${apresMarge.margesAttribut}`,
            /"haut":30/.test(apresMarge.margesAttribut || ''));

        // ── La numérotation ───────────────────────────────────────────────
        await page.evaluate((sel) => {
            const d = document.querySelector(sel);
            const b = [...d.querySelectorAll('nav button')].find((x) => /Pied de page/.test(x.innerText));
            if (b) b.click();
        }, ED);
        await wait(1200);
        await page.evaluate((sel) => {
            const d = document.querySelector(sel);
            const l = [...d.querySelectorAll('label')].find((x) => /Numéroter les pages/.test(x.textContent || ''));
            const cb = l && l.querySelector('input[type="checkbox"]');
            if (cb) cb.click();
        }, ED);
        await wait(900);
        ok('Cocher « Numéroter les pages » se transmet au PDF',
            (await typographie(page, ED)).numerotation === '1');

        // ── Le cadre autour du document ───────────────────────────────────
        // Signalé sur capture : « masquer le rectangle qui entoure le contenu
        // devis / facture ». Ce liseré est une commodité d'écran, mais
        // html2canvas le rend tel quel — il s'imprimait sur le PDF.
        await page.evaluate((sel) => {
            const d = document.querySelector(sel);
            const b = [...d.querySelectorAll('nav button')].find((x) => /Général/.test(x.innerText));
            if (b) b.click();
        }, ED);
        await wait(1200);
        const avecCadre = await typographie(page, ED);
        ok(`Le document est encadré par défaut — bordure ${avecCadre.cadre}, rayon ${avecCadre.rayon}`,
            parseFloat(avecCadre.cadre) > 0 && parseFloat(avecCadre.rayon) > 0);
        await page.evaluate((sel) => {
            const d = document.querySelector(sel);
            const l = [...d.querySelectorAll('label')].find((x) => /Encadrer le document/.test(x.textContent || ''));
            const cb = l && l.querySelector('input[type="checkbox"]');
            if (cb) cb.click();
        }, ED);
        await wait(900);
        const sansCadre = await typographie(page, ED);
        ok(`Décoché, le rectangle disparaît — bordure ${sansCadre.cadre}, rayon ${sansCadre.rayon}`,
            parseFloat(sansCadre.cadre) === 0 && parseFloat(sansCadre.rayon) === 0);

        // ── L'espacement des lots et des ouvrages ─────────────────────────
        // Signalé sur capture : « voir comment gérer l'espacement des lots /
        // ouvrage et contenu ».
        await page.evaluate((sel) => {
            const d = document.querySelector(sel);
            const b = [...d.querySelectorAll('nav button')].find((x) => /Tableau/.test(x.innerText));
            if (b) b.click();
        }, ED);
        await wait(1200);

        const interligne = async (id) => {
            await page.evaluate(({ sel, id }) => {
                const d = document.querySelector(sel);
                // Le libellé est dans le premier <span> du bouton ; `textContent`
                // colle le titre et sa description sans séparateur.
                const b = [...d.querySelectorAll('button')]
                    .find((x) => {
                        const t = x.querySelector('span');
                        return t && t.textContent.trim() === id;
                    });
                if (b) b.click();
            }, { sel: ED, id });
            await wait(900);
            return typographie(page, ED);
        };
        const aeree = await interligne('Aérée');
        const normale = await interligne('Normale');
        const compacte = await interligne('Compacte');
        ok(`Trois interlignes, réellement distincts — aérée ${aeree.celluleHaut}, normale ${normale.celluleHaut}, compacte ${compacte.celluleHaut}`,
            parseFloat(aeree.celluleHaut) > parseFloat(normale.celluleHaut)
            && parseFloat(normale.celluleHaut) > parseFloat(compacte.celluleHaut));

        await interligne('Normale');
        const avantEspace = await typographie(page, ED);
        await page.evaluate((sel) => {
            const d = document.querySelector(sel);
            const r = [...d.querySelectorAll('input[type="range"]')]
                .find((x) => /Espace entre les lots/i.test(x.getAttribute('aria-label') || ''));
            if (!r) return;
            Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(r, '32');
            r.dispatchEvent(new Event('input', { bubbles: true }));
        }, ED);
        await wait(900);
        const apresEspace = await typographie(page, ED);
        ok(`L’espace entre les lots s’ouvre — ${avantEspace.espaceLot2} → ${apresEspace.espaceLot2}`,
            avantEspace.espaceLot2 !== null
            && parseFloat(apresEspace.espaceLot2) > parseFloat(avantEspace.espaceLot2) + 20);
        // Le premier lot ne doit PAS être décollé de l'en-tête du tableau :
        // l'espace sépare les lots entre eux, il n'ouvre pas le tableau.
        ok(`Le premier lot reste collé à l’en-tête — ${apresEspace.espaceLot1}`,
            apresEspace.espaceLot1 === avantEspace.espaceLot1);

        // Le tag de statut se vérifie dans test_editeur_modeles : c'est là
        // qu'un devis est passé en brouillon. Le devis de démonstration est
        // « approuvé », il ne porte donc légitimement aucun tampon.
        const avecTag = await typographie(page, ED);
        ok('Un devis approuvé ne porte aucun tag de statut', avecTag.tagStatut === null);

        // ── L'arrondi des angles ──────────────────────────────────────────
        await page.evaluate((sel) => {
            const d = document.querySelector(sel);
            const b = [...d.querySelectorAll('nav button')].find((x) => /Général/.test(x.innerText));
            if (b) b.click();
        }, ED);
        await wait(1100);
        await page.evaluate((sel) => {
            const d = document.querySelector(sel);
            const r = [...d.querySelectorAll('input[type="range"]')]
                .find((x) => /Arrondi des angles/i.test(x.getAttribute('aria-label') || ''));
            if (!r) return;
            Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(r, '0');
            r.dispatchEvent(new Event('input', { bubbles: true }));
        }, ED);
        await wait(900);
        const carre = await typographie(page, ED);
        ok(`L’arrondi se règle jusqu’au carré — ${avecTag.rayonEntete} → ${carre.rayonEntete}`,
            parseFloat(avecTag.rayonEntete) > 0 && parseFloat(carre.rayonEntete) === 0);

        // ── Séparation des lignes ─────────────────────────────────────────
        await page.evaluate((sel) => {
            const d = document.querySelector(sel);
            const b = [...d.querySelectorAll('nav button')].find((x) => /Tableau/.test(x.innerText));
            if (b) b.click();
        }, ED);
        await wait(1100);
        const choisirSeparation = async (libelle) => {
            await page.evaluate(({ sel, libelle }) => {
                const d = document.querySelector(sel);
                const b = [...d.querySelectorAll('button')].find((x) => {
                    const t = x.querySelector('span');
                    return t && t.textContent.trim() === libelle;
                });
                if (b) b.click();
            }, { sel: ED, libelle });
            await wait(900);
            return typographie(page, ED);
        };
        const filets = await choisirSeparation('Filets');
        const zebre = await choisirSeparation('Alternée');
        const aucune = await choisirSeparation('Aucune');
        ok(`Filets : un trait entre les lignes — divide-y=${filets.separateurs.filets}`,
            filets.separateurs.filets === true);
        ok(`Alternée : une ligne sur deux prend un fond — ${zebre.separateurs.fonds} fonds distincts`,
            zebre.separateurs.filets === false && zebre.separateurs.fonds >= 2);
        ok(`Aucune : ni trait ni fond — ${aucune.separateurs.fonds} fond(s)`,
            aucune.separateurs.filets === false && aucune.separateurs.fonds === 1);
        await choisirSeparation('Filets');

        // ── Respiration sous l'en-tête de lot ─────────────────────────────
        const avantSousLot = await typographie(page, ED);
        await page.evaluate((sel) => {
            const d = document.querySelector(sel);
            const r = [...d.querySelectorAll('input[type="range"]')]
                .find((x) => /Espace sous l’en-tête de lot/i.test(x.getAttribute('aria-label') || ''));
            if (!r) return;
            Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(r, '24');
            r.dispatchEvent(new Event('input', { bubbles: true }));
        }, ED);
        await wait(900);
        const apresSousLot = await page.evaluate((sel) => {
            const z = document.querySelector(sel).querySelector('[data-zone-impression]');
            const b = z.querySelector('[data-entete-lot="0"]');
            return b ? getComputedStyle(b).paddingBottom : null;
        }, ED);
        ok(`La bande de lot se décolle de ses lignes — ${avantSousLot.espaceLot1} → ${apresSousLot} sous la bande`,
            parseFloat(apresSousLot) >= 24);

        // ── Général : l'arrière-plan, qui manquait ────────────────────────
        await page.evaluate((sel) => {
            const d = document.querySelector(sel);
            const b = [...d.querySelectorAll('nav button')].find((x) => /Général/.test(x.innerText));
            if (b) b.click();
        }, ED);
        await wait(1100);
        const avantFond = await typographie(page, ED);
        await page.evaluate((sel) => {
            const d = document.querySelector(sel);
            const champ = [...d.querySelectorAll('input[type="color"]')]
                .find((x) => /arrière-plan/i.test(x.getAttribute('aria-label') || ''));
            if (!champ) return;
            Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(champ, '#fdf6e3');
            champ.dispatchEvent(new Event('input', { bubbles: true }));
        }, ED);
        await wait(900);
        const apresFond = await typographie(page, ED);
        ok(`L’arrière-plan du document se règle — ${avantFond.fond} → ${apresFond.fond}`,
            apresFond.fond === 'rgb(253, 246, 227)' && apresFond.fond !== avantFond.fond);
        // ── Couleur des étiquettes, séparée de l'encre du corps ───────────
        await page.evaluate((sel) => {
            const d = document.querySelector(sel);
            const champ = [...d.querySelectorAll('input[type="color"]')]
                .find((x) => /étiquettes/i.test(x.getAttribute('aria-label') || ''));
            if (!champ) return;
            Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(champ, '#0b7285');
            champ.dispatchEvent(new Event('input', { bubbles: true }));
        }, ED);
        await wait(900);
        const avecEtiquettes = await typographie(page, ED);
        ok(`Les étiquettes se colorent indépendamment du corps — ${avantFond.etiquette} → ${avecEtiquettes.etiquette}`,
            avecEtiquettes.etiquette === 'rgb(11, 114, 133)'
            && avecEtiquettes.couleurForte !== avecEtiquettes.etiquette);

        // ── L'aperçu se repagine ──────────────────────────────────────────
        // Signalé : « la page ne se rafraîchit pas lorsqu'on change de format,
        // il y a aussi pas mal de réglages qui ne sont pas instantanément
        // visibles à l'écran ». C'était vrai : format, orientation et
        // numérotation ne changeaient RIEN à l'aperçu, et l'écran s'en
        // excusait en petits caractères au lieu de montrer.
        // Le titre de l'aperçu, et non le bouton « Aperçu PDF » de la barre du
        // haut : une recherche sur le texte les confondait, et faisait échouer
        // la mesure sur un défaut qui n'existait pas.
        const coupures = () => page.evaluate((sel) => {
            const d = document.querySelector(sel);
            const titre = [...d.querySelectorAll('p')]
                .find((x) => /^Aperçu\b/.test((x.textContent || '').trim()));
            return {
                traits: d.querySelectorAll('[data-bande-page]').length,
                entete: titre ? titre.textContent.trim() : ''
            };
        }, ED);
        const portrait = await coupures();
        ok(`L’aperçu marque les coupures de page — ${portrait.traits} coupure(s), « ${portrait.entete.trim()} »`,
            portrait.traits >= 1 && /portrait/i.test(portrait.entete));

        // ── Format et orientation, réellement transmis ────────────────────
        ok(`Le document part en A4 portrait — ${avecEtiquettes.papier.format} ${avecEtiquettes.papier.orientation}`,
            avecEtiquettes.papier.format === 'A4' && avecEtiquettes.papier.orientation === 'portrait');
        await page.evaluate((sel) => {
            const d = document.querySelector(sel);
            const a5 = [...d.querySelectorAll('button')].find((x) => x.textContent.trim() === 'A5');
            if (a5) a5.click();
            const p = [...d.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Paysage');
            if (p) p.click();
        }, ED);
        await wait(900);
        const autrePapier = (await typographie(page, ED)).papier;
        ok(`Format et orientation voyagent vers le PDF — ${autrePapier.format} ${autrePapier.orientation}`,
            autrePapier.format === 'A5' && autrePapier.orientation === 'paysage');
        // En paysage la page est moins haute : les coupures se rapprochent, et
        // il y en a donc davantage pour un même document.
        const paysage = await coupures();
        ok(`En paysage, les coupures se rapprochent — ${portrait.traits} → ${paysage.traits}`,
            paysage.traits > portrait.traits && /paysage/i.test(paysage.entete));
        await page.evaluate((sel) => {
            const d = document.querySelector(sel);
            const a4 = [...d.querySelectorAll('button')].find((x) => x.textContent.trim() === 'A4');
            if (a4) a4.click();
            const p = [...d.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Portrait');
            if (p) p.click();
        }, ED);
        await wait(700);

        // ── Image d'arrière-plan ──────────────────────────────────────────
        ok('Aucune image de fond par défaut',
            (await typographie(page, ED)).imageFond === 'none');
        const champImage = await page.$(`${ED} input[type="file"]`);
        if (champImage) {
            await champImage.uploadFile(fileURLToPath(new URL('./fixtures/logo_test.png', import.meta.url)));
            await wait(2200);
        }
        const avecImage = await typographie(page, ED);
        ok(`L’image d’arrière-plan se pose derrière le document — ${String(avecImage.imageFond).slice(0, 24)}…`,
            /^url\("data:image/.test(avecImage.imageFond || ''));
        await page.evaluate((sel) => {
            const d = document.querySelector(sel);
            const b = [...d.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Mosaïque');
            if (b) b.click();
        }, ED);
        await wait(800);
        ok('Sa position se règle — mosaïque répète le motif',
            (await typographie(page, ED)).positionFond === 'auto');

        ok('Les propriétés du modèle sont annoncées dans Général',
            await page.evaluate((sel) => /Propriétés du modèle/.test(document.querySelector(sel).textContent || ''), ED));

        // ── Pied de page : gras, alignement, numérotation ─────────────────
        await page.evaluate((sel) => {
            const d = document.querySelector(sel);
            const b = [...d.querySelectorAll('nav button')].find((x) => /Pied de page/.test(x.innerText));
            if (b) b.click();
        }, ED);
        await wait(1100);
        await page.evaluate((sel) => {
            const d = document.querySelector(sel);
            const t = d.querySelector('textarea');
            if (!t) return;
            Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
                .call(t, '**NIF:** 08 1128894f **RCCM:** MA.BKO215A');
            t.dispatchEvent(new Event('input', { bubbles: true }));
        }, ED);
        await wait(900);
        const pied = await typographie(page, ED);
        // ── Le pied de page est du MOBILIER, pas du contenu ───────────────
        // Signalé sur un PDF réel : la mention flottait au milieu de la feuille,
        // là où le bordereau s'arrêtait. « Le bas de page doit rester sur le bas
        // de page selon le format choisi, de manière automatique. »
        const mobilier = await page.evaluate((sel) => {
            const d = document.querySelector(sel);
            const z = d.querySelector('[data-zone-impression]');
            const enFlux = z.querySelector('[data-pied-en-flux]');
            // `data-bande-page` et non `.border-dashed` : le cadre « Bon pour
            // accord » du document porte lui aussi des tirets, et le sélecteur
            // large l'attrapait en premier.
            const bandes = [...d.querySelectorAll('[data-bande-page]')];
            return {
                horsCapture: !!(enFlux && enFlux.hasAttribute('data-hors-pdf')),
                masqueEnApercu: enFlux ? getComputedStyle(enFlux).display : null,
                bandes: bandes.length,
                texteBande: bandes.length ? bandes[0].innerText.trim().slice(0, 60) : '',
                attribut: (z.getAttribute('data-pied-texte') || '').slice(0, 40)
            };
        }, ED);
        ok('La mention de pied est retirée de la capture PDF', mobilier.horsCapture);
        ok(`…et masquée en fin de flux dans l’aperçu paginé — display=${mobilier.masqueEnApercu}`,
            mobilier.masqueEnApercu === 'none');
        ok(`Elle est dessinée dans la bande de chaque page — ${mobilier.bandes} bande(s)`,
            mobilier.bandes >= 1 && /Adresse|NIF|RCCM/.test(mobilier.texteBande));
        ok(`Elle voyage vers le PDF sans ses astérisques — « ${mobilier.attribut} »`,
            mobilier.attribut.length > 0 && !/\*\*/.test(mobilier.attribut));

        ok(`Le pied de page met en gras ce qui est entre astérisques — ${pied.piedGras && pied.piedGras.gras} passage(s)`,
            !!pied.piedGras && pied.piedGras.gras === 2
            && !/\*\*/.test(pied.piedGras.texte));

        await page.evaluate((sel) => {
            const d = document.querySelector(sel);
            const b = [...d.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Centré');
            if (b) b.click();
        }, ED);
        await wait(900);
        ok('La mention de pied de page s’aligne',
            (await typographie(page, ED)).piedGras.aligne === 'center');

        const numAvant = (await typographie(page, ED)).numeroPage;
        ok(`La numérotation part au centre, format « Page {page} / {total} » — ${numAvant.position} · ${numAvant.format}`,
            numAvant.position === 'centre' && numAvant.format === 'Page {page} / {total}');

        await page.evaluate((sel) => {
            const d = document.querySelector(sel);
            const b = [...d.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Droite');
            if (b) b.click();
            const f = [...d.querySelectorAll('button')].find((x) => x.textContent.trim() === '{document} — page {page}');
            if (f) f.click();
        }, ED);
        await wait(900);
        const numApres = (await typographie(page, ED)).numeroPage;
        ok(`Position et format voyagent vers le PDF — ${numApres.position} · ${numApres.format}`,
            numApres.position === 'droite' && numApres.format === '{document} — page {page}');
        ok(`Le numéro du document accompagne le jeton {document} — ${numApres.document}`,
            !!numApres.document && /DEV-/.test(numApres.document));

        // ── L'aperçu PDF ──────────────────────────────────────────────────
        ok('L’éditeur propose un aperçu PDF sans obliger à enregistrer',
            await page.evaluate((sel) => [...document.querySelector(sel).querySelectorAll('button')]
                .some((b) => /Aperçu PDF/.test(b.textContent || '')), ED));

        // ── La galerie : vignette et aperçu ───────────────────────────────
        await page.evaluate((sel) => {
            const d = document.querySelector(sel);
            const b = [...d.querySelectorAll('button')].find((x) => /^Enregistrer$/.test(x.textContent.trim()));
            if (b) b.click();
        }, ED);
        await wait(2600);
        const galerie = await page.evaluate((sel) => {
            const g = document.querySelector(sel);
            if (!g) return { ouverte: false };
            const carte = g.querySelector('.app-card');
            return {
                ouverte: true,
                vignette: !!(carte && carte.querySelector('[data-zone-impression]')),
                apercu: !!(carte && [...carte.querySelectorAll('button')].some((b) => /Aperçu PDF/.test(b.textContent || '')))
            };
        }, GAL);
        ok('La galerie montre le document en vignette, plus une liste de réglages', galerie.vignette);
        ok('Chaque modèle offre son aperçu PDF', galerie.apercu);

        await page.evaluate((sel) => {
            const g = document.querySelector(sel);
            const b = [...g.querySelectorAll('button')].find((x) => /Aperçu PDF/.test(x.textContent || ''));
            if (b) b.click();
        }, GAL);
        await wait(1800);
        const overlay = await page.evaluate(() => {
            const o = document.querySelector('[role="dialog"][aria-label^="Aperçu PDF"]');
            if (!o) return { ouvert: false };
            return {
                ouvert: true,
                document: !!o.querySelector('[data-zone-impression]'),
                telecharger: [...o.querySelectorAll('button')].some((b) => /Télécharger le PDF/.test(b.textContent || '')),
                margesAnnoncees: /mm/.test(o.innerText)
            };
        });
        ok('L’aperçu s’ouvre en plein format', overlay.ouvert && overlay.document);
        ok('Il propose le téléchargement du PDF', overlay.telecharger);
        ok('Il annonce les marges appliquées', overlay.margesAnnoncees);

        // ── Un seul endroit règle la mise en page ─────────────────────────
        // Signalé en production : un modèle réglé en noir à 85 % sortait un PDF
        // bleu à 100 %. Deux écrans réclamaient la même chose — l'éditeur, et
        // « Identité visuelle du PDF » dans les Paramètres — et un seul
        // décidait, sans que rien ne le dise.
        await page.evaluate(() => {
            const o = document.querySelector('[role="dialog"][aria-label^="Aperçu PDF"]');
            const b = o && [...o.querySelectorAll('button')].find((x) => /^Fermer$/.test(x.textContent.trim()));
            if (b) b.click();
        });
        await wait(1000);
        await page.evaluate((sel) => {
            const g = document.querySelector(sel);
            const b = g && [...g.querySelectorAll('button')].find((x) => /^Fermer$/.test(x.textContent.trim()));
            if (b) b.click();
        }, GAL);
        await wait(1400);
        const reglages = await page.evaluate(() => {
            const p = document.querySelector('.settings-page-shell');
            if (!p) return { ouvert: false };
            return {
                ouvert: true,
                doublons: p.querySelectorAll('input[type="color"]').length,
                promesse: /Identité visuelle du PDF/.test(p.innerText),
                renvoi: [...p.querySelectorAll('button')].some((b) => /Éditeur de modèles/.test(b.textContent || ''))
            };
        });
        ok('Les Paramètres n’offrent plus de couleur de document en double',
            reglages.ouvert && reglages.doublons === 0);
        ok('…ni la promesse « Identité visuelle du PDF » qui ne tenait plus',
            reglages.promesse === false);
        ok('Ils renvoient à l’éditeur, seul endroit qui décide', reglages.renvoi);

        // ── La facture suit le même modèle que le devis ───────────────────
        await page.evaluate(() => {
            const b = [...document.querySelectorAll('button')]
                .find((x) => /Retour à l’application|Retour à l'application/.test(x.textContent || ''));
            if (b) b.click();
        });
        await wait(1600);
        await page.evaluate(() => {
            const b = [...document.querySelectorAll('aside button')]
                .find((x) => (x.textContent || '').trim().startsWith('Factures'));
            if (b) b.click();
        });
        await wait(1800);
        await page.evaluate(() => {
            const b = [...document.querySelectorAll('button')]
                .find((x) => /Créer une facture depuis un devis/.test(x.getAttribute('aria-label') || ''));
            if (b) b.click();
        });
        await wait(1400);
        await page.evaluate(() => {
            const b = [...document.querySelectorAll('button')].find((x) => /DEV-/.test(x.textContent || ''));
            if (b) b.click();
        });
        await wait(2600);
        const facture = await page.evaluate(() => {
            const docs = [...document.querySelectorAll('.document-echelle')];
            const z = docs[docs.length - 1];
            if (!z) return null;
            const th = z.querySelector('table thead tr');
            return {
                trouvee: true,
                echelle: getComputedStyle(z).fontSize,
                bandeau: th ? getComputedStyle(th).backgroundColor : null,
                cadre: getComputedStyle(z).borderTopWidth
            };
        });
        // Le modèle enregistré plus haut porte encre brune, 100 % et cadre
        // décoché : la facture doit le refléter comme le devis.
        ok(`La facture lit le modèle actif — cadre ${facture && facture.cadre}`,
            !!facture && parseFloat(facture.cadre) === 0);
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
