// Utilitaires de formatage — pur JS, aucune dépendance React/JSX.
// Extrait de index_jsx.js le 2026-08-16 (PROJECT_MASTER_TRACKER.md § 15).
// Chargé en script classique AVANT app.compiled.js (voir index.html).
// Référentiel d'affichage monétaire V2. La devise est organisationnelle :
// aucune conversion ni aucun taux de change n'est appliqué ici.
const CURRENCY_OPTIONS = [
    { value: 'FCFA', code: 'XOF', label: 'XOF — Franc CFA (FCFA)' },
    { value: 'EUR', code: 'EUR', label: 'EUR — Euro (€)' },
    { value: 'USD', code: 'USD', label: 'USD — Dollar américain ($)' }
];

const normalizeCurrency = (currency) => {
    const raw = String(currency || 'FCFA').trim().toUpperCase();
    if (raw === 'XOF' || raw === 'CFA' || raw === 'F CFA' || raw === 'FCFA') return 'FCFA';
    if (raw === '€' || raw === 'EURO' || raw === 'EUR') return 'EUR';
    if (raw === '$' || raw === 'DOLLAR' || raw === 'USD') return 'USD';
    return String(currency || 'FCFA').trim() || 'FCFA';
};

const formatMoney = (amount, currency = 'FCFA') => {
    const normalized = normalizeCurrency(currency);
    if (isNaN(amount) || amount === null || amount === undefined) {
        return normalized === 'EUR' ? '0,00 €' : normalized === 'USD' ? '$0.00' : `0 ${normalized}`;
    }
    const rounded = Math.round(amount);
    if (normalized === 'EUR') {
        return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(rounded);
    }
    if (normalized === 'USD') {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(rounded);
    }
    if (normalized === 'FCFA') return `${rounded.toLocaleString('fr-FR')} FCFA`;
    return `${rounded.toLocaleString('fr-FR')} ${normalized}`;
};

// 2026-08-20 — "Mode: rectangle • 2m × 1m" affichait le nom interne du mode
// de métré (vocabulaire du moteur de calcul) à côté des dimensions, sur
// chaque ligne du tableau de devis. Comparé au motif des SaaS de devis du
// secteur (Jobber, Houzz Pro) : aucun ne montre ce genre de métadonnée
// technique, seulement l'info métier. Remplacé par cette fonction, qui
// choisit le bon champ selon le mode réel au lieu d'afficher toujours
// width/height (faux pour les modes surface/linéaire/unité, qui ne les
// utilisent pas).
const formatItemMetre = (calcForm) => {
    if (!calcForm) return '';
    const mode = calcForm.takeoffMode || 'rectangle';
    const num = (v) => {
        const n = parseFloat(v);
        return Number.isFinite(n) ? n : 0;
    };
    if (mode === 'volume') return `${num(calcForm.width)} × ${num(calcForm.height)} × ${num(calcForm.depth)} m`;
    if (mode === 'surface' || mode === 'floor') return `${num(calcForm.surfaceDirect)} m²`;
    if (mode === 'linear') return `${num(calcForm.lengthDirect)} ml`;
    if (mode === 'unit') return `${num(calcForm.qty) || 1} unité(s)`;
    return `${num(calcForm.width)} × ${num(calcForm.height)} m`;
};

// 2026-08-20 — Badge de marge par ligne (motif Houzz Pro : la rentabilité
// visible directement dans la liste, pas seulement au total du devis).
// Volontairement zéro clic — pas de popover à ouvrir : le % suffit pour
// juger d'un coup d'œil, le détail FCFA n'est que dans l'attribut title
// (survol). `revient`/`marge` valent `null` pour une ligne libre sans coût
// d'achat renseigné (`hasKnownCost` faux dans calc-engine.js) — dans ce cas
// aucune marge n'est calculable, on ne montre rien plutôt qu'un faux 0%.
const lineMarginInfo = (item, currency = 'FCFA') => {
    const qd = item && item.quoteData;
    if (!qd || qd.totalRevientConsomme == null || qd.margeValeurConsomme == null) return null;
    const netHT = qd.netHTConsomme ?? item.totalHT ?? 0;
    const marge = qd.margeValeurConsomme;
    const pct = netHT > 0 ? (marge / netHT) * 100 : 0;
    const isLoss = marge < 0;
    const sign = isLoss ? '' : '+';
    return {
        pct,
        isLoss,
        label: `${sign}${Math.round(pct)}%`,
        tooltip: `Coût de revient : ${formatMoney(qd.totalRevientConsomme, currency)} · Marge : ${sign}${formatMoney(marge, currency)}`
    };
};


