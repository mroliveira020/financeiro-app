# Financeiro — Documentação do Projeto

## Visão Geral

- Propósito: gestão financeira de imóveis com consolidação de orçamento vs. execução, cadastro de imóveis/categorias, lançamentos, edição e importação em lote.
- Stack: Backend Flask + PostgreSQL; Frontend React (Vite) + Bootstrap.
- Telas: Home (lista de imóveis) e Dashboard por imóvel (dados cadastrais, resumo financeiro, transações completas e incompletas).
- Escopo atual de prospecções: este projeto exibe, consulta e manipula no portal os imóveis ja abastecidos no Supabase; a captura e o enriquecimento dos dados acontecem em fluxo externo.

## Diretrizes para Contribuidores

- Consulte `../AGENTS.md` para orientações de estilo, comandos e processo de revisão antes de abrir PRs.

## Arquitetura

- Backend
  - App Flask em `backend/app.py`: define rotas de imóveis, categorias, lançamentos, resumo financeiro e orçamentos; registra `dashboard_bp` e `analytics_bp`.
  - Autenticação: `backend/auth.py` expõe `/auth/login`, `/auth/me`, `/auth/logout` e `/auth/users`; tokens JWT emitidos por `backend/security.py` com expiração configurável.
  - Blueprint Dashboard: `backend/dashboard/__init__.py` e `backend/dashboard/routes.py` — lista completos/incompletos, PATCH/DELETE, POST e PATCH em lote (categoria/imóvel/situação). Lançamentos são considerados “incompletos” quando `id_categoria = 0` (mesmo que `id_situacao = 1`).
  - Camada de dados: `backend/models.py` — CRUD, consultas às views e upsert de orçamentos.
  - Conexão DB: `backend/db_connection.py` — usa variáveis de ambiente do `.env` (PostgreSQL).
  - Analytics (admin): `backend/analytics.py` — rota de SELECT seguro e endpoint de lançamentos consolidados.
  - Notion helper: `backend/notion_service.py` — cliente utilitário não exposto em rotas públicas.
- Frontend
  - Rotas: `frontend/src/App.jsx` com `/login`, `/` (Home), `/dashboard/:id` e `/prospeccoes`; `RequireAuth` garante login antes de renderizar layout.
  - Home: `frontend/src/pages/Home.jsx` — lista/adiciona imóveis; usa `frontend/src/services/api.js`.
  - Dashboard: `frontend/src/pages/Dashboard.jsx` — compõe Dados Cadastrais, Resumo Financeiro, Transações Incompletas e Completas.
  - Prospecções: `frontend/src/pages/Prospeccoes.jsx` — nova tela na barra lateral com duas tabelas (Selecionados e Capturados) consumindo as rotas do backend.
  - Dados cadastrais: `frontend/src/components/dadosCadastrais/DadosCadastrais.jsx` — GET `/imoveis/:id`, exibe mapa, edição via modal.
  - Resumo financeiro: `frontend/src/components/ResumoFinanceiro.jsx` — GET `/dashboard/resumo-financeiro/:id`, calcula totais e ROI; edição de orçamentos via `ModalEditarOrcamento`.
  - Transações Incompletas: `frontend/src/components/TransacoesIncompletas/TransacoesIncompletas.jsx` — GET incompletos, atualização inline de categoria/imóvel/situação (com destaque de linhas alteradas e botões 💾/“Aplicar todos”), PATCH individual, POST lote.
  - Transações Completas: `frontend/src/components/transacoes/TransacoesCompletas.jsx` — GET completos, PATCH/DELETE; tabela e modal.
  - Tabelas: completas em `frontend/src/components/transacoes/LancamentosTable.jsx` (ordenação/paginação); incompletas em `frontend/src/components/TransacoesIncompletas/LancamentosTable.jsx` (ordenação).
  - Cliente HTTP: centralizado em `frontend/src/services/http.js` (Axios) usando `VITE_API_URL`.
- Integracao externa de captura
  - A captura de imoveis, o scraping e o enriquecimento de dados nao fazem mais parte do escopo operacional deste portal.
  - O banco Supabase continua sendo a fonte de dados consumida pelo site nas telas de Prospeccoes.
  - Este repositorio segue responsavel pelos contratos de leitura, filtros, listagens, selecao, analise e demais manipulacoes feitas pelo frontend e backend do site.

## Desenvolvimento (Quickstart)

