# Tarefas do portal

A área `/tarefas` reúne tarefas compartilhadas segundo o acesso atual ao imóvel. Administradores têm acesso global. Na prospecção, o acesso segue a capacidade de prospector. Nos adquiridos, cada usuário acessa os imóveis com participação societária ativa e positiva. O responsável pode ser escolhido entre os usuários com acesso ao contexto. A autenticação usa o JWT atual do portal.

A lista oferece busca, imóvel, etapa, situação, responsável, prazo e arquivamento. Cada página contém até 50 tarefas. O formulário de criação e edição fica junto à lista. Os campos são título, descrição, imóvel, responsável opcional, prazo opcional e situação. As duas situações são A fazer e Concluída. Concluir e reabrir preserva a tarefa e atualiza sua versão. Arquivamento é um metadado de visibilidade, com restauração das tarefas manuais.

A ficha desktop oferece Participação e tarefas. O Financeiro oferece um vínculo para as tarefas do adquirido. Os cards da Prospecção mostram a quantidade a fazer sobre o total ativo. Os resumos são consultados em lote para até 100 imóveis e atualizados após alterações nesta sessão.

## Intenção de participação

A intenção pertence ao usuário que a registra. Repetir o registro recupera sua intenção ativa. As tarefas são compartilhadas no imóvel e podem ser vinculadas à intenção pela origem Preparação para arrematação. A retirada pede confirmação na própria página e arquiva apenas as tarefas A fazer vinculadas àquela intenção. As concluídas e o histórico são preservados. A retirada não altera tarefas manuais nem tarefas de outra intenção.

As operações bloqueiam a intenção antes das tarefas para manter a retirada consistente com criações e edições simultâneas. Um pedido tardio não cria tarefas para uma intenção retirada. Um novo registro gera outra intenção, com identificação própria. Tarefas vinculadas à intenção retirada ficam disponíveis para consulta.

## Contrato da API

| Método e rota | Operação |
| --- | --- |
| `GET /tarefas` | Lista e contagens conforme filtros e acesso do usuário. |
| `GET /tarefas/opcoes` | Imóveis, responsáveis permitidos e opções dos filtros. A busca de capturados retorna até 30 opções por consulta. |
| `GET /tarefas/resumo` | Contagens por `numero_bem` recebido como parâmetro repetido. |
| `POST /tarefas` | Criação manual com UUID estável enviado pelo cliente. |
| `PUT /tarefas/<uuid>` | Atualização completa com a versão consultada. |
| `GET /tarefas/intencao/<numero_bem>` | Intenção ativa do usuário autenticado. |
| `POST /tarefas/intencao/<numero_bem>` | Registro idempotente da intenção. |
| `DELETE /tarefas/intencao/<numero_bem>` | Retirada lógica com o UUID da intenção no corpo. |

Os filtros incluem `busca`, `numero_bem`, `imovel_id`, `etapa`, `situacao`, `responsavel_id`, `responsavel=sem`, `prazo=atrasadas`, `arquivadas` e `pagina`. Prazos são datas ISO, comparadas com o dia corrente em America/Sao_Paulo no filtro de atrasadas.

O corpo da tarefa usa `id`, `titulo`, `descricao`, `numero_bem` ou `imovel_id`, `responsavel_id`, `prazo`, `situacao`, `origem`, `intencao_id` e `arquivada`. Atualizações incluem `versao`. A origem permanece vinculada ao registro inicial. Uma versão antiga recebe 409, preservando a edição já confirmada. Falhas mantêm os dados do formulário para revisão e nova tentativa. Reenvios de criação usam o mesmo UUID para evitar duplicações.

## Banco e publicação

As migrações em `supabase/migrations` criam `portal_tarefas`, `portal_intencoes_participacao` e seus índices. Os vínculos existentes de imóveis, usuários e sócios são consultados pela API. As novas tabelas têm RLS habilitado e acesso revogado aos papéis `anon` e `authenticated`. A API Flask realiza a autorização com o usuário autenticado e acessa o banco pela conexão de servidor já configurada.

A criação dessas estruturas foi aplicada antes da publicação da interface. A verificação de catálogo confirmou RLS e revogação dos acessos diretos. As consultas e índices foram conferidos com SELECT e EXPLAIN. Os testes usam integrações simuladas. As interações de navegador usam tarefas ilustrativas em uma prévia local.

A inteligência de geração de tarefas será desenvolvida posteriormente, conforme definição do usuário. O painel Lembretes do iPhone apresenta a integração planejada. Conexão e sincronismo efetivo pertencem à próxima implementação de INT-R01.
