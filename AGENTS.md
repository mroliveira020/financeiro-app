# Repository Guidelines

This guide keeps contributors aligned with this codebase’s structure, tooling, and review expectations. Skim it before opening pull requests and update it whenever you introduce new workflows or dependencies.

## Project Structure & Module Organization
- `backend/app.py` exposes the Flask API; register new routes via blueprints under `backend/dashboard/`.
- Persistence and queries live in `backend/models.py`; keep feature flags and settings centralized in `backend/config.py`.
- The React SPA resides in `frontend/`. Place pages, components, hooks, and services under `frontend/src/`, and mirror tests in `frontend/src/__tests__/`.
- Data-mining scripts live in `garimpo/src/`, consuming spreadsheets from `garimpo/data/input/` and writing results to `garimpo/data/output/`.
- Update documentation under `docs/` whenever you change contracts, configs, or operational runbooks.

## Build, Test, and Development Commands
- `bash dev.sh` starts the API on port 5000 and Vite on 5173 for full-stack development.
- `bash backend/start.sh` launches only the backend API for quick smoke checks.
- `npm run dev --prefix frontend -- --host` exposes the frontend to your LAN for shared QA.
- `npm run build --prefix frontend` creates the production bundle; `npm run lint --prefix frontend` must pass before merging.
- Activate the Python venv and run `python garimpo/src/principal.py` to execute the garimpo flow.

## Coding Style & Naming Conventions
- Backend follows PEP 8: 4-space indentation, snake_case, SQL logic consolidated in `backend/models.py`.
- Frontend obeys `frontend/eslint.config.js`: components in PascalCase, hooks prefixed with `use`, helpers in camelCase under `src/utils/`, and styling via Tailwind or scoped CSS modules.
- Reflect any new required env vars in `.env.example`.

## Testing Guidelines
- Run `pytest` for backend coverage; place new tests in `backend/tests/test_<feature>.py`, mocking external integrations.
- Use `npm run test --prefix frontend` (Vitest) and keep specs alongside their components in `frontend/src/__tests__/`.
- Validate garimpo outputs against `garimpo/data/output/saida_teste.xlsx`; log anomalies to `garimpo/data/output/erros_*.csv`.

## Commit & Pull Request Guidelines
- Write concise commits in Portuguese (e.g., `Melhoria na lista de transacoes`) scoped to a single change and referencing the relevant card.
- Rebase with `main`, ensure ESLint and API smoke tests pass, and attach UI screenshots plus contract change notes when applicable.
- Document new feature flags or limits in `docs/` and replicate Render configuration before requesting review.

## Security & Configuration Tips
- Load secrets via `python-dotenv` using keys like `APP_ENV`, `JWT_SECRET`, and `NOTION_API_KEY`; never commit real values.
- Keep feature-flag changes synchronized across environments and capture them in change logs for ops visibility.
