# Plano de Ação — Garimpo

## Objetivo
Adaptar os scrapers do garimpo à nova estrutura do site da CAIXA e à planilha-base atualizada, garantindo que as planilhas de saída continuem servindo à prospecção manual de imóveis.

## Contexto Atual
- Nova planilha salva em `garimpo/data/input/base.xlsx` (com cópia anterior em `base_.xlsx`). É preciso mapear mudanças de colunas/tipos.
- Arquivo `garimpo/data/retorno.txt` contém o HTML do novo detalhe de imóvel, indicando alteração de layout, atributos e JavaScript.
- Funções `localiza_informacoes.py` e `process_venda_online` dependem de seletores antigos.

## Ações Prioritárias
1. [x] **Mapear esquema da planilha**
   1.1. [x] Comparar `base_.xlsx` com a versão atual para identificar colunas novas/renomeadas.
   1.2. [x] Atualizar filtros (UF, Tipo de Venda, flags) com base no novo esquema.

2. [x] **Atualizar parser HTML**
   2.1. [x] Analisar `garimpo/data/retorno.txt` e atualizar seletores (classes, ids) em `localiza_informacoes.py`.
   2.2. [x] Ajustar extração de valores monetários, datas e disponibilidade aos novos padrões.
   2.3. [x] Criar utilitário central de parsing para reutilizar entre `principal.py` e `extrajudicial_caixa.py`.

3. [x] **Revisar fluxo do `principal.py`**
   3.1. [x] Validado via amostra (códigos 8787700428805, 8787702583905, 8444402764464).
   3.2. [x] Adaptar lógica de `skip_existing` se o identificador mudar.
   3.3. [x] Garantir logs claros quando página exigir autenticação ou redirecionar.

4. [x] **Revisar fluxo do `extrajudicial_caixa.py`**
   4.2. [ ] Reavaliar a necessidade de cookies/headers; parametrizar via `config.yaml`.

5. [x] **Tratamento de falhas e sanitização**
   5.1. [x] Persistir erros de scraping (HTTP/parse) em relatório (`data/output/erros_<data>.csv`).
   5.2. [x] Sanitizar campos textuais para evitar caracteres inválidos na planilha.

6. [x] **Validação e Documentação**
   6.1. [x] Executado subset (prompt custom) e revisadas amostras de saída.
   6.2. [x] Atualizar `garimpo/README.md` com novas instruções (colunas obrigatórias, limites conhecidos).
   6.3. [x] Registrar changelog das adaptações e próximos ajustes desejados.

7. [x] **Funcionalidades Futuras**
   7.1. [x] Permitir que o usuário selecione dinamicamente UFs e modalidades desejadas na execução.
   7.2. [x] Habilitar definição de faixa de registros para salvar apenas o intervalo desejado em cada execução.
   7.3. [x] Adicionar opção de envio automático do resultado final por e-mail informado pelo usuário.
   7.4. [x] Perguntar explicitamente se o usuário deseja continuar a pesquisa a partir do `output.xlsx` existente ou iniciar nova coleta.
   7.5. [x] Exibir progresso consolidado (X/Y) durante o processamento para facilitar o acompanhamento.
   7.6. [x] Compactar automaticamente o arquivo final e acionar o aplicativo de e-mail padrão com mensagem pronta para envio.
   7.7. [x] Prover atalho de execução (`run_garimpo.sh`) preparando o ambiente e chamando o script principal.
   7.8. [x] Implementar chunking parametrizável (salvar a cada *n* registros configurados em tempo de execução ou via `config.yaml`).

## Entregáveis
- Scripts atualizados e validados com a nova estrutura.
- Planilhas de saída revisadas (`saida_<UF>.xlsx`, `output.xlsx`, `output_financiado.xlsx`).
- Documentação alinhada e instruções de execução/validação revisadas.

## Pendências/Oportunidades
1. [ ] Avaliar adoção de headless browser (Playwright/Selenium) se a CAIXA bloquear requests simples.
2. [ ] Considerar exportar planilhas finais em CSV/Parquet para integração futura.
3. [ ] Investigar automação parcial de ingestão via API interna quando o fluxo estiver estável.
4. [ ] Supabase: integrar persistência e reprocesso de resultados.

