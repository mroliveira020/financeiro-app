# Plano de Ação — Projeto

## Fonte de Verdade
Este é o plano central do projeto e passa a concentrar as frentes de Garimpo, Prospecções, Financeiro, Usuários, Permissões e evoluções futuras.

Planos anteriores agora servem apenas como referência rápida e apontam para este arquivo:
- `garimpo/PLANO_ACAO.md`
- `docs/PLANO_DE_ACAO.md`

## Visão Geral

### Objetivo do Projeto
Consolidar em um único sistema as frentes de Garimpo, Prospecções, Financeiro, Usuários, Permissões e futuras evoluções operacionais, mantendo coerência entre captura de dados, decisão de prospecção, operação financeira e governança de acesso.

### Contexto Atual
- O projeto deixou de ser apenas um fluxo de garimpo e hoje reúne também operação comercial, gestão de usuários, UX mobile, análise de viabilidade e evolução do financeiro.
- O garimpo segue sendo uma frente crítica, com adaptações contínuas à estrutura do site da CAIXA, mitigação de bloqueios e integração com Supabase.
- A camada de Prospecções já possui fluxo operacional real, com autoria, responsáveis, observações, viabilidade financeira e experiência mobile em evolução.
- O Financeiro passa a demandar uma nova fase de modelagem para suportar participação societária, múltiplos papéis por usuário e acerto de contas entre sócios.

### Decisões de Produto Já Tomadas
- O plano central do projeto fica em `docs/PLANO_ACAO_PROJETO.md`; arquivos antigos permanecem apenas como ponteiro.
- O garimpo envia dados diretamente ao Supabase e não depende mais da geração local de planilhas como fluxo principal.
- A operação de Prospecções já considera autoria, responsáveis, observações, prioridade, exclusão lógica, viabilidade financeira e uso mobile.
- A ficha de viabilidade mantém edição local na UI e só persiste ao clicar em `Salvar`.
- A fórmula atual da viabilidade considera a prestação do financiamento nas despesas do período, no custo total do imóvel e no capital investido estimado.
- A próxima evolução relevante do Financeiro será suportar sócios, múltiplos papéis por usuário e equalização entre participantes.
- O cadastro de sócios, seu vínculo com imóveis e seus percentuais de participação será centralizado na tela de controle de usuários e só poderá ser administrado por `admin`.
- A centralização da gestão societária na tela de usuários é uma decisão de UX/administração, não de ordem de implementação: banco e backend do compartilhamento devem vir antes.

## Frente Garimpo

### Status Atual do Garimpo
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

### Entregáveis do Garimpo
- Scripts atualizados e validados com a nova estrutura.
- Planilhas de saída revisadas (`saida_<UF>.xlsx`, `output.xlsx`, `output_financiado.xlsx`).
- Documentação alinhada e instruções de execução/validação revisadas.

### Pendências do Garimpo
1. [ ] Tratar bloqueio anti-bot da CAIXA/Azion no garimpo.
   1.1. [x] Diagnóstico confirmado: requisições simples via `requests` passaram a receber `403` na borda da Azion (`x-azion-request-id`), inclusive para home e busca.
   1.2. [x] Evidência operacional confirmada: em navegador automatizado a home abre tela de verificação com hCaptcha, indicando barreira anti-bot antes do conteúdo do imóvel.
   1.3. [x] Melhorar observabilidade do scraping:
        - registrar `status_code`, `x-azion-request-id`, URL e trecho do corpo da resposta no CSV de erros;
        - diferenciar erro de rede, `403` de borda, parse vazio e bloqueio por challenge.
   1.4. [x] Implementar mitigação básica no fluxo atual:
        - rate limit entre requisições;
        - backoff exponencial com jitter para `403/429/5xx`;
        - rotação/renovação de sessão durante a coleta.
   1.5. [x] Validar bootstrap por navegador (`Playwright`) para obtenção de sessão/cookies antes da coleta.
   1.6. [x] Reavaliar fallback estrutural: migrar o detalhe do imóvel para navegador headless quando o site exigir challenge.
2. [ ] Considerar exportar planilhas finais em CSV/Parquet para integração futura.
3. [ ] Investigar automação parcial de ingestão via API interna quando o fluxo estiver estável.
4. [ ] Supabase: integrar persistência e reprocesso de resultados.

## Frente Dados e Supabase

### Próximas Etapas — Supabase
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

## Frente Produto, Prospecções e Usuários

### Roadmap Recomendado — Prospecções e Gestão de Usuários
1. [x] **Corrigir base do fluxo de usuários**
   1.1. [x] Incluir campo `nome` no cadastro/convite de usuários e armazenar esse valor na tabela `users`.
   1.2. [x] Exibir nome e e-mail na listagem `/usuarios`, mantendo o e-mail como identificador de login.
   1.3. [x] Ajustar fluxo de convite para tornar `nome` obrigatório e manter consistência entre convite, usuário ativo e sessão autenticada.
   1.4. [x] Corrigir geração e exibição do link de convite:
        - Backend: validar `FRONTEND_APP_URL` por ambiente para garantir que `invite_link` aponte para a URL pública correta do frontend.
        - Frontend: revisar exibição/cópia do link em `/usuarios` para evitar quebra visual ou cópia parcial do endereço/token.
        - Operação: revisar variáveis do ambiente produtivo (`FRONTEND_APP_URL`) e registrar valor esperado no runbook.
   1.5. [x] Corrigir acesso direto ao fluxo `/primeiro-acesso` em produção:
        - Deploy: configurar fallback SPA no serviço estático do Render para redirecionar rotas do frontend para `index.html`.
        - Validação: abrir link real de convite em aba anônima e confirmar carga da tela de definição de senha sem `Not Found`.
   1.6. [x] Garantir que a sessão/autenticação exponha `id`, `nome`, `email` e `role` para uso nas telas de Prospecções.
   1.7. [x] Permitir manutenção de usuários já cadastrados:
        - Backend: criar endpoint para atualizar `nome` e `is_active` de usuários existentes.
        - Frontend: adicionar ações de editar nome e ativar/inativar usuário na tela `/usuarios`.
        - Regra: `admin` pode ajustar dados cadastrais sem recriar convite.

2. [x] **Preparar autoria e identidade operacional nas Prospecções**
   2.1. [x] Registrar autor da inclusão (`created_by` ou equivalente) em `imoveis_selecionados`, vinculado ao usuário autenticado.
   2.2. [x] Propagar nome do autor (`created_by_name`) na listagem de selecionados e no histórico de observações.
   2.3. [x] Exibir autoria da seleção de forma visível na lista de selecionados.
   2.3.1. [x] Decisão de UX atual: remover a coluna dedicada "Selecionado por" e incorporar o autor no bloco de responsáveis, com destaque visual sutil e sem duplicar o nome quando ele também estiver atribuído ao imóvel.
   2.4. [x] Sanear registros antigos já existentes, atribuindo autoria inicial à base legada.

3. [ ] **Consolidar prioridade operacional**
   3.1. [ ] Frontend: ao selecionar um imóvel capturado, oferecer escolha explícita de prioridade (`baixa`, `média`, `alta`) no fluxo de inclusão.
   3.1.1. [ ] Decisão atual: adiar esta melhoria por ora; a edição de prioridade posterior na lista atende a operação no momento.
   3.2. [x] Backend: manter normalização de prioridade e garantir persistência consistente em `imoveis_selecionados.prioridade`.
   3.3. [x] UX: exibir prioridade atual na lista de selecionados com ação rápida de edição sem exigir recriação do registro.
   3.4. [x] UX: substituir o texto cru de prioridade por controle mais claro e objetivo na lista de selecionados.

4. [x] **Implementar regra de exclusão por autor/admin**
   4.1. [x] Backend: permitir exclusão apenas para o usuário autor da prospecção ou perfil `admin`; demais perfis recebem `403`.
   4.2. [x] Frontend: esconder/desabilitar ação de excluir quando o usuário não tiver permissão, mantendo mensagem clara ao receber bloqueio do backend.
   4.2.1. [x] Alterar exclusão física para inativação lógica (`ativo = false`), preservando autoria, prioridade e observações para possível recuperação.
   4.2.2. [x] Ocultar registros inativos da tabela de selecionados por padrão.
   4.2.3. [x] Reinclusão de imóvel já inativado deve reativar o mesmo registro, preservando observações e histórico técnico.
   4.3. [x] Frontend: revisar UX da confirmação de exclusão do selecionado:
        - substituir texto genérico/estranho por mensagem objetiva e contextual;
        - incluir identificação do imóvel (código e, se possível, cidade/UF);
        - deixar explícito que a exclusão remove apenas da fila de selecionados, sem apagar o histórico de prospecção.
   4.4. [x] UX: substituir o botão textual `Excluir` por ação visual mais apropriada (ícone/botão secundário com affordance clara e confirmação consistente).
   4.5. [x] Critério de aceite:
        - exclusão é permitida somente ao autor da inclusão ou a `admin`;
        - lista exibe com clareza quem foi o autor da seleção;
        - confirmação de exclusão é compreensível e sem ambiguidade para o usuário.

5. [x] **Implementar atribuição de imóveis para prospectores**
   5.1. [x] Modelagem: criar vínculo de responsáveis (`imoveis_selecionados_responsaveis`) permitindo um ou mais prospectores por imóvel selecionado.
   5.2. [x] Backend: permitir que `admin` atribua e remova prospectores responsáveis por imóvel.
   5.3. [x] Backend: definir regra de acesso operacional:
        - `admin`: vê e gerencia todos os selecionados;
        - autor da inclusão: pode excluir o imóvel que criou;
        - prospector atribuído: pode atuar no imóvel (prioridade/observações), sem poder excluir se não for o autor;
        - usuário não atribuído: não deve ver imóveis de terceiros fora da própria carteira.
   5.3.1. [x] Regra de visibilidade consolidada:
        - usuário comum vê apenas imóveis selecionados por ele ou atribuídos a ele;
        - `admin` mantém visão completa e pode filtrar os selecionados por usuário na interface.
   5.4. [x] Frontend: adicionar seletor de responsáveis na tela de selecionados (somente `admin`) e exibir responsáveis associados por imóvel.

