# Registros de lançamentos por ferramentas externas

## Gerar o ID no PostgreSQL

A coluna `public.lancamentos.id` já é uma identidade automática. Todas as ferramentas devem omitir essa coluna no `INSERT` e obter o número criado com `RETURNING id`.

- Não enviar `id`, nem mesmo como `NULL`.
- Não gerar números com `MAX(id) + 1`.
- Não reiniciar ou reduzir a sequência.
- Se for necessário guardar o ID na outra ferramenta, usar o valor devolvido pelo banco.

Exemplo com parâmetros nomeados do psycopg2, sem valores reais:

```sql
INSERT INTO public.lancamentos (
    data, id_imovel, id_categoria, id_situacao, descricao, valor, ativo,
    paid_by_user_id, tipo_movimentacao
)
VALUES (
    %(data)s, %(id_imovel)s, %(id_categoria)s, %(id_situacao)s,
    %(descricao)s, %(valor)s, TRUE, %(paid_by_user_id)s, 'despesa_imovel'
)
RETURNING id;
```

Usar uma data válida e os IDs existentes de imóvel, categoria, situação e pagador. Para despesas em imóveis com múltiplos sócios, informar um sócio ativo em `paid_by_user_id`. Gravações diretas no banco não executam as validações da API; a ferramenta precisa respeitar essas regras ou usar a API autenticada do sistema.

É normal haver intervalos nos números após erros ou transações desfeitas. O ID identifica o registro; não representa uma numeração contábil contínua.

## Recuperação automática no sistema

As inclusões individuais (`POST /gpt/lancamentos`) e em lote (`POST /dashboard/lancamentos/lote`, também usado pelo formulário) compartilham a proteção em `backend/models.py`:

1. Uma colisão nas restrições únicas conhecidas de `lancamentos.id` desfaz toda a tentativa.
2. A API aguarda até 5 segundos para bloquear gravações concorrentes na tabela. Leituras continuam disponíveis.
3. O contador só avança se estiver atrás ou apontando para um ID já ocupado; nunca é reduzido.
4. A transação inteira é repetida uma única vez, incluindo todos os itens do lote. Só há commit após a gravação completa.
5. Outros conflitos e erros são propagados, com rollback e devolução da conexão. Se a recuperação falhar, não há repetição indefinida.

Essa proteção precisa ser publicada no backend para atuar em produção. Ela recupera gravações feitas pela API; não intercepta os comandos executados diretamente por outras ferramentas.

## Importações históricas

Se uma restauração precisar preservar IDs, executar [corrigir_sequencia_lancamentos.sql](consultas/corrigir_sequencia_lancamentos.sql) ao terminar a importação, antes de liberar novas gravações.

Referências: [sequências do PostgreSQL](https://www.postgresql.org/docs/current/functions-sequence.html) e [bloqueios de tabela](https://www.postgresql.org/docs/current/explicit-locking.html).
