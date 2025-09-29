-- Script inicial do esquema financeiro pessoal (Supabase)
-- Execute no Supabase Studio (SQL Editor) após revisar conforme necessidades específicas.

create extension if not exists "pgcrypto";

begin;

-- =============================
-- 1. Tabelas principais
-- =============================

create table if not exists perfis (
  id_uuid uuid primary key default gen_random_uuid(),
  id_usuario_supabase uuid unique not null,
  nome text not null,
  fuso_horario text default 'America/Sao_Paulo',
  moeda_padrao text default 'BRL',
  configuracoes_json jsonb default '{}'::jsonb,
  criado_em timestamptz default now()
);

create table if not exists familias_financeiras (
  id_uuid uuid primary key default gen_random_uuid(),
  nome text not null,
  id_perfil_responsavel uuid not null references perfis(id_uuid) on delete cascade,
  criado_em timestamptz default now()
);

create table if not exists membros_familia (
  id_familia uuid not null references familias_financeiras(id_uuid) on delete cascade,
  id_perfil uuid not null references perfis(id_uuid) on delete cascade,
  papel text not null check (papel in ('gestor','parceiro','convidado')),
  permissoes_json jsonb default '{}'::jsonb,
  primary key (id_familia, id_perfil)
);

create table if not exists contas_financeiras (
  id_uuid uuid primary key default gen_random_uuid(),
  id_familia uuid not null references familias_financeiras(id_uuid) on delete cascade,
  nome text not null,
  tipo text not null check (tipo in ('corrente','poupanca','cartao','reserva')),
  saldo_inicial numeric(14,2) default 0,
  saldo_atual numeric(14,2) default 0,
  moeda text default 'BRL',
  ativa boolean default true,
  criado_em timestamptz default now()
);

create table if not exists participantes_conta (
  id_conta uuid not null references contas_financeiras(id_uuid) on delete cascade,
  id_perfil uuid not null references perfis(id_uuid) on delete cascade,
  escopo text not null check (escopo in ('pessoal','compartilhado')),
  primary key (id_conta, id_perfil)
);

create table if not exists categorias_financeiras (
  id_uuid uuid primary key default gen_random_uuid(),
  id_familia uuid not null references familias_financeiras(id_uuid) on delete cascade,
  nome text not null,
  tipo text not null check (tipo in ('fixa','variavel','periodica','meta')),
  cor_hex varchar(7),
  ativa boolean default true,
  saldo_atual numeric(14,2) default 0,
  criado_em timestamptz default now(),
  unique (id_familia, nome)
);

create table if not exists orcamentos_categoria (
  id_uuid uuid primary key default gen_random_uuid(),
  id_categoria uuid not null references categorias_financeiras(id_uuid) on delete cascade,
  mes_referencia date not null,
  limite_valor numeric(14,2) not null check (limite_valor >= 0),
  valor_buffer_planejado numeric(14,2) default 0,
  escopo_envelope text default 'pessoal' check (escopo_envelope in ('pessoal','compartilhado')),
  unique (id_categoria, mes_referencia)
);

create table if not exists lancamentos (
  id_uuid uuid primary key default gen_random_uuid(),
  id_familia uuid not null references familias_financeiras(id_uuid) on delete cascade,
  id_conta uuid not null references contas_financeiras(id_uuid),
  id_categoria uuid references categorias_financeiras(id_uuid),
  id_perfil_autor uuid not null references perfis(id_uuid),
  data_movimento date not null,
  valor numeric(14,2) not null check (valor > 0),
  tipo_movimento text not null check (tipo_movimento in ('receita','despesa','transferencia')),
  metodo_pagamento text,
  observacoes text,
  origem_registro text default 'manual' check (origem_registro in ('manual','importacao')),
  criado_em timestamptz default now()
);

create table if not exists parcelas_lancamento (
  id_lancamento uuid not null references lancamentos(id_uuid) on delete cascade,
  id_categoria uuid not null references categorias_financeiras(id_uuid),
  valor_parcela numeric(14,2) not null check (valor_parcela > 0),
  primary key (id_lancamento, id_categoria)
);

create table if not exists cartoes_credito (
  id_uuid uuid primary key default gen_random_uuid(),
  id_conta_cartao uuid not null references contas_financeiras(id_uuid) on delete cascade,
  emissor text,
  dia_fechamento smallint not null check (dia_fechamento between 1 and 31),
  dia_vencimento smallint not null check (dia_vencimento between 1 and 31),
  limite_credito numeric(14,2) check (limite_credito >= 0),
  id_perfil_titular uuid not null references perfis(id_uuid),
  criado_em timestamptz default now()
);

create table if not exists faturas_cartao (
  id_uuid uuid primary key default gen_random_uuid(),
  id_cartao uuid not null references cartoes_credito(id_uuid) on delete cascade,
  mes_referencia date not null,
  data_fechamento date,
  data_vencimento date,
  valor_total numeric(14,2) default 0,
  status_fatura text default 'aberta' check (status_fatura in ('aberta','fechada','paga')),
  unique (id_cartao, mes_referencia)
);

