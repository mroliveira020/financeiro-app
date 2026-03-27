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

## Próximos Passos Objetivos
1. [x] **Fechar atribuição de responsáveis**
   - Modelar `imoveis_selecionados_responsaveis`.
   - Criar rotas para atribuir/remover prospectores por imóvel.
   - Exibir responsáveis na lista de selecionados e liberar edição operacional para atribuídos.

2. [ ] **Fechar inclusão manual de imóveis**
   - Decisão atual: adiar para depois dos acabamentos de UX.
   - Permitir criação de selecionado sem dependência de `vw_imoveis_prospeccao_latest`.
   - Criar fluxo frontend com campos mínimos operacionais.
   - Identificar claramente origem manual vs. capturada.

3. [ ] **Concluir acabamentos de UX já parcialmente prontos**
   - Foco atual da aplicação.
   - Revisar se o tooltip de observação atual está suficiente ou se precisa componente visual dedicado.
   - Refinar somente os pontos finos ainda abertos na página principal.
   - Avaliar se a aba `Base completa` ainda pede mais acabamento visual em relação à aba de selecionados.
   - Decidir se o tooltip de observação atual será mantido como solução final ou trocado por componente visual dedicado.
   - [x] Incluir versão mobile com menu inicial em cards para `Controle financeiro` e `Selecionados para prospecção`.
   - [x] Definir a regra técnica de entrada mobile usando viewport responsiva + sinais de dispositivo.
   - [x] Implementar a experiência mobile de `Selecionados` com foco em consulta rápida, notas e viabilidade.
   - [x] Corrigir a entrada mobile para abrir `Prospecções` em vez da home financeira no celular.
   - [x] Reorganizar a ficha de viabilidade para refletir capital investido, despesas do período, despesas pós-venda, lucro líquido esperado e ROI.

4. [ ] **Validar operação e qualidade**
   - Decisão atual: adiar para depois da rodada de UX e da inclusão manual.
   - Validar amostra real no painel do Supabase.
   - Validar execução local do garimpo com `.env`.
   - Fechar telemetria mínima de bloqueio `403` no garimpo antes da próxima carga grande.
   - Implementar testes backend/frontend das rotas e fluxos de Prospecções.

5. [ ] **Fechar documentação operacional**
   - Decisão atual: adiar para depois das entregas funcionais prioritárias.
   - Atualizar README/docs com matriz de permissões, autoria, responsáveis, inclusão manual e fluxo de observações/análise.
   - Registrar runbook de incidente para segredos e rotação de chave.
   - Documentar runbook do garimpo quando a CAIXA ativar challenge/hCaptcha na borda.

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
