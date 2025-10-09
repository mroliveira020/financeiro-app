# Plano de Ação — Prioridades (com status)

1. Segurança e Acesso (Fase 1 — rápido e seguro)
1.1 [x] Backend: adicionar flags `APP_ENV`, `READ_ONLY`, `ENABLE_SQL_ENDPOINT`, `ALLOWED_ORIGINS`, `EDITOR_TOKEN` (legado, removido após migração para papéis de usuário).
1.2 [x] Backend: bloquear POST/PATCH/DELETE quando `READ_ONLY=true`.
1.3 [x] Backend: proteger rotas de escrita exigindo login (JWT) de usuários com papel `editor`/`admin`; token dedicado removido.
1.4 [x] Backend: desabilitar `/sql` e `/analise/*` quando `ENABLE_SQL_ENDPOINT=false`.
1.5 [x] Backend: configurar CORS por `ALLOWED_ORIGINS` (sem wildcard em produção).
1.6 [x] Backend: remover debug/prints; handlers de erro sem stack em produção.
1.7 [x] Backend: rate limiting básico em rotas sensíveis; logs de auditoria para escritas.
1.8 [x] Frontend: esconder botões de edição para quem não estiver logado como editor/admin; fluxo único de login por e-mail.
1.9 [x] Frontend: Axios adiciona `Authorization` apenas em rotas de escrita.

2. Continuidade do Agente GPT (sem interrupção)
2.1 [x] Manter serviço “GPT Backend” com `ENABLE_SQL_ENDPOINT=true` e `READ_ONLY=true` (DB user somente leitura) até habilitarmos a escrita segura.
2.2 [x] (Opcional) Proteger `/sql` com header `X-ADMIN-TOKEN` e configurar o Agente GPT para enviá-lo.
2.3 [x] Garantir que o front aponte para o “Site Backend” e o GPT continue usando o backend atual.

8. Integração GPT — Inclusão de Transações (pagamentos)
8.1 [x] Especificar e implementar API `POST /gpt/lancamentos` com payload `{ data, descricao, valor, id_imovel, id_categoria, id_situacao }`.
8.2 [x] Autenticação por `GPT_TOKEN` via header `X-GPT-TOKEN` e rate limiting `RATE_LIMIT_GPT_WRITE`.
8.3 [x] Exceção ao READ_ONLY para `/gpt/*` no middleware do app; rota ainda exige token.
8.4 [x] Idempotência via `Idempotency-Key` (in‑memory, TTL 1h). Observação: para produção/escala, migrar para armazenamento persistente (DB/Redis).
8.5 [x] Validações server‑side: conversão de data, valor numérico e verificação de existência de imóvel, categoria e situação.
8.6 [x] Auditoria: coberta pelo logger de after_request (método, rota, status, duração, etc.).
8.7 [x] Descoberta de IDs: adicionar endpoints de busca auxiliares: `GET /imoveis/search?q=...`, `GET /categorias/search?q=...` com `limit/offset` e rate limit.
8.8 [x] Fluxo do Agente (prompt/política): agente deve perguntar e confirmar com o usuário: imóvel, categoria, data, valor e descrição antes do envio; depois chamar `POST /gpt/lancamentos` com os IDs confirmados.
8.9 [x] Documentação: atualizar README e instruções do agente com o contrato da API, exemplos de cURL e regras de confirmação.

9. Idempotência centralizada (futuro — recomendado para produção/escala)
9.1 [ ] Definir backend: Redis (preferido) ou Postgres.
9.2 [ ] Redis: aplicar `SETNX` + `EXPIRE` por `Idempotency-Key` (TTL 1h), responder 409 em duplicatas.
9.3 [ ] Postgres: criar `gpt_idempotency(key primary key, created_at)`; usar `INSERT ... ON CONFLICT DO NOTHING` em transação; job de limpeza.
9.4 [ ] Parametrizar TTL (1–24h) e expor métricas (contagem de 409/2xx).
9.5 [ ] Documentar decisão e atualizar README/variáveis (`REDIS_URL` ou migração SQL).
8.10 [x] (Não será implementado no backend) Extração de PDF: manter processamento nativo pelo GPT (fora de escopo do projeto), documentado nas instruções do agente.

