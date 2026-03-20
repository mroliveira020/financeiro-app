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

## Roadmap Recomendado — Prospecções e Gestão de Usuários
1. [ ] **Corrigir base do fluxo de usuários**
   1.1. [ ] Incluir campo `nome` no cadastro/convite de usuários e armazenar esse valor na tabela `users`.
   1.2. [ ] Exibir nome e e-mail na listagem `/usuarios`, mantendo o e-mail como identificador de login.
   1.3. [ ] Ajustar fluxo de convite para tornar `nome` obrigatório e manter consistência entre convite, usuário ativo e sessão autenticada.
   1.4. [ ] Corrigir geração e exibição do link de convite:
        - Backend: validar `FRONTEND_APP_URL` por ambiente para garantir que `invite_link` aponte para a URL pública correta do frontend.
        - Frontend: revisar exibição/cópia do link em `/usuarios` para evitar quebra visual ou cópia parcial do endereço/token.
        - Operação: revisar variáveis do ambiente produtivo (`FRONTEND_APP_URL`) e registrar valor esperado no runbook.
   1.5. [ ] Garantir que a sessão/autenticação exponha `id`, `nome`, `email` e `role` para uso nas telas de Prospecções.

2. [ ] **Preparar autoria e identidade operacional nas Prospecções**
   2.1. [ ] Registrar autor da inclusão (`created_by` ou equivalente) em `imoveis_selecionados`, vinculado ao usuário autenticado.
   2.2. [ ] Propagar nome do autor (`created_by_name`) na listagem de selecionados e no histórico de observações.
   2.3. [ ] Exibir coluna "Selecionado por" na lista de selecionados.

3. [ ] **Consolidar prioridade operacional**
   3.1. [ ] Frontend: ao selecionar um imóvel capturado, oferecer escolha explícita de prioridade (`baixa`, `média`, `alta`) no fluxo de inclusão/edição.
   3.2. [ ] Backend: manter normalização de prioridade e garantir persistência consistente em `imoveis_selecionados.prioridade`.
   3.3. [ ] UX: exibir prioridade atual na lista de selecionados com ação rápida de edição sem exigir recriação do registro.

4. [ ] **Implementar regra de exclusão por autor/admin**
   4.1. [ ] Backend: permitir exclusão apenas para o usuário autor da prospecção ou perfil `admin`; demais perfis recebem `403`.
   4.2. [ ] Frontend: esconder/desabilitar ação de excluir quando o usuário não tiver permissão, mantendo mensagem clara ao receber bloqueio do backend.
   4.3. [ ] Critério de aceite:
        - exclusão é permitida somente ao autor da inclusão ou a `admin`;
        - lista exibe com clareza quem foi o autor da seleção.

5. [ ] **Implementar atribuição de imóveis para prospectores**
   5.1. [ ] Modelagem: criar vínculo de responsáveis (`imoveis_selecionados_responsaveis`) permitindo um ou mais prospectores por imóvel selecionado.
   5.2. [ ] Backend: permitir que `admin` atribua e remova prospectores responsáveis por imóvel.
   5.3. [ ] Backend: definir regra de acesso operacional:
        - `admin`: vê e gerencia todos os selecionados;
        - autor da inclusão: pode excluir o imóvel que criou;
        - prospector atribuído: pode atuar no imóvel (prioridade/observações), sem poder excluir se não for o autor;
        - usuário não atribuído: pode ter leitura restrita ou sem ações, conforme política a ser fechada.
   5.4. [ ] Frontend: adicionar seletor de responsáveis na tela de selecionados (somente `admin`) e exibir responsáveis associados por imóvel.

6. [ ] **Implementar observações com histórico**
   6.1. [ ] Modelagem: separar observação atual de trilha histórica (nova tabela `imoveis_selecionados_observacoes` ou estrutura equivalente com `id`, `numero_bem`, `autor_id`, `autor_nome`, `texto`, `created_at`).
   6.2. [ ] Backend: criar endpoints para adicionar observação, listar histórico e manter `observacao_atual` resumida na listagem principal.
   6.3. [ ] Frontend: permitir registrar novas observações sem sobrescrever as anteriores, exibir autor + data/hora e abrir histórico completo do imóvel selecionado.

7. [ ] **Revisar a experiência da lista de selecionados**
   7.1. [ ] Backend: manter retorno de `data_leilao` considerando a maior data disponível entre `data_leilao_1`, `data_leilao_2` e `data_hora_encerramento`.
   7.2. [ ] Frontend: garantir colunas e ações finais da lista:
        - Data do leilão
        - Prioridade
        - Selecionado por
        - Responsáveis
        - Observação atual
        - Acesso ao histórico
   7.3. [ ] Critério de aceite:
        - usuário consegue definir/alterar prioridade no ato da seleção e depois na lista;
        - lista de selecionados exibe quem selecionou o imóvel;
        - `admin` consegue atribuir um ou mais prospectores a cada imóvel;
        - prospector atribuído consegue alterar prioridade e registrar observações;
        - histórico permanece visível mesmo após mudanças de status/prioridade.

8. [ ] **Fechar qualidade, testes e documentação**
   8.1. [ ] Backend: testes de autorização por papel (`prospector/viewer/editor/admin`) nas rotas de Prospecções e rotas financeiras.
   8.2. [ ] Backend: testes para inclusão, edição, exclusão restrita por autor/admin, atribuição de responsáveis e cálculo de `data_leilao`.
   8.3. [ ] Backend: testes para histórico de observações (append-only, ordenação, autoria e permissões por atribuição).
   8.4. [ ] Frontend: testes de renderização condicional por papel, edição de prioridade, bloqueio de exclusão, atribuição de prospectores e fluxo de observações.
   8.5. [ ] Atualizar `docs/README.md` e `README.md` com matriz de permissões, regra de autoria, atribuição de responsáveis, campo `nome` no usuário e histórico de observações.
   8.6. [ ] Atualizar documentação operacional com fluxo completo de convite/primeiro acesso, incluindo campo `nome` e configuração correta da URL pública do frontend.
   8.7. [ ] Adicionar testes de integração para convites, expiração, definição de senha, persistência de `nome` e geração de `invite_link`.

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