## Próximas Etapas — Supabase
1. [x] **Modelo de dados**
   1.1. [x] Criar tabela dedicada para prospecção (ex.: `imoveis_prospeccao`) no Supabase, separada da tabela existente de imóveis adquiridos. Chave primária `numero_bem` (text), permitir versionamento via `coletado_em` (timestamp). Campos principais (tipos sugeridos):
        - `numero_bem` (text, PK), `tipo_venda` (text), `tipo_imovel` (text), `uf` (text(2)), `cidade` (text), `bairro` (text), `endereco` (text)
        - `valor_avaliacao` (numeric), `valor_venda` (numeric), `desconto` (numeric), `detalhes` (text)
        - Scraping: `disponivel` (boolean), `financia` (boolean), `valor_leilao_1`/`valor_leilao_2` (numeric), `data_leilao_1`/`data_leilao_2`/`data_licitacao_aberta` (timestamp), `data_hora_encerramento` (timestamp), `lance_atual` (numeric), `link_consulta` (text)
        - Auditoria: `coletado_em` (timestamp), `fonte` (text), `hash_linha` (text) para rastrear mudanças
        - Normalização antes do upsert: `numero_bem` limpo para apenas dígitos (remove espaços/caracteres não numéricos); descartar IDs vazios.
   1.2. [x] Criar tabela de seleção de leilão (ex.: `imoveis_selecionados`) para decisão única por imóvel:
        - `numero_bem` (text, PK, FK para `imoveis_prospeccao`), `status` (enum/text: candidato, aprovado, descartado, em_leilao, arrematado), `valor_maximo` (numeric), `observacoes` (text), `prioridade` (int), `created_at`/`updated_at` (timestamp)
        - Garantir que marcações de participação em leilão fiquem isoladas desta tabela, sem afetar os adquiridos.
