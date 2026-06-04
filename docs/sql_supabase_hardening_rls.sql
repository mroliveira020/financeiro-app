-- Hardening incremental do Supabase para tabelas públicas sensíveis.
-- Objetivo:
-- 1. Habilitar RLS nas tabelas do schema public ainda sinalizadas sem proteção.
-- 2. Preservar o funcionamento atual do backend e do abastecimento externo via service_role/postgres.
-- 3. Não abrir acesso para anon/authenticated até que políticas específicas sejam desenhadas.

BEGIN;

DO $$
DECLARE
  tabela text;
  tabelas text[] := ARRAY[
    'agent_tasks',
    'alugueis_comparaveis',
    'avaliacoes',
    'bairros_enriquecidos',
    'cidades_enriquecidas',
    'comparaveis',
    'contexto_leilao',
    'fontes_coleta',
    'ia_jobs',
    'imoveis_fotos',
    'imoveis_selecionados_ai_analise',
    'matriculas_enriquecidas',
    'user_capabilities'
  ];
  policy_name text;
BEGIN
  FOREACH tabela IN ARRAY tabelas
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tabela);

    policy_name := format('p_%s_service_role_all', tabela);
    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = tabela
        AND policyname = policy_name
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
        policy_name,
        tabela
      );
    END IF;
  END LOOP;
END
$$;

COMMIT;

-- Validação sugerida após aplicar:
-- SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
-- FROM pg_class c
-- JOIN pg_namespace n ON n.oid = c.relnamespace
-- WHERE n.nspname = 'public'
--   AND c.relkind = 'r'
--   AND c.relname IN (
--     'agent_tasks',
--     'alugueis_comparaveis',
--     'avaliacoes',
--     'bairros_enriquecidos',
--     'cidades_enriquecidas',
--     'comparaveis',
--     'contexto_leilao',
--     'fontes_coleta',
--     'ia_jobs',
--     'imoveis_fotos',
--     'imoveis_selecionados_ai_analise',
--     'matriculas_enriquecidas',
--     'user_capabilities'
--   )
-- ORDER BY c.relname;
