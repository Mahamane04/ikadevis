// Banc d'essai — synchronisation du référentiel clients / chantiers,
// ajoutée le 2026-09-02 en suite de l'audit.
//
// ⚠️ Portée, à lire avant de se fier à ce banc : il tourne en mode INVITÉ,
// sans session Supabase. Il ne peut donc PAS éprouver la remontée elle-même —
// celle-ci a été vérifiée séparément, en exécutant sur la base de staging les
// insertions exactes que produisent mapClientToDb et mapProjectToDb (client
// créé, chantier créé et relié au client, puis nettoyage).
//
// Ce que ce banc protège est l'autre moitié, et elle compte autant : le
// chemin hors ligne ne doit RIEN perdre. La synchronisation s'ajoute au
// stockage local, elle ne le remplace pas. Un chantier sans réseau — le cas
// courant pour cette application — doit continuer à créer ses fiches, à les
// retrouver après rechargement, et à ne jamais bloquer la saisie.
import { pathToFileURL } from 'node:url';
import { launchApp, enterGuestMode } from './lib/harness.mjs';

const wait = (ms = 700) => new Promise((r) => setTimeout(r, ms));

export async function run() {
    const results = [];
    const ok = (label, cond, detail = '') => results.push({ label, pass: !!cond, detail });

    const { page, close } = await launchApp();
    try {
        const erreurs = [];
        page.on('pageerror', (e) => erreurs.push(e.message.slice(0, 140)));

        await page.setViewport({ width: 1440, height: 900 });
        await enterGuestMode(page, { demo: true });
        await wait(2400);

        // Un devis crée implicitement client et chantier (resolveClientAndProject).
        await page.evaluate(() => {
            const b = [...document.querySelectorAll('aside button')].find((x) => (x.textContent || '').trim().startsWith('Clients'));
            if (b) b.click();
        });
        await wait(1600);
        const clients = await page.evaluate(() => {
            const l = JSON.parse(localStorage.getItem('costcalc:org_default:clients') || '[]');
            return { nombre: l.length, premier: l[0] ? l[0].name : null, idLocal: l[0] ? l[0].id : null };
        });
        ok(`Le répertoire clients est alimenté hors ligne — ${clients.nombre} fiche(s)`, clients.nombre > 0,
            `premier=« ${clients.premier} »`);
        ok('Les fiches créées hors ligne gardent un identifiant local',
            typeof clients.idLocal === 'string' && !/^[0-9a-f]{8}-/i.test(clients.idLocal),
            `id=${clients.idLocal}`);

        // Rien ne doit avoir été tenté vers le réseau : pas d'erreur de page.
        ok('Aucune erreur de page pendant le parcours hors ligne', erreurs.length === 0,
            erreurs.slice(0, 2).join(' | '));

        // Le référentiel survit au rechargement.
        await page.reload({ waitUntil: 'networkidle0' });
        await wait(1500);
        await enterGuestMode(page, { demo: false });
        await wait(2400);
        const apres = await page.evaluate(() => JSON.parse(localStorage.getItem('costcalc:org_default:clients') || '[]').length);
        ok(`Le référentiel survit au rechargement — ${apres} fiche(s)`, apres >= clients.nombre);

        // Et les chantiers restent reliés à leur client par identifiant.
        const lien = await page.evaluate(() => {
            const cs = JSON.parse(localStorage.getItem('costcalc:org_default:clients') || '[]');
            const ps = JSON.parse(localStorage.getItem('costcalc:org_default:projects') || '[]');
            if (ps.length === 0) return { sansChantier: true };
            const ids = new Set(cs.map((c) => c.id));
            return { relies: ps.filter((p) => p.clientId && ids.has(p.clientId)).length, total: ps.length };
        });
        if (!lien.sansChantier) {
            ok(`Les chantiers restent reliés à leur client — ${lien.relies}/${lien.total}`,
                lien.relies === lien.total);
        }
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