// M2 (2026-08-18) — Recherche insensible aux accents. Un prospect qui tape
// "maconnerie" ou "etiquette" sans accent (courant sur clavier de téléphone)
// n'obtenait AUCUN résultat, même si l'ouvrage cherché existait — la
// comparaison ne normalisait ni le terme tapé ni le nom du catalogue.
// \p{Diacritic} nécessite le flag /u ; normalize('NFD') décompose d'abord
// chaque caractère accentué en lettre de base + diacritique séparé.
const normalizeSearchText = (s) => (s || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();

// 2026-08-20 — Logo entreprise (Paramètres du Compte → Documents & PDF).
// Aucune infrastructure de stockage fichier n'existe dans l'app (vérifié
// avant de commencer) : stocké en base64 directement dans company_settings
// plutôt que d'ajouter un bucket Supabase Storage — marche identiquement en
// Mode Démo local et en cloud, sans nouvelle dépendance. Contrepartie
// assumée : on redimensionne et recompresse côté navigateur avant
// l'enregistrement (via <canvas>), sinon une photo de logo à 5 Mo alourdit
// chaque sauvegarde et chaque chargement du devis. maxWidth=480 est large
// pour un usage en-tête de PDF (jamais affiché à plus d'une centaine de px
// de haut) ; qualité JPEG 0.85 reste net pour un logo à fond uni ou photo.
// Sortie en JPEG (pas de canal alpha) : un logo à fond transparent hérite
// d'un fond blanc — acceptable pour un en-tête de document imprimé.
function compressImageToDataUrl(file, maxWidth = 480, quality = 0.85) {
    return new Promise((resolve, reject) => {
        if (!file || !file.type || !file.type.startsWith('image/')) {
            reject(new Error('Le fichier sélectionné n\'est pas une image.'));
            return;
        }
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('Impossible de lire le fichier.'));
        reader.onload = (ev) => {
            const img = new Image();
            img.onerror = () => reject(new Error('Image illisible ou corrompue.'));
            img.onload = () => {
                const scale = Math.min(1, maxWidth / img.width);
                const w = Math.max(1, Math.round(img.width * scale));
                const h = Math.max(1, Math.round(img.height * scale));
                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, w, h);
                ctx.drawImage(img, 0, 0, w, h);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
    });
}


// 2026-08-20 — Devis détaillé CLIENT (§ 27.1, axe « destinataire = client »).
// Le client voit chaque poste, mais au prix de VENTE : jamais le coût d'achat,
// jamais le coefficient, jamais la marge. On répartit donc le prix de vente du
// lot sur ses lignes au prorata de leur coût — c'est exactement le coefficient
// de vente du lot appliqué ligne à ligne.
//
// Le point délicat est l'arrondi : arrondir chaque ligne indépendamment fait
// dériver la somme de quelques FCFA par rapport au total du devis, et un client
// qui additionne la colonne tomberait sur un chiffre différent du total annoncé.
// L'écart résiduel est donc reporté sur la ligne la plus importante, où il est
// proportionnellement le plus faible. La somme retombe EXACTEMENT sur le prix de
// vente du lot, par construction.
//
// Renvoie null si la répartition n'a pas de sens (lot sans coût, sans prix, ou
// sans ligne facturable) — l'appelant retombe alors sur l'affichage en synthèse.
function distributeLotSalePrice(details, lotCost, lotSaleHT) {
    const lines = (details || []).filter(d => (d.totalCost || 0) > 0);
    if (!lines.length || !(lotCost > 0) || !(lotSaleHT > 0)) return null;

    const k = lotSaleHT / lotCost;
    const out = lines.map(d => ({ ...d, saleTotal: Math.round((d.totalCost || 0) * k) }));

    const cible = Math.round(lotSaleHT);
    const somme = out.reduce((s, d) => s + d.saleTotal, 0);
    const ecart = cible - somme;
    if (ecart !== 0) {
        let iMax = 0;
        for (let i = 1; i < out.length; i++) {
            if (out[i].saleTotal > out[iMax].saleTotal) iMax = i;
        }
        out[iMax].saleTotal += ecart;
    }

    out.forEach(d => {
        d.saleUnit = (d.billedQty > 0) ? (d.saleTotal / d.billedQty) : d.saleTotal;
    });
    return out;
}

// Regroupement des lignes par nature, pour un devis client lisible :
// « Fournitures » / « Main-d'œuvre » / « Installation »… plutôt qu'une liste
// à plat mélangeant matières et prestations.
const COST_CATEGORY_LABELS = {
    material: 'Fournitures & matériaux',
    labor: "Main-d'œuvre",
    installation: 'Installation & pose',
    transport: 'Transport & logistique',
    subcontracting: 'Sous-traitance'
};

// 2026-08-20 — Les lots portent par défaut un nom déjà numéroté
// (« Lot 01 — Installation & Gros Œuvre »). Préfixer systématiquement par
// « Lot N — » donnait « Lot 1 — Lot 01 — Installation… ». On ne numérote donc
// que si l'utilisateur a renommé le lot sans reprendre de numéro.
const formatLotHeading = (lotName, index) => {
    const nom = String(lotName || '').trim();
    if (/^lot\s/i.test(nom)) return nom;
    return nom ? `Lot ${index + 1} — ${nom}` : `Lot ${index + 1}`;
};


// ═══════════════════════════════════════════════════════════════
// TÉLÉCHARGEMENT PDF (2026-08-20, demandé par l'utilisateur)
// ═══════════════════════════════════════════════════════════════
// Le bouton existant appelait window.print() : il faut alors choisir
// « Enregistrer en PDF » dans la boîte d'impression, ce que peu d'utilisateurs
// trouvent. Ce chemin-ci produit directement un fichier.
//
// jsPDF (410 Ko) + html2canvas (194 Ko) pèsent plus lourd que l'application
// elle-même (432 Ko). Ils ne sont donc PAS chargés au démarrage mais au
// premier clic, puis mis en cache par le navigateur : l'app reste aussi
// légère qu'avant pour qui n'utilise jamais cette fonction — ce qui compte
// sur une connexion de chantier.
//
// Contrepartie assumée : html2canvas rastérise le document, le texte du PDF
// n'est donc pas sélectionnable. L'impression navigateur, elle, produit un PDF
// vectoriel de meilleure qualité — les deux boutons restent donc proposés.
let __pdfLibsPromise = null;
function chargerLibsPdf() {
    if (window.jspdf && window.html2canvas) return Promise.resolve();
    if (__pdfLibsPromise) return __pdfLibsPromise;
    const charger = (src) => new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = resolve;
        s.onerror = () => reject(new Error(`Chargement impossible : ${src}`));
        document.head.appendChild(s);
    });
    __pdfLibsPromise = Promise.all([
        window.html2canvas ? Promise.resolve() : charger('vendor/html2canvas.min.js'),
        window.jspdf ? Promise.resolve() : charger('vendor/jspdf.umd.min.js')
    ]).catch((e) => { __pdfLibsPromise = null; throw e; });
    return __pdfLibsPromise;
}