3. Deploy (Render)
3.0 [x] Criar blueprint `render.yaml` (site-backend, gpt-backend, frontend) com envs padrão.
3.1 [x] Backend (serviço web): root `backend`, build `pip install -r requirements.txt`, start `gunicorn app:app`.
3.2 [x] Backend (Site): configurar env (DB_*, APP_ENV, READ_ONLY, ENABLE_SQL_ENDPOINT=false, ALLOWED_ORIGINS).
3.3 [x] Backend (GPT): revisar env (DB_*, APP_ENV, READ_ONLY=true, ENABLE_SQL_ENDPOINT=true, ALLOWED_ORIGINS=*).
3.4 [x] Frontend (static site): root `frontend`, build `npm ci && npm run build`, publish `dist`.
3.5 [x] Frontend: definir `VITE_API_URL` para a URL pública do Site Backend e redeploy.
3.6 [x] Domínios: configurar domínio do front e alinhar CORS no Site Backend.
3.7 [x] Pós-deploy: checklist de validação (CORS, `/healthz`, navegação UI, buscas `/imoveis/categorias/search`, GPT `/gpt/lancamentos` e limites 429).

4. Correções funcionais
4.1 [x] Padronizar retorno 400 (mensagem clara) quando data inválida no lote (capturar `ValueError`).
4.2 [x] Remover `POST /lancamentos` genérico (inconsistente).
4.3 [x] Condicionar `print(app.url_map)` ao debug.
4.4 [x] Padronizar 400 em PATCH `/dashboard/lancamentos/:id` para datas inválidas e validações de payload (mensagem clara).

5. Segurança (Fase 2 — login por usuário)
5.1 [x] Backend: criar `/auth/login`, `/auth/me`, `/auth/logout` (JWT), tabela `users` e papéis.
5.2 [x] Backend: aplicar regras de papel (editor/admin) nas rotas sensíveis.
5.3 [x] Frontend: página de login, contexto de auth e guarda de ações.
5.4 [x] Backend: exigir autenticação também nas rotas de leitura sensíveis (`/dashboard/*`, `/lancamentos/*`, relatórios); expor apenas `/healthz` e landing pública sem exigir login.
5.5 [x] Frontend: redirecionar visitantes não autenticados para a tela de login antes de carregar dashboards; esconder dados até confirmar sessão válida (`/auth/me`).
5.6 [x] DB/Infra: tabela `users` com hash, campos `role`, `is_active`, timestamps e script `backend/create_user.py` para bootstrap/admin.
5.7 [x] Documentação: atualizar README, `.env.example` e `docs/` com variáveis (`JWT_SECRET`, expiração), fluxo de login e processo de provisionamento de usuários.

6. Observabilidade e operação
6.1 [x] Logs estruturados (auditoria básica em JSON nas escritas).
6.2 [ ] Usuário de banco com menor privilégio (principalmente no GPT Backend).
6.3 [ ] Política de revisão de acesso: revisar periodicamente usuários `editor`/`admin`, revogar logins inativos e monitorar delegações.
6.4 [ ] Padronizar schema de erro (JSON) para 4xx/5xx com campos: `code`, `message`, `details`.
6.5 [x] Implementar `GET /healthz` simples e, opcional, expor métricas (Prometheus) por ambiente.
6.6 [ ] Sanitização de logs: evitar PII/tokens; truncar payloads grandes e remover campos sensíveis.

10. Desempenho (busca e banco)
10.1 [ ] Índices para buscas: `CREATE INDEX ON imoveis (lower(nome));` e `CREATE INDEX ON categorias (lower(categoria));` (ou trigram, se necessário).
10.2 [ ] Revisar planos de execução e ajustar limites/paginação padrão das buscas.

