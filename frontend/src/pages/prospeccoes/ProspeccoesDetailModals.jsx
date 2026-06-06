import React, { useEffect, useState } from "react";
import {
  ProspectGallery,
  TextoEstruturado,
  DetalhesTexto,
  ArrowUpRightIcon,
  MapPinIcon,
  SparklesIcon,
  CloseIcon,
} from "./ProspeccoesShared";

export function AvaliacaoAutomaticaModal({
  item,
  detalhe,
  loading,
  savingScore,
  scoreRegiaoDraft,
  onScoreRegiaoChange,
  onSalvarScoreRegiao,
  onClose,
  onAdicionarAoFunil,
  getScoreClasse,
  getRoiClasse,
  formatarPercentual,
  formatarMoeda,
  formatarNumero,
  formatarDataHoraCompacta,
}) {
  if (!item) return null;

  const avaliacao = detalhe?.avaliacao || item.avaliacaoAutomatica;
  const comparaveis = detalhe?.comparaveis || [];
  const imovel = detalhe?.imovel || item;

  return (
    <div className="prospects-modal-backdrop" role="presentation">
      <div className="prospects-modal prospects-modal--wide prospects-modal--auto" role="dialog" aria-modal="true" aria-labelledby="avaliacao-auto-title">
        <div className="prospects-modal__header">
          <div>
            <p className="prospects-eyebrow">Pré-análise</p>
            <h3 id="avaliacao-auto-title" className="prospects-modal__title">Pré-análise automática do imóvel {item.codigo}</h3>
            <p className="prospects-subtitle prospects-subtitle--compact">
              Use a leitura automática como ponto de partida e refine depois na análise manual.
            </p>
          </div>
        </div>
        <div className="prospects-modal__body">
          {loading ? (
            <p className="prospects-empty">Carregando avaliacao automatica...</p>
          ) : !avaliacao ? (
            <p className="prospects-empty">Este imóvel ainda não possui pré-análise automática disponível.</p>
          ) : (
            <>
              <div className="prospects-auto-hero">
                <div className="prospects-auto-hero__media">
                  <ProspectGallery item={{ ...item, ...imovel }} className="prospects-auto-hero__photo" />
                </div>
                <div className="prospects-auto-hero__summary">
                  <span className="prospects-auto-hero__eyebrow">{imovel?.tipo_imovel || item.tipoImovel || "Imóvel"}</span>
                  <h4>{[imovel?.cidade || item.cidade, imovel?.uf || item.uf].filter(Boolean).join(" - ") || item.codigo}</h4>
                  <p>{[imovel?.endereco || item.endereco, imovel?.bairro || item.bairro].filter(Boolean).join(" - ") || "Endereço não informado"}</p>
                  <div className="prospects-capture-card__auto">
                    <span className={`prospects-auto-badge is-score ${getScoreClasse(avaliacao.score_total)}`}>Score {avaliacao.score_total ?? "—"}/85</span>
                    <span className={`prospects-auto-badge is-roi ${getRoiClasse(avaliacao.retorno_pct)}`}>ROI {formatarPercentual(avaliacao.retorno_pct)}</span>
                    <span className="prospects-auto-badge is-value">Venda est. {formatarMoeda(avaliacao.valor_estimado_venda)}</span>
                  </div>
                </div>
              </div>

              <div className="prospects-auto-grid">
                <div className="prospects-auto-card prospects-auto-card--summary">
                  <span>Fonte de comparáveis</span>
                  <strong>{avaliacao.fonte_pesquisa || "—"}</strong>
                </div>
                <div className="prospects-auto-card">
                  <span>Preço/m² da região</span>
                  <strong>{formatarMoeda(avaliacao.preco_m2_regiao)}</strong>
                </div>
                <div className="prospects-auto-card">
                  <span>Venda estimada</span>
                  <strong>{formatarMoeda(avaliacao.valor_estimado_venda)}</strong>
                </div>
                <div className="prospects-auto-card">
                  <span>Lucro estimado</span>
                  <strong>{formatarMoeda(avaliacao.lucro_estimado)}</strong>
                </div>
                <div className={`prospects-auto-card prospects-auto-card--score ${getScoreClasse(avaliacao.score_total)}`}>
                  <span>Score</span>
                  <strong>{avaliacao.score_total ?? "—"}/85</strong>
                </div>
                <div className={`prospects-auto-card prospects-auto-card--roi ${getRoiClasse(avaliacao.retorno_pct)}`}>
                  <span>ROI estimado</span>
                  <strong>{formatarPercentual(avaliacao.retorno_pct)}</strong>
                </div>
              </div>

              <div className="prospects-auto-breakdown">
                <div className="prospects-auto-breakdown__row">
                  <span>Desconto</span>
                  <strong>{avaliacao.score_desconto ?? 0}/40</strong>
                </div>
                <div className="prospects-auto-breakdown__row">
                  <span>Liquidez</span>
                  <strong>{avaliacao.score_liquidez ?? 0}/25</strong>
                </div>
                <div className="prospects-auto-breakdown__row">
                  <span>Risco</span>
                  <strong>{avaliacao.score_risco ?? 0}/5</strong>
                </div>
                <div className="prospects-auto-breakdown__row prospects-auto-breakdown__row--editable">
                  <label htmlFor="score-regiao">Região</label>
                  <div>
                    <input
                      id="score-regiao"
                      type="number"
                      min="0"
                      max="20"
                      value={scoreRegiaoDraft}
                      onChange={(e) => onScoreRegiaoChange(e.target.value)}
                    />
                    <button type="button" className="prospects-btn ghost prospects-btn--subtle" onClick={onSalvarScoreRegiao} disabled={savingScore}>
                      {savingScore ? "Salvando..." : "Salvar"}
                    </button>
                  </div>
                </div>
              </div>

              <div className="prospects-auto-meta">
                <span>Area: {imovel?.area_m2 ? `${formatarNumero(imovel.area_m2)} m2` : "—"}</span>
                <span>Quartos: {imovel?.quartos ?? "—"}</span>
                <span>Vagas: {imovel?.vagas ?? "—"}</span>
                <span>Avaliado em: {avaliacao.pesquisado_em ? formatarDataHoraCompacta(avaliacao.pesquisado_em) : "—"}</span>
              </div>

              {comparaveis.length ? (
                <div className="prospects-auto-comparaveis">
                  <h4>Comparáveis usados</h4>
                  <div className="prospects-table-wrap">
                    <table className="prospects-table prospects-table--compact">
                      <thead>
                        <tr>
                          <th>Titulo</th>
                          <th>Preco</th>
                          <th>Area</th>
                          <th>Preco/m2</th>
                          <th>Quartos</th>
                          <th>Link</th>
                        </tr>
                      </thead>
                      <tbody>
                        {comparaveis.map((comp) => (
                          <tr key={comp.id}>
                            <td>{comp.titulo || "—"}</td>
                            <td>{formatarMoeda(comp.preco)}</td>
                            <td>{comp.area_m2 ? `${formatarNumero(comp.area_m2)} m2` : "—"}</td>
                            <td>{comp.preco_m2 ? formatarMoeda(comp.preco_m2) : "—"}</td>
                            <td>{comp.quartos ?? "—"}</td>
                            <td>{comp.url ? <a className="prospects-link" href={comp.url} target="_blank" rel="noreferrer">Abrir</a> : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
        <div className="prospects-modal__footer prospects-modal__footer--auto">
          <button type="button" className="prospects-btn ghost prospects-btn--subtle" onClick={onClose}>Fechar</button>
          <button type="button" className="prospects-btn secondary prospects-btn--subtle" onClick={() => onAdicionarAoFunil(item)}>
            Levar para análise
          </button>
        </div>
      </div>
    </div>
  );
}

export function AvaliacaoDetalhadaModal({
  item,
  tab,
  aiAnalise,
  analiseDetalhada,
  analiseDetalhadaLoading,
  statusMessage,
  statusTone,
  statusAction,
  loading,
  sending,
  saving,
  matriculaLoading,
  enriquecimentoLoading,
  sinteseDraft,
  onSinteseDraftChange,
  mensagemDraft,
  onMensagemDraftChange,
  onTabChange,
  onClose,
  onEnviarMensagem,
  onGerarAnaliseInicial,
  onSalvarSintese,
  onSolicitarMatricula,
  onSolicitarEnriquecimento,
  onAbrirAnalise,
  canChat,
  getLeilaoResumo,
  getLeiloesInfo,
  getMapsUrl,
  getComparaveisLinks,
  normalizeComparableText,
  calcularDescontoExibicao,
  extrairEditalUrl,
  extrairProcessoNumero,
  getFonteLabel,
  formatarPercentual,
  formatarMoeda,
  formatarDataHoraCompacta,
  getMensagemPrefillAnalise,
  getAnaliseIaActionLabel,
  podeAnalisarMatricula,
}) {
  const [sinteseEditando, setSinteseEditando] = useState(false);

  useEffect(() => {
    setSinteseEditando(false);
  }, [item?.codigo]);

  if (!item) return null;

  const resumoLeilao = getLeilaoResumo(item);
  const leiloes = getLeiloesInfo(item);
  const mapsUrl = getMapsUrl(item);
  const comparaveis = getComparaveisLinks(item);
  const historico = aiAnalise?.historico_chat || [];
  const ultimaMensagem = historico.length ? historico[historico.length - 1] : null;
  const matriculaJaRepresentada = Boolean(
    ultimaMensagem
    && normalizeComparableText(ultimaMensagem.content) === normalizeComparableText(aiAnalise?.matricula_texto)
  );
  const historicoExpandido = aiAnalise?.matricula_texto && !matriculaJaRepresentada
    ? [...historico, { role: "assistant", content: aiAnalise.matricula_texto, kind: "matricula" }]
    : historico;
  const descontoExibicao = calcularDescontoExibicao(item);
  const quantidadeMensagens = historicoExpandido.length;
  const enderecoCompleto = [item.endereco, item.bairro].filter(Boolean).join(" - ");
  const valorReferencia = resumoLeilao?.valor ?? item.valor;
  const editalUrl = extrairEditalUrl(item.descricao);
  const processoNumero = extrairProcessoNumero(item.descricao);
  const fonteLabel = getFonteLabel(item.fonte);
  const avaliacaoAuto = item.avaliacaoAutomatica;
  const sinteseDisponivel = Boolean(`${sinteseDraft || ""}`.trim());
  const mostrarEditorSintese = sinteseEditando || !sinteseDisponivel;
  const tabs = [
    { key: "dados", label: "Dados" },
    { key: "enriquecimento", label: "Enriquecimento" },
    { key: "viabilidade", label: "Viabilidade" },
    { key: "matricula", label: "Matrícula" },
    { key: "ia", label: "IA" },
  ];
  const enriquecimentoDisponivel = Boolean(avaliacaoAuto);
  const matriculaDisponivel = Boolean(`${aiAnalise?.matricula_texto || ""}`.trim());
  const viabilidadeDisponivel = Boolean(analiseDetalhada?.calculos);
  const investimentoEstimadoEnriquecimento = avaliacaoAuto
    ? (avaliacaoAuto.custo_aquisicao_est || 0)
      + (avaliacaoAuto.custo_reforma_est || 0)
      + (avaliacaoAuto.custo_desocupacao_est || 0)
    : null;

  return (
    <div className="prospects-modal-backdrop" role="presentation">
      <div className="prospects-modal prospects-modal--wide prospects-modal--auto" role="dialog" aria-modal="true" aria-labelledby="avaliacao-detalhada-title">
        <div className="prospects-modal__header">
          <div className="prospects-modal__header-main">
            <div>
              <p className="prospects-eyebrow">Avaliação detalhada</p>
              <h3 id="avaliacao-detalhada-title" className="prospects-modal__title">Imóvel {item.codigo}</h3>
              <p className="prospects-subtitle prospects-subtitle--compact">
                Combine dados do leilão, análise financeira e conversa com IA em um único lugar.
              </p>
            </div>
            <button
              type="button"
              className="prospects-modal__close"
              onClick={onClose}
              aria-label="Fechar avaliação detalhada"
            >
              <CloseIcon />
            </button>
          </div>
        </div>
        <div className="prospects-modal__body">
          <div className="prospects-auto-hero">
            <div className="prospects-auto-hero__media">
              <ProspectGallery item={item} className="prospects-auto-hero__photo" />
            </div>
            <div className="prospects-auto-hero__summary">
              <div className="prospects-auto-hero__heading">
                <span className="prospects-auto-hero__eyebrow">{item.tipoImovel || "Imóvel"}</span>
                <h4>{[item.cidade, item.uf].filter(Boolean).join(" - ") || item.codigo}</h4>
                <p>{enderecoCompleto || "Endereço não informado"}</p>
              </div>
              <div className="prospects-capture-card__auto prospects-capture-card__auto--hero">
                {descontoExibicao !== null ? (
                  <span className="prospects-auto-badge is-discount">Desconto {formatarPercentual(descontoExibicao)}</span>
                ) : null}
                <span className="prospects-auto-badge is-event">{resumoLeilao?.label || "Sem evento"}</span>
                <span className="prospects-auto-badge is-value">{formatarMoeda(valorReferencia)}</span>
                {fonteLabel ? (
                  <span className={`prospects-auto-badge ${item.fonte === "tjdft_judicial" ? "is-judicial" : "is-source"}`.trim()}>{fonteLabel}</span>
                ) : null}
              </div>
              <div className="prospects-auto-hero__status-row">
                <span className="prospects-detail-status-chip">
                  <strong>Status</strong>
                  <span>{item.disponivel === undefined || item.disponivel === null ? "—" : item.disponivel ? "Disponível" : "Indisponível"}</span>
                </span>
                <span className="prospects-detail-status-chip">
                  <strong>Financeira</strong>
                  <span>{item.analiseSalva ? formatarPercentual(item.roiEsperadoPercentual) : "Pendente"}</span>
                </span>
                <span className="prospects-detail-status-chip">
                  <strong>IA</strong>
                  <span>{item.analiseIaSalva ? "Salva" : "Ainda não"}</span>
                </span>
              </div>
              <div className="prospects-auto-hero__decision-grid">
                <div className="prospects-auto-hero__decision-card prospects-auto-hero__decision-card--highlight">
                  <span>Valor de avaliação</span>
                  <strong>{formatarMoeda(item.valorAvaliacao)}</strong>
                </div>
                <div className="prospects-auto-hero__decision-card">
                  <span>Evento foco</span>
                  <strong>{resumoLeilao?.data ? formatarDataHoraCompacta(resumoLeilao.data) : "Não informado"}</strong>
                </div>
                <div className="prospects-auto-hero__decision-card">
                  <span>Financiamento</span>
                  <strong>{item.financia === undefined || item.financia === null ? "—" : item.financia ? "Aceita" : "Não aceita"}</strong>
                </div>
              </div>
              <div className="prospects-auto-hero__secondary">
                <div className="prospects-auto-hero__fact">
                  <span>Código</span>
                  <strong>{item.codigo}</strong>
                </div>
                {processoNumero ? (
                  <div className="prospects-auto-hero__fact">
                    <span>Processo</span>
                    <strong>{processoNumero}</strong>
                  </div>
                ) : null}
                <div className="prospects-auto-hero__fact">
                  <span>Leitura rápida</span>
                  <strong>{item.analiseSalva ? "Viabilidade registrada" : "Viabilidade pendente"}</strong>
                </div>
              </div>
              <div className="prospects-auto-hero__links">
                <div className="prospects-auto-hero__links-head">
                  <span className="prospects-ai-section__label">Ações rápidas</span>
                  <span className="prospects-auto-hero__links-hint">Abra só o que ajuda a decidir agora</span>
                </div>
                <div className="prospects-inline-links prospects-inline-links--detail">
                  <a className="prospects-inline-link" href={item.link} target="_blank" rel="noreferrer">
                    <ArrowUpRightIcon />
                    <span>Anúncio</span>
                  </a>
                  {mapsUrl ? (
                    <a className="prospects-inline-link" href={mapsUrl} target="_blank" rel="noreferrer">
                      <MapPinIcon />
                      <span>Google Maps</span>
                    </a>
                  ) : null}
                  {comparaveis.map((link) => (
                    <a key={`${item.codigo}-hero-${link.label}`} className="prospects-inline-link" href={link.url} target="_blank" rel="noreferrer">
                      <span>{link.label}</span>
                      <ArrowUpRightIcon />
                    </a>
                  ))}
                  {editalUrl ? (
                    <a className="prospects-inline-link prospects-inline-link--highlight" href={editalUrl} target="_blank" rel="noreferrer">
                      <span>Ver edital</span>
                      <ArrowUpRightIcon />
                    </a>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          <div className="prospects-detail-tabs" role="tablist" aria-label="Abas de avaliação detalhada">
            {tabs.map((tabItem) => (
              <button
                key={tabItem.key}
                type="button"
                className={`prospects-sort-chip ${tab === tabItem.key ? "is-active" : ""}`.trim()}
                onClick={() => onTabChange(tabItem.key)}
              >
                {tabItem.label}
              </button>
            ))}
          </div>

          {statusMessage ? (
            <div className={`prospects-inline-status is-${statusTone || "info"}`.trim()}>
              <span className="prospects-inline-status__content">{statusMessage}</span>
              {statusAction?.label ? (
                <button
                  type="button"
                  className="prospects-btn ghost prospects-btn--subtle prospects-inline-status__action"
                  onClick={statusAction.onClick}
                  disabled={statusAction.disabled}
                >
                  {statusAction.label}
                </button>
              ) : null}
            </div>
          ) : null}

          {tab === "dados" ? (
            <div className="prospects-ai-panel">
              <div className="prospects-auto-grid prospects-auto-grid--detail">
                <div className="prospects-auto-card">
                  <span>Valor avaliação</span>
                  <strong>{formatarMoeda(item.valorAvaliacao)}</strong>
                </div>
                <div className="prospects-auto-card">
                  <span>Valor de referência</span>
                  <strong>{formatarMoeda(item.valor)}</strong>
                </div>
                <div className="prospects-auto-card">
                  <span>Financiamento</span>
                  <strong>{item.financia === undefined || item.financia === null ? "—" : item.financia ? "Aceita" : "Não aceita"}</strong>
                </div>
                <div className="prospects-auto-card">
                  <span>Análise financeira</span>
                  <strong>{item.analiseSalva ? formatarPercentual(item.roiEsperadoPercentual) : "Não salva"}</strong>
                </div>
              </div>

              <div className="prospects-auto-comparaveis">
                <h4>Análise financeira manual</h4>
                {analiseDetalhadaLoading ? (
                  <p className="prospects-empty">Carregando resumo financeiro...</p>
                ) : analiseDetalhada?.calculos ? (
                  <>
                    {getMensagemPrefillAnalise(analiseDetalhada?.meta) ? (
                      <p className="prospects-modal__hint">
                        {getMensagemPrefillAnalise(analiseDetalhada.meta)}
                      </p>
                    ) : null}
                    <div className="prospects-auto-grid prospects-auto-grid--detail">
                      <div className="prospects-auto-card">
                        <span>Capital investido</span>
                        <strong>{formatarMoeda(analiseDetalhada.calculos.capital_investido_estimado)}</strong>
                      </div>
                      <div className="prospects-auto-card">
                        <span>Custo total</span>
                        <strong>{formatarMoeda(analiseDetalhada.calculos.custo_total_imovel)}</strong>
                      </div>
                      <div className="prospects-auto-card">
                        <span>Lucro esperado</span>
                        <strong>{formatarMoeda(analiseDetalhada.calculos.lucro_esperado_valor)}</strong>
                      </div>
                      <div className="prospects-auto-card">
                        <span>ROI estimado</span>
                        <strong>{formatarPercentual(analiseDetalhada.calculos.roi_esperado_percentual)}</strong>
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="prospects-empty">Nenhuma análise financeira disponível.</p>
                )}
              </div>

              {avaliacaoAuto ? (
                <div className="prospects-auto-comparaveis">
                  <h4>Enriquecimentos automáticos</h4>
                  <div className="prospects-auto-grid prospects-auto-grid--detail">
                    <div className="prospects-auto-card">
                      <span>Fonte de comparáveis</span>
                      <strong>{avaliacaoAuto.fonte_pesquisa || "—"}</strong>
                    </div>
                    <div className="prospects-auto-card">
                      <span>Preço m² da região</span>
                      <strong>{formatarMoeda(avaliacaoAuto.preco_m2_regiao)}</strong>
                    </div>
                    <div className="prospects-auto-card">
                      <span>Score automático</span>
                      <strong>{avaliacaoAuto.score_total ?? "—"}/85</strong>
                    </div>
                    <div className="prospects-auto-card">
                      <span>ROI estimado</span>
                      <strong>{formatarPercentual(avaliacaoAuto.retorno_pct)}</strong>
                    </div>
                  </div>
                  {avaliacaoAuto.resumo_ia ? (
                    <>
                      <h5 className="prospects-subsection-title">Resumo automático</h5>
                      <TextoEstruturado texto={avaliacaoAuto.resumo_ia} />
                    </>
                  ) : null}
                </div>
              ) : null}

              <div className="prospects-auto-comparaveis">
                <h4>Detalhes do imóvel</h4>
                <DetalhesTexto texto={item.descricao} className="prospects-detail-text" />
              </div>

              <div className="prospects-auto-comparaveis">
                <h4>Cenários de leilão</h4>
                <div className="prospects-leiloes-timeline">
                  {leiloes.length ? leiloes.map((entry) => (
                    <div key={`${item.codigo}-${entry.label}`} className="prospects-leilao-card">
                      <span>{entry.label}</span>
                      <strong>{formatarDataHoraCompacta(entry.data)}</strong>
                      <p>{entry.valor === null || entry.valor === undefined ? "Valor não informado" : formatarMoeda(entry.valor)}</p>
                    </div>
                  )) : (
                    <p className="prospects-empty">Nenhum cenário de leilão disponível.</p>
                  )}
                </div>
              </div>
            </div>
          ) : null}

          {tab === "enriquecimento" ? (
            <div className="prospects-ai-panel">
              <section className="prospects-ai-section">
                <div className="prospects-ai-section__header prospects-ai-section__header--row">
                  <div>
                    <span className="prospects-ai-section__label">Leitura automática do imóvel</span>
                    <p>Veja score, ROI, custos estimados e resumo automático sem depender da conversa com a IA.</p>
                  </div>
                  <div className="prospects-ai-summary__actions">
                    <button
                      type="button"
                      className={`prospects-btn secondary prospects-btn--subtle ${avaliacaoAuto ? "is-active" : ""}`.trim()}
                      onClick={onSolicitarEnriquecimento}
                      disabled={!canChat || loading || sending || matriculaLoading || enriquecimentoLoading}
                    >
                      {enriquecimentoLoading ? "Processando enriquecimento..." : avaliacaoAuto ? "Reenriquecer" : "Enriquecer"}
                    </button>
                    <button type="button" className="prospects-btn ghost prospects-btn--subtle" onClick={() => onTabChange("dados")}>
                      Ver dados do imóvel
                    </button>
                  </div>
                </div>

                {enriquecimentoDisponivel ? (
                  <>
                    <div className="prospects-auto-grid prospects-auto-grid--detail">
                      <div className="prospects-auto-card">
                        <span>Fonte de comparáveis</span>
                        <strong>{avaliacaoAuto.fonte_pesquisa || "—"}</strong>
                      </div>
                      <div className="prospects-auto-card">
                        <span>Preço m² da região</span>
                        <strong>{formatarMoeda(avaliacaoAuto.preco_m2_regiao)}</strong>
                      </div>
                      <div className="prospects-auto-card">
                        <span>Venda estimada</span>
                        <strong>{formatarMoeda(avaliacaoAuto.valor_estimado_venda)}</strong>
                      </div>
                      <div className="prospects-auto-card">
                        <span>Lucro estimado</span>
                        <strong>{formatarMoeda(avaliacaoAuto.lucro_estimado)}</strong>
                      </div>
                      <div className="prospects-auto-card">
                        <span>Investimento estimado</span>
                        <strong>{formatarMoeda(investimentoEstimadoEnriquecimento)}</strong>
                      </div>
                      <div className="prospects-auto-card">
                        <span>ROI estimado</span>
                        <strong>{formatarPercentual(avaliacaoAuto.retorno_pct)}</strong>
                      </div>
                      <div className="prospects-auto-card">
                        <span>Score automático</span>
                        <strong>{avaliacaoAuto.score_total ?? "—"}/85</strong>
                      </div>
                      <div className="prospects-auto-card">
                        <span>Pesquisado em</span>
                        <strong>{avaliacaoAuto.pesquisado_em ? formatarDataHoraCompacta(avaliacaoAuto.pesquisado_em) : "—"}</strong>
                      </div>
                    </div>
                    {avaliacaoAuto.resumo_ia ? (
                      <div className="prospects-auto-comparaveis">
                        <h4>Resumo automático</h4>
                        <TextoEstruturado texto={avaliacaoAuto.resumo_ia} />
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="prospects-ai-loading-card">
                    <strong>Nenhum enriquecimento disponível ainda</strong>
                    <p>Rode o enriquecimento para trazer score, comparáveis, custos estimados e uma leitura automática inicial deste imóvel.</p>
                  </div>
                )}
              </section>
            </div>
          ) : null}

          {tab === "viabilidade" ? (
            <div className="prospects-ai-panel">
              <section className="prospects-ai-section">
                <div className="prospects-ai-section__header prospects-ai-section__header--row">
                  <div>
                    <span className="prospects-ai-section__label">Viabilidade financeira</span>
                    <p>Aqui fica a leitura manual e a decisão econômica consolidada para este imóvel.</p>
                  </div>
                  <div className="prospects-ai-summary__actions">
                    <button type="button" className="prospects-btn secondary prospects-btn--subtle" onClick={() => onAbrirAnalise(item)}>
                      {viabilidadeDisponivel ? "Editar análise financeira" : "Preencher análise financeira"}
                    </button>
                  </div>
                </div>

                {analiseDetalhadaLoading ? (
                  <p className="prospects-empty">Carregando resumo financeiro...</p>
                ) : viabilidadeDisponivel ? (
                  <>
                    {getMensagemPrefillAnalise(analiseDetalhada?.meta) ? (
                      <p className="prospects-modal__hint">
                        {getMensagemPrefillAnalise(analiseDetalhada.meta)}
                      </p>
                    ) : null}
                    <div className="prospects-auto-grid prospects-auto-grid--detail">
                      <div className="prospects-auto-card">
                        <span>Capital investido</span>
                        <strong>{formatarMoeda(analiseDetalhada.calculos.capital_investido_estimado)}</strong>
                      </div>
                      <div className="prospects-auto-card">
                        <span>Custo total</span>
                        <strong>{formatarMoeda(analiseDetalhada.calculos.custo_total_imovel)}</strong>
                      </div>
                      <div className="prospects-auto-card">
                        <span>Lucro esperado</span>
                        <strong>{formatarMoeda(analiseDetalhada.calculos.lucro_esperado_valor)}</strong>
                      </div>
                      <div className="prospects-auto-card">
                        <span>ROI estimado</span>
                        <strong>{formatarPercentual(analiseDetalhada.calculos.roi_esperado_percentual)}</strong>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="prospects-ai-loading-card">
                    <strong>Nenhuma análise financeira disponível</strong>
                    <p>Abra a viabilidade para registrar custos, valor de venda, capital investido e ROI esperado deste imóvel.</p>
                  </div>
                )}
              </section>
            </div>
          ) : null}

          {tab === "matricula" ? (
            <div className="prospects-ai-panel">
              <section className="prospects-ai-section">
                <div className="prospects-ai-section__header prospects-ai-section__header--row">
                  <div>
                    <span className="prospects-ai-section__label">Leitura da matrícula</span>
                    <p>Use esta aba para consultar ou atualizar a matrícula sem misturar esse conteúdo com a conversa principal da IA.</p>
                  </div>
                  <div className="prospects-ai-summary__actions">
                    {podeAnalisarMatricula(item) ? (
                      <button
                        type="button"
                        className="prospects-btn secondary prospects-btn--subtle"
                        onClick={onSolicitarMatricula}
                        disabled={!canChat || loading || sending || matriculaLoading || enriquecimentoLoading}
                      >
                        {matriculaLoading ? "Processando matrícula..." : matriculaDisponivel ? "Atualizar matrícula" : "Analisar matrícula"}
                      </button>
                    ) : null}
                    <button type="button" className="prospects-btn ghost prospects-btn--subtle" onClick={() => onTabChange("ia")}>
                      Ver conversa da IA
                    </button>
                  </div>
                </div>

                {!podeAnalisarMatricula(item) ? (
                  <div className="prospects-ai-loading-card">
                    <strong>Matrícula indisponível para este imóvel</strong>
                    <p>A leitura automática de matrícula está liberada apenas para imóveis da Caixa neste momento.</p>
                  </div>
                ) : matriculaDisponivel ? (
                  <div className="prospects-auto-comparaveis">
                    <TextoEstruturado texto={aiAnalise.matricula_texto} />
                  </div>
                ) : (
                  <div className="prospects-ai-loading-card">
                    <strong>Nenhuma matrícula analisada ainda</strong>
                    <p>Quando você rodar a matrícula, o resultado fica salvo aqui para consulta rápida.</p>
                  </div>
                )}
              </section>
            </div>
          ) : null}

          {tab === "ia" ? (
            <div className="prospects-ai-panel">
              <div className="prospects-ai-toolbar">
                <div className="prospects-ai-toolbar__group">
                  <span className="prospects-ai-toolbar__label">Contexto</span>
                  <div className="prospects-ai-toolbar__meta">
                    <span className="prospects-indicator-chip is-automatica">
                      <SparklesIcon />
                      <span>{quantidadeMensagens} interações</span>
                    </span>
                    {aiAnalise?.updated_at ? (
                      <span className="prospects-indicator-chip is-ia">
                        <span>Atualizado em {formatarDataHoraCompacta(aiAnalise.updated_at)}</span>
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="prospects-ai-toolbar__group prospects-ai-toolbar__group--actions">
                  <span className="prospects-ai-toolbar__label">Processar</span>
                  <div className="prospects-ai-toolbar__actions">
                    {canChat ? (
                      <button
                        type="button"
                        className="prospects-btn primary prospects-btn--subtle"
                        onClick={onGerarAnaliseInicial}
                        disabled={loading || sending || matriculaLoading || enriquecimentoLoading}
                      >
                        {loading || sending ? "Processando IA..." : getAnaliseIaActionLabel(item)}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className={`prospects-btn secondary prospects-btn--subtle ${avaliacaoAuto ? "is-active" : ""}`.trim()}
                      onClick={onSolicitarEnriquecimento}
                      disabled={!canChat || loading || sending || matriculaLoading || enriquecimentoLoading}
                    >
                      {enriquecimentoLoading ? "Processando enriquecimento..." : avaliacaoAuto ? "Reenriquecer" : "Enriquecer"}
                    </button>
                    {podeAnalisarMatricula(item) ? (
                      <button
                        type="button"
                        className="prospects-btn secondary prospects-btn--subtle"
                        onClick={onSolicitarMatricula}
                        disabled={!canChat || loading || sending || matriculaLoading || enriquecimentoLoading}
                      >
                        {matriculaLoading ? "Processando matrícula..." : "Analisar matrícula"}
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className="prospects-ai-toolbar__group prospects-ai-toolbar__group--utility">
                  <span className="prospects-ai-toolbar__label">Navegação</span>
                  <div className="prospects-ai-toolbar__actions">
                    <button
                      type="button"
                      className="prospects-btn ghost prospects-btn--subtle"
                      onClick={() => onTabChange("dados")}
                    >
                      Ver dados do imóvel
                    </button>
                    <button type="button" className="prospects-btn ghost prospects-btn--subtle" onClick={() => onTabChange("viabilidade")}>
                      Ver viabilidade
                    </button>
                    <button type="button" className="prospects-btn ghost prospects-btn--subtle" onClick={onClose}>
                      Fechar
                    </button>
                  </div>
                </div>
              </div>
              {loading ? (
                <div className="prospects-ai-loading-card">
                  <strong>Preparando a pré-análise por IA</strong>
                  <p>Estamos carregando o histórico e, quando necessário, iniciando a avaliação automática deste imóvel.</p>
                </div>
              ) : (
                <>
                  <section className="prospects-ai-section">
                    <div className="prospects-ai-section__header">
                      <span className="prospects-ai-section__label">Leitura principal da análise</span>
                    </div>
                    <div className="prospects-ai-chat">
                      {historicoExpandido.length ? historicoExpandido.map((mensagem, index) => (
                        <div key={`${mensagem.role}-${mensagem.kind || "chat"}-${index}`} className={`prospects-ai-bubble is-${mensagem.role || "assistant"} ${mensagem.kind === "matricula" ? "is-matricula" : ""}`.trim()}>
                          <span>{mensagem.kind === "matricula" ? "Matrícula" : mensagem.role === "user" ? "Você" : "IA"}</span>
                          <TextoEstruturado texto={mensagem.content || "—"} />
                        </div>
                      )) : (
                        <p className="prospects-empty">Nenhuma análise salva ainda. Ao abrir o chat, a avaliação inicial será gerada automaticamente.</p>
                      )}
                    </div>
                  </section>

                  <section className="prospects-ai-summary">
                    <div className="prospects-ai-section__header prospects-ai-section__header--row">
                      <span className="prospects-ai-section__label">
                        {mostrarEditorSintese ? "Editar síntese" : "Síntese da análise"}
                      </span>
                      {sinteseDisponivel ? (
                        <button
                          type="button"
                          className="prospects-btn ghost prospects-btn--subtle"
                          onClick={() => setSinteseEditando((prev) => !prev)}
                        >
                          {mostrarEditorSintese ? "Ver formatada" : "Editar síntese"}
                        </button>
                      ) : null}
                    </div>
                    {mostrarEditorSintese ? (
                      <label className="prospects-form-field">
                        <span>Síntese da análise</span>
                        <textarea
                          rows={5}
                          value={sinteseDraft}
                          onChange={(e) => onSinteseDraftChange(e.target.value)}
                          placeholder="Resumo manual do que ficou decidido para este imóvel"
                        />
                      </label>
                    ) : (
                      <div className="prospects-ai-summary__preview">
                        <TextoEstruturado texto={sinteseDraft} />
                      </div>
                    )}
                    <div className="prospects-ai-summary__actions">
                      {mostrarEditorSintese ? (
                        <button type="button" className="prospects-btn primary prospects-btn--subtle" onClick={onSalvarSintese} disabled={saving}>
                          {saving ? "Salvando..." : "Salvar síntese"}
                        </button>
                      ) : null}
                      <button type="button" className="prospects-btn secondary prospects-btn--subtle" onClick={() => onAbrirAnalise(item)}>
                        Editar análise financeira
                      </button>
                    </div>
                    {podeAnalisarMatricula(item) ? null : (
                      <span className="prospects-modal__hint">Análise de matrícula disponível apenas para imóveis da Caixa.</span>
                    )}
                  </section>

                  {canChat ? (
                    <section className="prospects-ai-composer">
                      <div className="prospects-ai-section__header">
                        <span className="prospects-ai-section__label">Pergunta complementar</span>
                        <p>Use uma nova pergunta só quando precisar expandir a análise já consolidada acima.</p>
                      </div>
                      <label className="prospects-form-field">
                        <span>Pergunta para a IA</span>
                        <textarea
                          rows={3}
                          value={mensagemDraft}
                          onChange={(e) => onMensagemDraftChange(e.target.value)}
                          placeholder="Ex.: quais os maiores riscos deste imóvel?"
                        />
                      </label>
                      <button type="button" className="prospects-btn primary prospects-btn--subtle" onClick={onEnviarMensagem} disabled={sending || !mensagemDraft.trim()}>
                        {sending ? "Enviando..." : "Enviar"}
                      </button>
                    </section>
                  ) : (
                    <p className="prospects-modal__hint">Seu usuário pode visualizar o histórico salvo, mas não enviar novas mensagens para a IA. Se esse acesso já foi liberado pelo administrador, entre novamente para atualizar a sessão.</p>
                  )}
                </>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
