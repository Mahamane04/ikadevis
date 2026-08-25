// Service worker ikadevis — GÉNÉRÉ, ne pas modifier à la main.
// Source : scripts/sw.template.js · Génération : scripts/generer-sw.mjs
//
// La version ci-dessous est injectée au build depuis le jeton ?v= de
// index.html. C'est volontaire : ce projet a déjà un cache-busting manuel,
// et deux mécanismes de cache désalignés servent tôt ou tard une version
// périmée sans que rien ne le signale — le piège déjà rencontré sur ce
// projet avec un tailwind.css obsolète. Un seul jeton pilote les deux.
const VERSION = '20260825mobileaudit1';
const CACHE = `ikadevis-${VERSION}`;

// Coquille minimale : ce qu'il faut pour que l'application DÉMARRE sans
// réseau. Le reste se met en cache au fil de la navigation.
// Liste DÉRIVÉE de index.html au build (voir scripts/generer-sw.mjs), pas
// écrite à la main : la première version manuelle oubliait six ressources
// et l'application s'ouvrait sur une page blanche hors réseau.
const COQUILLE = [
    './',
    './favicon.svg',
    './assets/icon-192.png',
    './manifest.webmanifest',
    './tailwind.css',
    './vendor/react.production.min.js',
    './vendor/react-dom.production.min.js',
    './vendor/supabase.min.js',
    './vendor/fontawesome/css/all.min.css',
    './vendor/fonts/open-sans.css',
    './config.js',
    './js/calc-engine.js',
    './js/utils.js',
    './js/quote-templates.js',
    './app.compiled.js',
    './vendor/fonts/files/open-sans-0.woff2',
    './vendor/fonts/files/open-sans-1.woff2',
    './vendor/fontawesome/webfonts/fa-solid-900.woff2',
    './vendor/fontawesome/webfonts/fa-brands-400.woff2',
];

self.addEventListener('install', (e) => {
    e.waitUntil((async () => {
        const c = await caches.open(CACHE);
        // addAll échoue en bloc si UNE seule ressource manque : on tolère
        // les absences pour ne jamais empêcher l'installation.
        await Promise.all(COQUILLE.map((u) => c.add(u).catch(() => {})));
        await self.skipWaiting();
    })());
});

self.addEventListener('activate', (e) => {
    e.waitUntil((async () => {
        const noms = await caches.keys();
        await Promise.all(noms.filter((n) => n.startsWith('ikadevis-') && n !== CACHE)
                               .map((n) => caches.delete(n)));
        await self.clients.claim();
    })());
});

self.addEventListener('fetch', (e) => {
    const req = e.request;
    if (req.method !== 'GET') return;

    const url = new URL(req.url);
    // Tout ce qui n'est pas notre origine passe directement au réseau :
    // Supabase (auth, données, RPC) ne doit JAMAIS être servi depuis un cache.
    if (url.origin !== self.location.origin) return;

    // config.js porte l'environnement ciblé : le réseau doit TOUJOURS gagner,
    // sinon un changement d'environnement resterait invisible. Mais un repli
    // sur le cache est indispensable — en réseau seul, son échec hors-ligne
    // suffisait à rendre une page blanche (constaté au premier essai).
    if (url.pathname.endsWith('/config.js')) {
        e.respondWith((async () => {
            try {
                const rep = await fetch(req);
                if (rep && rep.ok) (await caches.open(CACHE)).put(req, rep.clone());
                return rep;
            } catch (err) {
                const hit = await caches.match(req, { ignoreSearch: true });
                if (hit) return hit;
                throw err;
            }
        })());
        return;
    }

    // Les dépendances publiques changent rarement : cache d'abord, réseau
    // seulement si elles sont absentes. La coquille PWA ne précharge que les
    // fichiers utiles à son démarrage hors ligne.
    if (url.pathname.includes('/vendor/')) {
        e.respondWith((async () => {
            const hit = await caches.match(req, { ignoreSearch: true });
            if (hit) return hit;
            const rep = await fetch(req);
            if (rep && rep.ok) (await caches.open(CACHE)).put(req, rep.clone());
            return rep;
        })());
        return;
    }

    // Tout le reste : RÉSEAU D'ABORD. Une version fraîche gagne toujours ;
    // le cache n'est qu'un filet hors-ligne. C'est ce qui évite de servir
    // un bundle périmé après un déploiement.
    e.respondWith((async () => {
        try {
            const rep = await fetch(req);
            if (rep && rep.ok) (await caches.open(CACHE)).put(req, rep.clone());
            return rep;
        } catch (err) {
            const hit = await caches.match(req, { ignoreSearch: true });
            if (hit) return hit;
            // Navigation hors-ligne vers une URL jamais visitée : on rend
            // la coquille, l'application se débrouille ensuite en local.
            if (req.mode === 'navigate') {
                const shell = await caches.match('./', { ignoreSearch: true })
                           || await caches.match('./index.html', { ignoreSearch: true });
                if (shell) return shell;
            }
            throw err;
        }
    })());
});