// Nettoie un intitulé pour en faire un nom de fichier sûr sur tous les OS.
function nomFichierSur(base) {
    return String(base || 'document')
        .normalize('NFD').replace(/\p{Diacritic}/gu, '')
        .replace(/[^A-Za-z0-9 _-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/ /g, '-')
        .slice(0, 80) || 'document';
}

// Génère le PDF A4 depuis un élément du DOM et déclenche le téléchargement.
// Découpe en plusieurs pages si le document dépasse une hauteur A4.
// `options` (2026-09-04) — jusqu'ici les marges de page étaient une constante
// de 8 mm enfouie ici, et la numérotation n'existait pas. Les deux sont
// désormais des réglages de modèle. Les valeurs par défaut REPRODUISENT le
// comportement d'avant : un appel sans options sort exactement le même PDF.
async function telechargerElementEnPdf(element, nomFichier, options = {}) {
    if (!element) throw new Error("Document introuvable à l'écran.");
    await chargerLibsPdf();

    // Largeur de capture fixe : sans elle, html2canvas suit la largeur d'affichage
    // et le PDF d'un téléphone (375 px) sortirait comprimé, celui d'un panneau
    // replié carrément illisible (constaté : canvas de 132 px de large). On force
    // donc la mise en page A4 (~794 px à 96 dpi) quel que soit l'écran.
    const LARGEUR_CAPTURE = 800;

    // On tague l'élément pour le retrouver dans le clone. Tout est modifié sur le
    // clone hors écran, jamais sur le DOM affiché : l'utilisateur ne voit rien bouger.
    const estCanvasValide = (c) => Number.isFinite(Number(c?.width))
        && Number.isFinite(Number(c?.height))
        && Number(c.width) > 0
        && Number(c.height) > 0;

    // Certains navigateurs ne savent pas recalculer correctement une modale
    // React redimensionnée dans le clone de html2canvas : le rendu obtenu fait
    // alors 0 px de haut et jsPDF échoue ensuite avec une erreur peu lisible
    // (« Invalid argument passed to jsPDF.scale »). On tente la capture A4
    // optimisée, puis on revient immédiatement à la mise en page réellement
    // affichée si le clone n'est pas exploitable. Le téléchargement reste ainsi
    // fiable, y compris dans un panneau de détail étroit.
    const optionsCapture = {
        scale: 2,           // ~200 dpi en A4 : net à l'impression sans exploser le poids
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        scrollX: 0,
        scrollY: -window.scrollY
    };

    // ⚠️ Le piège qui a coûté deux signalements en production (2026-09-02).
    //
    // html2canvas rend le clone dans une iframe dont la largeur est celle
    // passée en `windowWidth` — et les MEDIA QUERIES du document sont
    // réévaluées à cette largeur. Le code posait `windowWidth = 920` pour
    // obtenir une mise en page A4. Or le panneau de détail d'un devis vit
    // sous `hidden lg:flex` : à 920 px, c'est-à-dire SOUS le seuil `lg`
    // (1024 px) de Tailwind, il devient `display:none` DANS LE CLONE. La
    // capture rendait donc un canvas de 0 × 0, systématiquement, sur tout
    // écran de bureau — mesuré à 1440, 1280, 1100 et 1024 px.
    //
    // Le repli sauvait la mise, ce qui a longtemps masqué le défaut : le
    // téléchargement aboutissait, mais avec une capture à la largeur réelle
    // du panneau (530 px), donc un PDF comprimé au lieu d'une page A4.
    //
    // La largeur du clone doit donc rester AU MOINS celle de la fenêtre
    // réelle, pour que ce qui est visible à l'écran le reste dans le clone.
    // Le plancher à LARGEUR_CAPTURE + 120 sert le cas inverse, celui du
    // téléphone : à 390 px la modale mobile est la zone visible, et sans ce
    // plancher on retomberait sur une capture de 366 px — le PDF illisible
    // que ce paramètre corrigeait à l'origine. Les deux besoins sont
    // opposés ; c'est le maximum qui les concilie.
    const largeurClone = Math.max(
        document.documentElement.clientWidth || window.innerWidth || 0,
        LARGEUR_CAPTURE + 120
    );

    // Le forçage de la largeur A4 s'applique aussi au repli : sans lui, la
    // seconde tentative produit le PDF comprimé décrit plus haut.
    const forcerMiseEnPageA4 = (docClone) => {
        // Les deux repli passent par `onclone` et non par le bac à sable : le
        // retrait des éléments hors PDF doit donc être fait ici aussi, sans
        // quoi le ruban de statut reviendrait dès qu'on emprunte ce chemin.
        docClone.querySelectorAll('[data-hors-pdf]').forEach((n) => n.remove());
        const cible = docClone.querySelector('[data-pdf-cible]');
        if (!cible) return;
        cible.style.width = LARGEUR_CAPTURE + 'px';
        cible.style.maxWidth = 'none';
        // Les ancêtres sont souvent une modale à hauteur bornée et
        // défilante : conservés tels quels, ils tronqueraient le document
        // à la partie visible à l'écran.
        for (let p = cible.parentElement; p && p !== docClone.body; p = p.parentElement) {
            p.style.overflow = 'visible';
            p.style.maxHeight = 'none';
            p.style.height = 'auto';
            p.style.maxWidth = 'none';
        }
    };

    // Capture en bac à sable (2026-09-02, après un troisième signalement).
    //
    // Les deux tentatives précédentes rendaient toutes deux 0 × 0 chez
    // l'utilisateur — « zone 720x1918, A4@1800=0x0, repli=0x0 » — alors que le
    // même devis, rejoué à l'identique depuis sa base, se capturait sans
    // difficulté ici. Chercher la différence d'environnement une fois de plus
    // n'aurait fait que déplacer le problème : la faiblesse est structurelle.
    //
    // Le document vit au fond d'une chaîne de conteneurs contraints — panneau
    // en `hidden lg:flex`, carte en `h-full overflow-hidden`, zone de défilement
    // en `overflow-auto`, le tout en flex avec `min-h-0`. Capturer un élément à
    // cet endroit oblige à réécrire ses ancêtres dans le clone, et il suffit
    // qu'un seul se comporte autrement — une media query réévaluée, une hauteur
    // qui s'effondre, un conteneur qui clippe — pour que le rendu sorte vide.
    //
    // On copie donc le document dans un bac à sable posé directement sur
    // <body>, à la largeur A4, sans aucun ancêtre contraignant. Plus de chaîne
    // à réparer, donc plus rien à casser. Le bac est hors champ mais bel et
    // bien rendu : ni `display:none` ni `visibility:hidden`, qui donneraient
    // eux-mêmes un canvas vide.
    const capturerEnBacASable = async () => {
        const bac = document.createElement('div');
        bac.setAttribute('data-pdf-bac', '1');
        bac.style.cssText = [
            'position:fixed', 'top:0', 'left:-20000px', 'z-index:-1',
            `width:${LARGEUR_CAPTURE}px`, 'background:#ffffff',
            'overflow:visible', 'pointer-events:none'
        ].join(';');
        const copie = element.cloneNode(true);
        // 2026-09-04 — Ce qui est marqué `data-hors-pdf` disparaît de la copie.
        // Le ruban de statut est une commodité d'ÉCRAN : il ne doit sortir ni
        // à l'impression ni dans le PDF exporté — c'est ainsi que Zoho Books
        // procède, et c'est ce qu'on attend d'un document envoyé au client.
        // `print:hidden` ne suffisait pas : html2canvas rend le DOM tel quel et
        // ignore les media queries. La suppression sur le clone ne dépend
        // d'aucun comportement de bibliothèque ; l'attribut
        // `data-html2canvas-ignore` posé en plus n'est qu'une ceinture.
        copie.querySelectorAll('[data-hors-pdf]').forEach((n) => n.remove());
        copie.style.width = LARGEUR_CAPTURE + 'px';
        copie.style.maxWidth = 'none';
        copie.style.height = 'auto';
        copie.style.maxHeight = 'none';
        copie.style.overflow = 'visible';
        bac.appendChild(copie);
        document.body.appendChild(bac);
        try {
            // Laisser un cycle de rendu au navigateur : sans lui, la copie peut
            // être mesurée avant sa mise en page.
            //
            // ⚠️ Course avec un délai, et non `requestAnimationFrame` seul.
            // Constaté sur un vrai compte le 2026-09-03 : dans un onglet MASQUÉ,
            // le navigateur ne déclenche plus rAF du tout. L'attente ne se
            // terminait donc jamais — bouton figé sur « Génération… »,
            // indéfiniment, sans erreur ni message. Or cliquer puis passer à
            // autre chose est précisément ce qu'on fait en attendant un
            // téléchargement. Le délai garantit que la génération avance, que
            // l'onglet soit au premier plan ou non ; rAF reste utilisé quand il
            // fonctionne, parce qu'il cale l'attente sur un vrai cycle de rendu.
            await new Promise((resoudre) => {
                let fini = false;
                const finir = () => { if (!fini) { fini = true; resoudre(); } };
                requestAnimationFrame(() => requestAnimationFrame(finir));
                setTimeout(finir, 150);
            });
            return await window.html2canvas(copie, { ...optionsCapture, windowWidth: largeurClone });
        } finally {
            bac.remove();
        }
    };

    const tentatives = [];
    let canvas;
    try {
        canvas = await capturerEnBacASable();
        tentatives.push(`bac=${canvas?.width || 0}x${canvas?.height || 0}`);
    } catch (e) {
        tentatives.push(`bac=erreur(${String(e && e.message || e).slice(0, 60)})`);
    }

    // Les deux anciennes tentatives restent en repli : elles ont fonctionné
    // pendant des mois pour la plupart des utilisateurs, et rien ne justifie
    // de les retirer tant que le bac à sable n'a pas fait ses preuves partout.
    if (!estCanvasValide(canvas)) {
        element.setAttribute('data-pdf-cible', '1');
        try {
            canvas = await window.html2canvas(element, {
                ...optionsCapture,
                windowWidth: largeurClone,
                onclone: forcerMiseEnPageA4
            });
            tentatives.push(`A4@${largeurClone}=${canvas?.width || 0}x${canvas?.height || 0}`);

            if (!estCanvasValide(canvas)) {
                canvas = await window.html2canvas(element, { ...optionsCapture, onclone: forcerMiseEnPageA4 });
                tentatives.push(`repli=${canvas?.width || 0}x${canvas?.height || 0}`);
            }
        } finally {
            element.removeAttribute('data-pdf-cible');
        }
    }

    if (!estCanvasValide(canvas)) {
        // Le message portait auparavant « réessayez » et rien d'autre : face à
        // un signalement, impossible de savoir quelle étape avait lâché. Les
        // mesures y figurent désormais — elles ne coûtent rien à l'utilisateur
        // et rendent le prochain rapport exploitable du premier coup.
        const boite = element.getBoundingClientRect();
        throw new Error(
            "Le document n'a pas pu être rendu pour le PDF "
            + `(zone ${Math.round(boite.width)}x${Math.round(boite.height)}, ${tentatives.join(', ')})`
        );
    }

    const { jsPDF } = window.jspdf;
    // Format et orientation viennent du modèle (2026-09-04). Tout le calcul en
    // aval part de `pdf.internal.pageSize` : la pagination, les marges et la
    // position du numéro s'adaptent sans une ligne de plus.
    const FORMATS = { A4: 'a4', A5: 'a5', LETTRE: 'letter' };
    const format = FORMATS[String(options.formatPapier || 'A4').toUpperCase()] || 'a4';
    const orientation = String(options.orientation || 'portrait') === 'paysage' ? 'landscape' : 'portrait';
    const pdf = new jsPDF({ unit: 'mm', format, orientation });
    const pageL = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();

    // Marges bornées : au-delà de 40 mm il ne resterait plus de place pour le
    // bordereau, et une valeur négative ferait sortir l'image de la page.
    const borner = (valeur, defaut) => {
        const n = Number(valeur);
        return Number.isFinite(n) ? Math.max(0, Math.min(40, n)) : defaut;
    };
    const m = options.marges || {};
    const mHaut = borner(m.haut, 8);
    const mBas = borner(m.bas, 8);
    const mGauche = borner(m.gauche, 8);
    const mDroit = borner(m.droit, 8);

    const imgL = pageL - mGauche - mDroit;
    const hauteurUtile = pageH - mHaut - mBas;
    const imgH = (canvas.height * imgL) / canvas.width;

    if (![pageL, pageH, imgL, imgH, hauteurUtile].every(Number.isFinite)
        || imgL <= 0 || imgH <= 0 || hauteurUtile <= 0) {
        throw new Error("Les dimensions du document PDF sont invalides. Réessayez après avoir rouvert le document.");
    }

    const image = canvas.toDataURL('image/jpeg', 0.92);

    // ── Mobilier de page (2026-09-04) ────────────────────────────────────
    // Signalé sur un PDF réel : la mention de pied de page flottait au milieu
    // de la feuille, là où le contenu s'arrêtait. « Le bas de page doit rester
    // sur le bas de page selon le format choisi, de manière automatique, comme
    // aussi l'en-tête. »
    //
    // Elle cesse donc d'être du CONTENU capturé pour devenir du MOBILIER :
    // écrite par jsPDF au bas de CHAQUE page, à une position calculée depuis le
    // format réel. Le document, lui, est retiré de la capture par
    // `data-hors-pdf` — sans quoi il sortirait deux fois.
    //
    // La bande qui l'accueille est RÉSERVÉE avant le découpage, et retirée de
    // la hauteur utile : c'est la seule façon de garantir qu'aucune ligne du
    // bordereau ne passe dessous.
    const piedTexte = String(options.piedTexte || '').trim();
    const alignementPied = { center: 'center', right: 'right' }[options.piedAlignement] || 'left';
    pdf.setFontSize(7);
    const lignesPied = piedTexte ? pdf.splitTextToSize(piedTexte, imgL).slice(0, 3) : [];
    const hauteurLignePied = 2.6;
    // Bande CONSTANTE plutôt que proportionnelle au nombre de lignes : l'aperçu
    // de l'éditeur doit réserver exactement la même, et il ne peut pas
    // reproduire le retour à la ligne de jsPDF. Une valeur commune aux deux
    // garantit que les coupures montrées à l'écran sont celles du PDF.
    // 10 mm tiennent trois lignes à 7 pt.
    const BANDE_PIED_MM = 10;
    const bandePied = lignesPied.length ? BANDE_PIED_MM : 0;

    // En-tête courant : sur un document d'une seule page, l'en-tête complet du
    // devis suffit. Au-delà, les pages suivantes n'en portaient aucun. On
    // réserve donc une bande — mais SEULEMENT si le document déborde, pour
    // qu'un devis d'une page sorte exactement comme avant.
    const enteteTexte = String(options.enteteTexte || '').trim();
    const hauteurSansEntete = Math.max(1, hauteurUtile - bandePied);
    const plusieursPages = imgH > hauteurSansEntete;
    const BANDE_ENTETE_MM = 7;
    const bandeEntete = (enteteTexte && plusieursPages) ? BANDE_ENTETE_MM : 0;

    const hauteurContenu = Math.max(1, hauteurUtile - bandePied - bandeEntete);
    const hautContenu = mHaut + bandeEntete;

    let restant = imgH;
    let position = hautContenu;

    pdf.addImage(image, 'JPEG', mGauche, position, imgL, imgH);
    restant -= hauteurContenu;

    // Pages suivantes : on décale l'image vers le haut, la zone visible de la
    // page suivante correspondant à la suite du document.
    while (restant > 0) {
        position = hautContenu - (imgH - restant);
        pdf.addPage();
        pdf.addImage(image, 'JPEG', mGauche, position, imgL, imgH);
        restant -= hauteurContenu;
    }

    // Le mobilier s'écrit après coup, sur toutes les pages posées. L'image
    // ayant été découpée en tranches de `hauteurContenu`, la bande basse est
    // libre : rien ne peut s'y superposer.
    const totalPages = pdf.internal.getNumberOfPages();
    for (let page = 1; page <= totalPages; page++) {
        pdf.setPage(page);
        if (bandeEntete && page > 1) {
            pdf.setFontSize(7.5);
            pdf.setTextColor(140, 140, 140);
            pdf.text(enteteTexte, mGauche, mHaut + 3.5);
            pdf.setDrawColor(225, 225, 225);
            pdf.line(mGauche, mHaut + 5, pageL - mDroit, mHaut + 5);
        }
        if (lignesPied.length) {
            pdf.setFontSize(7);
            pdf.setTextColor(120, 120, 120);
            const xPied = alignementPied === 'center' ? pageL / 2
                : alignementPied === 'right' ? pageL - mDroit : mGauche;
            // Le bloc se cale sur le BAS de la zone utile, pas sur la fin du
            // contenu : c'est tout l'objet du correctif.
            const basZone = pageH - mBas;
            lignesPied.forEach((ligne, i) => {
                pdf.text(ligne, xPied, basZone - bandePied + 2 + (i + 1) * hauteurLignePied, { align: alignementPied });
            });
        }
    }

    // Numérotation : écrite APRÈS coup, quand le nombre total de pages est
    // connu — « Page 2 / 5 » ne peut pas s'écrire avant d'avoir posé la
    // cinquième. Le numéro se pose dans la marge basse ; si elle est trop
    // mince pour l'accueillir, on le remonte pour qu'il reste sur la page
    // plutôt que de déborder hors du papier.
    if (options.numeroterPages) {
        const total = pdf.internal.getNumberOfPages();
        const y = Math.min(pageH - 3, pageH - mBas / 2 + 1);
        // Position et format viennent du modèle. Les jetons sont remplacés par
        // page ; un format vide retombe sur « Page n / N » plutôt que de poser
        // une ligne muette au bas de chaque feuille.
        const alignement = { gauche: 'left', droite: 'right' }[options.positionNumeroPage] || 'center';
        const x = alignement === 'left' ? mGauche : alignement === 'right' ? pageL - mDroit : pageL / 2;
        const modele = String(options.formatNumeroPage || '').trim() || 'Page {page} / {total}';
        pdf.setFontSize(8);
        pdf.setTextColor(130, 130, 130);
        for (let page = 1; page <= total; page++) {
            pdf.setPage(page);
            const texte = modele
                .replace(/\{page\}/gi, String(page))
                .replace(/\{total\}/gi, String(total))
                .replace(/\{document\}/gi, String(options.numeroDocument || ''));
            pdf.text(texte, x, y, { align: alignement });
        }
    }

    pdf.save(`${nomFichierSur(nomFichier)}.pdf`);
}
