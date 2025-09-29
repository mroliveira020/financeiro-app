-- Script de dados de exemplo para desenvolvimento do sistema financeiro pessoal
-- Execute no Supabase Studio (SQL Editor) com uma sessão que possua permissões de service role.
-- Substitua os valores de id_usuario_supabase pelos IDs reais do Supabase Auth quando desejar validar RLS com usuários reais.

begin;

with params as (
  select date_trunc('month', current_date)::date as mes_base
),
perfis_insert as (
  insert into perfis (id_usuario_supabase, nome, fuso_horario, moeda_padrao)
  values
    ('00000000-0000-0000-0000-000000000001', 'Matheus Gestor', 'America/Sao_Paulo', 'BRL'),
    ('00000000-0000-0000-0000-000000000002', 'Ana Parceira', 'America/Sao_Paulo', 'BRL')
  returning id_uuid, id_usuario_supabase, nome
),
familias_insert as (
  insert into familias_financeiras (nome, id_perfil_responsavel)
  values (
    'Família Financeira Pessoal',
    (select id_uuid from perfis_insert where nome = 'Matheus Gestor')
  )
  returning id_uuid
),
membros_insert as (
  insert into membros_familia (id_familia, id_perfil, papel, permissoes_json)
  select f.id_uuid,
         p.id_uuid,
         case when p.nome = 'Matheus Gestor' then 'gestor' else 'parceiro' end,
         '{}'::jsonb
  from familias_insert f
  join perfis_insert p on true
  returning *
),
contas_insert as (
  insert into contas_financeiras (id_familia, nome, tipo, saldo_inicial, saldo_atual, moeda, ativa)
  select f.id_uuid, c.nome, c.tipo, c.saldo_inicial, c.saldo_inicial, 'BRL', true
  from familias_insert f
  cross join (values
    ('Conta Corrente Principal', 'corrente', 5000.00),
    ('Cartão Matheus', 'cartao', 0.00),
    ('Reserva Emergência', 'reserva', 2000.00)
  ) as c(nome, tipo, saldo_inicial)
  returning id_uuid, id_familia, nome, tipo
),
participantes_insert as (
  insert into participantes_conta (id_conta, id_perfil, escopo)
  select c.id_uuid,
         p.id_uuid,
         case when c.nome = 'Cartão Matheus' and p.nome = 'Matheus Gestor' then 'pessoal' else 'compartilhado' end
  from contas_insert c
  join perfis_insert p
    on (c.nome = 'Cartão Matheus' and p.nome in ('Matheus Gestor','Ana Parceira'))
    or (c.nome <> 'Cartão Matheus')
  returning *
),
categorias_insert as (
  insert into categorias_financeiras (id_familia, nome, tipo, cor_hex, ativa)
  select f.id_uuid, cat.nome, cat.tipo, cat.cor_hex, true
  from familias_insert f
  cross join (values
    ('Receita Mensal', 'fixa', '#1E90FF'),
    ('Moradia', 'fixa', '#FF7F50'),
    ('Supermercado', 'variavel', '#32CD32'),
    ('Lazer', 'variavel', '#FFD700'),
    ('Transporte', 'variavel', '#8A2BE2'),
    ('Buffer Mensal', 'periodica', '#20B2AA'),
    ('Reserva de Emergência', 'meta', '#FF69B4')
  ) as cat(nome, tipo, cor_hex)
  returning id_uuid, id_familia, nome
),
orcamentos_insert as (
  insert into orcamentos_categoria (id_categoria, mes_referencia, limite_valor, valor_buffer_planejado, escopo_envelope)
  select c.id_uuid,
         params.mes_base,
         case c.nome
           when 'Receita Mensal' then 0
           when 'Moradia' then 3200
           when 'Supermercado' then 1500
           when 'Lazer' then 800
           when 'Transporte' then 600
           when 'Buffer Mensal' then 2500
           when 'Reserva de Emergência' then 1000
           else 0
         end,
         case when c.nome = 'Buffer Mensal' then 2000 else 0 end,
         case when c.nome in ('Receita Mensal','Reserva de Emergência') then 'pessoal' else 'compartilhado' end
  from categorias_insert c
  cross join params
  returning *
),
cartoes_insert as (
  insert into cartoes_credito (id_conta_cartao, emissor, dia_fechamento, dia_vencimento, limite_credito, id_perfil_titular)
  select (select id_uuid from contas_insert where nome = 'Cartão Matheus'),
         'Banco XPTO',
         15,
         25,
         5000,
         (select id_uuid from perfis_insert where nome = 'Matheus Gestor')
  returning id_uuid
),
lancamentos_insert as (
  insert into lancamentos (id_familia, id_conta, id_categoria, id_perfil_autor, data_movimento, valor, tipo_movimento, metodo_pagamento, observacoes)
  select f.id_uuid,
         (select id_uuid from contas_insert where nome = dados.conta_nome),
         (select id_uuid from categorias_insert where nome = dados.categoria_nome),
         (select id_uuid from perfis_insert where nome = dados.perfil_nome),
         params.mes_base + (dados.dia_mes - 1),
         dados.valor,
         dados.tipo_movimento,
         dados.metodo_pagamento,
         dados.observacoes
  from familias_insert f
  cross join params
  cross join lateral (
    values
      ('Matheus Gestor','Conta Corrente Principal','Receita Mensal',20,12000,'receita','transferencia','Salário de outubro'),
      ('Matheus Gestor','Conta Corrente Principal','Moradia',25,3200,'despesa','transferencia','Aluguel apartamento'),
      ('Ana Parceira','Cartão Matheus','Supermercado',23,850,'despesa','cartao','Supermercado cartão - outubro'),
      ('Matheus Gestor','Cartão Matheus','Lazer',26,300,'despesa','cartao','Cinema com amigos'),
      ('Matheus Gestor','Conta Corrente Principal','Transporte',18,200,'despesa','debito','Combustível carro'),
      ('Matheus Gestor','Reserva Emergência','Reserva de Emergência',22,1000,'receita','transferencia','Aporte Reserva Emergência'),
      ('Ana Parceira','Cartão Matheus','Buffer Mensal',12,3000,'despesa','cartao','Notebook trabalho (entrada)')
  ) as dados(perfil_nome, conta_nome, categoria_nome, dia_mes, valor, tipo_movimento, metodo_pagamento, observacoes)
  returning id_uuid, id_conta, id_categoria, observacoes, valor
),
fatura_insert as (
  insert into faturas_cartao (id_cartao, mes_referencia, data_fechamento, data_vencimento, status_fatura)
  select c.id_uuid,
         params.mes_base,
         params.mes_base + 14,
         params.mes_base + 24,
         'aberta'
  from cartoes_insert c
  cross join params
  returning id_uuid
),
itens_fatura_insert as (
  insert into itens_fatura (id_fatura, id_lancamento, valor_registrado, parcela_atual, total_parcelas)
  select f.id_uuid,
         l.id_uuid,
         case when l.observacoes = 'Notebook trabalho (entrada)' then l.valor / 6.0 else l.valor end,
         1,
         case when l.observacoes = 'Notebook trabalho (entrada)' then 6 else 1 end
  from fatura_insert f
  join contas_insert conta_cartao on conta_cartao.nome = 'Cartão Matheus'
  join lancamentos_insert l on l.id_conta = conta_cartao.id_uuid
  returning id_fatura
),
fatura_totais as (
  select f.id_uuid as id_fatura,
         sum(i.valor_registrado) as valor_total
  from fatura_insert f
  join itens_fatura i on i.id_fatura = f.id_uuid
  group by f.id_uuid
),
metas_insert as (
  insert into metas_financeiras (id_familia, nome, tipo_meta, valor_alvo, data_alvo, id_categoria_relacionada)
  select f.id_uuid,
         'Reserva de Emergência',
         'reserva',
         15000,
         (params.mes_base + interval '12 months')::date,
         (select id_uuid from categorias_insert where nome = 'Reserva de Emergência')
  from familias_insert f
  cross join params
  returning id_uuid
),
contribuicoes_insert as (
  insert into contribuicoes_meta (id_meta, id_lancamento, valor_contribuido, mes_referencia)
  select m.id_uuid,
         l.id_uuid,
         l.valor,
         params.mes_base
  from metas_insert m
  cross join params
  join lancamentos_insert l on l.observacoes = 'Aporte Reserva Emergência'
  returning *
),
notificacoes_insert as (
  insert into notificacoes (id_familia, tipo_notificacao, dados_json)
  select f.id_uuid,
         'limite_categoria',
         jsonb_build_object('categoria','Supermercado','limite',1500,'gasto_atual',850)
  from familias_insert f
  union all
  select f.id_uuid,
         'fatura_cartao_aberta',
         jsonb_build_object('cartao','Cartão Matheus','valor_atual',coalesce(t.valor_total,0))
  from familias_insert f
  left join fatura_totais t on true
  returning *
)
select 'dados_exemplo_inseridos' as status;

commit;
