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
