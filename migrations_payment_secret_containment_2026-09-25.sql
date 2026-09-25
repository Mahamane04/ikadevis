-- P0 SEC-01 : quarantaine privée et nettoyage des documents publics.
-- À relire/valider sur staging avant application. Aucun secret n'est retourné.
BEGIN;
-- Empêche une écriture concurrente de réintroduire une clé entre nettoyage et trigger.
-- Échoue rapidement plutôt que bloquer durablement une base occupée.
SET LOCAL lock_timeout = '5s';
DO $$
DECLARE tab text;
BEGIN
    FOREACH tab IN ARRAY ARRAY['company_settings','quotes','invoices','document_templates'] LOOP
        IF to_regclass('public.' || tab) IS NOT NULL THEN
            EXECUTE format('LOCK TABLE public.%I IN SHARE ROW EXCLUSIVE MODE',tab);
        END IF;
    END LOOP;
END $$;
CREATE SCHEMA IF NOT EXISTS payment_private;
REVOKE ALL ON SCHEMA payment_private FROM PUBLIC, anon, authenticated;
CREATE TABLE IF NOT EXISTS payment_private.legacy_keys (
    organization_id uuid NOT NULL REFERENCES public.organizations(id),
    digest text NOT NULL,
    secret_value text NOT NULL,
    quarantined_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (organization_id,digest)
);
ALTER TABLE payment_private.legacy_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON payment_private.legacy_keys FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA payment_private TO service_role;
GRANT SELECT ON payment_private.legacy_keys TO service_role;

CREATE OR REPLACE FUNCTION payment_private.clean(value jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,payment_private AS $$
DECLARE result jsonb;
BEGIN
    IF jsonb_typeof(value)='object' THEN
        SELECT coalesce(jsonb_object_agg(key,payment_private.clean(val)), '{}'::jsonb) INTO result
          FROM jsonb_each(value) e(key,val) WHERE key NOT IN ('apiKey','api_key','secretKey','secret_key');
    ELSIF jsonb_typeof(value)='array' THEN
        SELECT coalesce(jsonb_agg(payment_private.clean(val) ORDER BY ordinal), '[]'::jsonb) INTO result
          FROM jsonb_array_elements(value) WITH ORDINALITY e(val,ordinal);
    ELSE result:=value; END IF;
    RETURN result;
END $$;
CREATE OR REPLACE FUNCTION payment_private.extract_keys(value jsonb)
RETURNS SETOF text LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,payment_private AS $$
DECLARE item record;
BEGIN
    IF jsonb_typeof(value)='object' THEN
        FOR item IN SELECT * FROM jsonb_each(value) LOOP
            IF item.key IN ('apiKey','api_key','secretKey','secret_key') AND jsonb_typeof(item.value)='string' THEN
                IF length(trim(item.value #>> '{}')) > 0 THEN RETURN NEXT item.value #>> '{}'; END IF;
            ELSE RETURN QUERY SELECT payment_private.extract_keys(item.value); END IF;
        END LOOP;
    ELSIF jsonb_typeof(value)='array' THEN
        FOR item IN SELECT * FROM jsonb_array_elements(value) LOOP
            RETURN QUERY SELECT payment_private.extract_keys(item.value);
        END LOOP;
    END IF;
END $$;

-- Tables contenant les paramètres d'entreprise ou leurs copies historiques.
-- L'ensemble est transactionnel ; les triggers financiers restent actifs.
DO $$
DECLARE col record;
BEGIN
    FOR col IN SELECT table_name,column_name,data_type FROM information_schema.columns
      WHERE table_schema='public' AND table_name IN ('company_settings','quotes','invoices','document_templates')
      AND data_type IN ('json','jsonb') LOOP
        EXECUTE format('INSERT INTO payment_private.legacy_keys(organization_id,digest,secret_value)
          SELECT organization_id,md5(k),k FROM public.%I,
          LATERAL payment_private.extract_keys(%I::jsonb) k ON CONFLICT DO NOTHING',col.table_name,col.column_name);
        EXECUTE format('UPDATE public.%I SET %I=payment_private.clean(%I::jsonb)::%s
          WHERE %I::jsonb IS DISTINCT FROM payment_private.clean(%I::jsonb)',
          col.table_name,col.column_name,col.column_name,col.data_type,col.column_name,col.column_name);
    END LOOP;
END $$;

CREATE OR REPLACE FUNCTION payment_private.reject_public_secrets()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,payment_private AS $$
BEGIN
    IF to_jsonb(NEW) IS DISTINCT FROM payment_private.clean(to_jsonb(NEW)) THEN
        RAISE EXCEPTION 'Les clés de paiement ne peuvent pas être enregistrées dans les données publiques.' USING ERRCODE='22023';
    END IF;
    RETURN NEW;
END $$;
DO $$
DECLARE tab text;
BEGIN
    FOREACH tab IN ARRAY ARRAY['company_settings','quotes','invoices','document_templates'] LOOP
        IF to_regclass('public.' || tab) IS NOT NULL THEN
            EXECUTE format('DROP TRIGGER IF EXISTS reject_public_payment_secrets ON public.%I',tab);
            EXECUTE format('CREATE TRIGGER reject_public_payment_secrets BEFORE INSERT OR UPDATE ON public.%I
              FOR EACH ROW EXECUTE FUNCTION payment_private.reject_public_secrets()',tab);
        END IF;
    END LOOP;
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA payment_private FROM PUBLIC,anon,authenticated;
COMMIT;