6. [ ] **Consolidar observações operacionais**
   6.1. [x] Modelagem: separar observação atual de trilha histórica técnica (`imoveis_selecionados_observacoes`) para preservar rastreabilidade sem poluir a operação.
   6.2. [x] Backend: manter `observacao_atual` na listagem principal e registrar atualizações com autoria.
   6.3. [x] Frontend: permitir editar a observação atual em modal simples, com bastante espaço de digitação e sem duplicidade de ações.
   6.3.1. [x] Decisão de produto: manter o link do Google Maps acoplado ao modal de observações, como apoio operacional da nota atual, e não à ficha de análise.
   6.4. [ ] UX: exibir observação atual em tooltip/hover na tabela para reduzir ruído visual, sem necessidade de histórico visível na rotina operacional.
   6.5. [ ] Opcional futuro: abrir histórico completo apenas em tela/modal secundário administrativo, se houver necessidade real.

7. [ ] **Adicionar ficha de análise e viabilidade do imóvel selecionado**
   7.0. [x] Decisão atual: considerar a ficha de análise suficientemente boa para a fase atual; manter pendências finas desta seção em backlog, sem priorização imediata.
   7.1. [x] Modelagem: criar estrutura persistente para análise do selecionado, vinculada a `imoveis_selecionados.numero_bem`, preservando autoria e `updated_at`.
   7.2. [x] Modelagem: incluir campos manuais de entrada:
        - valor base da operação
        - tempo da operação em meses (default `12`)
        - reforma
        - condomínio em atraso
        - IPTU em atraso
        - desocupação
        - ITBI em `%` e em valor (campos espelhados)
        - documentação
        - manutenção (`água`, `luz`, `condomínio`)
        - despesas mensais (`água`, `luz`, `condomínio`, `IPTU`)
        - valor máximo do lance
        - comissão de leiloeiro em `%` e em valor (campos espelhados)
        - ganho de capital em `%` e em valor (campos espelhados)
        - `% de financiamento`
        - valor estimado da venda
   7.3. [x] Backend/API: expor endpoint de leitura/gravação da ficha de análise por imóvel selecionado.
   7.4. [x] Frontend: criar formulário de análise no imóvel selecionado com cálculos dinâmicos em tempo real, sem persistir cada alteração automaticamente.
   7.5. [x] Regra de persistência: cálculos e alterações de campos ficam locais na UI enquanto o usuário edita; gravação ocorre apenas ao clicar em `Salvar`.
   7.6. [x] Cálculos dinâmicos esperados:
        - valor do ITBI e seu respectivo percentual (sincronizados)
        - valor da comissão do leiloeiro e seu respectivo percentual (sincronizados)
        - valor do ganho de capital e seu respectivo percentual (sincronizados)
        - total de despesas mensais com multiplicação automática pelo tempo da operação
        - valor desembolsado na aquisição
        - custo do imóvel
        - estimativa de capital investido
        - ROI esperado em `%`
        - ROI esperado em valor
   7.7. [x] Definir fórmula operacional dos cálculos:
        - considerar `% de financiamento` sobre o valor de aquisição
        - definir qual campo usa `valor base` como referência de cálculo para ITBI, comissão e ganho de capital
        - separar claramente despesas únicas vs. despesas mensais recorrentes
        - aplicar despesas mensais projetadas com base no tempo da operação (default `12` meses)
        - permitir informar `prestacao_mensal_financiamento` para casos financiados
        - considerar a prestação do financiamento como caixa não recuperado no horizonte da operação
        - manter ITBI com edição bidirecional entre `%` e valor
        - manter comissão de leiloeiro com edição bidirecional entre `%` e valor
        - manter comissão do corretor com edição bidirecional entre `%` e valor, usando `valor_estimado_venda` como base sugerida
        - manter ganho de capital com edição bidirecional entre `%` e valor
        - separar claramente desembolso de aquisição, custos acessórios, custo total do imóvel e capital total investido
        - não incluir comissão do corretor nem IR/ganho de capital no `custo_total_imovel`, pois esses pagamentos ocorrem apenas após a venda
        - incluir a prestação mensal do financiamento nas despesas do período e, por consequência, no `custo_total_imovel` e no `capital_investido_estimado`
        - manter fórmula auditável e documentada para evitar divergência entre tela e backend
   7.7.1. [x] Especificação base confirmada:
        - `valor_base_operacao`: sugerir `valor_maximo_lance`, mas permitir edição manual
        - `base_itbi = valor_base_operacao`
        - `base_comissao_leiloeiro = valor_maximo_lance`
        - `base_comissao_corretor = valor_estimado_venda`
        - `base_ganho_capital = max((valor_estimado_venda - comissao_corretor_valor) - custo_total_imovel, 0)`
   7.7.2. [x] Fórmulas de sincronização confirmadas:
        - `itbi_valor = base_itbi * (itbi_percentual / 100)`
        - `itbi_percentual = (itbi_valor / base_itbi) * 100`
        - `comissao_leiloeiro_valor = base_comissao_leiloeiro * (comissao_leiloeiro_percentual / 100)`
        - `comissao_leiloeiro_percentual = (comissao_leiloeiro_valor / base_comissao_leiloeiro) * 100`
        - `comissao_corretor_valor = base_comissao_corretor * (comissao_corretor_percentual / 100)`
        - `comissao_corretor_percentual = (comissao_corretor_valor / base_comissao_corretor) * 100`
        - `ganho_capital_valor = base_ganho_capital * (ganho_capital_percentual / 100)`
        - `ganho_capital_percentual = (ganho_capital_valor / base_ganho_capital) * 100`
        - quando a base for `0`, o percentual calculado deve retornar `0` para evitar divisão inválida
   7.7.3. [x] Fórmulas de despesas e aquisição confirmadas:
        - `despesas_unicas = reforma + condominio_atraso + iptu_atraso + desocupacao + documentacao + itbi_valor`
        - `despesa_mensal_operacional = manutencao_agua_mensal + manutencao_luz_mensal + manutencao_condominio_mensal + manutencao_iptu_mensal`
        - `despesa_mensal_total = despesa_mensal_operacional + prestacao_mensal_financiamento`
        - `despesas_mensais_projetadas = despesa_mensal_total * tempo_operacao_meses`
        - `custo_financiamento_projetado = prestacao_mensal_financiamento * tempo_operacao_meses`
        - `valor_financiado = valor_maximo_lance * (percentual_financiamento / 100)`
        - `desembolso_aquisicao = valor_maximo_lance - valor_financiado + comissao_leiloeiro_valor`
        - `custo_total_imovel = valor_financiado + desembolso_aquisicao + despesas_unicas + despesas_mensais_projetadas`
        - `capital_investido_estimado = desembolso_aquisicao + despesas_unicas + despesas_mensais_projetadas`
   7.7.4. [x] Fórmulas de venda e resultado confirmadas:
        - `lucro_esperado_valor = valor_estimado_venda - comissao_corretor_valor - ganho_capital_valor - custo_total_imovel`
        - `despesas_pos_venda = comissao_corretor_valor + ganho_capital_valor`
        - `roi_esperado_percentual = (lucro_esperado_valor / capital_investido_estimado) * 100`
        - `roi_esperado_valor = lucro_esperado_valor`
   7.8. [x] UX: destacar campos digitáveis vs. campos calculados; exibir resumo financeiro em bloco visual claro; permitir edição confortável sem poluir a tabela principal.
        - resumo reorganizado em duas linhas de cards, separando capital investido, venda, despesas pós-venda, lucro líquido esperado e ROI;
        - nomenclatura padronizada para `Despesas únicas`, `Despesas mensais` e `Despesas do período`;
        - `Prestação mensal financiamento` movida para o bloco de despesas mensais, evitando duplicidade/confusão visual.
   7.9. [ ] Critério de aceite:
        - usuário consegue preencher a análise do imóvel sem sair da rotina de prospecção;
        - cálculos reagem imediatamente às alterações dos campos;
        - ITBI permanece sincronizado entre `%` e valor;
        - comissão e ganho de capital permanecem sincronizados entre `%` e valor;
        - despesas mensais projetadas respeitam o tempo da operação informado;
        - custo do financiamento no período respeita o tempo da operação e a prestação mensal informada;
        - nada é persistido antes do clique em `Salvar`;
        - ao salvar, os valores reaparecem idênticos ao recarregar a página;
        - link do Google Maps fica acessível a partir do modal de observações do imóvel selecionado.