create table if not exists itens_fatura (
  id_fatura uuid not null references faturas_cartao(id_uuid) on delete cascade,
  id_lancamento uuid not null references lancamentos(id_uuid) on delete cascade,
  valor_registrado numeric(14,2) not null check (valor_registrado >= 0),
  parcela_atual smallint default 1,
  total_parcelas smallint default 1,
  primary key (id_fatura, id_lancamento)
);

create table if not exists metas_financeiras (
  id_uuid uuid primary key default gen_random_uuid(),
  id_familia uuid not null references familias_financeiras(id_uuid) on delete cascade,
  nome text not null,
  tipo_meta text not null check (tipo_meta in ('reserva','investimento','despesa')),
  valor_alvo numeric(14,2) not null check (valor_alvo > 0),
  data_alvo date,
  id_categoria_relacionada uuid references categorias_financeiras(id_uuid),
  criado_em timestamptz default now()
);

create table if not exists contribuicoes_meta (
  id_meta uuid not null references metas_financeiras(id_uuid) on delete cascade,
  id_lancamento uuid not null references lancamentos(id_uuid) on delete cascade,
  valor_contribuido numeric(14,2) not null check (valor_contribuido > 0),
  mes_referencia date,
  primary key (id_meta, id_lancamento)
);

create table if not exists notificacoes (
  id_uuid uuid primary key default gen_random_uuid(),
  id_familia uuid not null references familias_financeiras(id_uuid) on delete cascade,
  tipo_notificacao text not null,
  dados_json jsonb default '{}'::jsonb,
  lido_em timestamptz,
  criado_em timestamptz default now()
);

create table if not exists registros_auditoria (
  id_uuid uuid primary key default gen_random_uuid(),
  id_perfil uuid references perfis(id_uuid),
  entidade text not null,
  id_entidade uuid,
  acao text not null,
  dados_json jsonb default '{}'::jsonb,
  criado_em timestamptz default now()
);

-- =============================
-- 2. Índices adicionais
-- =============================

create index if not exists idx_lancamentos_familia_data on lancamentos(id_familia, data_movimento);
create index if not exists idx_lancamentos_categoria on lancamentos(id_categoria);
create index if not exists idx_lancamentos_conta on lancamentos(id_conta);
create index if not exists idx_orcamentos_mes on orcamentos_categoria(mes_referencia);
create index if not exists idx_faturas_status on faturas_cartao(id_cartao, status_fatura);
create index if not exists idx_notificacoes_pendentes on notificacoes(id_familia, lido_em);
create index if not exists idx_auditoria_data on registros_auditoria(criado_em);

-- =============================
-- 3. Funções auxiliares
-- =============================

create or replace function fn_recalcula_saldo_categoria(p_categoria uuid)
returns void language plpgsql as $$
begin
  update categorias_financeiras
     set saldo_atual = coalesce((
       select sum(case
                    when l.tipo_movimento = 'receita' then l.valor
                    when l.tipo_movimento = 'despesa' then -l.valor
                    else 0
                  end)
         from lancamentos l
         where l.id_categoria = p_categoria
     ), 0)
   where id_uuid = p_categoria;
end;
$$;

create or replace function fn_recalcula_saldo_conta(p_conta uuid)
returns void language plpgsql as $$
begin
  update contas_financeiras
     set saldo_atual = saldo_inicial + coalesce((
       select sum(case
                    when tipo_movimento = 'receita' then valor
                    when tipo_movimento = 'despesa' then -valor
                    else 0
                  end)
         from lancamentos
         where id_conta = p_conta
     ), 0)
   where id_uuid = p_conta;
end;
$$;

create or replace function fn_atualiza_totais_fatura(p_fatura uuid)
returns void language plpgsql as $$
begin
  update faturas_cartao
     set valor_total = coalesce((
       select sum(valor_registrado)
         from itens_fatura
         where id_fatura = p_fatura
     ), 0)
   where id_uuid = p_fatura;
end;
$$;

create or replace function fn_registra_auditoria()
returns trigger language plpgsql as $$
declare
  v_entidade text := TG_TABLE_NAME;
  v_id uuid;
  v_acao text := TG_OP;
  v_payload jsonb;
  v_perfil uuid;
begin
  if TG_OP = 'INSERT' then
    v_id := NEW.id_uuid;
    v_payload := to_jsonb(NEW);
  elsif TG_OP = 'UPDATE' then
    v_id := NEW.id_uuid;
    v_payload := jsonb_build_object('antes', to_jsonb(OLD), 'depois', to_jsonb(NEW));
  else
    v_id := OLD.id_uuid;
    v_payload := to_jsonb(OLD);
  end if;

  v_perfil := (v_payload ->> 'id_perfil_autor')::uuid;

  insert into registros_auditoria(id_perfil, entidade, id_entidade, acao, dados_json)
  values (v_perfil, v_entidade, v_id, v_acao, v_payload);

  if TG_OP = 'DELETE' then
    return OLD;
  end if;
  return NEW;
