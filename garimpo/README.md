# Garimpo de Imóveis

Subprojeto responsável por prospectar novos imóveis em leilão e gerar planilhas consolidadas para ingestão no Financeiro.

## Estrutura
- `src/`: scripts Python de coleta e parsing (`principal.py`, `extrajudicial_caixa.py`, `localiza_informacoes.py`).
- `data/input/`: planilhas de origem (ex.: `base.xlsx`). Use cópias anonimizadas quando possível.
- `data/output/`: resultados gerados automaticamente (`saida_<UF>.xlsx`, `output.xlsx`, etc.).
- `config.yaml`: configurações operacionais (copie de `config.yaml.example`).
- `requirements.txt`: dependências específicas do garimpo.

## Pré-requisitos
1. Ative o ambiente virtual do backend: `source backend/venv/bin/activate`.
2. Instale dependências adicionais: `pip install -r garimpo/requirements.txt`.
3. Copie `garimpo/config.yaml.example` para `garimpo/config.yaml` e ajuste UFs, nomes de arquivos e, se necessário, parâmetros em `http` (timeout, headers, cookies).

## Scripts Principais
- `python garimpo/src/principal.py`
  - Filtra a planilha `base.xlsx` e permite selecionar interativamente as UFs, modalidades (`Tipo de Venda`) e o intervalo de registros desejados para coleta.
  - Gera um único arquivo `output.xlsx` em `data/output/`, compacta automaticamente (`output.xlsx.zip`) e pergunta se deve reiniciar a coleta (renomeando o arquivo atual para `YYYYMMDD HHMM output.xlsx`) ou continuar apenas com imóveis novos.
  - Permite definir um tamanho de lote (`chunk_size`) para salvar o arquivo a cada *N* registros (via `config.yaml` ou prompt em tempo de execução; use `0` para salvar apenas ao final).
  - Ao finalizar, pode abrir o cliente de e-mail padrão com destinatário, assunto e corpo pré-preenchidos, facilitando o envio do arquivo zipado.
- `python garimpo/src/extrajudicial_caixa.py`
  - Consulta imóveis de venda direta da CAIXA, aplicando os tipos definidos em `config.yaml`.
  - Gera planilhas `output.xlsx` (todos) e `output_financiado.xlsx` (financiáveis) no diretório de saída.

Os scripts usam configurações compartilhadas em `src/config.py`. Ajustes de timeout, headers ou cookies podem ser adicionados a `config.yaml` conforme necessário.

## Integração com o Financeiro
- Os arquivos produzidos servem como insumo para análise e priorização de prospecções.
- Não existe importação automática no backend; após revisão, faça cadastros manualmente pelas telas ou rotinas internas.

## Boas Práticas
- Rode os scripts utilizando cópias das planilhas originais (`data/input/`) e versiona somente modelos vazios ou amostras reduzidas.
- Antes de enviar PR, mova resultados sensíveis para fora do repositório ou limpe `data/output/`.
- Documente no PR o filtro utilizado (UFs, tipos de venda) e anexe registros de amostra.
- Em caso de falhas, verifique os arquivos `data/output/erros_<script>_<data>.csv`; eles listam códigos de imóveis e motivos do erro.
- Para rodadas de teste, aponte `GARIMPO_CONFIG` para um YAML alternativo (ex.: uma planilha reduzida) sem alterar `config.yaml` do repositório.
