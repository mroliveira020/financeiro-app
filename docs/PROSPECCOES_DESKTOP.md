# Prospecção no computador

A pesquisa usa cards em quatro colunas nas telas amplas e três em larguras intermediárias. A abertura de um imóvel cria uma aba dentro da página. A pesquisa permanece montada e preserva filtros, ordenação, página e posição de leitura. A ficha reutiliza as integrações existentes de dados, enriquecimento, viabilidade, matrícula e IA. A apresentação do celular continua no componente existente.

A pesquisa inicial no computador carrega 100 itens por página em ordem de menor lance. O usuário pode escolher 20 ou 50. UF, financiamento e presença de análise de IA ficam visíveis. Origem, modalidade, presença na captura e necessidade de revisão ficam na expansão. Os critérios antigos presentes na URL continuam removíveis pela lista de filtros aplicados.

Os cards oferecem acessos pequenos ao Google Maps e ao anúncio original em outra aba. O mapa usa o link salvo na análise financeira quando disponível, com pesquisa por endereço como alternativa. O anúncio usa o endereço da fonte. O endereço padrão da CAIXA é usado para imóveis CAIXA e registros antigos sem fonte.

## Contrato de consulta

`GET /prospeccoes/capturados` recebe os parâmetros opcionais abaixo. A filtragem ocorre antes da contagem e da paginação.

| Parâmetro | Significado |
| --- | --- |
| `busca` | Pesquisa em cidade, bairro e código, com até 200 caracteres e comparação sem diferenciar maiúsculas. `%` e `_` são tratados como texto. |
| `lance_min`, `lance_max` | Valores numéricos finitos e não negativos, com limites inclusivos. Faixas invertidas retornam 400. |
| `avaliados` | `sim` ou `nao`. Considera pré-análise automática, texto de análise de IA, matrícula analisada ou resposta de assistente salva no histórico. |
| `oportunidade=1` | Ordena `valor_minimo` e `ultima_disputa` pelo par de menor preço e data. Outros consumidores continuam usando o contexto de oferta existente. |

Cada registro inclui `melhor_lance`, `melhor_data`, `avaliado`, `analise_solicitada` e `link_google_maps`. O par da melhor oportunidade compara os valores positivos de primeiro leilão, segundo leilão e venda com suas datas correspondentes. Datas ausentes continuam sinalizadas como não informadas. Empates priorizam uma data conhecida e depois a mais próxima. A classificação não verifica se uma etapa já encerrou.

`GET /prospeccoes/meta` inclui `lance_maximo` para dimensionar a barra. O usuário também pode digitar os valores exatos. A faixa é armazenada na URL e preservada ao voltar da ficha.

“Solicitada análise IA” corresponde a job pendente ou em processamento com atividade nos últimos 20 minutos, seguindo o prazo de expiração já utilizado pelo servidor. “Concluída análise IA” indica resultado salvo. Abrir uma análise existente no computador faz consultas. A solicitação explícita utiliza o serviço atual de IA e suas permissões.

## Publicação e conferência

Publicar backend e frontend desta revisão no Render. A mudança usa consultas sobre as tabelas e views existentes. Os testes de API e de interface usam integrações simuladas. A verificação da consulta sobre a base real usa SELECT.

A primeira entrega cobre pesquisa, cards, links e abas com a ficha existente. A área global de tarefas, a intenção de participação com geração de tarefas e a avaliação estruturada com exportação PDF seguem nas frentes próprias do backlog.

## Validação desta revisão

Foram aprovados 52 testes de interface, 46 testes de backend, ESLint e build de produção. A consulta de preço e data e a classificação de análises foram verificadas com SELECT sobre a base real. A prévia local foi capturada com o componente integrado e dados ilustrativos. Os cliques enviados pela automação do navegador continuaram sem acionar os controles, por isso a conferência manual de interação em navegador permanece pendente. Os testes de interface exercitam filtros, links, abas, consultas e solicitação de IA com serviços simulados.
