# ikadevis — propositions de réorganisation et décisions

Format : situation → difficulté observée → objectif → proposition →
alternative → risques → critère de réussite → **décision**.

Le 2026-10-03, l'utilisateur a confié l'arbitrage (« réfléchis et prends
les décisions par toi-même »). Chaque décision ci-dessous est donc prise et,
sauf mention contraire, appliquée dans la branche `audit/ux-220-2026-10`.
Elles restent réversibles.

## R1 · Teinte secondaire `neutral-400` employée comme couleur de texte

- **Situation** : `#8F9CA8` servait à 127 textes ; 2,8:1 sur blanc.
- **Objectif** : qu'aucun texte ne tombe sous 4,5:1 par construction.
- **Proposition** : `text-neutral-400` → `text-neutral-500` (`#64748B`,
  4,76:1) ; le 400 reste pour les icônes décoratives, bordures et repères.
- **Alternative écartée** : assombrir le jeton 400 lui-même — il sert aussi
  de fond (interrupteur éteint) et d'icône ; l'échelle de gris se serait
  resserrée partout.
- **Décision : appliquée.** 111 occurrences (classes de base seulement,
  jamais `hover:` ni `/opacité`). Six restent en 400 : textes sur fond
  sombre (barres de titre d'aperçu), où le 400 contraste **mieux** que le 500.

## R2 · Point d'entrée de la démo : un seul appel à l'action (UX-HYP-01)

- **Situation** : trois portes vers « nouveau devis » en démo, et « Créer
  mon premier devis » alors qu'un devis d'exemple est affiché.
- **Difficulté** : HYPOTHÈSE, non démontrée auprès d'utilisateurs.
- **Décision : non appliquée.** Changer l'entrée principale sur une
  hypothèse risque de dégrader un parcours qui fonctionne (C001 PASSÉ).
  Étude rapide recommandée (5 personnes : temps jusqu'à « voir un devis
  chiffré », premier clic).

## R3 · Reprise de la démonstration après rechargement (UX-P2-10)

- **Proposition initiale** : renommer le bouton « Reprendre ma démonstration ».
- **Décision : appliquée autrement.** Le libellé « Essayer sans compte » est
  conservé (il reste juste et des dizaines de bancs le ciblent), mais la
  ligne sous le bouton dit désormais, quand c'est le cas, « Démonstration en
  cours sur cet appareil : vos N devis et M factures d'essai sont conservés
  — ce bouton la reprend ».

## R4 · Détail des ouvrages sur la facture (UX-HYP-02)

- **Décision : non appliquée.** La facturation par lot est cohérente avec
  les situations de travaux (% d'avancement par lot) ; reprendre le détail
  ligne à ligne changerait le document légal émis. À trancher par le métier
  avec un client réel.

## R5 · Attente de 350 ms (UX-DEC-01)

- **Faits** : ajoutée le 2026-09-16, retirée le 25/09, **rétablie** par
  `ff40ffe` — un choix produit délibéré et récent.
- **Décision : 350 ms conservés** entre écrans et sur les fiches. L'en-tête
  de `scratch/test_lot5_a11y_ui.mjs`, qui annonçait encore « suppression des
  délais artificiels » en vérifiant 350, est corrigé : un test ne doit pas
  affirmer le contraire de son assertion. Le chronomètre visible n'est plus
  annoncé aux lecteurs d'écran (C127).

## R6 · Signaler où confirmer les quantités (UX-P2-12)

- **Décision : appliquée.** Le message nomme l'ouvrage ouvert et le nombre
  restant ; l'inspecteur s'ouvre sur lui et le focus va sur « Confirmer mes
  quantités ».

## R7 · Menus de navigation en liens (C023)

- **Situation** : les entrées de navigation sont des `<button>` : pas
  d'ouverture dans un nouvel onglet (⌘-clic, clic milieu).
- **Proposition** : `<a href="#devis">` avec interception du clic simple.
- **Décision : différée.** Chaque écran a désormais une adresse propre
  (UX-P2-06 corrigé) : le lien profond existe. Convertir huit composants de
  navigation et les bancs qui les ciblent est un chantier à part, sans
  perte de données à la clé.

## R8 · Un seul bouton plein par écran (C026)

- **Situation** : « Nouveau devis » (barre latérale) est plein sur tous les
  écrans ; l'action propre à l'écran (« Nouveau client »…) est secondaire.
- **Décision : conserver.** Le devis est l'action principale du produit ;
  le doublon visuel est assumé et cohérent d'un écran à l'autre.

## R9 · Renouvellement et arrêt d'abonnement (C203)

- **Situation** : les offres disent prix, limites et cycle, mais rien sur
  le renouvellement (automatique ou non) ni sur l'arrêt.
- **Décision : non appliquée, information manquante.** Écrire une règle de
  renouvellement que le serveur (`saspay-proxy`) n'applique peut-être pas
  serait trompeur. À rédiger avec la politique commerciale réelle.

## R10 · Thème sombre du système (C215)

- **Décision : appliquée.** L'application n'a qu'un thème clair ;
  `darkMode: 'class'` empêche dix classes `dark:` isolées de s'activer
  sous un système en thème sombre.