8. [ ] **Revisar a experiência da lista de selecionados**
   8.1. [x] Backend: manter retorno de `data_leilao` considerando a maior data disponível entre `data_leilao_1`, `data_leilao_2` e `data_hora_encerramento`.
   8.2. [x] Frontend: permitir ordenação pela data do leilão, priorizando esse campo como ordenação operacional da fila.
   8.3. [x] UX: remover a coluna `Status` da tabela de selecionados enquanto ela não agrega valor operacional, reduzindo poluição visual.
   8.4. [x] Frontend: garantir colunas e ações finais da lista:
        - Data do leilão
        - Prioridade editável por ação compacta na coluna de ações
        - autoria integrada ao tooltip/gestão de responsáveis
        - Responsáveis geridos por ação compacta na coluna de ações
        - Cidade/UF consolidados em uma única coluna para reduzir largura da tabela
        - Ações com botões/iconografia mais claros
   8.4.1. [x] Reorganizar navegação da página:
        - aba `Base completa` vem primeiro;
        - aba `Selecionados` vem depois;
        - imóveis já selecionados aparecem identificados na consulta da base completa.
   8.4.2. [x] Melhorias visuais aplicadas na página principal de Prospecções:
        - filtros e ordenações dedicados para a fila de selecionados;
        - aparência mais profissional dos botões e comandos;
        - redução da hierarquia tipográfica para evitar títulos excessivamente grandes;
        - refinamento de espaçamento, densidade dos cards e legibilidade geral da tela;
        - remoção do header secundário "Prospecções", preservando apenas a barra principal e os cards-resumo;
        - data do leilão compactada para formato `dd/mm/yy hh:mm`;
        - observações representadas por ícone com estado visual cinza/azul;
        - análise financeira representada por ícone com cor orientada pelo ROI;
        - ações principais da tabela condensadas em ícones na mesma linha;
        - descrição da sessão do usuário reduzida para não competir com o conteúdo operacional.
   8.4.3. [ ] Versão mobile da aplicação:
        - [x] iniciar menu mobile com cards-resumo para entrada rápida;
        - [x] card `Controle financeiro` aponta para a home quando o usuário tem acesso;
        - [x] card `Selecionados para prospecção` abre a primeira experiência mobile da fila;
        - [x] primeira versão mobile da fila prioriza consulta rápida, notas e viabilidade;
        - [x] ao identificar acesso em viewport/dispositivo móvel, exibir uma tela inicial simplificada em vez da grade completa desktop;
        - [x] essa entrada mobile deve abrir com cards-resumo de navegação operacional;
        - [x] card `Controle financeiro` exibe quantidade de imóveis e só aparece/habilita quando o usuário tiver acesso a essa área;
        - [x] card `Selecionados para prospecção` exibe quantidade de imóveis da fila acessível ao usuário;
        - [x] a partir desse menu inicial, o usuário entra na experiência mobile otimizada de cada módulo, começando por `Selecionados`;
        - [x] a detecção mobile deve combinar viewport responsiva e sinais de dispositivo/toque, sem depender apenas de `userAgent`;
        - [x] a rota inicial no celular redireciona para `Prospecções`, evitando queda indevida na home financeira;
        - [x] o shell mobile (topbar/sessão) foi ajustado para evitar quebra visual em telas pequenas.
   8.5. [ ] Critério de aceite:
        - usuário consegue alterar prioridade na lista;
        - lista de selecionados exibe com clareza quem selecionou o imóvel, integrado aos responsáveis;
        - tabela ordena por data do leilão;
        - coluna `Status` não polui a operação diária;
        - coluna de observações indica visualmente se existe nota ativa;
        - coluna de ações comunica análise e remoção sem exigir botões textuais;
        - `admin` consegue atribuir um ou mais prospectores a cada imóvel;
        - prospector atribuído consegue alterar prioridade e registrar observações;
        - interface principal de Prospecções separa claramente base completa e fila operacional;
        - no celular, a entrada do usuário prioriza cards-resumo claros e acesso rápido aos módulos permitidos;
        - no celular, a área de `Selecionados` permite consultar o imóvel, registrar notas e abrir a viabilidade sem depender da tabela desktop.

9. [ ] **Incluir imóveis manualmente fora da base capturada**
   9.1. [ ] Modelagem/API: permitir criação manual de imóvel selecionado sem dependência prévia de `vw_imoveis_prospeccao_latest`, preservando autoria e metadados mínimos.
   9.2. [ ] Frontend: criar fluxo de inclusão manual para imóveis vindos de outros sites, com campos essenciais (código/manual, cidade, UF, modalidade/origem, link, valor de referência, data do leilão, prioridade inicial e observação).
   9.3. [ ] UX: destacar origem manual vs. origem capturada, sem quebrar a gestão unificada da fila de selecionados.
   9.4. [ ] Critério de aceite:
        - usuário autorizado consegue cadastrar imóvel manualmente;
        - item manual aparece na mesma fila de selecionados com identificação clara da origem;
        - item manual aceita atribuição, prioridade e observações como qualquer outro.

10. [ ] **Fechar qualidade, testes e documentação**
   10.1. [ ] Backend: testes de autorização por papel (`prospector/viewer/editor/admin`) nas rotas de Prospecções e rotas financeiras.
   10.2. [ ] Backend: testes para inclusão, edição, exclusão restrita por autor/admin, atribuição de responsáveis, inclusão manual e cálculo de `data_leilao`.
   10.3. [ ] Backend: testes para observações (persistência da nota atual, trilha técnica, autoria e permissões por atribuição).
   10.4. [ ] Backend: testes para ficha de análise/viabilidade, fórmulas financeiras e persistência apenas no `Salvar`.
   10.5. [ ] Frontend: testes de renderização condicional por papel, edição de prioridade, bloqueio de exclusão, ordenação por leilão, atribuição de prospectores, tooltip de observações, ficha de viabilidade e inclusão manual.
   10.6. [ ] Atualizar `docs/README.md` e `README.md` com matriz de permissões, regra de autoria, atribuição de responsáveis, campo `nome` no usuário, inclusão manual, observações operacionais e ficha de análise financeira.
   10.7. [ ] Atualizar documentação operacional com fluxo completo de convite/primeiro acesso, incluindo campo `nome`, configuração correta da URL pública do frontend e fallback SPA do deploy.
   10.8. [ ] Adicionar testes de integração para convites, expiração, definição de senha, persistência de `nome`, geração de `invite_link` e edição/inativação de usuários.

11. [ ] **Backlog administrativo**
   11.1. [ ] Criar visão administrativa de selecionados inativos, com opção de reativação manual sem depender de nova inclusão via base capturada.

## Frente Financeiro Compartilhado

### Status Atual da Frente
- Implementado em código e com smoke técnico concluído:
  - tabela `imovel_socios` e colunas compartilhadas em `lancamentos`;
  - backfill idempotente dos imóveis atuais para `matheus.mro@gmail.com` com `100%`;
  - backfill idempotente de `paid_by_user_id` legado quando ausente;
  - correção do `INSERT` de convite de usuário, restabelecendo a geração de convites com validade e link de primeiro acesso;
  - endpoints mínimos para sócios do imóvel, posição financeira compartilhada e imóveis acessíveis no contexto societário;
  - campo `pix_key` no cadastro de usuários e serialização de sessão/login;
  - tela `/usuarios` com camada administrativa mínima para compor a participação societária por imóvel;
  - seleção de `Quem pagou` na edição de lançamentos;
  - exigência de `Quem pagou` no lançamento em lote;
  - card técnico inicial de financeiro compartilhado no dashboard;
  - registro de equalização entre sócios direto no card compartilhado do dashboard;
  - fluxo de equalização refinado para abrir em modal, com CTA exibido apenas quando houver saldo a pagar e com valor sugerido no próprio botão;
  - tabela de equalizações com data no padrão brasileiro e colunas `Quem pagou` / `Quem recebeu`;
  - equalizações filtradas para aparecer apenas no card compartilhado, sem poluir `Transações Incompletas` e `Transações Completas`;
  - correção do filtro de `Transações Incompletas` por imóvel atual;
  - restauração de `Transações Completas` e inclusão da coluna `Quem pagou`;
  - correções adicionais nas queries de `Transações Completas` para evitar que o quadro fique vazio após os filtros novos;
  - inclusão direta de nova transação confirmada via botão `+ Incluir transação`, sem depender do fluxo de pendências;
  - liberação transitória do módulo Financeiro para usuário `prospector` com vínculo ativo em `imovel_socios`;
  - restrição da Home financeira do sócio para carregar apenas imóveis acessíveis;
  - proteção de acesso por `id_imovel` no backend e bloqueio de navegação indevida pela URL;
  - modal `Trocar imóvel` filtrado pelos imóveis acessíveis ao usuário;
  - refinamento inicial do dashboard com card de dados cadastrais mais compacto, exibindo apenas nome do imóvel, endereço e mapa;
  - mapa sob demanda no card superior, carregado apenas quando o usuário solicitar;
  - correção do atalho mobile do `Controle financeiro`, com entrada própria em `/financeiro` e navegação direta para o dashboard quando houver apenas um imóvel acessível;
  - contagem do card mobile de Financeiro baseada na lista real de imóveis acessíveis ao usuário;
  - versão mobile dedicada do dashboard financeiro para `Resumo Financeiro`, `Financeiro Compartilhado` e grades de transações, substituindo tabelas espremidas por cards/listas empilhadas;
  - leitura do orçamento no mobile simplificada, com detalhamento sob demanda;
  - primeira leitura gráfica do orçamento no dashboard, como apoio visual ao comparativo por grupo;
  - remoção do espaço reservado ao mapa no topo do dashboard quando o imóvel não possui geolocalização salva;
  - remoção de uma chamada redundante no resumo financeiro;
  - carregamento progressivo das seções mais pesadas do dashboard;
  - cache curto para imóveis acessíveis no frontend, reduzindo chamadas repetidas.
- Evidências já confirmadas em smoke técnico:
  - `13` imóveis atuais vinculados ao usuário padrão no backfill societário;
  - `851` lançamentos legados atualizados com `paid_by_user_id` padrão quando ausente;
  - consulta de `Transações Incompletas` validada com filtro por imóvel;
  - consulta de `Transações Completas` validada após correção da query ambígua.
- Ainda pendente de validação operacional pelo usuário:
  - testar o fluxo completo no app rodando com o imóvel piloto, especialmente edição individual, lote, restrição de imóveis por sócio e leitura do card compartilhado;
  - revisar minuciosamente a leitura do dashboard compartilhado antes de fechar a interface final;
  - confirmar cenários reais de equalização entre sócios no imóvel piloto, incluindo reflexo correto do saldo após registro do acerto;
  - validar se o CTA de equalização por saldo sugerido está mais claro do que o formulário sempre aberto;
  - validar se o fluxo `+ Incluir transação` ficou mais natural do que depender do card de pendências;
  - medir o ganho real das primeiras melhorias de performance e identificar os próximos gargalos de carregamento;
  - validar se o card superior mais compacto melhorou a leitura e a navegação do dashboard no uso diário;
  - validar a nova entrada mobile do Financeiro em cenários com um e com vários imóveis acessíveis;
  - validar se a nova apresentação mobile do dashboard ficou adequada em aparelho real;
  - validar se o topo do dashboard sem geolocalização ficou mais limpo e sem espaço desperdiçado.
- Situação atual dos testes operacionais:
  - a UI mínima de cadastro societário e `pix_key` já existe, então o fluxo compartilhado pode ser validado com dados reais;
  - o bloqueio principal deixou de ser cadastro/vínculo e passou a ser refinamento funcional do dashboard compartilhado, da equalização entre sócios e da navegação mobile do Financeiro.
- Regra transitória já aplicada:
  - enquanto a capacidade explícita `socio` não existir no modelo de autenticação, o acesso ao Financeiro pode ser liberado para usuário `prospector` que tenha participação ativa em pelo menos um imóvel;
  - essa liberação é temporária e deve ser substituída por permissão explícita baseada em capacidade/papel societário.

