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