- Requisitos: Python 3.9+, Node.js 18+, PostgreSQL acessível.
- Rodar dev (backend + frontend):
  - `bash dev.sh`
  - Opcional: `bash scripts/install-dev-command.sh` e depois `financeiro-dev`
- Variáveis:
  - Backend (copie `backend/.env.example` para `backend/.env`): `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_PORT` (padrão 5432)
    - Flags: `APP_ENV` (development|production), `READ_ONLY` (true|false), `ENABLE_SQL_ENDPOINT` (true|false), `ENABLE_SEARCH_API` (true|false), `ALLOWED_ORIGINS` (origens separadas por vírgula).
    - Autenticação: `JWT_SECRET` (obrigatório em produção), `JWT_EXPIRES_MINUTES` (padrão 720 minutos / 12 horas), `ADMIN_TOKEN` (opcional para `/sql`).
    - Rate limiting: `RATE_LIMIT_STORAGE_URI` (ex.: `memory://` ou `redis://...`), `RATE_LIMIT_EDIT` (ex.: `30/minute`), `RATE_LIMIT_ADMIN` (ex.: `10/minute`), `RATE_LIMIT_SEARCH` (ex.: `60/minute`), `RATE_LIMIT_GLOBAL` (opcional, ex.: `300/minute`), `TRUST_PROXY` (true em produção no Render).
    - GPT Write: `ENABLE_GPT_WRITE` (true|false), `GPT_TOKEN` (token do agente), `RATE_LIMIT_GPT_WRITE` (ex.: `20/minute`).
    - Performance: `DB_POOL_MIN`/`DB_POOL_MAX` (pool de conexões), `PERF_WARN_THRESHOLD_MS` (padrão 700ms para log de requisições lentas).
  - Frontend: `frontend/.env` (de `.env.example`) com `VITE_API_URL` (ex.: `http://127.0.0.1:5000`).
- Portas: API `http://127.0.0.1:5000`, Vite `http://127.0.0.1:5173`

## Backup do Supabase

- Objetivo: gerar um backup local do schema `public` e dos dados atuais do Supabase, sem versionar os artefatos.
- Script oficial do projeto: `scripts/backup_supabase.py`
- Execução recomendada:
  - `backend/venv/bin/python scripts/backup_supabase.py`
- Pré-requisito:
  - `backend/.env` deve conter `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` e `DB_PORT`
  - o `backend/venv` precisa ter `psycopg2` instalado
- Saída padrão:
  - diretório local `.local_backups/supabase/`
  - arquivo compactado com o padrão `YYYYMMDD HHMM Backup Supabase.zip`
- Estrutura gerada:
  - `schema_objects.txt`: DDL de tabelas, constraints, índices, RLS/policies, funções, views, materialized views, triggers, sequences e extensões
  - `manifest.txt`: relação das tabelas exportadas
  - `tabelas/<nome>.txt`: dados de cada tabela em CSV com cabeçalho
- Segurança operacional:
  - os arquivos ficam somente na máquina local
  - `.local_backups/` está ignorado no Git e não deve ser publicado

## Hardening do Supabase

- Alerta já identificado no projeto: havia tabelas do schema `public` sem `RLS` ativo.
- Script SQL de correção inicial: [sql_supabase_hardening_rls.sql](/Users/matheusoliveira/Documents/Leiloes/Aplicacoes/Financeiro/docs/sql_supabase_hardening_rls.sql)
- Tabelas cobertas nesse hardening inicial:
  - `imoveis_selecionados_analise`
  - `imoveis_selecionados_observacoes`
  - `imoveis_selecionados_responsaveis`
  - `imovel_socios`
- Tabelas cobertas na rodada incremental validada em produção:
  - `agent_tasks`
  - `alugueis_comparaveis`
  - `avaliacoes`
  - `bairros_enriquecidos`
  - `cidades_enriquecidas`
  - `comparaveis`
  - `contexto_leilao`
  - `fontes_coleta`
  - `ia_jobs`
  - `imoveis_fotos`
  - `imoveis_selecionados_ai_analise`
  - `matriculas_enriquecidas`
  - `user_capabilities`
- Estratégia adotada:
  - habilitar `RLS`
  - criar policy mínima para `service_role`
  - não liberar `anon` nem `authenticated` até que políticas específicas sejam desenhadas