### Premissas de Implementação Segura
- a aplicação não pode parar durante a introdução do financeiro compartilhado;
- nenhum dado existente pode ser perdido, sobrescrito sem rastreabilidade ou reclassificado sem critério documentado;
- a entrega deve acontecer por fases compatíveis com a base atual, mantendo leitura e gravação do fluxo atual enquanto o novo modelo é ativado gradualmente;
- toda mudança estrutural precisa ser retrocompatível no primeiro momento, com campos novos opcionais, backfill controlado e ativação progressiva por funcionalidade;
- qualquer cálculo novo de participação, saldo ou equalização deve ser auditável e reprocessável a partir dos lançamentos originais.

### Proposta Técnica Inicial
1. [ ] **Estratégia de rollout sem parada**
   1.1. [ ] Adotar expansão gradual do schema: primeiro adicionar novas tabelas/colunas sem remover nem renomear estruturas já usadas pela aplicação.
   1.2. [ ] Manter backend e frontend compatíveis com o modelo atual enquanto o novo modelo compartilhado estiver incompleto.
   1.3. [ ] Ativar a nova experiência por etapas, preferencialmente com feature flag ou checagem de capacidade do usuário/imóvel.
   1.4. [ ] Só migrar telas, consultas e cálculos principais depois de validar que toda a base histórica relevante já recebeu vínculo societário mínimo.

2. [ ] **Modelo mínimo de dados sugerido**
   2.1. [x] Criar tabela de participação por imóvel, por exemplo `imovel_socios`, com:
        - `id`
        - `imovel_id`
        - `user_id`
        - `percentual_participacao`
        - `ativo`
        - `created_at` / `updated_at`
   2.1.1. [ ] A participação deve ser definida no vínculo entre usuário e imóvel, permitindo que o mesmo sócio participe de vários imóveis com percentuais diferentes em cada um.
   2.1.2. [ ] Alterações de participação devem suportar cenários em que um sócio compra a parte de outro, com recálculo dinâmico do saldo no dashboard a partir da configuração atual.
   2.1.3. [ ] O modelo também deve permitir entrada de novo sócio e saída de sócio existente, tratando a saída como participação `0%` na configuração atual do imóvel.
   2.2. [ ] Garantir regra de integridade para impedir mais de `100%` de participação ativa por imóvel e evitar duplicidade de sócio ativo no mesmo período.
   2.2.1. [ ] A soma dos percentuais ativos do imóvel deve continuar fechando em `100%` após entrada, saída ou redistribuição de participação entre sócios.
   2.3. [x] Adicionar em lançamentos financeiros o campo `paid_by_user_id` como opcional no primeiro rollout.
   2.4. [x] Adicionar tipo/classificação para distinguir:
        - despesa do imóvel;
        - receita do imóvel;
        - transferência de equalização entre sócios.
   2.5. [ ] Evitar reescrever lançamentos históricos; o compartilhamento deve ser inferido por vínculo do imóvel e por campos complementares novos.

3. [ ] **Migração inicial da base sem perda de dados**
   3.1. [x] Criar primeiro o registro societário padrão de todos os imóveis atuais para `matheus.mro@gmail.com` com `100%` de participação.
   3.2. [x] Preencher `paid_by_user_id` legado apenas quando a origem do pagamento não existir e documentar a premissa adotada.
   3.3. [x] Executar backfill idempotente, para que a rotina possa rodar novamente sem duplicar vínculos ou corromper dados.
   3.4. [x] Registrar relatório pós-migração com quantidade de imóveis vinculados, lançamentos atualizados e eventuais exceções.
   3.5. [ ] Fazer backup completo antes da migração e validar amostra depois do backfill, comparando totais financeiros antes vs. depois.

4. [ ] **Compatibilidade da aplicação durante a transição**
   4.1. [x] Se o imóvel não tiver configuração societária explícita, o sistema deve continuar funcionando como imóvel individual.
   4.2. [x] Cálculos antigos do financeiro não podem quebrar caso `paid_by_user_id` ou participação ainda estejam ausentes.
   4.3. [ ] A UI só deve exibir visão compartilhada quando os dados mínimos do imóvel estiverem consistentes.
   4.4. [x] APIs existentes devem continuar respondendo no formato atual até que o frontend esteja adaptado ao modelo novo.

5. [ ] **Cálculo e auditabilidade**
   5.1. [ ] Calcular saldo societário sempre a partir dos lançamentos originais e dos percentuais vigentes do imóvel.
   5.2. [ ] Transferências entre sócios não podem alterar artificialmente custo do imóvel, orçamento ou lucro operacional.
   5.3. [ ] Manter memória de cálculo por imóvel:
        - total pago por sócio;
        - valor devido por participação;
        - saldo líquido a pagar/receber;
        - equalizações já registradas.
   5.4. [ ] Garantir que a visão `Minha participação` derive dos mesmos dados-base da visão total, mudando apenas a ótica de apresentação e rateio.
   5.5. [ ] Quando o administrador alterar o quadro societário por compra de participação, o saldo de compensação deve ser recalculado automaticamente com base na configuração atual do imóvel.
   5.6. [ ] Quando um sócio sair da sociedade ou um novo sócio entrar, o dashboard deve recalcular automaticamente a posição entre os participantes com base na composição atual.

6. [ ] **Sequência recomendada de implementação**
   6.1. [x] Fase 1: criar schema novo e backfill dos imóveis atuais para participação de `100%`.
   6.2. [x] Fase 2: adicionar `paid_by_user_id` e adaptar formulários de lançamento sem obrigatoriedade imediata.
   6.3. [x] Fase 3: criar consultas/cálculos de saldo entre sócios e transferências de equalização.
   6.4. [ ] Fase 4: liberar visão do dashboard com chave `Total` vs. `Minha participação`.
   6.5. [ ] Fase 5: revisar permissões, consolidar papéis acumuláveis e só então simplificar legados que deixarem de ser necessários.

### Proposta Concreta de Banco, API e Migração
1. [ ] **Diagnóstico do estado atual**
   1.1. [ ] A tabela `users` hoje trabalha com coluna única `role`, o que impede representar com clareza um usuário simultaneamente `prospector` e `socio`.
   1.2. [ ] O token JWT atual também carrega apenas um `role`, e a autorização do backend usa essa premissa em `requires_role`, `requires_editor_token` e `requires_prospeccao_write`.
   1.3. [ ] A tabela `lancamentos` hoje não registra explicitamente quem pagou, nem distingue despesa operacional do imóvel vs. acerto entre sócios.
   1.4. [ ] O financeiro atual é centrado no imóvel como unidade única, sem camada societária entre `imoveis` e `lancamentos`.

2. [ ] **Schema incremental sugerido**
   2.1. [ ] Criar tabela `user_capabilities` para papéis acumuláveis:
        - `id`
        - `user_id` FK para `users`
        - `capability` (`viewer`, `editor`, `admin`, `prospector`, `socio`)
        - `created_at`
        - `created_by` opcional
        - unicidade por `user_id + capability`
   2.2. [ ] Manter `users.role` no primeiro momento como campo legado de compatibilidade, alimentado em paralelo até a aplicação migrar completamente para capacidades.
   2.3. [x] Criar tabela `imovel_socios`:
        - `id`
        - `imovel_id` FK para `imoveis`
        - `user_id` FK para `users`
        - `percentual_participacao`
        - `ativo`
        - `observacao` opcional
        - `created_at` / `updated_at`
   2.3.1. [ ] O mesmo `user_id` pode aparecer em múltiplos imóveis, com `percentual_participacao` diferente em cada vínculo.
   2.4. [x] Adicionar em `lancamentos` novas colunas opcionais no primeiro rollout:
        - `paid_by_user_id` FK para `users`
        - `beneficiary_user_id` FK para `users`, usada apenas em acertos entre sócios
        - `tipo_movimentacao` (`despesa_imovel`, `receita_imovel`, `equalizacao_socios`)
        - `created_by_user_id` opcional, para separar autor do lançamento vs. pagador
   2.5. [ ] Evitar alterar significado das colunas atuais de `lancamentos`; a evolução deve ser aditiva.

3. [ ] **Views e consultas novas sugeridas**
   3.1. [ ] Criar view de participação ativa por imóvel, por exemplo `vw_imovel_socios_ativos`, para concentrar o percentual vigente de cada sócio.
   3.2. [ ] Criar view de posição financeira por sócio e imóvel, por exemplo `vw_imovel_saldos_socios`, contendo:
        - valor total pago por sócio;
        - valor devido por participação;
        - saldo líquido;
        - total de equalizações já registradas.
   3.3. [ ] Criar view consolidada por usuário, por exemplo `vw_saldos_socios_consolidado`, para alimentar dashboard de “tenho a receber / tenho a pagar”.
   3.4. [ ] Manter as views atuais do dashboard financeiro funcionando sem dependência obrigatória das novas views na primeira etapa.

   4. [ ] **Compatibilidade de autenticação e autorização**
   4.1. [ ] Evoluir o token para carregar:
        - `role` legado, enquanto necessário;
        - `capabilities` como lista oficial para a nova autorização.
   4.2. [ ] Atualizar o backend para ler `capabilities` primeiro e cair em `role` apenas como fallback.
   4.3. [ ] Reescrever gradualmente as regras:
        - acesso a Prospecções por `prospector`, `editor` ou `admin`;
        - acesso ao Financeiro compartilhado por `socio`, `editor` ou `admin`;
        - `admin` com acesso integral;
        - `prospector` sem acesso financeiro por padrão.
   4.3.1. [ ] Regra transitória aceita no rollout atual:
        - enquanto `socio` ainda não existir como capacidade formal, o sistema pode liberar o módulo Financeiro para usuário `prospector` com vínculo ativo em `imovel_socios`;
        - essa exceção existe apenas para não travar a operação antes da migração para papéis acumuláveis.
   4.4. [ ] Só remover dependência de `users.role` quando frontend, backend e sessão estiverem plenamente adaptados.

