-- Hardening inicial do Supabase para tabelas públicas sensíveis.
-- Objetivo:
-- 1. Habilitar RLS nas tabelas sinalizadas pelo alerta do Supabase.
-- 2. Preservar o funcionamento atual do backend/garimpo via service_role.
-- 3. Não abrir acesso para anon/authenticated até que políticas específicas sejam desenhadas.

BEGIN;

ALTER TABLE public.imoveis_selecionados_analise ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.imoveis_selecionados_observacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.imoveis_selecionados_responsaveis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.imovel_socios ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'imoveis_selecionados_analise'
      AND policyname = 'p_imoveis_selecionados_analise_service_role_all'
  ) THEN
    EXECUTE $sql$
      CREATE POLICY p_imoveis_selecionados_analise_service_role_all
      ON public.imoveis_selecionados_analise
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true)
    $sql$;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'imoveis_selecionados_observacoes'
      AND policyname = 'p_imoveis_selecionados_observacoes_service_role_all'
  ) THEN
    EXECUTE $sql$
      CREATE POLICY p_imoveis_selecionados_observacoes_service_role_all
      ON public.imoveis_selecionados_observacoes
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true)
    $sql$;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'imoveis_selecionados_responsaveis'
      AND policyname = 'p_imoveis_selecionados_responsaveis_service_role_all'
  ) THEN
    EXECUTE $sql$
      CREATE POLICY p_imoveis_selecionados_responsaveis_service_role_all
      ON public.imoveis_selecionados_responsaveis
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true)
    $sql$;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'imovel_socios'
      AND policyname = 'p_imovel_socios_service_role_all'
  ) THEN
    EXECUTE $sql$
      CREATE POLICY p_imovel_socios_service_role_all
      ON public.imovel_socios
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true)
    $sql$;
  END IF;
END
$$;

COMMIT;

-- Validação sugerida após aplicar:
-- SELECT n.nspname, c.relname, c.relrowsecurity
-- FROM pg_class c
-- JOIN pg_namespace n ON n.oid = c.relnamespace
-- WHERE n.nspname = 'public'
--   AND c.relname IN (
--     'imoveis_selecionados_analise',
--     'imoveis_selecionados_observacoes',
--     'imoveis_selecionados_responsaveis',
--     'imovel_socios'
--   );