7. Documentação e Dev Experience
7.1 [x] Quickstart de dev e scripts (dev.sh; comando global).
7.2 [x] Centralizar cliente HTTP e VITE_API_URL no front.
7.3 [x] README reorganizado e detalhado; plano separado.
7.4 [x] Atualizar `openapi.json` com endpoints novos (GPT `/gpt/lancamentos`, buscas `/imoveis/search`, `/categorias/search`, `/healthz`).
7.5 [x] Adicionar exemplo de “conversa modelo” nas Instruções do Agente (perguntas → confirmações → POST), incluindo tratamento de 400/409/429.

## Roadmap do Site — Próximas Iterações

1. Status atual
   1.1 [x] Site operacional em produção (deploy e CORS OK)
   1.2 [x] Fluxo de edição via login único (e-mail/senha) com papel de editor (habilitável por env)

2. Prioridades (curto prazo)
   2.1 [ ] UX e validações no lote
       2.1.1 [ ] Aceitar separadores `;`, `,`, tab e múltiplos espaços
       2.1.2 [ ] Normalizar valores com vírgula decimal (ex.: `1.234,56` → `1234.56`)
       2.1.3 [ ] Pré-visualização antes de enviar; destacar linhas inválidas com número da linha
       2.1.4 [ ] Feedback granular: sucesso parcial com lista de rejeitadas (motivo + linha)
       2.1.5 [ ] Indicador de envio e prevenção de múltiplos cliques
   2.2 [ ] Erros claros nas edições individuais
       2.2.1 [ ] Mensagens consistentes para datas inválidas, categorias/situação ausentes
       2.2.2 [ ] Tooltips no formulário e exemplos de formatos aceitos (DD/MM/AAAA)
   2.3 [ ] Observabilidade e erros (fase inicial)
       2.3.1 [ ] Padronizar resposta de erro JSON no backend: `code`, `message`, `details`
       2.3.2 [ ] Sanitizar logs (ocultar tokens/PII) e incluir `request_id`
   2.4 [ ] Desempenho de busca/listas
       2.4.1 [ ] Índices recomendados: `CREATE INDEX ON imoveis (lower(nome));` e `CREATE INDEX ON categorias (lower(categoria));` (adiado)
       2.4.2 [ ] Revisar paginação padrão e limites nas rotas de listagem (adiado)
   2.5 [x] Rodapé: Data de atualização + últimos 10 lançamentos
       2.5.1 [x] Backend: endpoint para data de atualização (último lançamento confirmado com `id_situacao=1` e `data <= hoje`)
       2.5.2 [x] Backend: endpoint para listar últimos 10 lançamentos globais (ordem desc por `data`, independentemente do imóvel)
       2.5.3 [x] Frontend: exibir data no rodapé da Home; mostrar estado de carregando/erro
       2.5.4 [x] Frontend: ação de clique no rodapé abrindo modal/lista com os 10 lançamentos (data, descrição, valor, imóvel, categoria)
       2.5.5 [x] Timezone/formatos: garantir comparações por data em UTC/`current_date` e exibir `DD/MM/AAAA`
       2.5.6 [x] Segurança/CORS: endpoints de leitura pública, respeitando `ALLOWED_ORIGINS`