5. [ ] **Rotas/API mínimas da primeira fase**
   5.1. [ ] Adicionar endpoint administrativo para listar vínculos societários por usuário e por imóvel.
   5.2. [x] Adicionar endpoint administrativo para salvar/editar quadro societário de um imóvel com validação de soma de percentuais.
   5.3. [x] Adaptar criação/edição de lançamentos para aceitar `paid_by_user_id` sem torná-lo obrigatório no primeiro deploy.
   5.4. [x] Adicionar endpoint de leitura da posição societária do imóvel:
        - sócios ativos;
        - percentual de cada um;
        - total pago;
        - valor devido;
        - saldo líquido;
        - equalizações registradas.
   5.5. [ ] Adicionar endpoint da chave de visão do dashboard, mantendo a mesma base de dados:
        - `view_mode=total`
        - `view_mode=ownership`
   5.6. [ ] Garantir que endpoints antigos do dashboard continuem respondendo sem exigir contexto societário explícito.
   5.7. [ ] Adicionar suporte ao cadastro de `pix_key` no usuário para facilitar transferências entre sócios.

6. [ ] **Migração segura recomendada**
   6.1. [ ] Deploy 1:
        - criar tabelas/colunas novas;
        - não alterar comportamento da UI;
        - não exigir preenchimento dos novos campos.
   6.2. [ ] Backfill 1:
        - criar capacidade `admin`/`editor`/`prospector` espelhando `users.role`;
        - criar vínculo `imovel_socios` de `100%` para `matheus.mro@gmail.com` em todos os imóveis atuais;
        - preencher `paid_by_user_id` legado apenas onde a premissa padrão for aceita.
   6.3. [ ] Deploy 2:
        - adaptar backend para aceitar capacidades múltiplas e novos campos opcionais;
        - manter fallback completo para imóveis sem sociedade configurada.
   6.4. [ ] Deploy 3:
        - liberar UI de cadastro de sócios por imóvel;
        - liberar seleção de “quem pagou” em lançamentos.
   6.5. [ ] Deploy 4:
        - liberar cálculo de saldo/equalização;
        - liberar chave do dashboard entre visão total e participação.
   6.6. [ ] Após estabilização:
        - revisar legados;
        - reduzir dependência de `users.role`;
        - decidir o que pode ser oficialmente descontinuado.

7. [ ] **Validações para garantir zero perda de dados**
   7.1. [ ] Antes de cada backfill, gerar backup completo do Supabase com snapshot local versionado fora do Git.
   7.2. [ ] Comparar totais antes/depois por imóvel:
        - quantidade de lançamentos;
        - soma de despesas;
        - soma de receitas;
        - orçamento;
        - saldo operacional.
   7.3. [ ] Validar amostra manual de imóveis pessoais e do primeiro imóvel compartilhado.
   7.4. [ ] Só tornar obrigatório qualquer campo novo depois que a aplicação já estiver escrevendo e lendo esse campo de forma estável.
   7.5. [ ] Tratar qualquer migração como idempotente e com rollback lógico possível, evitando operações destrutivas nas tabelas atuais.

### Desenho Executivo de Implementação
1. [ ] **Migrations planejadas em ordem**
   1.1. [x] `001_imovel_socios.sql` ou equivalente via helper idempotente em [models.py](/Users/matheusoliveira/Documents/Leiloes/Aplicacoes/Financeiro/backend/models.py)
        - criar tabela `imovel_socios`;
        - criar índice por `imovel_id`;
        - criar índice por `user_id`;
        - criar validações mínimas de percentual positivo e ativo.
   1.2. [x] `002_lancamentos_shared_fields.sql` ou equivalente via helper idempotente em [models.py](/Users/matheusoliveira/Documents/Leiloes/Aplicacoes/Financeiro/backend/models.py)
        - adicionar `paid_by_user_id` em `lancamentos`;
        - adicionar `beneficiary_user_id` em `lancamentos`;
        - adicionar `tipo_movimentacao` em `lancamentos`;
        - adicionar `created_by_user_id` em `lancamentos`;
        - definir default seguro de `tipo_movimentacao = 'despesa_imovel'` apenas para novos lançamentos, sem reclassificar automaticamente o legado.
   1.3. [ ] `003_shared_views.sql`
        - criar `vw_imovel_socios_ativos`;
        - criar `vw_imovel_saldos_socios`;
        - criar `vw_saldos_socios_consolidado`.
   1.4. [x] `004_backfill_imoveis_socios_legacy.sql` ou equivalente via rotina idempotente em [models.py](/Users/matheusoliveira/Documents/Leiloes/Aplicacoes/Financeiro/backend/models.py)
        - localizar usuário `matheus.mro@gmail.com`;
        - vincular todos os imóveis atuais com participação de `100%`;
        - gerar relatório de quantos imóveis ficaram cobertos.
   1.5. [x] `005_backfill_lancamentos_paid_by.sql` ou equivalente via rotina idempotente em [models.py](/Users/matheusoliveira/Documents/Leiloes/Aplicacoes/Financeiro/backend/models.py)
        - preencher `paid_by_user_id` apenas para lançamentos sem pagador explícito;
        - aplicar premissa documentada do usuário padrão;
        - registrar contagem de linhas afetadas.
   1.6. [ ] `006_user_capabilities.sql`
        - criar tabela `user_capabilities`;
        - criar índice por `user_id`;
        - criar unicidade por `user_id + capability`;
        - popular capacidades iniciais com espelho de `users.role`;
        - deixar essa etapa para depois da estabilização do compartilhamento no financeiro.

2. [ ] **Contratos de dados sugeridos**
   2.1. [ ] `user_capabilities`
        - um usuário pode ter múltiplas capacidades simultâneas;
        - `admin` continua sendo capacidade máxima, não excludente.
   2.2. [ ] `imovel_socios`
        - um imóvel pode ter um ou mais sócios ativos;
        - um mesmo sócio pode participar de vários imóveis diferentes;
        - o percentual de participação do sócio pertence ao imóvel, não ao usuário de forma global;
        - mudança de participação atualiza a configuração societária vigente do imóvel, sem exigir controle de vigência temporal;
        - entrada de novo sócio ou saída de sócio existente é tratada pela atualização da composição atual do imóvel;
        - sócio que sair pode ficar com `0%` de participação ou ser marcado como inativo para não aparecer mais como participante ativo;
        - a soma das participações ativas deve ser `100%` para imóveis compartilhados já configurados;
        - imóveis sem configuração explícita seguem operando como legados até o backfill.
   2.2.1. [ ] Enquanto a capacidade `socio` não for formalizada, participação ativa em `imovel_socios` pode funcionar como sinal transitório de acesso ao Financeiro para usuários originalmente `prospector`.
   2.3. [ ] `lancamentos`
        - `paid_by_user_id` representa quem desembolsou o valor;
        - `created_by_user_id` representa quem lançou no sistema;
        - `beneficiary_user_id` só faz sentido para `equalizacao_socios`;
        - `tipo_movimentacao` define se o lançamento impacta custo do imóvel ou apenas acerto societário.

3. [ ] **Impacto esperado nas rotas atuais**
   3.1. [ ] Rotas de autenticação:
        - token passa a incluir `capabilities`;
        - respostas de sessão/login continuam incluindo `role` por compatibilidade inicial.
   3.1.1. [ ] Rotas de usuários:
        - a tela de controle de usuários passa a concentrar a gestão administrativa de capacidade `socio` e os vínculos societários por imóvel;
        - essa centralização entra depois que banco, APIs e dashboard compartilhado estiverem estáveis;
        - apenas `admin` pode criar, editar ou remover vínculos de sócios em imóveis;
        - o cadastro do usuário deve suportar chave Pix para consulta rápida no fluxo de equalização e transferências.
   3.2. [ ] Rotas de Prospecções:
        - devem migrar de validação por `role` para validação por capacidade;
        - não devem sofrer mudança funcional imediata para o usuário final.
   3.3. [ ] Rotas do dashboard financeiro:
        - leitura atual do imóvel continua igual em `view_mode=total`;
        - nova camada de leitura adiciona `view_mode=ownership`;
        - endpoints antigos não devem exigir dados de sócio para continuar respondendo.
   3.4. [x] Rotas de lançamentos:
        - `POST/PATCH` passam a aceitar `paid_by_user_id`, `tipo_movimentacao` e `beneficiary_user_id`;
        - payload antigo continua válido.
   3.5. [ ] Rotas novas:
        - `GET /imoveis/<id>/socios`
        - `GET /imoveis/<id>/financeiro-compartilhado`
        - `GET /dashboard/imoveis/<id>?view_mode=total|ownership`
   3.5.1. [ ] Fase posterior de administração:
        - `GET /usuarios/<id>/participacoes-imoveis`
        - `PUT /usuarios/<id>/participacoes-imoveis`
   3.5.2. [ ] O `PUT /usuarios/<id>/participacoes-imoveis` deve suportar ajuste administrativo de participação quando um sócio comprar a parte de outro, com recálculo automático da posição societária.
   3.5.3. [ ] O ajuste administrativo também deve suportar entrada de novo sócio e saída de sócio atual, refletindo imediatamente a nova composição no dashboard.

4. [ ] **Sequência de backend por fase**
   4.1. [x] Fase A — Preparação silenciosa
        - criar schema novo;
        - manter toda autorização atual funcionando;
        - não depender ainda da tela de usuários para operar o compartilhamento.
   4.2. [x] Fase B — Compatibilidade de segurança
        - adicionar verificações mínimas de acesso por participação no imóvel e por `admin`;
        - manter fallback para o modelo atual de `role`;
        - adiar a evolução completa de `capabilities` para uma fase posterior.
   4.3. [x] Fase C — Financeiro compartilhado no backend
        - adaptar queries de lançamentos;
        - criar queries de saldo societário;
        - criar endpoints novos sem trocar a UI antiga imediatamente;
        - permitir operação compartilhada mesmo antes da centralização completa na tela de usuários.
   4.4. [ ] Fase D — Frontend incremental
        - [x] criar camada administrativa mínima para viabilizar teste real do compartilhamento antes da consolidação completa em `/usuarios`;
        - [x] essa camada precisa permitir cadastrar/editar usuário sócio, informar chave Pix e vincular participação por imóvel;
        - [x] liberar seleção de pagador;
        - [x] liberar leitura inicial de saldo e composição compartilhada;
        - [ ] liberar toggle `Total` vs. `Minha participação`.
   4.5. [ ] Fase E — Consolidação
        - revisar logs e métricas;
        - comparar números com imóveis reais;
        - consolidar a tela de usuários como ponto oficial de administração societária;
        - decidir quando reduzir a dependência de `role` único.
   4.6. [ ] Fase F — Ajustes societários
        - suportar compra da parte de um sócio por outro;
        - suportar entrada e saída de sócios na composição atual do imóvel;
        - recalcular automaticamente saldo e compensações após a mudança.
   4.7. [ ] Fase G — Papéis acumuláveis completos
        - introduzir `user_capabilities` como fonte principal de autorização;
        - permitir combinação formal de `prospector`, `socio`, `editor` e `admin`;
        - aposentar gradualmente a dependência de `role` único.

