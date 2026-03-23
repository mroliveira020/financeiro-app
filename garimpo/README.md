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
   - Para usar o bootstrap de sessão da CAIXA via navegador, instale também o browser do Playwright:
     - `backend/venv/bin/playwright install chromium`
3. Copie `garimpo/config.yaml.example` para `garimpo/config.yaml` e ajuste UFs, nomes de arquivos e, se necessário, parâmetros em `http` (`timeout`, `headers`, `cookies`, `cookies_file`, `rate_limit_seconds`, `session_rotate_every`, `retry`, `browser_fallback`).
4. Entrada da base:
   - Planilha única (`data.input`): modo `excel`.
   - CSVs por UF (ex.: `data/input/Lista_imoveis_PR.csv`): modo `csv` ou `auto` (pergunta se os arquivos estiverem presentes).
5. Segredos locais:
   - Copie `garimpo/.env.example` para `garimpo/.env`.
   - Preencha no `garimpo/.env`:
     - `SUPABASE_URL`
     - `SUPABASE_ANON_KEY`
     - `SUPABASE_SERVICE_KEY`
   - O arquivo `garimpo/.env` fica apenas na sua máquina e não deve ir para o Git.

## Scripts Principais
- `python garimpo/src/principal.py`
  - Filtra a planilha `base.xlsx` e permite selecionar interativamente as UFs, modalidades (`Tipo de Venda`) e o intervalo de registros desejados para coleta.
  - Pergunta quantas horas de dados recentes do Supabase devem ser ignoradas (pula códigos já coletados nesse intervalo) e permite definir o tamanho do lote para envio ao Supabase (`chunk_size`, via `config.yaml` ou prompt; use `0` para enviar apenas ao final).
  - A saída agora é somente no Supabase (tabela `imoveis_prospeccao`); não é mais gerado Excel ou ZIP.
- `python garimpo/src/extrajudicial_caixa.py`
  - Consulta imóveis de venda direta da CAIXA, aplicando os tipos definidos em `config.yaml`.
  - Pergunta quantas horas de dados recentes do Supabase devem ser ignoradas e envia os registros diretamente para `imoveis_prospeccao`, em lotes.
- `python garimpo/src/bootstrap_caixa_session.py`
  - Abre a CAIXA em um navegador controlado pelo Playwright para permitir resolução manual do challenge/hCaptcha.
  - Exporta os cookies da sessão para `data/session/caixa_cookies.json`, que podem ser reaproveitados automaticamente pelo bloco `http.cookies_file` do `config.yaml`.

- Inicialização rápida do ambiente:
  - `bash garimpo/init_garimpo.sh` cria/usa `backend/venv`, instala dependências (backend + garimpo) e copia `config.yaml.example` para `config.yaml` se ainda não existir. Depois, rode `bash garimpo/start.sh principal`, `extrajudicial_caixa` ou `bootstrap_caixa_session`.

Os scripts usam configurações compartilhadas em `src/config.py`. Ajustes de timeout, headers, cookies, `cookies_file`, rate limit, rotação de sessão, retries e fallback via navegador (`browser_fallback`) podem ser adicionados a `config.yaml` conforme necessário. Com `supabase.enabled=false` não há mais persistência (execução será abortada).
O `bash garimpo/start.sh ...` carrega automaticamente o `garimpo/.env` e valida `SUPABASE_URL`/`SUPABASE_SERVICE_KEY` quando `supabase.enabled=true`.

## Integração com Supabase
- Preencha `supabase` em `config.yaml` (ou via `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_ANON_KEY`). O envio só é tentado se `enabled: true` e `url`/chave de serviço estiverem configurados; caso contrário, o script aborta para evitar perda de dados.
- Campos suportados: `enabled`, `url`, `anon_key`, `service_role_key`, `chunk_size`, `timeout`, `retry` (attempts/backoff_seconds) e `error_log`.
- Os scripts enviam registros para `imoveis_prospeccao` via REST, respeitando o `chunk_size` (envio incremental ou único lote ao final) e registrando falhas em `data/output/erros_supabase.csv`.

## Integração com o Financeiro
- Os arquivos produzidos servem como insumo para análise e priorização de prospecções.
- Não existe importação automática no backend; após revisão, faça cadastros manualmente pelas telas ou rotinas internas.

## Boas Práticas
- Rode os scripts utilizando cópias das planilhas originais (`data/input/`) e versiona somente modelos vazios ou amostras reduzidas.
- Antes de enviar PR, mova resultados sensíveis para fora do repositório ou limpe `data/output/`.
- Documente no PR o filtro utilizado (UFs, tipos de venda) e anexe registros de amostra.
- Em caso de falhas, verifique os arquivos `data/output/erros_<script>_<data>.csv`; eles listam códigos de imóveis e motivos do erro.
- Os CSVs de erro agora incluem telemetria básica de bloqueio HTTP, como `Status HTTP`, `Request ID Azion`, `Edge Location`, `Tentativas`, `URL Final` e `Trecho Resposta`.
- Quando `http.browser_fallback.enabled=true`, o coletor tenta abrir a URL pelo Playwright após esgotar as tentativas via `requests`. Isso é útil para diagnóstico e para cenários em que a borda só libera conteúdo em navegador.
- Para rodadas de teste, aponte `GARIMPO_CONFIG` para um YAML alternativo (ex.: uma planilha reduzida) sem alterar `config.yaml` do repositório.
- Instale o hook de proteção de segredos antes de commitar:
  - `bash scripts/install-git-hooks.sh`
  - O hook bloqueia commits com `.env` real e padrões como `sb_secret_`.
