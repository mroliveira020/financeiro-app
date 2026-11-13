CREATE TABLE public.portal_intencoes_participacao (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    numero_bem text NOT NULL CHECK (length(numero_bem) BETWEEN 1 AND 120),
    usuario_id integer NOT NULL REFERENCES public.users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    retirada_em timestamptz
);
CREATE UNIQUE INDEX portal_intencoes_ativas_usuario
    ON public.portal_intencoes_participacao (numero_bem, usuario_id)
    WHERE retirada_em IS NULL;

CREATE TABLE public.portal_tarefas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    numero_bem text CHECK (length(numero_bem) BETWEEN 1 AND 120),
    imovel_id bigint REFERENCES public.imoveis(id),
    titulo text NOT NULL CHECK (length(btrim(titulo)) BETWEEN 1 AND 200),
    descricao text NOT NULL DEFAULT '' CHECK (length(descricao) <= 10000),
    situacao text NOT NULL DEFAULT 'a_fazer' CHECK (situacao IN ('a_fazer', 'concluida')),
    prazo date,
    responsavel_id integer REFERENCES public.users(id),
    created_by integer NOT NULL REFERENCES public.users(id),
    origem text NOT NULL DEFAULT 'manual' CHECK (origem IN ('manual', 'preparacao')),
    intencao_id uuid REFERENCES public.portal_intencoes_participacao(id),
    arquivada_em timestamptz,
    concluida_em timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    versao integer NOT NULL DEFAULT 1 CHECK (versao > 0),
    CHECK (num_nonnulls(numero_bem, imovel_id) = 1),
    CHECK ((origem = 'preparacao' AND intencao_id IS NOT NULL AND numero_bem IS NOT NULL)
        OR (origem = 'manual' AND intencao_id IS NULL)),
    CHECK ((situacao = 'concluida') = (concluida_em IS NOT NULL))
);
CREATE INDEX portal_tarefas_prospeccao ON public.portal_tarefas(numero_bem) WHERE numero_bem IS NOT NULL;
CREATE INDEX portal_tarefas_financeiro ON public.portal_tarefas(imovel_id) WHERE imovel_id IS NOT NULL;
CREATE INDEX portal_tarefas_responsavel ON public.portal_tarefas(responsavel_id);
CREATE INDEX portal_tarefas_autor ON public.portal_tarefas(created_by);
CREATE INDEX portal_tarefas_intencao ON public.portal_tarefas(intencao_id) WHERE intencao_id IS NOT NULL;
CREATE INDEX portal_tarefas_lista ON public.portal_tarefas(arquivada_em, situacao, prazo);

-- O portal usa JWT próprio e valida o acesso na API Flask.
-- As tabelas ficam fechadas para acesso direto pela API pública do Supabase.
ALTER TABLE public.portal_tarefas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_intencoes_participacao ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.portal_tarefas, public.portal_intencoes_participacao FROM anon, authenticated;