5. [ ] **Estratégia de rollout sem interrupção**
   5.1. [ ] Primeiro deploy sempre deve ser tolerante a dados ausentes nas colunas novas.
   5.2. [ ] O backfill deve rodar fora do caminho crítico da aplicação, sem lock prolongado de escrita.
   5.3. [ ] Toda nova leitura compartilhada precisa cair em fallback para visão total antiga quando faltar configuração societária.
   5.4. [ ] O primeiro imóvel compartilhado deve ser habilitado com acompanhamento manual, antes de generalizar a experiência.
   5.5. [ ] Equalização entre sócios só deve ser liberada depois que `paid_by_user_id` e participação por imóvel estiverem estáveis.

6. [ ] **Checklist objetivo antes de implementar**
   6.1. [ ] Confirmar nome definitivo das tabelas/colunas novas.
   6.2. [ ] Confirmar se `socio` será capacidade pura ou também papel exibido na gestão de usuários.
   6.3. [ ] Confirmar quais telas existentes do financeiro precisam refletir visão proporcional já na primeira entrega.
   6.4. [ ] Confirmar se a equalização será lançada na mesma grade de lançamentos ou em bloco visual separado.
   6.5. [ ] Confirmar o primeiro imóvel real que servirá como piloto do rollout compartilhado.
   6.6. [x] Confirmado: cadastro de sócios, vínculo com imóveis e definição de participação ficarão centralizados na tela de controle de usuários, com gestão restrita a `admin`.
   6.7. [x] Confirmado: quando um sócio comprar a parte de outro, o administrador ajustará a participação e o saldo de compensação será recalculado automaticamente.
   6.8. [x] Confirmado: a ordem de implementação prioriza banco de dados, backend e dashboard compartilhado; a tela de usuários entra depois como camada administrativa consolidada.
   6.9. [x] Confirmado: a parte de dashboard compartilhado será revisada minuciosamente antes da interface final, com checkpoint explícito de validação funcional e visual.

### Primeira Entrega Real Recomendada
1. [x] **Escopo mínimo da primeira entrega**
   1.1. [x] Criar `imovel_socios` com participação por imóvel.
   1.2. [x] Adicionar `paid_by_user_id` e `tipo_movimentacao` em `lancamentos`.
   1.3. [x] Fazer backfill dos imóveis atuais para `matheus.mro@gmail.com` com `100%`.
   1.4. [x] Permitir registrar despesa informando qual sócio pagou.
   1.5. [x] Expor backend e consultas necessários para o dashboard compartilhado, sem fechar ainda a interface final.

2. [ ] **O que fica fora da primeira entrega**
   2.1. [ ] Tela completa de administração societária dentro de `/usuarios`.
   2.2. [ ] Migração completa para `user_capabilities` como fonte principal de autorização.
   2.3. [ ] Consolidação de múltiplos papéis em toda a aplicação.
   2.4. [ ] Refinamentos avançados de UX para gestão societária.
   2.5. [ ] Regras temporais/históricas de vigência.
   2.6. [ ] Interface final do dashboard compartilhado antes da sua revisão detalhada.
   2.7. [ ] Observação: uma camada administrativa mínima de cadastro/vinculação de sócios deixou de ser “opcional”, porque ela é pré-requisito para testar o fluxo compartilhado com dados reais.

3. [x] **Fluxo operacional esperado no MVP**
   3.1. [x] Administrador configura os sócios do imóvel diretamente por mecanismo mínimo de backend/admin.
   3.2. [x] Usuário registra despesas informando quem pagou.
   3.3. [x] Backend calcula automaticamente quanto cada sócio deveria ter pago e quanto efetivamente pagou.
   3.4. [ ] Se um sócio comprar parte do outro, o administrador ajusta os percentuais atuais.
  3.5. [x] O sócio que ficou devendo registra um lançamento de equalização ao outro.

4. [ ] **Critério de sucesso da primeira entrega**
   4.1. [ ] Um imóvel compartilhado real pode ser operado sem planilha externa.
   4.2. [x] O backend retorna saldo coerente entre sócios após despesas e equalizações.
   4.3. [x] A aplicação continua operando normalmente para imóveis pessoais.
   4.4. [x] Não é necessário parar a aplicação nem migrar toda a gestão de usuários para usar o compartilhamento.
   4.5. [ ] Validar manualmente no app o fluxo de edição individual, lote, restrição de imóveis por sócio e leitura do card compartilhado.
   4.6. [ ] Conseguir cadastrar ao menos um segundo sócio, informar sua chave Pix e vinculá-lo a um imóvel piloto antes da validação final do dashboard.

### Tarefas Técnicas da Primeira Entrega
1. [x] **Banco de dados**
   1.1. [x] Criar helper/migração para garantir tabela `imovel_socios`.
   1.2. [x] Criar helper/migração para adicionar em `lancamentos`:
        - `paid_by_user_id`
        - `beneficiary_user_id`
        - `tipo_movimentacao`
        - `created_by_user_id`
   1.3. [x] Definir defaults seguros para não quebrar dados legados.
   1.4. [x] Criar backfill idempotente atribuindo imóveis atuais a `matheus.mro@gmail.com` com `100%`.
   1.5. [x] Criar backfill opcional e seguro para `paid_by_user_id` legado.

2. [x] **Backend — models**
   2.1. [x] Adicionar funções de garantia de schema em [models.py](/Users/matheusoliveira/Documents/Leiloes/Aplicacoes/Financeiro/backend/models.py).
   2.2. [x] Criar operações de leitura/gravação da composição societária por imóvel.
   2.3. [x] Adaptar inserção e atualização de lançamentos para aceitar `paid_by_user_id` e `tipo_movimentacao`.
   2.4. [x] Criar função de cálculo de posição societária por imóvel:
        - total pago por sócio;
        - valor devido por participação;
        - saldo líquido;
        - equalizações registradas.
   2.5. [x] Garantir fallback para imóvel sem configuração societária explícita.

3. [x] **Backend — rotas**
   3.1. [x] Criar endpoint mínimo administrativo para definir sócios de um imóvel.
   3.2. [x] Criar endpoint para consultar sócios ativos de um imóvel.
   3.3. [x] Criar endpoint para consultar posição financeira compartilhada do imóvel.
   3.4. [x] Adaptar rotas de lançamentos para receber novos campos sem quebrar payload antigo.
   3.5. [x] Restringir edição do quadro societário a `admin`.

4. [x] **Segurança e compatibilidade**
   4.1. [x] Manter o modelo atual de `role` funcionando durante toda a primeira entrega.
   4.2. [x] Adicionar apenas verificações mínimas para proteger acesso ao imóvel compartilhado.
   4.3. [x] Garantir que imóveis pessoais continuem funcionando sem configuração extra.

5. [ ] **Testes mínimos**
   5.1. [x] Testar migração/backfill sem duplicação de vínculos.
   5.2. [x] Testar cálculo do saldo entre sócios para imóvel com 2 participantes em smoke técnico/backend.
  5.3. [ ] Testar lançamento de equalização sem distorcer custo operacional do imóvel.
  5.4. [ ] Testar regressão de imóvel pessoal com `100%` de participação em um único usuário no app, com validação manual.
  5.5. [ ] Executar os testes operacionais recomendados no frontend e no dashboard com uso real.
  5.6. [ ] Desbloquear esses testes com UI mínima para cadastro do sócio, chave Pix e vínculo com imóvel/participação.

6. [ ] **Arquivos mais prováveis de impacto**
   6.1. [ ] [models.py](/Users/matheusoliveira/Documents/Leiloes/Aplicacoes/Financeiro/backend/models.py)
   6.2. [ ] [app.py](/Users/matheusoliveira/Documents/Leiloes/Aplicacoes/Financeiro/backend/app.py)
   6.3. [ ] [routes.py](/Users/matheusoliveira/Documents/Leiloes/Aplicacoes/Financeiro/backend/dashboard/routes.py)
   6.4. [ ] Arquivos do dashboard financeiro no frontend, apenas em etapa posterior e controlada.

### Dashboard Compartilhado — Etapa de Revisão Dedicada
1. [x] Implementar o dashboard compartilhado apenas depois de banco e backend estarem estáveis no primeiro imóvel piloto.
2. [x] Preparar uma versão inicial com:
  - composição dos sócios;
  - total pago por sócio;
  - valor devido por participação;
  - saldo líquido entre sócios;
  - equalizações registradas.
  - registro de equalização entre sócios no próprio card.
3. [x] Entregar uma primeira melhoria de apresentação do dashboard base:
  - card de dados cadastrais mais compacto e menos dominante;
  - card superior simplificado para nome do imóvel, endereço e mapa;
  - remoção de `ganho de capital` e `valor de venda` do topo do dashboard;
  - mapa sob demanda, carregado apenas quando o usuário solicitar;
   - quando não houver geolocalização, o topo não reserva área para mapa;
   - resumo visual mais contido no topo do dashboard;
   - versão mobile com cards/listas no lugar de tabelas comprimidas;
   - detalhamento do orçamento oculto por padrão no mobile;
   - CTA de equalização por saldo sugerido e modal de ação.
4. [ ] Revisar minuciosamente com o usuário:
   - leitura dos números;
   - clareza entre valores totais vs. proporcionais;
   - regra de compensação;
   - posição devedor/credor;
   - apresentação visual e fluxo operacional.
5. [ ] Só fechar a interface final do dashboard depois dessa revisão detalhada.

### Próxima Etapa Imediata — UI Mínima de Sócios e Pix
1. [x] **Objetivo da etapa**
   1.1. [x] Desbloquear o uso real do financeiro compartilhado sem esperar a versão final da tela de usuários.
   1.2. [x] Permitir cadastrar/editar usuário com dados suficientes para operação societária.
   1.3. [x] Permitir vincular usuário a imóvel com percentual de participação.
   1.4. [x] Permitir consultar rapidamente a chave Pix do sócio para equalizações e transferências.

