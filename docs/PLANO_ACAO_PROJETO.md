# Plano de Ação — Projeto

## Papel Deste Documento
Este arquivo nao e mais o backlog operacional do projeto.

O backlog oficial e unico das tarefas em aberto vive no Supabase:
- tabela `agent_tasks` para fila, priorizacao, execucao e status das tarefas dos agentes;
- demais tabelas operacionais do produto para refletir o estado real da aplicacao.

Este documento passa a servir para:
- registrar contexto, decisoes de produto e arquitetura;
- preservar historico de frentes ja executadas ou discutidas;
- reunir roadmap macro, criterios e referencias uteis;
- apontar riscos, dependencias e temas que precisam ser convertidos em tarefas no Supabase.

Nao usar este arquivo como checklist vivo de execucao. Sempre que houver uma nova pendencia acionavel, ela deve ser registrada no Supabase.

Planos anteriores agora servem apenas como referencia rapida e apontam para este arquivo:
- `garimpo/PLANO_ACAO.md`
- `docs/PLANO_DE_ACAO.md`

## Especificação Operacional dos Agentes
- A especificacao operacional do `agente_site` foi movida para [docs/AGENTE_SITE.md](/Users/matheusoliveira/Documents/Leiloes/Aplicacoes/Financeiro/docs/AGENTE_SITE.md).
- O backlog oficial dos agentes vive exclusivamente na tabela `agent_tasks` do Supabase.
- Sempre manter [docs/AGENTE_SITE.md](/Users/matheusoliveira/Documents/Leiloes/Aplicacoes/Financeiro/docs/AGENTE_SITE.md) alinhado com o fluxo de consulta, atualizacao e criacao dessas tarefas.

## Uso Correto
- Consultar o Supabase para saber o que esta pendente agora.
- Consultar este arquivo para entender contexto, historico e direcao do projeto.
- Quando um item deste documento ainda exigir execucao, transformá-lo em tarefa no Supabase em vez de acompanhar o status manualmente aqui.

## O Que Vai Para o Supabase vs. O Que Fica Aqui
- Vai para o Supabase:
  - toda tarefa acionavel;
  - qualquer item com dono, prioridade, sprint, status ou dependencia de execucao;
  - bugs, melhorias, refactors, investigacoes, testes, hardening e validacoes operacionais;
  - handoffs entre agentes.
- Fica neste documento:
  - contexto, decisoes de produto e arquitetura;
  - regras de negocio e criterios de aceite em nivel conceitual;
  - resumo historico do que ja foi implementado;
  - dependencias externas e direcionamento macro das frentes.
- Regra pratica:
  - se alguem precisa executar e acompanhar, vai para o Supabase;
  - se alguem precisa entender o porquê, a regra ou o contexto, fica aqui.

## Convencao de Leitura
- Checklists marcados com `[x]` e `[ ]` neste arquivo representam registro historico, diagnostico ou agrupamento tematico.
- Um item aberto neste documento nao significa que ele esteja oficialmente priorizado agora.
- O que estiver realmente em execucao, aguardando execucao ou priorizado deve existir no Supabase.
- Ao concluir uma frente antiga, prefira resumir o resultado aqui em texto e manter o detalhe operacional no Supabase.

## Itens Operacionais Ja Migrados Para o Supabase
Os blocos operacionais que ainda apareciam neste documento ja foram revisados contra a tabela `agent_tasks`.

- itens que ja existiam no Supabase foram mantidos sem duplicacao;
- itens que ainda so existiam no markdown foram cadastrados no backlog oficial;
- a partir daqui, este plano deve guardar apenas contexto, decisao e historico.

## Visão Geral

### Objetivo do Projeto
Consolidar em um unico sistema as frentes de Prospeccoes, Financeiro, Usuarios, Permissoes e evolucoes operacionais do portal, mantendo coerencia entre consulta de dados no Supabase, decisao de prospeccao, operacao financeira e governanca de acesso.

### Contexto Atual
- Este repositorio e responsavel pelo portal web e pela API usada pelo site, com foco em consulta, selecao, manipulacao e operacao sobre dados ja persistidos no Supabase.
- A captura, o enriquecimento e a escrita inicial dos imoveis no Supabase sairam do escopo operacional deste projeto e hoje pertencem ao fluxo externo conduzido por outro agente.
- A camada de Prospeccoes ja possui fluxo operacional real, com autoria, responsaveis, observacoes, viabilidade financeira e experiencia mobile em evolucao.
- O Financeiro passa a demandar uma nova fase de modelagem para suportar participacao societaria, multiplos papeis por usuario e acerto de contas entre socios.