- Achados da validação de amostra real:
  - `imoveis_selecionados_ai_analise` ainda possui registros órfãos para `numero_bem` fora da fila atual;
  - `imoveis_selecionados_observacoes` também possui histórico órfão para itens já removidos da seleção;
  - esses casos ficaram como insumo direto para a frente de banco que trata a ficha de capturados e o desacoplamento da FK.
- Ação operacional obrigatória:
  - rotacionar `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_KEY` no painel do Supabase antes de continuar usando o ambiente atual, pois havia chaves reais expostas em configuração local do projeto.

## Autenticação e Provisionamento

- Criação inicial de usuário: com o venv ativo e variáveis de banco configuradas, execute `python backend/create_user.py --email admin@empresa.com --role admin` e informe a senha quando solicitado. O script utiliza `backend/models.py` para aplicar hash seguro (Werkzeug) e grava o registro na tabela `users`.
- Login: acesse `/login`, informe e-mail e senha. O frontend armazena o JWT em `sessionStorage` e renova a sessão via `/auth/me`.
- Perfis:
  - `viewer`: leitura das rotas protegidas.
  - `editor`: leitura + edição (rotas protegidas por `requires_editor_token` agora aceitam JWT com papel editor/admin).
  - `admin`: inclui acesso a `/auth/users` (criação de novos usuários) e a recursos administrativos.
- Rotas de leitura (`/imoveis`, `/categorias`, `/dashboard/*`, `/lancamentos`, buscas) exigem JWT válido. Rotas públicas permanecem: `/healthz`, `/openapi.json` e landing do frontend antes do login.
- Todas as rotas de escrita exigem JWT válido com papel `editor` ou `admin`; tokens legados foram descontinuados.

## Ambientes e Serviços

- GPT Backend (existente): API dedicada ao agente GPT — pode manter `/sql` ativo; recomenda-se DB usuário read-only.
- Site Backend: API para o site público — deve restringir CORS, desativar `/sql` e aplicar política de edição.
- Frontend: site estático (Vite) consumindo o Site Backend.

### URLs de Produção (Render)

- Site Backend: https://site-backend-hg4w.onrender.com
- GPT Backend: https://gpt-backend-hg4w.onrender.com
- Frontend: https://financeiro-frontend-hg4w.onrender.com

Observações:
- O Frontend deve apontar `VITE_API_URL` para o Site Backend.
- O Site Backend deve ter `ALLOWED_ORIGINS` configurado para o domínio do Frontend.

### Integração GPT — Inclusão de Transações (Pagamentos)

- Objetivo: permitir que o agente GPT insira pagamentos como lançamentos na API, com validações server-side e rate limiting.
- Endpoint implementado: `POST /gpt/lancamentos` (`backend/gpt.py`), disponível no GPT Backend (`https://gpt-backend-hg4w.onrender.com`).
  - Auth: header `X-GPT-TOKEN: <token>` (variável `GPT_TOKEN`) e limiter dedicado (`RATE_LIMIT_GPT_WRITE`).
  - Idempotência: header obrigatório `Idempotency-Key: <uuid>`; requisições repetidas retornam 409.
  - Body JSON:
    - `data` ("DD/MM/AAAA" ou "YYYY-MM-DD"), `descricao` (string não vazia), `valor` (number),
    - `id_imovel` (int), `id_categoria` (int), `id_situacao` (int, ex.: 1 = efetivado).
  - Respostas: 201 `{ id, ... }` ao criar; 400 validação; 401/403 auth; 409 idempotência; 429 limite.
- Descoberta de IDs para o agente (Search API):
  - `GET /imoveis/search?q=<texto>&limit=10&offset=0`
  - `GET /categorias/search?q=<texto>&limit=10&offset=0`
  - Ambas as rotas respeitam `RATE_LIMIT_SEARCH` e aceitam chamadas vazias (q="") para listar os mais recentes.
- Confirmações pelo agente (obrigatório): antes de enviar o POST, confirmar com o usuário imóvel, categoria, data, descrição, valor (positivo/negativo) e situação.
- Exemplo cURL:
  - `curl -X POST "$API/gpt/lancamentos" -H "Content-Type: application/json" -H "X-GPT-TOKEN: $GPT_TOKEN" -H "Idempotency-Key: $UUID" -d '{"data":"2025-03-01","descricao":"Pagamento luz","valor":123.45,"id_imovel":5,"id_categoria":12,"id_situacao":1}'`

