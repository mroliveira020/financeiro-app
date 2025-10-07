# Repository Guidelines

## Project Structure & Module Organization
APIs vivem em `backend/app.py` com blueprints em `backend/dashboard/`. Persistência centraliza em `backend/models.py`; configurações globais e feature flags ficam em `backend/config.py`. A SPA React está em `frontend/` (páginas, componentes, serviços e hooks dentro de `src/`). Scripts de garimpo moram em `garimpo/src/`, com planilhas de entrada em `garimpo/data/input/` e saídas em `garimpo/data/output/`. Documentação complementar reside em `docs/` e deve acompanhar mudanças de contrato ou configuração.

## Build, Test, and Development Commands
Use `bash dev.sh` para subir API na porta 5000 e Vite em 5173. Rode apenas a API com `bash backend/start.sh`. Para o frontend, use `npm run dev --prefix frontend -- --host` quando precisar expor a rede local, `npm run build --prefix frontend` para gerar a SPA e `npm run lint --prefix frontend` para o ESLint obrigatório. O fluxo de garimpo inicia com `source backend/venv/bin/activate && python garimpo/src/principal.py`.

## Coding Style & Naming Conventions
Backend segue PEP 8 com indentação de 4 espaços e nomes snake_case; concentre queries SQL em `backend/models.py`. No frontend, respeite `frontend/eslint.config.js`: componentes em PascalCase, hooks com prefixo `use`, helpers camelCase em `src/utils/`, estilos preferencialmente via Tailwind e CSS adicional apenas em `src/index.css` ou escopos locais. Atualize `.env.example` ao introduzir variáveis obrigatórias.

## Testing Guidelines
Execute `pytest` sob `backend/tests/test_<feature>.py`, isolando integrações externas com mocks. No frontend, mantenha testes Vitest em `frontend/src/__tests__/` espelhando os componentes. Para garimpo, valide manualmente contra `garimpo/data/output/saida_teste.xlsx` e registre falhas em `garimpo/data/output/erros_*.csv`.

## Commit & Pull Request Guidelines
Commits devem ser curtos, em português (ex.: `Melhoria na lista de transacoes`), focados em uma mudança e citando o card correspondente. Antes de abrir PR, faça rebase com `main`, confirme ESLint e smoke tests da API. PRs precisam de resumo objetivo, prints para ajustes de UI, notas sobre alterações de contrato de API e evidências dos testes executados.

## Security & Configuration Tips
Carregue segredos com `python-dotenv`, usando chaves como `APP_ENV`, `EDITOR_TOKEN` e `NOTION_API_KEY`. Não versione valores reais. Documente qualquer alteração em feature flags (`ENABLE_SEARCH_API`, `ENABLE_GPT_WRITE`, limites) em `docs/` e replique configurações no Render.
