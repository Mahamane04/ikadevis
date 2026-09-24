# Landing ikadevis — proposition du 24 septembre 2026

## Message et direction

Cible : entreprises et entrepreneurs de la construction BTP. Le gros œuvre, le second œuvre et la rénovation sont prioritaires ; la métallerie, le bois et les façades sont présentés comme les spécialités qui composent leurs chantiers.

Accroche retenue : « Vos devis BTP ne devraient pas prendre vos soirées. »

La page suit le parcours problème → solution concrète → exemple interactif → métiers → réutilisation → offres → questions → essai. Elle parle de mesures, de profilés, de quincaillerie, de pertes de découpe et de pose. Aucun témoignage, volume de clients ou gain de temps chiffré n’est inventé.

Identité : bleu #256BDF, encre #152A43, fond #F4F8FD, panneau #132C49, texte secondaire #5B6C80, blanc #FFFFFF. Titres Manrope ExtraBold, texte Open Sans, polices servies localement. Le premier écran utilise l’illustration fournie ; les schémas d’ouvrages sont des SVG. Apparitions uniques au défilement, interactions discrètes et respect de la préférence de réduction des animations.

Autres pistes de titre, si besoin d’une campagne différente :
- « Le client attend son devis. Vous avez déjà un chantier à gérer. » — insiste sur l’arbitrage entre chantier et travail administratif.
- « Un portail à chiffrer. Pas une soirée à sacrifier. » — adaptée à une campagne spécifique métallerie.

## Source et assemblage

- `landing.html` : contenu de la nouvelle proposition.
- `assets/landing/landing.css` et `landing.js` : mise en page et interactions, indépendantes de l’ERP.
- `assets/landing/hero-artisan.webp` : conversion optimisée du GIF utilisateur (une seule image dans le GIF original), sans génération ni modification de la composition.
- `npm run build:landing` : assemble uniquement les 11 fichiers publics dans `dist-landing/`, avec `index.html` comme point d’entrée.
- `wrangler.vitrine.jsonc` : configuration distincte du Worker existant `ikadevis-vitrine`, préparée pour une publication ultérieure. Aucun déploiement effectué.

Le site public inspecté est séparé de l’application. Son ancienne source locale reste dans le dossier voisin `ikadevis-vitrine/`. La nouvelle version vit ici pour permettre sa revue et sa gestion dans le dépôt de travail. Le fichier `wrangler.jsonc` de l’application n’a pas été modifié. Les anciennes pages sont conservées dans `scratch/landing-redesign/`.

Aperçu local : `http://127.0.0.1:8117/`, servi depuis `dist-landing/`.

## Exactitude du contenu

Les offres reprennent `js/subscription-service.js` lu le 24 septembre : Starter 14 jours, 3 devis, 1 projet, 1 utilisateur ; Standard 19 900 FCFA/mois, jusqu’à 5 utilisateurs ; Entreprise 49 000 FCFA/mois. Le site public précédent parlait encore d’accès anticipé. Ces tarifs sont ceux du code local, pas une nouvelle décision commerciale.

Le simulateur est explicitement illustratif : tarifs fictifs par m², pertes matières à 5 %, frais généraux à 0 %, marge sur prix de vente à 25 %, hors TVA. Il ne remplace pas le moteur de chiffrage de l’application et n’émet aucun devis. La formule est `(matières + pertes + main-d’œuvre) / 0,75`, arrondie au franc pour l’affichage.

Tous les boutons d’essai / offre conduisent à l’entrée existante de `app.ikadevis.com`. Aucun faux parcours d’inscription direct ou choix automatique de forfait n’a été ajouté. Les contacts et liens légaux proviennent du site public existant.

## Vérifications

- Construction autonome : 11 fichiers, environ 380 Ko au total, sans API, CDN ou dépendance JavaScript externe.
- Contrôle visuel du hero sur ordinateur 1440 px et mobile 390 px ; lecture du simulateur et de la FAQ.
- Absence de débordement horizontal à 320, 390, 768 et 1440 px.
- Menu mobile : ouverture, lien vers une section, fermeture ; fermeture par Échap vérifiée.
- FAQ : ouverture de la réponse sur le contenu de l’essai.
- Simulation : bois 6 m² = 240 800 FCFA ; bois 20 m² = 802 667 FCFA ; façade 20 m² = 944 000 FCFA.
- Liens internes résolus, un seul H1, IDs uniques, ressources et polices locales présentes.
- Syntaxe JavaScript et absence d’erreurs de console vérifiées.
- Contraste du bouton principal : blanc sur #256BDF, ratio 4,94:1.

Le moteur ERP, les paiements et les fichiers applicatifs déjà modifiés dans le dossier de travail n’ont pas été changés par cette refonte.

## Ajustement demandé : priorité à la construction BTP

Le premier écran et le bandeau métiers mettent désormais en avant la construction, le gros œuvre, le second œuvre et la rénovation. Un grand bloc « Un chantier, plusieurs lots. Un devis bien construit. » précède les trois spécialités. La bibliothèque illustrée commence par la maçonnerie et le carrelage. Les flèches diagonales des boutons, liens et décorations ont été retirées.

La simulation démarre sur un mur en maçonnerie (tarifs illustratifs : matières 12 500 F/m², main-d’œuvre 3 500 F/m²). Vérifications navigateur : 6 m² = 133 000 FCFA HT ; 20 m² = 443 333 FCFA HT. Le passage à la métallerie fonctionne : 20 m² = 553 333 FCFA HT. Absence de débordement vérifiée à 320 et 390 px ; contrôle visuel du hero et du grand bloc BTP à 1440 px. Toujours aucune publication sur le site public.
