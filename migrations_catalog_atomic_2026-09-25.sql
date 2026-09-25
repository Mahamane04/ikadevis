-- P0 REL-01. Préparer puis valider sur staging ; aucune application automatique.
-- Les anciens clients ne peuvent plus remplacer le catalogue par DELETE/INSERT.
BEGIN;

CREATE OR REPLACE FUNCTION public.catalog_snapshot_v1(p_org_id uuid, p_table text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE rows_json jsonb;
BEGIN
    IF NOT public.has_org_permission(p_org_id, ARRAY['owner','admin','estimator','commercial','viewer']) THEN
        RAISE EXCEPTION 'Catalogue non autorisé.' USING ERRCODE = '42501';
    END IF;
    IF p_table IS NULL OR p_table NOT IN ('materials','labor','solutions','recipes') THEN
        RAISE EXCEPTION 'Catalogue inconnu.' USING ERRCODE = '22023';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(p_org_id::text || ':' || p_table, 0));
    EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id), ''[]''::jsonb) FROM public.%I t WHERE organization_id = $1', p_table)
      INTO rows_json USING p_org_id;
    RETURN jsonb_build_object('rows', rows_json, 'fingerprint', md5(rows_json::text));
END $$;

CREATE OR REPLACE FUNCTION public.replace_catalog_v1(p_org_id uuid, p_table text, p_expected text, p_rows jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE snapshot jsonb; allowed text[]; columns_sql text; updates_sql text; payload jsonb; keys text[];
BEGIN
    IF NOT public.has_org_permission(p_org_id, ARRAY['owner','admin','estimator']) THEN
        RAISE EXCEPTION 'Modification du catalogue non autorisée.' USING ERRCODE = '42501';
    END IF;
    allowed := CASE p_table
      WHEN 'materials' THEN ARRAY['id','organization_id','name','category','unit_buy','unit_size','unit_calc','price_buy','price_calc','waste','yield_rate','purchase_mode','stock_qty']
      WHEN 'labor' THEN ARRAY['id','organization_id','name','calc_mode','unit','rate','yield_rate']
      WHEN 'solutions' THEN ARRAY['id','organization_id','name','icon','allowed_modes','custom_vars']
      WHEN 'recipes' THEN ARRAY['id','organization_id','solution_id','type','ref_id','formula','cost_category','label']
      ELSE NULL END;
    IF allowed IS NULL OR jsonb_typeof(p_rows) IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'Catalogue ou contenu invalide.' USING ERRCODE = '22023';
    END IF;
    IF jsonb_array_length(p_rows) > 10000 OR octet_length(p_rows::text) > 10000000 THEN
        RAISE EXCEPTION 'Catalogue trop volumineux.' USING ERRCODE = '22023';
    END IF;
    -- Le verrou est partagé avec la lecture : lignes et empreinte sont cohérentes.
    snapshot := public.catalog_snapshot_v1(p_org_id, p_table);
    IF p_expected IS NULL OR p_expected <> snapshot->>'fingerprint' THEN
        RAISE EXCEPTION 'Catalogue modifié ailleurs. Rechargez et comparez vos modifications.' USING ERRCODE = '40001';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_rows) r WHERE jsonb_typeof(r) <> 'object'
        OR NOT (r ? 'id') OR r->>'id' IS NULL
        OR (r ? 'organization_id' AND r->>'organization_id' IS DISTINCT FROM p_org_id::text)) THEN
        RAISE EXCEPTION 'Ligne ou entreprise invalide.' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_rows) r, jsonb_object_keys(r) k WHERE NOT (k = ANY(allowed))) THEN
        RAISE EXCEPTION 'Champ de catalogue interdit.' USING ERRCODE = '22023';
    END IF;
    SELECT coalesce(jsonb_agg(r || jsonb_build_object('organization_id', p_org_id)), '[]'::jsonb)
      INTO payload FROM jsonb_array_elements(p_rows) r;
    IF jsonb_array_length(payload) > 0 THEN
        SELECT array_agg(k ORDER BY k) INTO keys FROM jsonb_object_keys(payload->0) k;
        IF EXISTS (SELECT 1 FROM jsonb_array_elements(payload) r WHERE
          (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(r) k) IS DISTINCT FROM keys) THEN
            RAISE EXCEPTION 'Les lignes doivent utiliser les mêmes champs.' USING ERRCODE = '22023';
        END IF;
        SELECT string_agg(format('%I', k), ','),
               string_agg(format('%I=EXCLUDED.%I', k, k), ',') FILTER (WHERE k NOT IN ('id','organization_id'))
          INTO columns_sql, updates_sql FROM unnest(keys) k;
        IF updates_sql IS NULL THEN RAISE EXCEPTION 'Contenu manquant.' USING ERRCODE = '22023'; END IF;
        -- Upsert préserve created_at ; la transaction annule aussi les suppressions en cas d'erreur.
        EXECUTE format('INSERT INTO public.%I (%s) SELECT %s FROM jsonb_populate_recordset(NULL::public.%I, $1)
          ON CONFLICT (organization_id,id) DO UPDATE SET %s,updated_at=now()',
          p_table, columns_sql, columns_sql, p_table, updates_sql) USING payload;
    END IF;
    EXECUTE format('DELETE FROM public.%I t WHERE organization_id=$1 AND NOT EXISTS
      (SELECT 1 FROM jsonb_array_elements($2) r WHERE (r->>''id'')::bigint=t.id)', p_table) USING p_org_id, payload;
    RETURN public.catalog_snapshot_v1(p_org_id, p_table);
END $$;

REVOKE ALL ON FUNCTION public.catalog_snapshot_v1(uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.replace_catalog_v1(uuid,text,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.catalog_snapshot_v1(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.replace_catalog_v1(uuid,text,text,jsonb) TO authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.materials,public.labor,public.solutions,public.recipes FROM PUBLIC,anon,authenticated;
COMMIT;