## Deploy (Render)

- Backend (Flask):
  - Serviço Web Python com `rootDir: backend` no blueprint, `pip install -r requirements.txt` e `gunicorn app:app`.
  - Variáveis: `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_PORT`, `FLASK_ENV=production`.
  - Recomendações: restringir CORS por domínio, desabilitar `/sql` em produção ou exigir token.
- Frontend (Static Site):
  - Root `frontend`, build `npm ci && npm run build`, publish `dist`.
  - `VITE_API_URL` deve apontar para a URL pública do backend.
- Blueprint: `render.yaml` na raiz com 3 serviços (site-backend, gpt-backend, frontend). Use `rootDir: backend` e `backend/runtime.txt` para fixar a versão do Python.

### Perfis de Deploy

- GPT Backend
  - `ENABLE_SQL_ENDPOINT=true`, `READ_ONLY=true`, `ALLOWED_ORIGINS=*`
  - Usuário de banco somente leitura
- Site Backend
  - `ENABLE_SQL_ENDPOINT=false`, `READ_ONLY=true` (1ª versão), `ALLOWED_ORIGINS=https://seu-dominio`

### Considerações de Segurança

- Produção deve rodar em modo leitura se o site for público (sem login). Use uma flag de ambiente e oculte botões de edição no front.
- Desative `/sql` e `/analise/*` em produção; se precisar, proteja com token de serviço e CORS separado.
- Restringir CORS ao domínio do frontend; remova `*`.
- Não commitar `.env`; configure variáveis no painel do Render.
- Remova `debug` e prints ruidosos; trate erros sem expor stack traces.

### Notas de Teste (Rate Limit)

- Em alguns ambientes de desenvolvimento automatizados, não foi possível validar 429 programaticamente devido a limitações de dependências. Em uso local (VS Code/dev.sh) o limiter foi configurado e funciona.
- Para testar manualmente 429 no seu ambiente:
  - Defina em `backend/.env`: `RATE_LIMIT_ADMIN=1/minute` e `RATE_LIMIT_STORAGE_URI=memory://`
  - Reinicie: `bash dev.sh`
  - Rode duas vezes: `curl -s -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:5000/sql -H "Content-Type: application/json" -d '{"query":"select 1"}'`
  - Esperado: primeira chamada 200 (ou 400 dependendo do DB), segunda 429 (Too Many Requests).

### Editor Token (Fase 1)

  - Perfis de usuário substituem a necessidade de tokens adicionais; gere usuários `editor`/`admin` via `/auth/users` ou script `create_user.py`.
- Uso: o front oferece um campo “Entrar como Editor”. Ao informar o token, ações de escrita habilitam `Authorization: Bearer <token>`.
- Distribuição: pode ser enviado por e‑mail a editores autorizados. Boas práticas:
  - Enviar individualmente, com orientação de sigilo; evitar encaminhamentos.
  - Rotacionar periodicamente (ex.: mensal) ou ao suspeitar vazamento.
  - Tokens por ambiente (dev/staging/prod) e revogação trocando a env var.
  - Evitar logs com o token e nunca commitar em Git.

## Endpoints Principais (UI)

- Healthcheck
  - GET `/healthz` — monitoração simples para Render/Uptime — `backend/app.py:77`.
- Imóveis
  - GET `/imoveis` — lista com total agregado — `backend/app.py:161`.
  - POST `/imoveis` — cria registro (token de editor) — `backend/app.py:165`.
  - GET `/imoveis/:id` — detalha dados cadastrais — `backend/app.py:172`.
  - PATCH `/imoveis/:id` — atualiza campos cadastrais — `backend/app.py:179`.
  - DELETE `/imoveis/:id` — remove imóvel — `backend/app.py:215`.
- Categorias
  - GET `/categorias` — lista categorias — `backend/app.py:225`.
  - POST `/categorias` — cria categoria (editor) — `backend/app.py:229`.
  - DELETE `/categorias/:id` — remove (editor) — `backend/app.py:236`.