2. [x] **Configuração**
   2.1. [x] Adicionado bloco `supabase` em `garimpo/config.yaml` / `garimpo/config.yaml.example` com `enabled`, `url`, `anon_key`, `service_role_key`, `chunk_size`, `timeout`, retentativas e `error_log`; preencher via envs (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`) antes de enviar dados.
3. [x] **Cliente**
   3.1. [x] Implementado `src/supabase_client.py` via REST (`requests`) com upsert por `numero_bem, coletado_em`, chunking configurável e retentativas.
4. [x] **Integração de escrita**
   4.1. [x] `principal.py` e `extrajudicial_caixa.py` agora enviam direto para o Supabase (sem gerar Excel), com flush por chunk configurável e filtro para ignorar códigos coletados nas últimas N horas (lidos da tabela).
   4.2. [x] Falhas registradas em `data/output/erros_supabase.csv` com payload para reprocesso.
5. [ ] **Conversões e validação**
   5.1. [x] Normalização implementada (datas → ISO, monetários → decimal, booleanos `Disponível`/`Financia`).
   5.2. [ ] Validar amostra no painel do Supabase.

## Próximas Etapas — Produto Prospecções (RBAC + Selecionados)
1. [x] **Controle de acesso por módulo (somente Prospecção)**
   1.1. [x] Adicionar papel `prospector` (ou equivalente) no backend (`auth/create_user/security`) e aceitar emissão de token com esse papel.
   1.2. [x] Criar guardas específicos para prospecção:
        - leitura (`GET /prospeccoes/*`) permitida para `prospector`, `viewer`, `editor`, `admin`;
        - escrita (`POST/DELETE /prospeccoes/selecionados*`) permitida para `prospector`, `editor`, `admin`.
   1.3. [x] Restringir módulos financeiros para `prospector` (backend e frontend), mantendo acesso apenas à rota `/prospeccoes`.
   1.4. [x] Frontend: condicionar menu/rotas por papel e redirecionar `prospector` de `/` para `/prospeccoes`.
   1.5. [x] Critério de aceite:
        - usuário `prospector` autentica normalmente;
        - acessa e opera somente Prospecções;
        - recebe `403` ao tentar endpoints fora do módulo.

2. [x] **Evolução da lista de imóveis selecionados**
   2.1. [x] Backend: retornar `data_leilao` em `GET /prospeccoes/selecionados` considerando a maior data disponível entre `data_leilao_1`, `data_leilao_2` e `data_hora_encerramento`.
   2.2. [x] Frontend: incluir coluna "Data do leilão" na tabela de selecionados.
   2.3. [x] Frontend: incluir coluna "Observações" na tabela de selecionados usando o campo já persistido.
   2.4. [x] Backend: criar endpoint de exclusão `DELETE /prospeccoes/selecionados/<numero_bem>`.
   2.5. [x] Frontend: adicionar ação de exclusão com confirmação e atualização da lista sem reload completo.
   2.6. [x] Critério de aceite:
        - data do leilão e observações visíveis para todos os selecionados;
        - exclusão remove o registro de `imoveis_selecionados` e atualiza a UI;
        - fluxo preserva histórico em `imoveis_prospeccao`.

3. [ ] **Qualidade, testes e documentação**
   3.1. [ ] Backend: testes de autorização por papel (`prospector/viewer/editor/admin`) nas rotas de Prospecções e rotas financeiras.
   3.2. [ ] Backend: testes para inclusão e exclusão de selecionados e cálculo de `data_leilao`.
   3.3. [ ] Frontend: testes de renderização condicional por papel e fluxo de exclusão.
   3.4. [ ] Atualizar `docs/README.md` e `README.md` com matriz de permissões e novas capacidades da tela de Prospecções.
   3.5. [ ] Critério de aceite:
        - suíte mínima de testes cobrindo RBAC e CRUD de selecionados;
        - documentação de operação e criação de usuário `prospector` revisada.

4. [ ] **Ordem de execução recomendada**
   4.1. [x] Fase 1: RBAC por módulo.
   4.2. [x] Fase 2: API de selecionados (`data_leilao` + `DELETE`).
   4.3. [x] Fase 3: ajustes de UI (novas colunas + exclusão).
   4.4. [ ] Fase 4: testes automatizados e documentação final.

## Próximas Etapas — Gestão de Usuários (Admin + Convite)
1. [x] **Administração de usuários**
   1.1. [x] Criar tela `/usuarios` para perfil `admin` listar usuários cadastrados.
   1.2. [x] Exibir status operacional: perfil, ativo, convite pendente e expiração do convite.

2. [x] **Primeiro acesso com senha definida pelo usuário**
   2.1. [x] Endpoint admin para gerar convite (`POST /auth/users/invite`) com validade configurável.
   2.2. [x] Endpoint público para definir senha por convite (`POST /auth/setup-password`).
   2.3. [x] Tela pública `/primeiro-acesso` para o usuário informar e-mail, token e nova senha.
   2.4. [x] Bloquear login direto enquanto `password_reset_required = true`.

3. [ ] **Pendências de consolidação**
   3.1. [ ] Atualizar documentação operacional com fluxo completo de convite/primeiro acesso.
   3.2. [ ] Adicionar testes de integração para convites, expiração e definição de senha.

## Segurança Operacional
1. [x] Rotacionar chaves do Supabase após exposição acidental em arquivo `.env`.
2. [x] Garantir que arquivos `.env` locais (`backend/.env`, `frontend/.env`, `garimpo/.env` e raiz) não sejam mais versionados.

## Supabase — Security Advisor
1. [x] Corrigir alertas de `Security Definer View` nas views:
   - `public.vw_lancamentos_completos`
   - `public.vw_lancamentos_incompletos`
   - `public.vw_orcamento_execucao`
   - `public.vw_imoveis_prospeccao_latest`
2. [x] Endurecer tabelas `public` com `RLS Disabled in Public`:
   - `public.imoveis_prospeccao`
   - `public.imoveis_selecionados`
   - `public.users`
   - `public.situacao_lancamento`
3. [x] Corrigir warning `Function Search Path Mutable` na função `public.set_updated_at`.
4. [ ] Planejar update de versão do Postgres no Supabase (warning de patch de segurança).
5. [x] Validar regressão após hardening:
   - login e rota `/usuarios`;
   - leitura/gravação em `/prospeccoes/*`;
   - carga do dashboard financeiro.
6. [x] Security Advisor sem erros críticos; permanecem apenas sugestões/info de políticas RLS em tabelas de catálogo.

## Garimpo — Segredos Locais (somente máquina)
1. [x] **Padronizar configuração local sem versionamento**
   1.1. [x] Manter apenas `garimpo/.env.example` no Git (sem valores reais).
   1.2. [x] Garantir `garimpo/.env` no `.gitignore` e fora do índice Git.
   1.3. [x] Definir carregamento prioritário de variáveis locais (`garimpo/.env`) para execução dos scripts.

2. [ ] **Execução segura do garimpo na máquina local**
   2.1. [x] Atualizar `garimpo/start.sh` para validar variáveis obrigatórias antes de iniciar (`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`).
   2.2. [x] Exibir mensagem clara quando variável obrigatória estiver ausente, sem imprimir segredo em log.
   2.3. [ ] Validar fluxo `principal.py` e `extrajudicial_caixa.py` com `.env` local.

3. [ ] **Prevenção de vazamento em commits**
   3.1. [x] Adicionar pre-commit simples para bloquear inclusão de arquivos `.env` reais.
   3.2. [x] Adicionar varredura rápida por padrões de chave (`sb_secret_`, `SUPABASE_SERVICE_KEY=`) antes de commit.
   3.3. [ ] Documentar runbook de resposta (rotacionar chave + remoção do índice) em caso de incidente.

4. [ ] **Critério de aceite**
   4.1. [ ] Garimpo funciona localmente com `.env` privado.
   4.2. [ ] Nenhum arquivo de segredo aparece em `git status`/`git add .`.
   4.3. [ ] Repositório mantém apenas exemplos sanitizados.