end;
$$;

create or replace function fn_registra_e_recalcula()
returns trigger language plpgsql as $$
begin
  if TG_OP = 'INSERT' then
    if NEW.id_categoria is not null then
      perform fn_recalcula_saldo_categoria(NEW.id_categoria);
    end if;
    perform fn_recalcula_saldo_conta(NEW.id_conta);
    return NEW;
  elsif TG_OP = 'UPDATE' then
    if OLD.id_categoria is not null then
      perform fn_recalcula_saldo_categoria(OLD.id_categoria);
    end if;
    if NEW.id_categoria is not null then
      perform fn_recalcula_saldo_categoria(NEW.id_categoria);
    end if;
    perform fn_recalcula_saldo_conta(OLD.id_conta);
    perform fn_recalcula_saldo_conta(NEW.id_conta);
    return NEW;
  else
    if OLD.id_categoria is not null then
      perform fn_recalcula_saldo_categoria(OLD.id_categoria);
    end if;
    perform fn_recalcula_saldo_conta(OLD.id_conta);
    return OLD;
  end if;
end;
$$;

create or replace function fn_trigger_itens_fatura()
returns trigger language plpgsql as $$
begin
  if TG_OP = 'INSERT' then
    perform fn_atualiza_totais_fatura(NEW.id_fatura);
    return NEW;
  elsif TG_OP = 'UPDATE' then
    perform fn_atualiza_totais_fatura(NEW.id_fatura);
    if OLD.id_fatura <> NEW.id_fatura then
      perform fn_atualiza_totais_fatura(OLD.id_fatura);
    end if;
    return NEW;
  else
    perform fn_atualiza_totais_fatura(OLD.id_fatura);
    return OLD;
  end if;
end;
$$;

-- =============================
-- 4. Triggers
-- =============================

drop trigger if exists tg_lancamento_recalcula on lancamentos;
create trigger tg_lancamento_recalcula
after insert or update or delete on lancamentos
for each row execute function fn_registra_e_recalcula();

drop trigger if exists tg_auditoria_lancamentos on lancamentos;
create trigger tg_auditoria_lancamentos
after insert or update or delete on lancamentos
for each row execute function fn_registra_auditoria();

drop trigger if exists tg_itens_fatura_totais on itens_fatura;
create trigger tg_itens_fatura_totais
after insert or update or delete on itens_fatura
for each row execute function fn_trigger_itens_fatura();

drop trigger if exists tg_auditoria_contas on contas_financeiras;
create trigger tg_auditoria_contas
after insert or update or delete on contas_financeiras
for each row execute function fn_registra_auditoria();

drop trigger if exists tg_auditoria_categorias on categorias_financeiras;
create trigger tg_auditoria_categorias
after insert or update or delete on categorias_financeiras
for each row execute function fn_registra_auditoria();

-- =============================
-- 5. Row Level Security
-- =============================

alter table perfis enable row level security;
alter table familias_financeiras enable row level security;
alter table membros_familia enable row level security;
alter table contas_financeiras enable row level security;
alter table participantes_conta enable row level security;
alter table categorias_financeiras enable row level security;
alter table orcamentos_categoria enable row level security;
alter table lancamentos enable row level security;
alter table parcelas_lancamento enable row level security;
alter table cartoes_credito enable row level security;
alter table faturas_cartao enable row level security;
alter table itens_fatura enable row level security;
alter table metas_financeiras enable row level security;
alter table contribuicoes_meta enable row level security;
alter table notificacoes enable row level security;
alter table registros_auditoria enable row level security;

-- Exemplos de policies (ajuste conforme regras de negócio)

drop policy if exists perfis_self on perfis;
create policy perfis_self on perfis
  for all
  using (id_usuario_supabase = auth.uid())
  with check (id_usuario_supabase = auth.uid());

-- famílias: apenas membros podem ver/manter

drop policy if exists familias_membros on familias_financeiras;
create policy familias_membros on familias_financeiras
  for all
  using (exists (
    select 1 from membros_familia mf
    join perfis p on p.id_uuid = mf.id_perfil
    where mf.id_familia = familias_financeiras.id_uuid
      and p.id_usuario_supabase = auth.uid()
  ))
  with check (exists (
    select 1 from membros_familia mf
    join perfis p on p.id_uuid = mf.id_perfil
    where mf.id_familia = familias_financeiras.id_uuid
      and p.id_usuario_supabase = auth.uid()
  ));

-- membros_familia: cada usuário vê sua participação

drop policy if exists membros_da_familia on membros_familia;
create policy membros_da_familia on membros_familia
  for all
  using (exists (
    select 1 from perfis p
    where p.id_uuid = membros_familia.id_perfil
      and p.id_usuario_supabase = auth.uid()
  ));

-- contas, categorias, orçamentos, lançamentos e demais entidades podem repetir padrão semelhante

comment on policy membros_da_familia on membros_familia is 'Permite que cada usuário enxergue os vínculos de família em que participa.';

commit;
