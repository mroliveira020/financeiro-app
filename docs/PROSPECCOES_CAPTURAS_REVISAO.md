# Presença nas capturas e revisão de avaliações

## Comportamento do portal

A referência é a última captura **completa e concluída por fonte e UF**. Capturas parciais, interrompidas ou de outra UF não substituem essa referência. A ausência na listagem não comprova venda: não muda `disponivel`, não apaga registros e não remove itens de Selecionados.

O filtro `presenca` aceita `presentes` (padrão), `ausentes` e `todos`. Enquanto uma UF/fonte não tiver referência completa, `presente_ultima_captura` é nulo e os registros existentes continuam visíveis em `presentes`, identificados como presença desconhecida. `ausentes` só inclui ausência comprovada por uma referência completa.

O portal exibe a data da captura e o motivo da revisão nos cards, em Selecionados e no hub. O filtro `somente_revisao=true` suspende os mínimos de ROI e score, para não esconder oportunidades por indicadores antigos. Os filtros de localização, modalidade e financiamento continuam valendo. O filtro de presença é independente do campo legado `disponivel`; sem `status` explícito, a API não restringe o campo `disponivel`, incluindo disponibilidade ainda desconhecida.

O prazo da pesquisa de mercado é configurado por `PROSPECCAO_AVALIACAO_VALIDADE_DIAS`, padrão 90 dias. Sincronizar esse valor entre os backends/ambientes no deploy. A data da coleta sozinha nunca comprova presença atual.

## Etapa recomendada

A função `prospeccao_melhor_etapa` escolhe o menor preço positivo entre os leilões ainda abertos/futuros. Empate usa a data mais próxima; uma data ausente continua ausente. Datas que só informam o dia (meia-noite em São Paulo) permanecem elegíveis durante aquele dia. Etapas com horário explícito vencem naquele instante.

Quando existem preços de leilão, `valor_venda` não entra como uma terceira etapa sem vínculo. Quando não existem, venda/licitação usa `valor_venda`, vinculado ao encerramento ou, se ausente, à data de licitação. Venda direta sem prazo permanece sem data. Não se usa a data de coleta como data de leilão.

A mesma seleção alimenta preço, data, ordenação das listagens e o preenchimento inicial de viabilidade. Todos os eventos disponíveis continuam nos detalhes. Uma ficha manual existente preserva suas premissas. A ação **Simular com lance atual** modifica apenas o rascunho local; os demais custos continuam sendo as premissas da ficha e precisam de revisão. A persistência ocorre ao salvar.

## Referências e histórico

`avaliacoes.oferta_referencia` e `imoveis_selecionados_analise.oferta_referencia` guardam as condições usadas na análise. Preços, modalidade, financiamento, disponibilidade e datas diferentes geram revisão; etapas encerradas também. Retorno após ausência gera revisão se a análise é anterior à captura de retorno. Pesquisa antiga ou sem data gera revisão de mercado.

Nas avaliações legadas sem snapshot, a leitura busca a última coleta anterior à pesquisa; na viabilidade legada, anterior à última atualização. Sem essa coleta, o portal sinaliza falta de referência. Não compara custo de aquisição estimado com lance mínimo: são valores diferentes.

Ao salvar uma viabilidade, o backend registra o snapshot das condições disponíveis. O capturador/avaliador pode enviar a referência exata calculada por `prospeccao_oferta_referencia(to_jsonb(oferta))`. Se uma nova avaliação não informar referência, um trigger procura a coleta anterior à pesquisa. Atualizar `pesquisado_em` somente quando houver uma nova pesquisa efetiva.

O trigger arquiva o registro anterior em `prospeccao_analise_historico` antes de atualizar avaliação ou viabilidade. Não há sobrescrita automática das premissas manuais, nova pesquisa automática nem reativação automática de selecionados. A interface exibe a análise atual; versões arquivadas ficam disponíveis no banco para auditoria.

## Contrato do capturador externo

O capturador deve registrar a **lista completa de códigos encontrados na fonte**, antes dos filtros de seleção ou da consulta de detalhes. Falha ao consultar uma página de detalhes e reaproveitamento de dados recentes não significam ausência.

1. Criar um registro `prospeccao_capturas` com `fonte` igual ao valor usado em `imoveis_prospeccao` (por exemplo `caixa_extrajudicial`), UF normalizada, `status='em_andamento'` e `completa=false`.
2. Inserir os códigos em `prospeccao_captura_itens(captura_id, numero_bem)`, deduplicados. Registrar presença inclusive quando não for necessário atualizar os detalhes.
3. Abastecer `imoveis_prospeccao` normalmente. Para um código novo com falha de detalhes, persistir ao menos os dados conhecidos da listagem; o portal só lista imóveis existentes nessa base.
4. Só publicar uma captura completa depois de conferir paginação, cobertura de todas as modalidades da UF/fonte e integridade da listagem. O fim de uma execução parcial não autoriza `completa=true`. Os detalhes podem falhar sem invalidar uma listagem comprovadamente completa.
5. Em uma transação, após inserir todos os itens, atualizar `total_listados` com a contagem real, `concluida_em`, `completa=true` e `status='concluida'`. Zero itens só é válido com confirmação efetiva de listagem vazia da fonte.
6. Em execução parcial, publicar `completa=false`; em falha da listagem, usar `status='falhou'`. Não alterar uma captura publicada: criar nova execução.

O banco valida contagem e impede alterações em capturas concluídas e seus itens. A comprovação de cobertura completa pertence ao capturador. Não criar capturas históricas artificiais usando `MAX(coletado_em)`.

Exemplo de publicação (o UUID é retornado no início e reutilizado):

```sql
INSERT INTO prospeccao_capturas(fonte, uf)
VALUES ('caixa_extrajudicial', 'PR') RETURNING id;
-- Inserir TODOS os códigos da listagem em prospeccao_captura_itens.
-- Depois, publicar na mesma transação que finaliza os itens:
UPDATE prospeccao_capturas
SET completa=true, status='concluida', concluida_em=now(),
    total_listados=(SELECT count(*) FROM prospeccao_captura_itens WHERE captura_id=:id)
WHERE id=:id;
```

## Migração e validação

Aplicar `docs/sql_prospeccoes_capturas_revisao.sql` antes de publicar o backend. A migração é transacional e reaplicável; adiciona tabelas com RLS, colunas, funções, triggers e view sem excluir dados. O contrato depende de PostgreSQL 15+ (`security_invoker`). Não publicar novas versões do código antes da migração.

Regressões SQL: executar `backend/tests/prospeccoes_regras.sql` após a migração, dentro de `BEGIN`/`ROLLBACK`; não manter os registros fictícios. O arquivo testa vínculo preço/data, empate, vencimento, data ausente, venda direta, revisão por preço/idade e integridade/abrangência das capturas. Testes Python e Vitest cobrem mapeamento e interface com integrações mockadas.

O backlog e a adaptação do capturador são acompanhados exclusivamente em `agent_tasks`, conforme `docs/AGENTE_SITE.md`.