2. [x] **Escopo mínimo recomendado**
   2.1. [x] Adicionar campo `pix_key` no cadastro de usuários.
   2.2. [x] Exibir/editar `pix_key` apenas para `admin` no primeiro momento.
   2.3. [x] Criar fluxo administrativo mínimo para vincular um ou mais usuários a um imóvel com `% de participação`.
   2.4. [x] Permitir gerenciar a composição societária atual do imóvel sem depender da interface final.
   2.5. [x] Reaproveitar os endpoints já criados de sócios por imóvel, evitando retrabalho.

3. [x] **Tarefas técnicas da etapa**
   3.1. [x] Banco/backend:
        - adicionar coluna `pix_key` em `users` com rollout aditivo e retrocompatível;
        - adaptar leitura e gravação de usuários para aceitar `pix_key`;
        - revisar serialização de usuário em login/sessão/listagem para incluir `pix_key` quando apropriado;
        - manter permissão restrita de edição para `admin`.
   3.2. [x] Frontend:
        - atualizar tela de usuários para incluir campo `chave Pix`;
        - adicionar UI mínima para administrar participações por imóvel;
        - permitir selecionar imóvel, sócio e percentual de participação;
        - mostrar composição atual do imóvel de forma simples e auditável.
   3.2.1. [x] Ajustes visuais já aplicados:
        - bloco de composição societária movido para a parte inferior da tela;
        - `pix_key` removido da grade de composição societária;
        - tipografia da página de usuários reduzida para uma densidade mais administrativa.
   3.3. [x] Compatibilidade:
        - não quebrar o fluxo atual de edição/criação de usuários;
        - manter imóveis pessoais funcionando como hoje;
        - não exigir `pix_key` para usuários legados.

4. [x] **Critério de pronto da etapa**
   4.1. [x] `admin` consegue cadastrar ou editar um usuário com chave Pix.
   4.2. [x] `admin` consegue vincular esse usuário a um imóvel com percentual definido.
   4.3. [x] o vínculo passa a refletir na seleção de `Quem pagou` e nas restrições por imóvel acessível.
   4.4. [x] a base legada continua íntegra e sem necessidade de parada.

5. [ ] **Testes que precisam ser feitos depois desta etapa**
   5.1. [ ] Cadastrar um novo usuário com chave Pix válida e confirmar persistência após salvar e recarregar.
   5.2. [ ] Editar usuário existente adicionando/alterando `pix_key` sem quebrar outros campos.
   5.3. [ ] Vincular um segundo sócio a um imóvel piloto com percentual diferente de `0%`.
   5.4. [ ] Confirmar que a soma de participações do imóvel fecha em `100%`.
   5.5. [ ] Confirmar que usuário não-admin não consegue editar quadro societário nem chave Pix de terceiros.
   5.6. [ ] Abrir o dashboard do imóvel piloto e verificar se o seletor `Quem pagou` passa a listar os sócios corretos.
   5.7. [ ] Testar edição individual de lançamento escolhendo cada sócio como pagador.
  5.8. [ ] Testar lançamento em lote exigindo `Quem pagou` e conferindo o preenchimento automático quando houver sócio único.
  5.8.1. [ ] Testar `+ Incluir transação` confirmada e validar que ela cai direto em `Transações Completas`.
  5.9. [ ] Confirmar que `Transações Incompletas` continuam filtradas pelo imóvel atual.
  5.10. [ ] Confirmar que `Transações Completas` continuam exibindo `Quem pagou`.
  5.10.1. [ ] Confirmar que equalizações não aparecem nem em `Transações Incompletas` nem em `Transações Completas`.
  5.11. [ ] Validar um imóvel pessoal legado para garantir que nada regrediu no cenário `100%` individual.
  5.12. [ ] Revisar o card técnico de financeiro compartilhado com dados reais antes de qualquer refinamento visual final.
  5.13. [ ] Confirmar que usuário sócio não consegue abrir imóvel indevido trocando o `id` pela URL.
  5.14. [ ] Confirmar que o modal `Trocar imóvel` lista apenas imóveis acessíveis ao sócio.
  5.15. [ ] Confirmar que a Home financeira do sócio não mostra métricas e gráficos globais da carteira inteira.
  5.16. [ ] Confirmar que a tabela de equalizações exibe data em `dd/mm/aaaa`, além de `Quem pagou` e `Quem recebeu`.
  5.17. [ ] Validar a navegação mobile do `Controle financeiro`:
       - com 1 imóvel acessível, deve abrir direto o dashboard;
       - com mais de 1 imóvel, deve abrir a entrada do Financeiro sem retornar para `Prospecções`.
  5.18. [ ] Validar o CTA de equalização:
       - botão só aparece quando houver saldo a pagar;
       - botão mostra o valor sugerido;
       - modal abre com recebedor e valor coerentes.
  5.19. [ ] Validar a leitura mobile do orçamento:
       - detalhamento não aparece aberto por padrão;
       - ação de `Detalhar orçamento` funciona;
       - leitura em cards/listas ficou adequada em tela pequena.
  5.20. [ ] Validar imóveis sem geolocalização:
       - o topo do dashboard não reserva espaço para mapa;
       - a leitura do nome/endereço aproveita melhor a largura disponível.

12. [ ] **Planejar controle financeiro compartilhado entre sócios**
   12.1. [ ] **Modelagem de participação por imóvel**
        - criar estrutura para vincular um ou mais sócios a cada imóvel do financeiro;
        - registrar percentual de participação de cada sócio no imóvel;
        - permitir que o mesmo sócio participe de imóveis diferentes com percentuais distintos em cada vínculo;
        - permitir imóveis 100% pessoais (um único sócio com 100%) e imóveis compartilhados;
        - permitir ajuste administrativo de participação quando um sócio comprar a parte de outro;
        - permitir entrada de novo sócio e saída de sócio atual, inclusive com participação indo para `0%`;
        - manter a configuração atual simples, sem controle de vigência nesta primeira fase.
   12.2. [ ] **Papéis e identidade operacional**
        - evoluir o modelo atual de `role` único para papéis acumuláveis/capacidades;
        - permitir que um mesmo usuário seja simultaneamente `prospector` e `socio`;
        - manter `admin` com visão e atuação total sobre todos os módulos;
        - concentrar a gestão de capacidade `socio` e o vínculo societário na tela de usuários;
        - revisar autenticação/sessão para expor a lista de papéis/capacidades do usuário, e não apenas um `role` único;
        - incluir no cadastro do usuário um campo de chave Pix para facilitar transferências e equalizações entre sócios;
        - tratar a liberação por vínculo societário ativo como regra transitória, não como modelo final de permissão.
   12.3. [ ] **Lançamentos financeiros com autoria pagadora**
        - permitir que cada lançamento do financeiro registre quem efetivamente pagou (`paid_by_user_id`);
        - ao lançar uma despesa, permitir selecionar explicitamente qual sócio realizou o pagamento;
        - aceitar pagamentos feitos por qualquer sócio participante do imóvel;
        - preservar compatibilidade com lançamentos antigos, assumindo autor/operador padrão quando essa informação não existir.
   12.3.1. [ ] **Migração inicial da base atual**
        - atribuir todos os imóveis já existentes do controle financeiro ao usuário `matheus.mro@gmail.com`;
        - definir participação inicial de `100%` para esse usuário em todos os imóveis atuais;
        - preencher `paid_by_user_id` legado com esse mesmo usuário quando não houver outra origem confiável do pagador;
        - documentar essa premissa como regra de transição da base histórica.
   12.4. [ ] **Rateio e saldo entre sócios**
        - calcular, por imóvel e no consolidado, quanto cada sócio deveria ter arcado com base na sua participação;
        - comparar valor devido vs. valor efetivamente pago por cada sócio;
        - gerar saldo líquido entre sócios (quem deve para quem) para equalização das contas;
        - recalcular automaticamente o saldo de compensação quando o administrador alterar o quadro societário do imóvel;
        - recalcular automaticamente o saldo quando houver entrada ou saída de sócio na composição atual;
        - suportar cenários com 2 ou mais sócios no mesmo imóvel.
   12.5. [ ] **Transferências de equalização entre sócios**
        - criar tipo de lançamento específico para acerto entre sócios, separado de despesas operacionais do imóvel;
        - permitir registrar pagamento de um sócio para outro para abatimento de saldo;
        - manter trilha auditável de origem do saldo, acertos realizados e saldo remanescente.
   12.6. [ ] **Visões e UX do financeiro compartilhado**
        - criar visão por imóvel mostrando participação, total pago por sócio, valor devido, saldo e acertos;
        - criar visão consolidada por sócio com posição geral em aberto/receber;
        - deixar claro na UI quando um lançamento é despesa do imóvel vs. transferência de equalização;
        - preservar a experiência atual dos imóveis pessoais sem poluir a rotina para casos sem sociedade.
   12.6.1. [ ] **Dashboard do imóvel com chave de visão**
        - adicionar no dashboard do imóvel uma chave para alternar entre `Visão total do imóvel` e `Minha participação`;
        - na visão total, manter os números integrais atuais do imóvel;
        - na visão de participação, exibir despesas, orçamento, lucro projetado, totais e demais indicadores proporcionalmente ao percentual do sócio logado;
        - deixar explícito na interface qual visão está ativa para evitar interpretação errada dos valores.
   12.7. [ ] **Permissões**
        - `admin` vê e edita tudo;
        - apenas `admin` pode cadastrar sócios, vincular sócios a imóveis e definir/alterar percentuais de participação;
        - apenas `admin` pode registrar alteração societária por compra de participação entre sócios;
        - apenas `admin` pode registrar entrada de novo sócio ou saída de sócio da composição do imóvel;
        - `socio` vê apenas imóveis em que participa e os respectivos lançamentos/saldos;
        - `prospector` não ganha acesso ao financeiro por ser prospector; o acesso financeiro depende da capacidade de `socio`, `editor` ou `admin`;
        - revisar regras atuais de frontend e backend que hoje assumem um único `role`;
        - durante a transição, um `prospector` com vínculo ativo em `imovel_socios` pode receber acesso financeiro para não bloquear a operação, mas essa exceção deve ser removida quando a capacidade explícita `socio` entrar em produção.
   12.8. [ ] **Critérios de aceite iniciais**
        - um imóvel pode ter um ou mais sócios com percentuais definidos;
        - o mesmo sócio pode aparecer em vários imóveis com percentuais diferentes;
        - o cadastro de sócios e a atribuição de participação por imóvel são feitos na tela de usuários;
        - apenas `admin` consegue alterar quadro societário e percentuais;
        - quando um sócio comprar a participação de outro, o administrador consegue ajustar os percentuais atuais de forma simples;
        - após a alteração societária, o saldo de compensação do imóvel é recalculado automaticamente;
        - o administrador consegue incluir um novo sócio no imóvel e remover outro da composição atual;
        - quando um sócio sair, sua participação pode ser ajustada para `0%`;
        - o sócio que comprou a parte do outro pode registrar um pagamento de equalização ao outro usuário;
        - ao registrar despesa, o usuário consegue informar qual sócio pagou;
        - lançamentos registram quem pagou;
        - o sistema calcula automaticamente o saldo entre sócios conforme a participação;
        - transferências de acerto reduzem o saldo pendente sem distorcer o custo do imóvel;
        - imóveis legados aparecem inicialmente atribuídos a `matheus.mro@gmail.com` com participação de `100%`;
        - o dashboard do imóvel permite alternar entre visão total e visão proporcional do sócio logado;
        - na visão proporcional, despesas, orçamento e lucro projetado respeitam a participação do usuário;
        - o mesmo usuário pode atuar em Prospecções e no Financeiro compartilhado sem conflito de permissão;
        - `admin` mantém visão integral da operação.

