# Especificação Operacional — Agente Site

## Identificação
- Agente: `agente_site`
- Projeto Supabase: `thmekudlkuwjuddkyhpi`

## Escopo atual
- Este agente cuida do portal web, da API do site e das operacoes sobre dados ja persistidos no Supabase.
- Captura, scraping, enriquecimento e escrita inicial de imoveis no Supabase nao sao mais responsabilidade deste agente.
- Quando a necessidade envolver interface, filtros, leitura, selecao, analise, permissao ou manipulacao no site, a tarefa pertence ao `agente_site`.

## Estado operacional atual do portal
- Na tela `Prospecções`, os cards de `capturados` funcionam como ponto de entrada para o hub do imóvel.
- Clicar no card abre o hub na aba `Dados`.
- Os atalhos `Enriquecimento`, `IA`, `Viabilidade` e `Matrícula` abrem diretamente a aba correspondente do hub.
- A ação `Selecionar` saiu do card e hoje vive apenas dentro do hub, no topo do modal detalhado.
- A aba `Enriquecimento` não depende mais só de `avaliacoes`; ela lê um endpoint agregado que reúne avaliação automática, comparáveis, aluguel, contexto de leilão, bairro e último resultado de job.
- Se o enriquecimento falhar no pipeline externo, o agente do site deve primeiro validar leitura, exibição e estado da UI antes de encaminhar tarefa ao agente externo.

## Backlog oficial
- O backlog de ambos os agentes vive exclusivamente na tabela `agent_tasks` do Supabase.
- Não manter listas paralelas de pendências fora desta tabela.

## Schema atual
```sql
id            uuid
de            text
para          text
titulo        text
especificacao text
status        text
resposta      text
prioridade    text
categoria     text
sprint        text
area          text
created_at    timestamptz
updated_at    timestamptz
```

## Fila de tarefas entre agentes
Ao iniciar cada sessão, consultar tarefas pendentes destinadas ao `agente_site`:

```sql
SELECT id, titulo, prioridade, sprint, especificacao
FROM agent_tasks
WHERE para = 'agente_site' AND status = 'pendente'
ORDER BY prioridade DESC, created_at ASC;
```

Se houver tarefas pendentes:
1. Marcar a tarefa como `em_andamento` antes de executar:
   ```sql
   UPDATE agent_tasks
   SET status = 'em_andamento', updated_at = now()
   WHERE id = '<id>';
   ```
2. Executar exatamente o que estiver descrito em `especificacao`, incluindo arquivo, função e trecho de código quando houver.
3. Ao concluir, registrar o que foi feito e marcar como `concluido`:
   ```sql
   UPDATE agent_tasks
   SET status = 'concluido',
       resposta = 'arquivo editado, linha, o que mudou, commit se houver',
       updated_at = now()
   WHERE id = '<id>';
   ```
4. Se não for possível executar, marcar como `rejeitado` e explicar o motivo em `resposta`.

## Criação de novas tarefas
Ao identificar bug, melhoria, feature ou pendência nova, registrar diretamente em `agent_tasks`:

```sql
INSERT INTO agent_tasks (de, para, titulo, especificacao, prioridade, categoria, sprint, area)
VALUES ('agente_site', 'agente_site', '<titulo>', '<especificacao completa>', '<prioridade>', '<categoria>', '<sprint>', 'site');
```

## Envio de tarefas ao agente de coleta
Para enviar uma tarefa do `agente_site` para o `agente_coleta`:

```sql
INSERT INTO agent_tasks (de, para, titulo, especificacao, prioridade, categoria, sprint, area)
VALUES ('agente_site', 'agente_coleta', '<titulo>', '<especificacao completa>', '<prioridade>', '<categoria>', '<sprint>', '<area>');
```

Use este encaminhamento apenas quando a demanda envolver captura, scraping, enriquecimento ou abastecimento do banco. Ajustes de leitura e operacao no portal permanecem com o `agente_site`.

## Sprints ativas
- `fase4` — Portal web completo
- `a5` — Resumo IA por botão
- `a6` — Overrides e comparáveis curáveis
- `infra` — Melhorias técnicas, testes e segurança
- `backlog` — Itens sem sprint definida