- Lançamentos (Dashboard)
  - GET `/dashboard/lancamentos/incompletos/:id_imovel` — `backend/dashboard/routes.py:18`.
  - GET `/dashboard/lancamentos/completos/:id_imovel` — `backend/dashboard/routes.py:31`.
  - POST `/dashboard/lancamentos/lote` — insere lista (editor) — `backend/dashboard/routes.py:44`.
  - PATCH `/dashboard/lancamentos/:id_lancamento` — altera lançamento completo/incompleto (payload completo) — `backend/dashboard/routes.py:96`.
  - PATCH `/dashboard/lancamentos/batch` — aplica categoria/imóvel/situação para múltiplos lançamentos — `backend/dashboard/routes.py`.
  - DELETE `/dashboard/lancamentos/:id_lancamento` — exclui lançamento — `backend/dashboard/routes.py:73`.
- Resumo e Orçamentos
  - GET `/dashboard/resumo-financeiro/:id_imovel` — resumo consolidado — `backend/app.py:256`.
  - GET `/orcamentos/:id_imovel` — lista orçamentos — `backend/app.py:279`.
  - POST `/orcamentos/:id_imovel` — upsert lote de orçamentos (editor) — `backend/app.py:284`.
- Rodapé (Home)
  - GET `/dashboard/ultima_atualizacao` — data do último lançamento confirmado — `backend/dashboard/routes.py:127`.
  - GET `/dashboard/ultimos_lancamentos?limit=10` — últimos lançamentos confirmados — `backend/dashboard/routes.py:138`.
- Indicadores (Home)
  - GET `/dashboard/gastos-mensais?meses=6&excluir=8,15,18` — totais mensais por imóvel (meses configuráveis via query, `excluir` aceita lista de IDs; padrão exclui 8, 15 e 18) — `backend/dashboard/routes.py:148`.
- Busca auxiliar (`ENABLE_SEARCH_API=true`)
  - GET `/imoveis/search?q=<texto>&limit=&offset=` — busca rápida — `backend/search.py:30`.
  - GET `/categorias/search?q=<texto>&limit=&offset=` — busca rápida — `backend/search.py:66`.
- Analytics/Admin (habilitado quando `ENABLE_SQL_ENDPOINT=true`)
  - POST `/sql` — executor de SELECT com rate limit — `backend/analytics.py`.

## Banco de Dados (inferido)

- Tabelas principais: `imoveis`, `categorias`, `lancamentos`, `grupos`, `orcamentos`.
- Views necessárias:
  - `vw_lancamentos_completos(id_imovel, id_lancamento, data, descricao, valor, id_categoria, nome_categoria, id_situacao, nome_situacao, ...)`.
  - `vw_lancamentos_incompletos(id_imovel, id_lancamento, data, descricao, valor, id_categoria, id_situacao, ...)`.
  - `vw_orcamento_execucao(id_imovel, id_grupo, grupo, valor_efetivado, valor_em_contratacao, valor_total, orcamento)`.

## Decisões e Comportamentos

- Datas: frontend usa `DD/MM/AAAA`; backend converte para ISO `YYYY-MM-DD` via `converter_data()` (reutilizada em lote e GPT).
- Valores: UI normaliza strings (`,` → `.`) antes de enviar; backend repassa floats direto ao banco.
- CORS: controlado por `ALLOWED_ORIGINS`; em dev aceita `*`, em produção deve apontar para o domínio público.
- READ_ONLY: bloqueia POST/PATCH/DELETE globalmente, exceto `/sql` e `/gpt/*` (permitidos mediante token).
- Search API: opcional via `ENABLE_SEARCH_API`; paginação limitada a 50 itens e rate limit dedicado.
- Home: usa `totalInvestido`, `grupos` e período (`periodo_inicio`/`periodo_fim`) retornados por `GET /imoveis`.

## Observações / Pontos de Atenção

- `GET /lancamentos` permanece acessível sem paginação; manter como endpoint administrativo ou restringir junto às rotas do dashboard.
- A lista de “incompletos” continua global (ignora `id_imovel`) para que a fila possa ser trabalhada de forma cruzada; comportamento descrito na UI.
- `/sql` e `/analise/*` só devem ficar ativos no GPT Backend (`ENABLE_SQL_ENDPOINT=true`); no Site Backend, defina `false` para evitar exposição.
- A idempotência do GPT (memória in-memory em `backend/gpt.py`) se perde a cada restart; Plano 9 cobre a migração para Redis/Postgres.
- O logger de auditoria imprime resumo do corpo no stdout; sanitização extra (tokens/PII) segue listado no Plano 6.6.
- Scripts `dev.sh` e `scripts/install-dev-command.sh` aceleram o setup local (backend + frontend simultâneos).
- O gráfico de desembolsos carrega por padrão 6 meses e ignora categorias específicas (IDs 8, 15 e 18). A UI permite personalizar meses/categorias e memoriza preferências; ajuste adicional para comissão permanece pendente no plano.
- Para reduzir cold start no Render, use `scripts/keep_alive.sh` em um cron job (Render cron task ou serviço externo) — variables `SITE_HEALTH_URL`, `FRONTEND_URL` e `GPT_HEALTH_URL` podem ser sobrescritas ao chamar o script.
- Índices sugeridos para agilizar o carregamento da Home estão em `docs/consultas/indices_lancamentos.sql`.

