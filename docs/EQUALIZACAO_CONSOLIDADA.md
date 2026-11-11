# Equalização consolidada entre imóveis

## Uso

No Financeiro Compartilhado do imóvel, ao lado de Equalizações registradas, o botão com ícone **Outros imóveis** aparece quando o usuário possui saldo pendente com um dos mesmos sócios em outro imóvel elegível. Funciona também quando o imóvel atual já está equalizado.

O modal atualiza os saldos ao abrir e mostra, para cada sócio escolhido:

- os imóveis com pendências e quais estão selecionados;
- os valores a receber e a pagar, sempre na perspectiva do usuário autenticado;
- o saldo líquido dos imóveis selecionados;
- data e observação do acerto.

Exemplo: receber R$ 1.000 em Araruna e pagar R$ 600 em Rio Verde resulta em um recebimento único de R$ 400. Com valores iguais nos dois sentidos, o saldo é zero e a operação registra apenas a compensação, sem transferência financeira.

A transferência bancária é realizada pelo usuário fora do portal. **Registrar acerto consolidado** registra a transferência já efetuada; **Registrar compensação** confirma o acerto sem transferência quando o saldo líquido é zero. O recibo permanece aberto até concluir, quando o dashboard é atualizado.

## Critérios e segurança

Cada imóvel consolidado deve ter exatamente os mesmos dois sócios ativos, participações positivas totalizando 100%, despesas com pagador identificado e saldos dos sócios fechando entre si até o centavo. O modal agrupa separadamente cada contraparte. Imóveis com três ou mais sócios, despesas sem pagador ou diferenças de arredondamento/participação são informados e excluídos da consolidação automática. O registro exige ao menos dois imóveis.

A consulta e a gravação usam o usuário da autenticação, nunca uma identidade enviada no payload. O usuário precisa participar ativamente do imóvel de origem e de cada imóvel selecionado. Imóveis vendidos com saldos pendentes também podem integrar o acerto. A consulta é feita em lote, sem uma chamada por imóvel.

A confirmação quita integralmente as pendências dos imóveis selecionados. As versões das participações e dos lançamentos são verificadas novamente sob bloqueio transacional. Alterações concorrentes nos lançamentos ou sócios usam o mesmo bloqueio por imóvel. Se os dados mudarem, o servidor responde 409 e a interface exige atualizar e revisar a seleção. O registro individual também revalida seu limite sob o mesmo bloqueio, evitando repetir uma equalização já quitada pelo consolidado.

O identificador UUID da operação garante idempotência: repetir um pedido idêntico retorna o mesmo recibo, sem novas parcelas; reutilizar o identificador com outro usuário ou outro conteúdo é rejeitado. Após uma falha de comunicação, tentar novamente sem editar mantém o identificador. Uma atualização explícita dos saldos inicia uma nova confirmação.

## Rateio de centavos

Quando as participações totalizam 100%, o total das despesas é dividido em centavos inteiros pelo método do maior resto. O centavo residual vai para a maior fração remanescente; empates usam o menor ID de sócio. Exemplo: R$ 100,01 a 50% gera parcelas de R$ 50,01 e R$ 50,00, somando exatamente o total. A ordem de exibição dos sócios não interfere. Esta regra é compartilhada pela posição financeira individual e pela consolidação, eliminando diferenças artificiais de arredondamento. Os lançamentos originais permanecem com seus valores.

## Persistência e histórico

`equalizacao_operacoes` registra uma operação única com os dois sócios, o usuário responsável, data, observação, origem, transferência líquida, pagador/recebedor e as parcelas. No saldo zero, pagador/recebedor da transferência são nulos.

Cada imóvel recebe um lançamento `equalizacao_socios` vinculado por `equalizacao_operacao_id`, na direção e no valor integral de sua pendência. Essas linhas são **parcelas contábeis**, identificadas assim no histórico; seus valores brutos não representam transferências bancárias adicionais. A transferência financeira única fica na operação. Os acertos não aumentam o custo operacional e são excluídos dos gráficos e detalhes de gastos mensais.

Operação e parcelas são persistidas em uma única transação. Constraints diferidas validam o vínculo, a composição, a direção e o valor líquido no commit. O banco impede alterações ou exclusões individuais nas parcelas e no registro da operação, preservando a trilha do acerto. Esta entrega não inclui estorno de acertos consolidados.

## API

`GET /imoveis/:id/equalizacoes/consolidado`

Retorna `{socios: [{socio_id, socio_nome, saldo_centavos, imoveis: [{id_imovel, nome, atual, saldo_centavos, versao}]}], avisos: [...]}`. Saldo positivo significa receber; negativo, pagar. Os cálculos de consolidação são feitos em centavos inteiros.

`POST /imoveis/:id/equalizacoes/consolidado`

```json
{
  "operacao_id": "UUID gerado para esta confirmação",
  "socio_id": 6,
  "data": "2026-11-11",
  "descricao": "Acerto entre imóveis",
  "imoveis": [
    {"id_imovel": 23, "versao": "hash recebido na consulta"},
    {"id_imovel": 24, "versao": "hash recebido na consulta"}
  ]
}
```

O servidor calcula o valor e a direção; o cliente não envia um valor arbitrário de transferência. Respostas: 201 para registro novo, 200 para repetição idêntica, 400 para dados inválidos, 403 para acesso negado e 409 para saldo modificado ou concorrência.

## Implantação e validação

Aplicar `docs/sql_equalizacao_consolidada.sql` antes de publicar o backend. A migração é aditiva e transacional; cria a tabela com RLS e policy para `service_role`, coluna de vínculo, índice único por operação/imóvel e triggers. Não altera saldos financeiros existentes. Não há novas variáveis de ambiente.

Executar regressão de banco com `backend/venv/bin/python scripts/validar_equalizacao_consolidada.py --validar-migracao`. O teste cria imóveis e acertos fictícios dentro de uma transação e executa ROLLBACK ao final. Verifica transferência líquida, quitação por imóvel, idempotência, saldo antigo, imutabilidade, compensação sem transferência, pagamento líquido, operação incompleta e bloqueio entre transações. O parâmetro valida a própria migração sem mantê-la; sem ele, exige o schema já instalado.

Os testes de unidade e API em `backend/tests/test_equalizacao_consolidada*.py` usam integrações mockadas. Os testes da interface ficam em `frontend/src/components/EqualizacaoConsolidada.test.jsx`.
