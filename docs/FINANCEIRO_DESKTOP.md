# Gestão financeira no computador

A Carteira permanece aberta e cada imóvel ocupa uma aba interna. Abrir novamente um imóvel ativa a aba existente. Busca, situação, ordenação e posição de leitura da Carteira ficam preservadas durante a navegação. Cada imóvel mantém suas seções e rascunhos enquanto a aba estiver aberta. Os endereços `/financeiro` e `/dashboard/:id` continuam disponíveis. A apresentação móvel segue pelos componentes anteriores.

A Carteira mostra fotos cadastradas, nome e endereço, investimento previsto, valor efetivado, saldo a investir e resultado projetado. A visão Minha participação aplica os percentuais ativos do usuário às métricas da lista. O gráfico mensal conserva a consulta e a configuração existentes e apresenta desembolsos totais. Imóveis sem foto são apresentados com seus dados textuais.

O imóvel oferece Resumo, Orçamento, Lançamentos, Sócios e acertos, Tarefas e Dados. Resumo reutiliza os cálculos atuais de fechamento. Orçamento apresenta os grupos em tabela e edição integrada à página. Dados reutiliza os campos cadastrais existentes. Tarefas usa a área compartilhada já publicada.

## Resumo do imóvel

O Resumo apresenta investimento previsto, valor efetivado, saldo a investir e resultado projetado. A projeção discrimina venda, investimento, financiamento a quitar, corretagem, imposto e retorno estimado. A visão Minha participação aplica o percentual ativo aos valores da projeção.

A posição entre sócios mostra sempre a participação pessoal, sua parte no investimento e no saldo a investir e o saldo dos acertos registrados. A consulta usa a rota existente de financeiro compartilhado. Falhas nessa consulta permitem nova tentativa e mantêm a projeção disponível. Valores de acertos ausentes aparecem como indisponíveis. Lançamentos sem pagador geram aviso de revisão. Os atalhos abrem Orçamento e Sócios e acertos nas seções do imóvel, preservando os rascunhos das abas.

O portal se identifica como Investimentos Imobiliários, inclusive no login e nos títulos do navegador. A navegação usa Carteira e o título visível da lista aparece apenas na aba. O título principal da página permanece disponível para leitores de tela.

## Lançamentos

`GET /dashboard/lancamentos/imovel/<id>` reúne despesas e receitas ativas do imóvel com paginação. Recebe `busca`, `inicio`, `fim`, `categoria`, `pagador`, `situacao`, `page` e `pageSize`. A busca compara descrições sem diferenciar maiúsculas. Os limites de data são inclusivos em formato ISO. Categoria e pagador recebem identificadores numéricos. Situação aceita `confirmado` ou `pendente`.

A confirmação segue `id_situacao = 1`. A consulta exclui equalizações entre sócios e registros inativos. As views anteriores agrupam por presença de categoria, por isso a nova consulta utiliza diretamente os lançamentos. Página, contagem, pendentes e soma confirmada são calculados na mesma instrução SQL. Os filtros são aplicados antes da paginação. Uma categoria ausente continua identificada como A definir.

O cadastro, a revisão e a importação ficam na própria página. São utilizadas as rotas de gravação existentes. O imóvel é herdado da aba. Lotes entram pendentes, com categoria a definir. A edição preserva o tipo de movimentação. Erros mantêm os campos para correção. Solicitações de consulta ultrapassadas são canceladas. O formulário bloqueia cliques repetidos durante o salvamento.

`GET /dashboard/participacoes` retorna somente os percentuais ativos do usuário autenticado, indexados pelo identificador do imóvel. A lista geral inclui o endereço cadastrado para identificação e pesquisa.

## Sócios e acertos

A posição apresenta participação, despesas pagas, parcela proporcional, acertos enviados e recebidos e saldo atual. O formulário adapta pagamento ou recebimento à posição do usuário. O histórico permanece associado ao imóvel. A compensação entre imóveis ocupa a própria página e conserva as regras atuais de elegibilidade, versões, confirmação, rateio e reenvio da operação. O seletor de todos os imóveis indica seleção parcial.

## Conferência

Os testes automatizados usam integrações simuladas. A prévia de navegador usa dados ilustrativos e um adaptador local que intercepta todas as consultas e gravações. O plano da consulta nova foi conferido no banco por EXPLAIN com imóvel fictício zero. A validação autenticada em produção deve ser realizada pelo usuário com seus imóveis.