### Decisões de Produto Já Tomadas
- O contexto central do projeto fica em `docs/PLANO_ACAO_PROJETO.md`; arquivos antigos permanecem apenas como ponteiro.
- O portal consulta e manipula dados ja abastecidos no Supabase; ele nao e mais responsavel pela captura ou enriquecimento dos imoveis.
- O garimpo passa a ser uma dependencia externa deste projeto: abastece o banco, mas nao define mais o escopo principal do `agente_site`.
- A operação de Prospecções já considera autoria, responsáveis, observações, prioridade, exclusão lógica, viabilidade financeira e uso mobile.
- A ficha de viabilidade mantém edição local na UI e só persiste ao clicar em `Salvar`.
- A fórmula atual da viabilidade considera a prestação do financiamento nas despesas do período, no custo total do imóvel e no capital investido estimado.
- A próxima evolução relevante do Financeiro será suportar sócios, múltiplos papéis por usuário e equalização entre participantes.
- O cadastro de sócios, seu vínculo com imóveis e seus percentuais de participação será centralizado na tela de controle de usuários e só poderá ser administrado por `admin`.
- A centralização da gestão societária na tela de usuários é uma decisão de UX/administração, não de ordem de implementação: banco e backend do compartilhamento devem vir antes.

## Integracao Externa de Captura

- A captura de imoveis, o scraping, o enriquecimento e a escrita inicial no Supabase sao mantidos fora deste escopo.
- O portal administrado aqui depende desse abastecimento externo e trabalha sobre os dados ja disponiveis nas tabelas de prospeccao.
- Quando houver necessidade de ajuste na interface, filtros, contratos de leitura ou manipulacao dos dados capturados, isso continua sendo responsabilidade deste projeto.
- Quando houver necessidade de ajuste na coleta em si, a demanda deve seguir para o agente externo responsavel pelo garimpo.

## Frente Dados e Supabase

### Historico e temas de Supabase
Resumo historico desta frente:
- a base de prospeccao e selecao foi consolidada no Supabase e o portal hoje opera sobre essas tabelas;
- o fluxo antigo de captura ja foi desacoplado deste repositorio e permanece apenas como dependencia externa;
- houve uma rodada de hardening e revisao de seguranca, incluindo preparo de `RLS` e limpeza de segredos locais.

Validacoes operacionais restantes de Supabase, seguranca e ambiente deixaram de ser acompanhadas neste documento e foram encaminhadas ao backlog oficial.

## Frente Produto, Prospecções e Usuários

### Referencia Historica — Fase 4 do Portal de Prospeccao
Resumo historico desta frente:
- os cards e modais de prospeccao ganharam fotos, badges, comparaveis, links externos e melhor leitura operacional;
- a camada de analise com IA e matricula foi incorporada ao fluxo dos selecionados, com persistencia, historico e protecoes basicas de permissao;
- o portal passou a suportar multiplas fontes de captura dentro da mesma experiencia, com tratamento especifico para o TJDFT;
- contratos de interface e boa parte da UX de Prospecções ja foram estabilizados.

Tudo o que ainda exigia execucao operacional nessa frente foi retirado do controle local e acompanhado no Supabase.

### Snapshot Historico de Sprint Recomendada
Esta sprint historica foi desdobrada no backlog do Supabase. Os temas centrais eram:
- estabilizacao de IA, matricula e ficha de viabilidade;
- pequenos fechamentos de UX e robustez em Prospecções;
- melhoria de leitura operacional da fila de selecionados;
- reducao de divida tecnica antes de novas expansoes.

O detalhamento acionavel deixou de ser mantido aqui.

### Roadmap Recomendado — Prospecções e Gestão de Usuários
Resumo executivo desta frente:
- Fluxo de usuarios, convites, autoria, responsaveis, exclusao logica e visibilidade da fila ja foi consolidado.
- Lista de selecionados, ordenacao por leilao, experiencia mobile inicial e ficha de analise/viabilidade ja existem e foram estabilizadas.
- A operacao atual ja suporta observacoes, prioridade, responsaveis e analise financeira no portal.

Pendencias macro que permanecem:
- concluir pequenos acabamentos de UX da fila de selecionados, especialmente observacoes, acoes compactas e validacao da experiencia mobile;
- revisar o acionamento da ficha de viabilidade e validar o fluxo ponta a ponta com uso real;
- suportar inclusao manual de imoveis fora da base importada;
- ampliar testes e atualizar documentacao operacional.

Os detalhes historicos desta frente foram condensados para manter o documento legivel. O desdobramento operacional deve acontecer no Supabase.

## Frente Financeiro Compartilhado

### Status Atual da Frente
- A base tecnica do financeiro compartilhado ja foi entregue:
  - `imovel_socios`, campos societarios em `lancamentos`, backfills iniciais e endpoints minimos;
  - selecao de `Quem pagou`, equalizacao entre socios, UI administrativa minima e dashboard compartilhado inicial;
  - restricoes de acesso por imovel, leitura mobile dedicada e primeira rodada de otimizacoes.
