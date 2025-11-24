-- Esquema para prospecção de imóveis no Supabase
-- Tabelas separadas da base de imóveis adquiridos

-- Histórico de coletas (permite múltiplas versões por numero_bem)
create table if not exists public.imoveis_prospeccao (
    numero_bem text not null,
    coletado_em timestamptz not null default now(),
    tipo_venda text,
    tipo_imovel text,
    uf char(2),
    cidade text,
    bairro text,
    endereco text,
    valor_avaliacao numeric(18,2),
    valor_venda numeric(18,2),
    desconto numeric(10,2),
    detalhes text,
    disponivel boolean,
    financia boolean,
    valor_leilao_1 numeric(18,2),
    valor_leilao_2 numeric(18,2),
    data_leilao_1 timestamptz,
    data_leilao_2 timestamptz,
    data_licitacao_aberta timestamptz,
    data_hora_encerramento timestamptz,
    lance_atual numeric(18,2),
    link_consulta text,
    fonte text,
    hash_linha text,
    primary key (numero_bem, coletado_em)
);

create index if not exists idx_imoveis_prospeccao_numero_bem on public.imoveis_prospeccao (numero_bem);
create index if not exists idx_imoveis_prospeccao_coletado_em on public.imoveis_prospeccao (coletado_em desc);

-- View de última coleta por imóvel (facilita consultas sem escolher timestamp)
create or replace view public.vw_imoveis_prospeccao_latest as
select distinct on (numero_bem)
    numero_bem,
    coletado_em,
    tipo_venda,
    tipo_imovel,
    uf,
    cidade,
    bairro,
    endereco,
    valor_avaliacao,
    valor_venda,
    desconto,
    detalhes,
    disponivel,
    financia,
    valor_leilao_1,
    valor_leilao_2,
    data_leilao_1,
    data_leilao_2,
    data_licitacao_aberta,
    data_hora_encerramento,
    lance_atual,
    link_consulta,
    fonte,
    hash_linha
from public.imoveis_prospeccao
order by numero_bem, coletado_em desc;

-- Seleção de imóveis para participação em leilão (um registro por número do bem)
create table if not exists public.imoveis_selecionados (
    numero_bem text not null,
    coletado_em_ref timestamptz null,
    status text not null default 'candidato' check (status in ('candidato','aprovado','descartado','em_leilao','arrematado')),
    valor_maximo numeric(18,2),
    observacoes text,
    prioridade integer,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (numero_bem),
    foreign key (numero_bem, coletado_em_ref) references public.imoveis_prospeccao (numero_bem, coletado_em) on delete set null
);

create index if not exists idx_imoveis_selecionados_status on public.imoveis_selecionados (status);