## Rotas Em Uso (UI atual)

Com base nas páginas Home e Dashboard, as rotas efetivamente utilizadas pelo frontend são:

- Imóveis: `GET /imoveis`, `GET /imoveis/:id`, `POST /imoveis`, `PATCH /imoveis/:id`, `DELETE /imoveis/:id`.
- Categorias: `GET /categorias` (para popular selects).
- Dashboard/Lançamentos: `GET /dashboard/lancamentos/incompletos/:id_imovel`, `GET /dashboard/lancamentos/completos/:id_imovel`, `PATCH /dashboard/lancamentos/:id_lancamento`, `PATCH /dashboard/lancamentos/batch`, `DELETE /dashboard/lancamentos/:id_lancamento`, `POST /dashboard/lancamentos/lote`.
- Resumo/Orçamentos: `GET /dashboard/resumo-financeiro/:id_imovel`, `GET /orcamentos/:id_imovel`, `POST /orcamentos/:id_imovel`.
- Rodapé/Home: `GET /dashboard/ultima_atualizacao`, `GET /dashboard/ultimos_lancamentos`.
- Indicadores/Home: `GET /dashboard/gastos-mensais?meses=6&excluir=8,15,18`.
- Prospecções: `GET /prospeccoes/selecionados`, `GET /prospeccoes/capturados`.

## Rotas Não Utilizadas pela UI (atual)

- `GET /lancamentos` (endpoint genérico; a UI usa as rotas do blueprint do dashboard).
- `POST /categorias` e `DELETE /categorias` (não há telas de gestão de categorias na UI atual).
- `GET /dashboard/orcamento_execucao/:id_imovel` (alias alternativo do resumo não referenciado no front).
- `GET /openapi.json` (útil para documentação, não consumido pela UI).
- Search API (`/imoveis/search`, `/categorias/search`) — usada pelo agente GPT para confirmação de IDs.

Sugestão: manter, documentar como “suporte/administrativo” ou desabilitar em produção se não forem necessários. O endpoint genérico `POST /lancamentos` foi removido; mantenha o `GET /lancamentos` disponível apenas para uso administrativo (se necessário).

## Endpoints para ChatGPT (sem frontend)

Existem rotas pensadas para consumo programático (ex.: integrações e consultas ad‑hoc), sem página de frontend associada:

- `GET /imoveis/search` e `GET /categorias/search` — busca paginada para confirmar IDs (rate limit).
- `GET /dashboard/gastos-mensais` — série agregada de lançamentos confirmados por imóvel; aceita `meses` (1-24) e `excluir` (IDs separados por vírgula) para personalizar.
- `POST /gpt/lancamentos` — criação de lançamentos via agente (token + idempotência).
- `GET /analise/lancamentos` — retorna lançamentos com joins (para análises).
- `POST /sql` — executor de SELECT “seguro”.

Como funciona a “orfanização”: são endpoints expostos pela API que não possuem rotas React correspondentes. Eles podem ser usados por automações (ChatGPT, scripts, notebooks). O risco é ficarem com o mesmo CORS/permissão das rotas da UI e escaparem de políticas de segurança.

Melhorias propostas para esses endpoints:

- Restringir a disponibilidade por ambiente: habilitar apenas em dev/staging via `FLASK_ENV`/flag.
- Autenticação: exigir token de serviço (header) ou IP allowlist. Evitar exposição pública.
- `/sql`: além de permitir apenas SELECT, validar palavras‑chave, bloquear `;`, `--`, funções perigosas, e limitar linhas/tempo. Em produção, preferir desativar no site-backend.
- CORS dedicado: origem restrita e distinta da UI para consumo por ferramentas específicas.
- Observabilidade: log estruturado e auditoria de queries executadas (com truncamento de payload).