- O maior bloco pendente nao e mais de modelagem, e sim de validacao operacional com uso real.
- Regra transitoria vigente: usuario `prospector` com participacao ativa em `imovel_socios` ainda pode acessar o Financeiro ate a migracao completa para capacidades acumulaveis.

### Premissas de Implementação Segura
- a aplicacao nao pode parar durante a evolucao do compartilhamento;
- nenhum dado existente pode ser perdido ou reclassificado sem criterio documentado;
- a evolucao deve permanecer retrocompativel, com rollout progressivo;
- calculos societarios precisam continuar auditaveis a partir dos lancamentos originais.

### Proposta Técnica Inicial
Resumo tecnico atual:
- rollout aditivo, sem parada e com retrocompatibilidade, continua sendo a estrategia correta;
- `imovel_socios`, `paid_by_user_id`, equalizacoes e fallback para imovel individual ja foram implementados;
- os proximos blocos relevantes sao a chave `Total` vs. `Minha participação`, a consolidacao de capacidades acumulaveis e a revisao final de permissoes.

### Proposta Concreta de Banco, API e Migração
Resumo executivo:
- o principal legado ainda aberto esta em autenticacao e autorizacao: hoje `role` unico ainda convive com a necessidade de capacidades acumulaveis;
- `imovel_socios`, campos adicionais em `lancamentos` e endpoints de leitura basica ja existem;
- faltam consolidacao de `user_capabilities`, chave de visao do dashboard e fechamento do modelo final de permissao.

### Desenho Executivo de Implementação
Resumo historico desta fase:
- a base aditiva do compartilhamento foi entregue com tabelas, campos extras, backfills e endpoints minimos;
- o rollout preservou retrocompatibilidade para imoveis pessoais e para o modelo legado de `role`;
- `imovel_socios`, extensoes em `lancamentos` e a futura migracao para `user_capabilities` seguem como referencias conceituais desta arquitetura;
- validacoes restantes, ajustes de UX, permissoes finais e operacao do imovel piloto passaram a ser acompanhados no Supabase.

### Primeira Entrega do Compartilhamento — Registro Historico
A primeira entrega cumpriu o objetivo de colocar o compartilhamento em estado utilizavel sem parar a aplicacao:
- banco e backend preparados;
- dashboard compartilhado inicial entregue;
- camada administrativa minima liberada para destravar uso real;
- compatibilidade com o fluxo legado preservada.

As validacoes pendentes e os proximos incrementos deixaram de ser controlados neste arquivo.

### Dashboard Compartilhado — Etapa de Revisão Dedicada
O dashboard compartilhado ja possui primeira versao funcional e primeira rodada de refinamento visual. Falta a revisao operacional profunda com o usuario antes do fechamento definitivo da interface.

### Próxima Etapa Imediata — UI Mínima de Sócios e Pix
Essa etapa ja cumpriu o papel de destravar a operacao real. O que falta agora e validar com dados reais, revisar a UX final do dashboard e concluir a migracao para permissoes e papeis acumulaveis sem excecoes temporarias.

## Priorizacao e Encaminhamento
Os snapshots de priorizacao e os blocos de encaminhamento operacional deixaram de ser mantidos neste arquivo.

Hoje, a leitura correta e:
- prioridade ativa, fila e status das tarefas vivem em `agent_tasks`;
- este documento guarda apenas o racional das frentes, as decisoes tomadas e o historico resumido.

## Plataforma, Segurança e Operação

### Domínio, Hospedagem e Performance
Resumo executivo:
- o projeto ainda precisa consolidar estrategia de dominio, hospedagem e baseline de performance;
- ja houve uma primeira rodada de otimizacao no dashboard e no frontend;
- comparacoes de provedor, publicacao e gargalos restantes passaram a ser tratadas no backlog do Supabase quando viram trabalho ativo.

### Segurança Operacional
1. [x] Rotacionar chaves do Supabase após exposição acidental em arquivo `.env`.
2. [x] Garantir que arquivos `.env` locais relevantes deste repositorio nao sejam mais versionados.

### Supabase — Security Advisor
Resumo historico:
- os alertas principais do Security Advisor foram tratados;
- houve validacao de regressao nas rotas criticas do portal;
- pontos residuais de seguranca e manutencao de infraestrutura, como upgrades de versao, devem ser acompanhados no Supabase quando virarem trabalho ativo.

### Integracao Externa — Notas de Seguranca
- O abastecimento externo do Supabase continua exigindo boas praticas de segredo, rotacao de chaves e isolamento de configuracoes locais, mas a operacao detalhada desse fluxo nao e mais acompanhada neste documento.
- Do ponto de vista deste portal, o que importa e:
  - nao versionar segredos reais;
  - manter as policies e acessos do Supabase compativeis com a leitura e escrita do site;
  - alinhar com o agente externo qualquer ajuste de credencial, contrato ou qualidade da base importada.
