// Utilitaires de formatage — pur JS, aucune dépendance React/JSX.
// Extrait de index_jsx.js le 2026-08-16 (PROJECT_MASTER_TRACKER.md § 15).
// Chargé en script classique AVANT app.compiled.js (voir index.html).
const formatMoney = (amount, currency = 'FCFA') => {
    if (isNaN(amount) || amount === null || amount === undefined) return `0 ${currency}`;
    const rounded = Math.round(amount);
    return `${rounded.toLocaleString('fr-FR')} ${currency}`;
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