2.6 [x] Gráfico financeiro
       2.6.1 [x] Endpoint `/dashboard/gastos-mensais` com limite configurável (padrão 6 meses + filtro `excluir`)
       2.6.2 [x] Frontend: gráfico configurável (meses/categorias) com Chart.js, cores translúcidas e preferências persistidas
   2.7 [x] Home — cartão do imóvel com visão por grupos
       2.7.1 [x] Backend: expor endpoint reutilizando `docs/consultas/total_lancamentos_por_grupo.sql` para agregar `SUM(valor)` por `g.grupo` (considerar filtros `ativo`, `id_situacao=1` e exclusões 8, 15, 18)
       2.7.2 [x] Frontend: substituir valor único pelo total investido (soma da consulta) e inserir mini gráfico de pizza com os grupos (fonte menor para acomodar o gráfico)
       2.7.3 [x] Frontend: exibir rótulo `Período <MM/AAAA> a <MM/AAAA>` usando a primeira e a última transação confirmada do imóvel
       2.7.4 [x] UX: ajustar layout do card (legendas, alinhamento e responsividade) garantindo contraste, legibilidade e paleta com cores translúcidas (seguindo o gráfico maior)
   2.8 [x] Confiabilidade do carregamento inicial
       2.8.1 [x] Axios com timeout maior (45s) e retry exponencial (2 tentativas) nas chamadas `/imoveis` e `/dashboard/gastos-mensais`.
       2.8.2 [x] UI exibe estado “tentando novamente” e oferece botão de recarregar após falha.
       2.8.3 [x] Script `scripts/keep_alive.sh` (pings configuráveis) pronto para agendamento em cron/uptime monitor do Render.
       2.8.4 [x] Query `listar_imoveis` reescrita + script `docs/consultas/indices_lancamentos.sql` com índices recomendados para agregações.
   2.9 [ ] Resumo agregado performático
       2.9.1 [ ] Consolidar totais (efetivado, a investir, lucro) direto via SQL, evitando processamento em memória.
       2.9.2 [ ] Cache ou otimizar view conforme necessidade (avaliar após medição).
   2.10 [ ] Revisão do fluxo de autenticação
       2.10.1 [ ] Remover menções a "token de edição" na UI e na documentação do site
       2.10.2 [ ] Garantir que permissões de edição dependam apenas do login com papel `editor`/`admin`
   2.11 [ ] Revisão do Dashboard (transações)
       2.11.1 [ ] Corrigir erro ao incluir transações incompletas via lote/edição manual
       2.11.2 [ ] Garantir que as transações carreguem ao abrir a página (estado inicial)
       2.11.3 [ ] Ajustar quadro de transações incompletas para respeitar o imóvel selecionado
       2.11.4 [ ] Atualizar cards e resumos imediatamente após uma transação virar completa
   2.12 [ ] Edição rápida para transações incompletas (categoria/imóvel/situação)
       2.12.1 [ ] Permitir alteração inline com combos por linha e sinalizar linhas editadas
       2.12.2 [ ] Incluir botão "Aplicar todos" e opção para aplicar linha a linha
       2.12.3 [ ] Garantir validações de categoria/imóvel/situação antes do envio
       2.12.4 [ ] Planejar testes em produção com operação (janelas acordadas)

3. Próximas (médio prazo)
   3.1 [x] Segurança (Fase 2 — login por usuário)
       3.1.1 [x] Backend: `/auth/login`, `/auth/me`, `/auth/logout` (JWT) e papéis
       3.1.2 [x] Frontend: tela de login e guarda de rotas/ações por papel
   3.2 [ ] Operação
       3.2.1 [ ] Atualizar checklist operacional para provisionamento/revogação de usuários `editor`/`admin` (login único)
       3.2.2 [ ] Documentar procedimento de alternância `READ_ONLY` (manutenção/edição)
   3.3 [ ] Documentação
       3.3.1 [ ] Guia do Editor (como solicitar acesso, papéis disponíveis, formatos aceitos)
       3.3.2 [ ] Troubleshooting rápido (CORS, 401/403/405/429, datas e valores)

## Checklist de Testes Manuais do Site

1. Leitura
   1.1 [ ] `GET /imoveis`
   1.2 [ ] `GET /categorias`
   1.3 [ ] `GET /dashboard/resumo-financeiro/:id`
   1.4 [ ] Rodapé mostra “Data de atualização” correta (último confirmado `<= hoje`)
   1.5 [ ] Clique no rodapé abre lista dos 10 últimos lançamentos (global)
2. Edição (usuário editor/admin e `READ_ONLY=false`)
   2.1 [ ] Lote: inclusões válidas, linhas inválidas, idempotência operacional (prevenir duplos cliques)
   2.2 [ ] PATCH de lançamento (datas válidas/ inválidas), DELETE lançamento
   2.3 [ ] Orçamentos: `GET/POST /orcamentos/:id_imovel`
3. Controles e segurança
   3.1 [ ] `READ_ONLY=true` bloqueia POST/PATCH/DELETE (esperado 405)
   3.2 [ ] CORS: origem do front aceita; outras origens bloqueadas
   3.3 [ ] Rate limit: exceder algumas chamadas de edição e esperar 429