## Plano de Ação

- O backlog oficial e unico das tarefas em aberto fica no Supabase, na tabela `agent_tasks`.
- O documento de contexto, historico e roadmap macro fica em `docs/PLANO_ACAO_PROJETO.md`.
- `docs/PLANO_DE_ACAO.md` permanece apenas como ponteiro legado para evitar fragmentacao.

### Deploy (Render) — Serviços e Variáveis

- site-backend (web/python)
  - Build: `pip install -r requirements.txt`, Start: `gunicorn app:app`
  - Env:
    - `APP_ENV=production`, `ENABLE_SQL_ENDPOINT=false`, `ENABLE_GPT_WRITE=false`, `READ_ONLY=true`
    - `ALLOWED_ORIGINS=https://financeiro-frontend-hg4w.onrender.com`
    - `DB_HOST=aws-0-sa-east-1.pooler.supabase.com`, `DB_NAME=postgres`, `DB_USER=postgres.thmekudlkuwjuddkyhpi`, `DB_PASSWORD` (definir no painel), `DB_PORT=5432`
    - `RATE_LIMIT_STORAGE_URI=memory://`, `RATE_LIMIT_EDIT=30/minute`, `RATE_LIMIT_GLOBAL=300/minute`, `TRUST_PROXY=true`
- gpt-backend (web/python)
  - Build: `pip install -r requirements.txt`, Start: `gunicorn app:app`
  - Env:
    - `APP_ENV=production`, `ENABLE_SQL_ENDPOINT=true`, `ENABLE_GPT_WRITE=true`, `READ_ONLY=true`
    - `ALLOWED_ORIGINS=*`
    - `DB_HOST=aws-0-sa-east-1.pooler.supabase.com`, `DB_NAME=postgres`, `DB_USER=postgres.thmekudlkuwjuddkyhpi`, `DB_PASSWORD` (definir no painel), `DB_PORT=5432`
    - `RATE_LIMIT_STORAGE_URI=memory://`, `RATE_LIMIT_ADMIN=10/minute`, `RATE_LIMIT_GPT_WRITE=20/minute`, `TRUST_PROXY=true`
    - `GPT_TOKEN` (definir no painel), `ADMIN_TOKEN` (opcional, protege `/sql`)
- financeiro-frontend (static)
  - Build: `cd frontend && npm ci --no-audit --no-fund && npm run build`
  - Publicar: `frontend/dist`
  - Env:
    - `VITE_API_URL=https://site-backend-hg4w.onrender.com`

Checklist pós-deploy:
- Validar `GET /healthz` nos dois backends; abrir o Frontend e navegar.
- Testar CORS: chamadas da UI devem funcionar sem erros de origem.
- Quando habilitar edição no site, garanta que usuários adequados tenham papel `editor` e ajuste `READ_ONLY=false` no site-backend.

## Referências de Código (linhas relevantes)

- `backend/app.py:112`
- `backend/models.py:248`
- `backend/models.py:186`
- `backend/dashboard/__init__.py:6`
- `backend/app.py:187`
- `frontend/src/components/transacoes/TransacoesCompletas.jsx:22`
- `frontend/src/components/TransacoesIncompletas/TransacoesIncompletas.jsx:25`

## Notas de Implementação

- As views do banco são parte central da lógica agregada (resumo e listas); certifique-se de tê-las criadas no banco usado pelo `.env`.
- O front mistura `localhost` e `127.0.0.1`; alinhar a origem do navegador com a configuração de CORS para evitar problemas quando CORS global for restringido.
- A inserção em lote assume datas no formato `DD/MM/AAAA`; se o Excel eventualmente exportar ISO (`YYYY-MM-DD`), detecte e trate para não reverter erroneamente.


### Gráficos e métricas

#### Drilldown mensal
- O frontend armazena catálogos (imóveis/categorias) em cache via `useCatalogos`, evitando refetch em cadastros e no login.
- Novo endpoint `/dashboard/gastos-mensais/detalhes` agrega valores por grupo e categoria para o mês selecionado (filtros respeitam categorias ocultas).
- Endpoint `/dashboard/gastos-mensais/transacoes` retorna o nível de transação (data, descrição, valor) por imóvel/mês e categoria.
- No front, o gráfico de desembolsos mensais passou a ser clicável: cada barra abre um modal com totals e permite expandir categorias para ver as transações confirmadas daquele mês.