## Priorização Atual
- Prioridade imediata: validar em uso real o primeiro imóvel compartilhado já suportado por backend, permissões e UI mínima de sócios/Pix.
- Primeira entrega de maior valor agora: revisar o fluxo compartilhado ponta a ponta com o imóvel piloto e consolidar a leitura do dashboard.
- Equalização entre sócios já está implementada na primeira versão; o próximo bloco agora é validar o uso real e refinar a experiência.
- Em paralelo, a navegação mobile do Financeiro e a nova apresentação mobile do dashboard já receberam correção estrutural e precisam de validação operacional.
- Prospecções continua importante, mas passa a ser frente secundária até o primeiro imóvel compartilhado estar operacional ponta a ponta.
- Em paralelo, manter apenas validação operacional mínima do garimpo/Supabase para não acumular risco silencioso.

## Próximos Passos Objetivos
1. [ ] **Agora — Validar o fluxo compartilhado no imóvel piloto**
  - cadastrar ao menos um segundo sócio real;
  - vincular esse sócio ao imóvel com participação definida;
  - confirmar que o usuário consegue acessar o Financeiro via regra transitória de vínculo ativo;
  - testar seleção de `Quem pagou` em edição individual e em lote;
  - testar registro de equalização e confirmar o reflexo correto no saldo;
  - conferir restrição de imóveis acessíveis, Home financeira e leitura do card técnico compartilhado.

2. [ ] **Agora — Revisar o dashboard compartilhado com profundidade**
  - revisar leitura dos números;
  - confirmar clareza entre valores totais vs. proporcionais;
  - avaliar regra de compensação e posição devedor/credor;
  - validar a tabela de equalizações com data brasileira, pagador e recebedor;
  - validar o CTA de equalização com saldo sugerido;
  - validar o novo fluxo de `+ Incluir transação`;
  - validar a primeira melhoria visual do card superior simplificado, do mapa sob demanda e do estado sem geolocalização;
  - só então desenhar a interface final do dashboard compartilhado.

3. [ ] **Agora — Validar a navegação mobile do Financeiro**
  - confirmar abertura correta do `Controle financeiro` pelo celular;
  - verificar contador com base nos imóveis realmente acessíveis;
  - confirmar abertura direta do dashboard quando houver um único imóvel;
  - revisar se a entrada `/financeiro` faz sentido também para cenários com múltiplos imóveis;
  - validar a nova leitura mobile de orçamento, compartilhamento e transações.

4. [ ] **Agora — Melhorar desempenho percebido e operacional**
  - medir o ganho real da rodada já aplicada:
     cache curto de imóveis acessíveis,
     carregamento progressivo das seções pesadas
     e remoção de chamada redundante no resumo financeiro;
   - consolidar novas requisições repetidas do dashboard por imóvel;
   - revisar carregamento da Home financeira e dos cards mais pesados;
   - definir uma linha de base simples de tempo de carregamento para comparar otimizações;
   - seguir removendo chamadas redundantes e componentes caros no carregamento inicial.

5. [ ] **Depois — Fechar identidade e permissões do modelo compartilhado**
   - definir a estratégia de múltiplos papéis por usuário (`prospector`, `socio`, `admin` etc.);
   - mapear quais permissões mudam no backend e no frontend que hoje assumem `role` único;
   - garantir que um mesmo usuário possa atuar simultaneamente como prospector e sócio;
   - confirmar que `admin` mantém visão integral e capacidade total de operação.

6. [ ] **Depois — Retomar frentes operacionais já abertas**
   - Fechar inclusão manual de imóveis na fila de selecionados.
   - Concluir acabamentos finos de UX ainda pendentes em Prospecções.
   - Consolidar a experiência já entregue de mobile e ficha de viabilidade, corrigindo apenas arestas finais.

7. [ ] **Depois — Validar operação, testes e documentação**
   - Validar amostra real no painel do Supabase.
   - Validar execução local do garimpo com `.env`.
   - Fechar telemetria mínima de bloqueio `403` no garimpo antes da próxima carga grande.
   - Implementar testes backend/frontend das rotas e fluxos prioritários.
   - Atualizar README/docs com a nova matriz de permissões e o desenho operacional do financeiro compartilhado.

## Plataforma, Segurança e Operação

### Domínio, Hospedagem e Performance
1. [ ] **Planejar publicação pública do projeto com domínio próprio**
   1.1. [ ] Avaliar compra de domínio para publicação oficial do sistema.
   1.2. [ ] Definir estratégia de DNS, subdomínios e ambiente inicial de produção/homologação.
   1.3. [ ] Registrar critérios para escolha do nome público do projeto e impactos em autenticação, links e documentação.

2. [ ] **Avaliar opções de hospedagem**
   2.1. [ ] Comparar publicação no Hostinger (plano já pago) vs. manutenção/migração para Render.
   2.2. [ ] Comparar custo marginal, simplicidade operacional, suporte a backend Flask, frontend SPA e variáveis de ambiente.
   2.3. [ ] Validar suporte a rotas SPA, SSL, deploy contínuo, logs, restart de serviços e facilidade de rollback.
   2.4. [ ] Mapear esforço para mover frontend e backend juntos ou separar serviços por responsabilidade.

3. [ ] **Melhorar desempenho percebido e operacional**
   3.1. [~] Levantar gargalos atuais de inicialização, carregamento do frontend e latência da API.
        - [x] Identificado no dashboard: excesso de requisições simultâneas no mount, seções pesadas carregadas cedo demais e repetição de busca dos imóveis acessíveis.
        - [x] Identificado no frontend: bundle principal ainda grande no build (`index` acima do limite de warning do Vite).
        - [ ] Mapear com mais precisão os gargalos restantes da Home e dos gráficos/modais mais pesados.
   3.2. [ ] Identificar ganhos esperados com mudança de hospedagem vs. otimizações no próprio código/configuração.
   3.3. [ ] Definir baseline simples de performance para comparar Hostinger, Render e ambiente atual.
   3.4. [x] Primeira rodada de otimização já aplicada:
        - mapa do dashboard sob demanda;
        - card superior reduzido para melhorar a experiência e diminuir peso visual;
        - carregamento progressivo de seções pesadas do dashboard;
        - cache curto de imóveis acessíveis no frontend;
        - remoção de chamada redundante no resumo financeiro.

4. [ ] **Critérios de aceite**
   4.1. [ ] Existe decisão documentada de domínio e provedor principal de hospedagem.
   4.2. [ ] Existe plano de publicação com frontend, backend, variáveis de ambiente e fallback SPA.
   4.3. [ ] Existe comparação objetiva de custo, operação e desempenho entre Hostinger e Render.

### Segurança Operacional
1. [x] Rotacionar chaves do Supabase após exposição acidental em arquivo `.env`.
2. [x] Garantir que arquivos `.env` locais (`backend/.env`, `frontend/.env`, `garimpo/.env` e raiz) não sejam mais versionados.

### Supabase — Security Advisor
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

### Garimpo — Segredos Locais (somente máquina)
1. [x] **Padronizar configuração local sem versionamento**
   1.1. [x] Manter apenas `garimpo/.env.example` no Git (sem valores reais).
   1.2. [x] Garantir `garimpo/.env` no `.gitignore` e fora do índice Git.
   1.3. [x] Definir carregamento prioritário de variáveis locais (`garimpo/.env`) para execução dos scripts.

2. [ ] **Execução segura do garimpo na máquina local**
   2.1. [x] Atualizar `garimpo/start.sh` para validar variáveis obrigatórias antes de iniciar (`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`).
   2.2. [x] Exibir mensagem clara quando variável obrigatória estiver ausente, sem imprimir segredo em log.
   2.3. [ ] Validar fluxo `principal.py` e `extrajudicial_caixa.py` com `.env` local.
   2.4. [ ] Ajustar execução para cenário de bloqueio da CAIXA:
        - rodar por lotes menores/UF;
        - introduzir espera entre requests;
        - registrar e encerrar cedo quando detectar sequência anormal de `403`.
   2.5. [ ] Validar estratégia de sessão com navegador real/headless quando a borda exigir challenge.

3. [ ] **Prevenção de vazamento em commits**
   3.1. [x] Adicionar pre-commit simples para bloquear inclusão de arquivos `.env` reais.
   3.2. [x] Adicionar varredura rápida por padrões de chave (`sb_secret_`, `SUPABASE_SERVICE_KEY=`) antes de commit.
   3.3. [ ] Documentar runbook de resposta (rotacionar chave + remoção do índice) em caso de incidente.

4. [ ] **Critério de aceite**
   4.1. [ ] Garimpo funciona localmente com `.env` privado.
   4.2. [ ] Nenhum arquivo de segredo aparece em `git status`/`git add .`.
   4.3. [ ] Repositório mantém apenas exemplos sanitizados.
