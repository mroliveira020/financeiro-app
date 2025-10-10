# Repository Guidelines

## Estrutura do Projeto e Organização de Módulos
- `backend/app.py` expõe a API Flask; novas rotas entram como blueprints em `backend/dashboard/`.
- Persistência, queries e feature flags centralizam-se em `backend/models.py` e `backend/config.py`.
- O SPA em React fica em `frontend/`; mantenha páginas, componentes, hooks e serviços em `frontend/src/` e testes em `frontend/src/__tests__/`.
- Scripts de garimpo vivem em `garimpo/src/`, lendo planilhas de `garimpo/data/input/` e escrevendo saídas em `garimpo/data/output/`.
- Documente alterações contratuais, configs e runbooks em `docs/`.

## Comandos de Build, Testes e Desenvolvimento
- `bash dev.sh`: sobe API (5000) e Vite (5173) para desenvolvimento full-stack.
- `bash backend/start.sh`: executa apenas a API para smoke checks rápidos.
- `npm run dev --prefix frontend -- --host`: expõe o front na rede local para QA compartilhado.
- `npm run build --prefix frontend`: gera o bundle de produção; execute antes de releases.
- `npm run lint --prefix frontend`: lint obrigatório antes de merge.

## Estilo de Código e Convenções de Nomes
- Backend segue PEP 8 (4 espaços) e concentra SQL/ORM em `backend/models.py`.
- Frontend respeita `frontend/eslint.config.js`: componentes em PascalCase, hooks prefixados com `use`, utilitários camelCase em `frontend/src/utils/`.
- Estilize com Tailwind ou CSS modules escopados; reflita novas variáveis em `.env.example`.

## Diretrizes de Testes
- `pytest` cobre o backend; novos testes em `backend/tests/test_<feature>.py`, sempre mockando integrações externas.
- `npm run test --prefix frontend` (Vitest) garante cobertura da UI; mantenha specs próximas aos componentes.
- Garimpo: compare saídas com `garimpo/data/output/saida_teste.xlsx` e registre anomalias em `garimpo/data/output/erros_*.csv`.

## Commits e Pull Requests
- Commits curtos em português (ex.: `Melhoria na lista de transacoes`) e referencie o card.
- Rebase com `main`, valide ESLint e smoke das APIs, anexe screenshots e notas contratuais quando alterarem o front.

## Segurança, Configuração e Comunicação
- Carregue segredos via `python-dotenv` (`APP_ENV`, `JWT_SECRET`, `NOTION_API_KEY`); nunca versionar valores reais.
- Sincronize alterações de feature flags entre ambientes e documente-as em `docs/`.
- Toda comunicação assíncrona (issues, PRs, documentação) deve ser em português claro e direto; traduza mensagens de erro antes de expô-las aos usuários.
