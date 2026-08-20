-- Accès aux documents internes (2026-08-20, demandé par l'utilisateur :
-- « tu peux mettre admin par défaut mais dans le setting l'admin peut
-- paramétrer les rôles qui peuvent voir ou pas »).
--
-- L'étude de prix expose les coûts d'achat, le coefficient de vente et la
-- marge. Jusqu'ici la bascule « Vue Interne » était offerte à TOUS les rôles,
-- y compris 'viewer'. Cette colonne stocke la liste des rôles autorisés.
--
-- 'owner' n'est jamais stocké ici : il a toujours accès et est le seul à
-- pouvoir modifier la liste — l'y inclure permettrait de se verrouiller hors
-- de ses propres documents.
--
-- Purement additif, idempotent. Pas de DEFAULT SQL : NULL = jamais configuré,
-- l'application retombe sur son défaut (['admin']). Un tableau vide est une
-- valeur légitime et distincte (personne hormis le propriétaire).

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS internal_doc_roles jsonb;

COMMENT ON COLUMN public.company_settings.internal_doc_roles IS
  'Rôles autorisés à ouvrir les documents internes (étude de prix : coûts, coefficient, marge). NULL = non configuré, défaut applicatif ["admin"]. ''owner'' a toujours accès et n''est pas stocké ici.';
