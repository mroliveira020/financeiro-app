# Financeiro

Repositório do sistema financeiro para gestão de imóveis. Para visão geral de arquitetura, requisitos e fluxos de trabalho, consulte `docs/README.md`.

## Onboarding rápido
- Leia `AGENTS.md` para diretrizes de estrutura, comandos essenciais, padrões de código e permissões do agente padrão.
- Use `bash dev.sh` para iniciar backend (Flask) em `:5000` e frontend (Vite) em `:5173` durante o desenvolvimento.
- Garanta que as variáveis de ambiente listadas em `.env.example` estejam configuradas antes de iniciar os serviços.
- Crie ao menos um usuário administrador com `python backend/create_user.py --email admin@empresa.com --role admin` (solicita a senha via prompt).

## Recursos úteis
- Documentação detalhada: `docs/README.md`
- Guia para scripts de garimpo: `garimpo/README.md`
- Referência do frontend: `frontend/README.md`
- Nova rota no front: `/prospeccoes` (tabela de selecionados/capturados; hoje com dados mockados aguardando ligação ao Supabase).
- Garimpo agora envia diretamente ao Supabase (`imoveis_prospeccao`) com filtros por janela de horas e chunk de envio; não gera mais planilhas locais.

## Backup do Supabase
- Script local: `backend/venv/bin/python scripts/backup_supabase.py`
- Saída padrão: `.local_backups/supabase/`
- Formato padronizado do arquivo compactado: `YYYYMMDD HHMM Backup Supabase.zip`
- Conteúdo:
  - `schema_objects.txt` com criação de tabelas, constraints, índices, policies RLS, funções, views, materialized views, triggers, sequences e extensões do schema `public`
  - `manifest.txt` com a lista das tabelas exportadas
  - um arquivo `.txt` por tabela dentro de `tabelas/`, em CSV com cabeçalho
- Os backups ficam somente na máquina local e a pasta `.local_backups/` está ignorada no Git.
