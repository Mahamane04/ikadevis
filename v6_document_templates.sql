-- ============================================================================
-- Modèles de documents PDF (2026-09-03) — étape 1 de l'éditeur de modèles
-- ============================================================================
-- Jusqu'ici la personnalisation tenait en trois colonnes de company_settings :
-- brand_color, pdf_font, pdf_header_alignment. C'est une organisation qui a UN
-- style, pas un modèle qu'on édite. Cette table permet d'en avoir plusieurs,
-- par type de document, et de les éditer champ par champ.
--
-- POURQUOI DU JSONB POUR LA CONFIGURATION
-- L'arbre est profond et mouvant : chaque champ porte affichage, libellé,
-- taille, couleur ; chaque colonne de tableau porte en plus une largeur.
-- Trente colonnes aujourd'hui en appelleraient quinze de plus au premier ajout,
-- chacune avec sa migration. Restent en colonnes les seules valeurs qu'on
-- interroge : le type, le nom, le drapeau par défaut.
--
-- SÛRETÉ
-- - strictement additive et rejouable (IF NOT EXISTS) ;
-- - aucune donnée existante n'est modifiée ni supprimée ;
-- - company_settings reste la source des valeurs actuelles : tant qu'une
--   organisation n'a aucun modèle, l'application applique ses réglages comme
--   avant. La migration ne crée AUCUN modèle — c'est l'application qui en
--   génère un au premier passage dans l'éditeur, depuis les réglages existants.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.document_templates (
    id               UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    organization_id  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    type_document    TEXT NOT NULL CHECK (type_document IN ('devis', 'facture')),
    nom              TEXT NOT NULL,
    par_defaut       BOOLEAN NOT NULL DEFAULT FALSE,
    configuration    JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    updated_at       TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.document_templates IS
  'Modèles de mise en page des documents PDF (devis, factures), éditables par organisation.';
COMMENT ON COLUMN public.document_templates.configuration IS
  'Arbre de configuration de l''éditeur : blocs affichés, libellés, tailles, couleurs, colonnes du tableau et leurs largeurs.';
COMMENT ON COLUMN public.document_templates.par_defaut IS
  'Modèle appliqué par défaut pour ce type de document. Un seul par (organisation, type).';

-- Un seul modèle par défaut par organisation et par type. Index partiel : il
-- ne contraint que les lignes marquées par_defaut, les autres sont libres.
CREATE UNIQUE INDEX IF NOT EXISTS document_templates_un_defaut_par_type
    ON public.document_templates (organization_id, type_document)
    WHERE par_defaut;

CREATE INDEX IF NOT EXISTS document_templates_par_organisation
    ON public.document_templates (organization_id, type_document);

ALTER TABLE public.document_templates ENABLE ROW LEVEL SECURITY;

-- Lecture : tout membre de l'organisation. Un modèle décrit la mise en page des
-- documents que ces membres consultent déjà.
DROP POLICY IF EXISTS "Document templates select" ON public.document_templates;
CREATE POLICY "Document templates select" ON public.document_templates
    FOR SELECT USING (organization_id IN (SELECT get_my_organization_ids()));

-- Écriture : réservée aux rôles qui règlent déjà les paramètres de
-- l'entreprise. Un modèle engage l'image de l'entreprise sur chaque document
-- envoyé à un client — ce n'est pas un réglage de confort.
DROP POLICY IF EXISTS "Document templates insert" ON public.document_templates;
CREATE POLICY "Document templates insert" ON public.document_templates
    FOR INSERT WITH CHECK (has_org_permission(organization_id, ARRAY['owner', 'admin']));

DROP POLICY IF EXISTS "Document templates update" ON public.document_templates;
CREATE POLICY "Document templates update" ON public.document_templates
    FOR UPDATE USING (has_org_permission(organization_id, ARRAY['owner', 'admin']));

DROP POLICY IF EXISTS "Document templates delete" ON public.document_templates;
CREATE POLICY "Document templates delete" ON public.document_templates
    FOR DELETE USING (has_org_permission(organization_id, ARRAY['owner', 'admin']));

-- Contrôle post-migration (lecture seule) :
-- SELECT tablename, rowsecurity FROM pg_tables WHERE tablename = 'document_templates';
-- SELECT polname, polcmd FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
--   WHERE c.relname = 'document_templates';
