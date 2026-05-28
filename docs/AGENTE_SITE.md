# Especificação Operacional — Agente Site

## Identificação
- Agente: `agente_site`
- Projeto Supabase: `thmekudlkuwjuddkyhpi`

## Fila de tarefas entre agentes
Ao iniciar cada sessão, consultar tarefas pendentes destinadas ao `agente_site`:

```sql
SELECT id, de, titulo, especificacao, created_at
FROM agent_tasks
WHERE para = 'agente_site' AND status = 'pendente'
ORDER BY created_at ASC;
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

## Envio de tarefas ao agente de coleta
Para enviar uma tarefa do `agente_site` para o `agente_coleta`:

```sql
INSERT INTO agent_tasks (de, para, titulo, especificacao)
VALUES ('agente_site', 'agente_coleta', '<titulo>', '<especificacao completa>');
```
