# Plano de Ação — Sistema Financeiro Pessoal (com status)

1. Alinhamento inicial
1.1 [x] Consolidar objetivos, escopo e premissas no `readme_pessoal.md`.
1.2 [x] Registrar perfis de uso (individual, casal, compartilhado) e necessidades prioritárias no `readme_pessoal.md`.
1.3 [x] Definir metas por fase com critérios de sucesso e atualizar o `readme_pessoal.md`.

2. Governança de requisitos
2.1 [x] Documentar requisitos funcionais no `readme_pessoal.md`.
2.2 [x] Registrar requisitos não funcionais no `readme_pessoal.md`.
2.3 [x] Priorizar o backlog inicial com matriz impacto × esforço e refletir no `readme_pessoal.md`.

3. Modelagem de dados (Supabase)
3.1 [x] Levantar entidades principais com nomes em português e registrar detalhes no `readme_pessoal.md`.
3.2 [x] Definir constraints, índices e políticas de consistência no `readme_pessoal.md`.
3.3 [x] Planejar scripts/migrações versionadas e registrar documentação técnica no `readme_pessoal.md`.
3.4 [x] Disponibilizar scripts SQL de estrutura e dados de desenvolvimento (`sql_esquema_inicial.sql`, `sql_dados_exemplo_dev.sql`).

4. Backend e integrações
4.1 [ ] Vincular o projeto Supabase `financeiro_pessoal` ao repositório (CLI) e configurar variáveis de ambiente (estrutura criada via `sql_esquema_inicial.sql`; falta link/configuração local).
4.2 [ ] Implementar Edge Functions/API para cadastros, lançamentos diários, conciliação de faturas e metas.
4.3 [ ] Determinar integração ou isolamento em relação ao sistema de imóveis (usuários, infraestrutura, limites de dados).

5. Frontend React
5.1 [ ] Definir arquitetura de estado (Context, React Query ou Zustand) e padrões de componentes reutilizáveis.
5.2 [ ] Implementar telas principais: Dashboard, Lançamento Diário, Gestão de Categorias, Faturas, Metas.
5.3 [ ] Integrar visualizações (Recharts ou Chart.js) para limites versus gastos, histórico e alertas.

6. Experiência do usuário
6.1 [ ] Mapear fluxos críticos (recebimento do salário, lançamentos rápidos, fechamento de faturas, revisão mensal).
6.2 [ ] Definir validações e feedbacks (alertas de limite, vencimentos, progresso de metas).
6.3 [ ] Realizar testes exploratórios com cenários reais e ajustar linguagem/UX para simplicidade diária.

7. Qualidade, automação e operação
7.1 [ ] Configurar linting, testes unitários/integrados e cenários de dados de exemplo.
7.2 [ ] Preparar pipelines CI/CD no Render para backend e frontend com validações antes do deploy.
7.3 [ ] Estabelecer monitoramento básico (logs, métricas de uso) e rotina de backup do banco.

8. Roadmap de entregas
8.1 [ ] Entrega 1 — MVP: esquema de dados, cadastros básicos e lançamentos manuais com limites por categoria.
8.2 [ ] Entrega 2 — Cartões e faturas: conciliação automática, ajuste de vencimentos, alertas de pagamento.
8.3 [ ] Entrega 3 — Relatórios e metas: gráficos comparativos, metas de poupança, exportação de dados.
8.4 [ ] Entrega contínua — Iteração com feedback, automações adicionais e avaliação de integrações futuras.
