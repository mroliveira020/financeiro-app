import React, { useEffect, useState } from "react";
import {
  ProspectGallery,
  DetalhesTexto,
  NoteIcon,
  UsersIcon,
  PriorityIcon,
  ChartIcon,
  TrashIcon,
  EyeIcon,
  ArrowLeftIcon,
  MoreIcon,
  ArrowUpRightIcon,
  MapPinIcon,
  SparklesIcon,
} from "./ProspeccoesShared";

const toFiniteNumber = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const getInvestimentoTotalEstimado = (avaliacao) => {
  if (!avaliacao) return null;
  const valores = [
    toFiniteNumber(avaliacao.custo_aquisicao_est),
    toFiniteNumber(avaliacao.custo_reforma_est),
    toFiniteNumber(avaliacao.custo_desocupacao_est),
  ].filter((value) => value !== null);
  if (!valores.length) return null;
  return valores.reduce((total, value) => total + value, 0);
};

export function TabelaSelecionados({
  dados,
  loading,
  erro,
  onExcluir,
  onReativar,
  onAcionarAnaliseIa,
  onEditarObservacoes,
  onAbrirAnalise,
  onAbrirEnriquecimentos,
  onEditarResponsaveis,
  onEditarPrioridade,
  onIncluirManual,
  removeLoadingIds,
  updateLoadingIds,
  canDeleteItem,
  canOperateItem,
  canManageResponsaveis,
  canReactivateItem,
  collapsed,
  onToggleCollapse,
  sortLabel,
  getLeilaoResumo,
  getMapsUrl,
  getComparaveisLinks,
  isSelecionadoAtivo,
  formatarDataHoraCompacta,
  formatarMoeda,
  resumirObservacao,
  obterClasseRoi,
  formatarPercentual,
  getAnaliseIaActionLabel,
}) {
  const [openActionMenuCodigo, setOpenActionMenuCodigo] = useState(null);

  useEffect(() => {
    if (!openActionMenuCodigo) return undefined;
    const handlePointerDown = (event) => {
      if (event.target.closest("[data-row-menu-root='true']")) return;
      setOpenActionMenuCodigo(null);
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [openActionMenuCodigo]);

  if (loading) return <div className="prospects-card"><p className="prospects-empty">Carregando selecionados...</p></div>;
  if (erro) return <div className="prospects-card"><p className="prospects-empty">Erro ao carregar selecionados: {erro}</p></div>;

  return (
    <div className="prospects-card">
      <div className="prospects-card__header">
        <div>
          <p className="prospects-eyebrow">Fila de decisão</p>
          <h2 className="prospects-title">Itens da fila</h2>
          <p className="prospects-subtitle prospects-subtitle--compact">{sortLabel}</p>
        </div>
        <div className="prospects-card__header-actions">
          <span className="prospects-pill">{dados.length} imóveis</span>
          {onIncluirManual ? (
            <button type="button" className="prospects-btn tertiary prospects-btn--toolbar" onClick={onIncluirManual}>
              Adicionar manual
            </button>
          ) : null}
          <button
            type="button"
            className="prospects-visibility-btn"
            onClick={onToggleCollapse}
            title={collapsed ? "Mostrar selecionados" : "Ocultar selecionados"}
            aria-label={collapsed ? "Mostrar selecionados" : "Ocultar selecionados"}
            aria-pressed={collapsed}
          >
            <EyeIcon closed={collapsed} />
          </button>
        </div>
      </div>
      {!dados.length && <p className="prospects-empty">Nenhum item da fila encontrado.</p>}
      {!dados.length || collapsed ? null : (
        <div className="prospects-table-wrap">
          <table className="prospects-table">
            <thead>
              <tr>
                <th>Código</th>
                <th className="prospects-col-city">Cidade / UF</th>
                <th>Data leilão</th>
                <th>Valor máximo</th>
                <th>Valor referência</th>
                <th className="prospects-col-description">Descrição</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {dados.map((item) => {
                const resumoLeilao = getLeilaoResumo(item);
                const mapsUrl = getMapsUrl(item);
                const comparaveis = getComparaveisLinks(item);
                const itemAtivo = isSelecionadoAtivo(item);
                const podeOperar = itemAtivo && canOperateItem(item);
                const podeExcluir = itemAtivo && canDeleteItem(item);
                const podeReativar = !itemAtivo && canReactivateItem(item);
                const podeGerenciarResponsaveis = itemAtivo && canManageResponsaveis;
                const actionMenuAberto = openActionMenuCodigo === item.codigo;
                const responsaveisResumo = (() => {
                  const pessoas = [];
                  const seen = new Set();
                  const addPessoa = (id, label, suffix = "") => {
                    const normalizedId = id ? String(id) : "";
                    const normalizedLabel = `${label || ""}`.trim();
                    const key = normalizedId || normalizedLabel.toLowerCase();
                    if (!key || seen.has(key)) return;
                    seen.add(key);
                    pessoas.push(`${normalizedLabel}${suffix}`);
                  };
                  addPessoa(item.createdBy, item.createdByName, item.createdByName ? " (selecionou)" : "");
                  (item.responsaveis || []).forEach((responsavel) => {
                    addPessoa(responsavel.id, responsavel.name || responsavel.email);
                  });
                  return pessoas.length ? pessoas.join(", ") : "Sem responsáveis definidos.";
                })();

                return (
                  <tr key={item.codigo}>
                    <td className="mono">
                      <a className="prospects-link" href={item.link} target="_blank" rel="noreferrer">
                        {item.codigo}
                      </a>
                    </td>
                    <td className="prospects-col-city">
                      <div className="prospects-city-cell">
                        <strong>{item.cidade && item.uf ? `${item.cidade}/${item.uf}` : item.cidade || item.uf || "—"}</strong>
                        <div className="prospects-table-indicators">
                          {item.analiseSalva ? (
                            <span className="prospects-indicator-chip is-financeira" title="Análise financeira salva">
                              <ChartIcon />
                              <span>Financeira</span>
                            </span>
                          ) : null}
                          {item.avaliacaoAutomatica ? (
                            <span className="prospects-indicator-chip is-automatica" title="Pré-análise automática disponível">
                              <SparklesIcon />
                              <span>Pré-análise</span>
                            </span>
                          ) : null}
                          {item.analiseIaSalva ? (
                            <span className="prospects-indicator-chip is-ia" title="Avaliação IA salva">
                              <SparklesIcon />
                              <span>IA salva</span>
                            </span>
                          ) : null}
                          {!itemAtivo ? (
                            <span className="prospects-indicator-chip is-inactive" title="Item fora da fila ativa">
                              <span>Inativo</span>
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="prospects-date-cell">
                        <strong>{formatarDataHoraCompacta(resumoLeilao?.data || item.dataLeilao)}</strong>
                        <span>{resumoLeilao?.label || "Data principal"}</span>
                        {resumoLeilao?.valor !== null && resumoLeilao?.valor !== undefined ? (
                          <span>{formatarMoeda(resumoLeilao.valor)}</span>
                        ) : null}
                      </div>
                    </td>
                    <td>{formatarMoeda(item.valorMaximo)}</td>
                    <td>{item.valor ? formatarMoeda(item.valor) : "—"}</td>
                    <td className="prospects-col-description">
                      <div className="prospects-description-cell" title={item.descricao || "—"}>
                        {item.descricao || "—"}
                      </div>
                      {item.observacoes ? (
                        <div className="prospects-note-snippet" title={item.observacoes}>
                          <span>Observação atual</span>
                          <strong>{resumirObservacao(item.observacoes)}</strong>
                        </div>
                      ) : null}
                      <div className="prospects-inline-links">
                        {mapsUrl ? (
                          <a className="prospects-inline-link" href={mapsUrl} target="_blank" rel="noreferrer">
                            <MapPinIcon />
                            <span>Mapa</span>
                          </a>
                        ) : null}
                        {comparaveis.map((link) => (
                          <a key={`${item.codigo}-${link.label}`} className="prospects-inline-link" href={link.url} target="_blank" rel="noreferrer">
                            <span>{link.label}</span>
                            <ArrowUpRightIcon />
                          </a>
                        ))}
                      </div>
                    </td>
                    <td>
                      <div className="prospects-row-actions">
                        <button
                          type="button"
                          className={`prospects-table-icon-btn prospects-table-icon-btn--note ${item.observacoes ? "has-note" : "is-empty"}`}
                          title={
                            !podeOperar
                              ? "Somente admin, autor ou responsável atribuído podem editar este imóvel"
                              : item.observacoes || "Nenhuma observação cadastrada."
                          }
                          onClick={() => onEditarObservacoes(item)}
                          disabled={updateLoadingIds.has(`${item.codigo}:observacoes`) || !podeOperar}
                        >
                          <NoteIcon />
                        </button>
                        <button
                          type="button"
                          className={`prospects-table-icon-btn prospects-table-icon-btn--analysis ${item.analiseSalva ? obterClasseRoi(item.roiEsperadoPercentual) : "is-neutral"}`}
                          title={
                            !podeOperar
                              ? "Somente admin, autor ou responsável atribuído podem editar este imóvel"
                              : item.analiseSalva
                                ? `Abrir análise financeira. ROI: ${formatarPercentual(item.roiEsperadoPercentual)}`
                                : "Abrir ficha de viabilidade"
                          }
                          onClick={() => onAbrirAnalise(item)}
                          disabled={!podeOperar}
                        >
                          <ChartIcon />
                        </button>
                        <div className="prospects-row-menu" data-row-menu-root="true">
                          <button
                            type="button"
                            className={`prospects-table-icon-btn prospects-table-icon-btn--menu ${actionMenuAberto ? "is-active" : ""}`.trim()}
                            title="Mais ações"
                            aria-label={`Mais ações do imóvel ${item.codigo}`}
                            aria-expanded={actionMenuAberto}
                            onClick={() => setOpenActionMenuCodigo((prev) => (prev === item.codigo ? null : item.codigo))}
                          >
                            <MoreIcon />
                          </button>
                          {actionMenuAberto ? (
                            <div className="prospects-row-menu__panel" role="menu" aria-label={`Ações do imóvel ${item.codigo}`}>
                              {mapsUrl ? (
                                <a
                                  className="prospects-row-menu__item"
                                  href={mapsUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  role="menuitem"
                                  onClick={() => setOpenActionMenuCodigo(null)}
                                >
                                  <MapPinIcon />
                                  <span>Abrir no mapa</span>
                                </a>
                              ) : null}
                              <button
                                type="button"
                                className="prospects-row-menu__item"
                                onClick={() => {
                                  setOpenActionMenuCodigo(null);
                                  onEditarPrioridade(item);
                                }}
                                disabled={updateLoadingIds.has(`${item.codigo}:prioridade`) || !podeOperar}
                              >
                                <PriorityIcon level={Number(item.prioridade || 2)} />
                                <span>Editar prioridade</span>
                              </button>
                              <button
                                type="button"
                                className="prospects-row-menu__item"
                                title={podeGerenciarResponsaveis ? `${responsaveisResumo} Clique para editar responsáveis.` : responsaveisResumo}
                                onClick={() => {
                                  setOpenActionMenuCodigo(null);
                                  if (podeGerenciarResponsaveis) onEditarResponsaveis(item);
                                }}
                                disabled={!itemAtivo}
                              >
                                <UsersIcon />
                                <span>{podeGerenciarResponsaveis ? "Editar responsáveis" : "Ver responsáveis"}</span>
                              </button>
                              <button
                                type="button"
                                className="prospects-row-menu__item"
                                onClick={() => {
                                  setOpenActionMenuCodigo(null);
                                  if (item.avaliacaoAutomatica) onAbrirEnriquecimentos(item);
                                }}
                                disabled={!item.avaliacaoAutomatica || !itemAtivo}
                              >
                                <SparklesIcon />
                                <span>Ver enriquecimentos</span>
                              </button>
                              <button
                                type="button"
                                className="prospects-row-menu__item"
                                aria-label={`${getAnaliseIaActionLabel(item)} do imóvel ${item.codigo}`}
                                onClick={() => {
                                  setOpenActionMenuCodigo(null);
                                  onAcionarAnaliseIa(item);
                                }}
                                disabled={!itemAtivo}
                              >
                                <SparklesIcon />
                                <span>{getAnaliseIaActionLabel(item)}</span>
                              </button>
                              {podeReativar ? (
                                <button
                                  type="button"
                                  className="prospects-row-menu__item"
                                  title={item.inativadoPorName ? `Reativar item removido por ${item.inativadoPorName}` : "Reativar item"}
                                  disabled={updateLoadingIds.has(`${item.codigo}:reativar`)}
                                  onClick={() => {
                                    setOpenActionMenuCodigo(null);
                                    onReativar(item);
                                  }}
                                >
                                  <ArrowLeftIcon />
                                  <span>Reativar item</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="prospects-row-menu__item is-danger"
                                  title={podeExcluir ? "Remover da fila" : "Apenas o autor da seleção ou um administrador pode remover este imóvel"}
                                  disabled={removeLoadingIds.has(item.codigo) || !podeExcluir}
                                  onClick={() => {
                                    setOpenActionMenuCodigo(null);
                                    onExcluir(item);
                                  }}
                                >
                                  <TrashIcon />
                                  <span>{removeLoadingIds.has(item.codigo) ? "Removendo..." : "Remover da fila"}</span>
                                </button>
                              )}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function TabelaCapturados({
  dados,
  total,
  page,
  pageSize,
  loading,
  erro,
  onIncluir,
  includeLoadingIds,
  onPageChange,
  sortBy,
  sortDir,
  onSortChange,
  selectedCodes,
  onAbrirAvaliacaoDetalhada,
  getLeilaoResumo,
  calcularDescontoExibicao,
  getMapsUrl,
  getComparaveisLinks,
  extrairEditalUrl,
  getFonteLabel,
  extrairProcessoNumero,
  formatarPercentual,
  formatarMoeda,
  formatarDataHoraCompacta,
  getScoreClasse,
  getRoiClasse,
}) {
  if (loading) return <div className="prospects-card"><p className="prospects-empty">Carregando capturados...</p></div>;
  if (erro) return <div className="prospects-card"><p className="prospects-empty">Erro ao carregar capturados: {erro}</p></div>;

  const totalPages = Math.max(1, Math.ceil((total || 0) / pageSize));
  const isEmpty = !dados.length;
  const renderSort = (key, label) => {
    const isActive = sortBy === key;
    const arrow = isActive ? (sortDir === "asc" ? "▲" : "▼") : "";
    const handleSort = () => {
      const nextDir = isActive && sortDir === "asc" ? "desc" : "asc";
      onSortChange(key, nextDir);
    };
    return (
      <button
        type="button"
        className={`prospects-sort-chip ${isActive ? "is-active" : ""}`.trim()}
        onClick={handleSort}
        aria-pressed={isActive}
      >
        <span>{label}</span>
        <strong>{arrow || "↕"}</strong>
      </button>
    );
  };

  const renderRange = () => {
    if (!total) return "0 de 0";
    const start = (page - 1) * pageSize + 1;
    const end = Math.min(page * pageSize, total);
    return `${start} – ${end} de ${total}`;
  };

  return (
    <div className="prospects-card">
      <div className="prospects-card__header">
        <div>
          <p className="prospects-eyebrow">Última coleta</p>
          <h2 className="prospects-title">Capturados</h2>
          <p className="prospects-subtitle prospects-subtitle--compact">
            Visualização em cards com foto, resumo financeiro e dados principais do imóvel.
          </p>
        </div>
        <span className="prospects-pill">{total} registros</span>
      </div>
      <div className="prospects-card-grid">
        <div className="prospects-card-grid__toolbar">
          {renderSort("codigo", "Código")}
          {renderSort("cidade", "Cidade")}
          {renderSort("uf", "UF")}
          {renderSort("modalidade", "Modalidade")}
          {renderSort("valor_minimo", "Valor")}
          {renderSort("ultima_disputa", "Última disputa")}
        </div>

        {isEmpty ? (
          <p className="prospects-empty">Nenhum capturado encontrado.</p>
        ) : dados.map((item) => {
          const jaSelecionado = selectedCodes.has(item.codigo);
          const enderecoCompacto = [item.endereco, item.bairro].filter(Boolean).join(" - ");
          const resumoLeilao = getLeilaoResumo(item);
          const descontoExibicao = calcularDescontoExibicao(item);
          const avaliacao = item.avaliacaoAutomatica;
          const investimentoEstimadoAutomatico = getInvestimentoTotalEstimado(avaliacao);
          const investimentoEstimadoManual = toFiniteNumber(item.capitalInvestidoEstimado);
          const investimentoTotalEstimado = investimentoEstimadoManual ?? investimentoEstimadoAutomatico;
          const roiEstimadoManual = toFiniteNumber(item.roiEsperadoPercentual);
          const roiEstimadoAutomatico = toFiniteNumber(avaliacao?.retorno_pct);
          const roiEstimadoDisponivel = roiEstimadoManual ?? roiEstimadoAutomatico;
          const mapsUrl = getMapsUrl(item);
          const comparaveis = getComparaveisLinks(item);
          const editalUrl = extrairEditalUrl(item.descricao);
          const fonteLabel = getFonteLabel(item.fonte);
          const processoNumero = extrairProcessoNumero(item.descricao);
          const situacaoNormalizada = `${item.situacao || ""}`.trim().toLowerCase();
          const mostrarSituacao = Boolean(
            situacaoNormalizada
            && !["disponivel", "disponível"].includes(situacaoNormalizada)
          );
          return (
            <article key={item.codigo} className="prospects-capture-card">
              <div className="prospects-capture-card__media">
                <ProspectGallery item={item} className="prospects-capture-card__photo" />
                <div className="prospects-capture-card__badges">
                  <span className="prospects-chip">{item.modalidade || "Sem modalidade"}</span>
                  {fonteLabel ? <span className={`prospects-chip ${item.fonte === "tjdft_judicial" ? "prospects-chip--judicial" : "prospects-chip--source"}`.trim()}>{fonteLabel}</span> : null}
                  {jaSelecionado ? <span className="prospects-chip prospects-chip--selected">Na fila</span> : null}
                </div>
                {descontoExibicao !== null ? (
                  <div className="prospects-capture-card__discount">
                    {formatarPercentual(descontoExibicao)}
                  </div>
                ) : null}
              </div>

              <div className="prospects-capture-card__body">
                <div className="prospects-capture-card__headline">
                  <span className="prospects-capture-card__type">{item.tipoImovel || "Imóvel"}</span>
                  <a className="prospects-link mono" href={item.link} target="_blank" rel="noreferrer">
                    {item.codigo}
                  </a>
                </div>
                <h3 className="prospects-capture-card__location">
                  {[item.cidade, item.uf].filter(Boolean).join(" - ") || "Sem localização"}
                </h3>
                <p className="prospects-capture-card__address">
                  {enderecoCompacto || "Endereço não informado"}
                </p>

                {mostrarSituacao ? (
                  <div className="prospects-capture-card__facts">
                    <span>{item.situacao}</span>
                  </div>
                ) : null}

                <div className="prospects-capture-card__meta-grid">
                  <div className="prospects-capture-card__meta-item">
                    <span>Valor avaliação</span>
                    <strong>{formatarMoeda(item.valorAvaliacao)}</strong>
                  </div>
                  <div className="prospects-capture-card__meta-item">
                    <span>{resumoLeilao?.label || "Evento"}</span>
                    <strong>{resumoLeilao?.data ? formatarDataHoraCompacta(resumoLeilao.data) : "Data não informada"}</strong>
                  </div>
                  <div className="prospects-capture-card__meta-item prospects-capture-card__meta-item--accent">
                    <span>{resumoLeilao?.valor !== null && resumoLeilao?.valor !== undefined ? "Lance" : "Valor mínimo"}</span>
                    <strong>{formatarMoeda(resumoLeilao?.valor ?? item.valorMinimo)}</strong>
                  </div>
                  <div className="prospects-capture-card__meta-item">
                    <span>{processoNumero ? "Processo" : "Financia"}</span>
                    <strong>{processoNumero || (item.financia === undefined || item.financia === null ? "—" : item.financia ? "Sim" : "Não")}</strong>
                  </div>
                </div>

                {(avaliacao || item.analiseSalva) ? (
                  <div className="prospects-capture-card__auto">
                    <span className={`prospects-auto-badge is-roi ${roiEstimadoDisponivel === null ? "is-neutral" : getRoiClasse(roiEstimadoDisponivel)}`}>
                      ROI: {roiEstimadoDisponivel === null ? "A definir" : formatarPercentual(roiEstimadoDisponivel)}
                    </span>
                    <span className={`prospects-auto-badge is-investment ${investimentoTotalEstimado === null ? "is-neutral" : ""}`.trim()}>
                      Investimento 12M: {investimentoTotalEstimado === null ? "A definir" : formatarMoeda(investimentoTotalEstimado)}
                    </span>
                    {avaliacao ? (
                      <span className={`prospects-auto-badge is-score ${getScoreClasse(avaliacao.score_total)}`}>
                        Score: {avaliacao.score_total ?? "—"}/85
                      </span>
                    ) : null}
                  </div>
                ) : null}

                <DetalhesTexto texto={item.descricao} className="prospects-capture-card__description" />

                <div className="prospects-inline-links">
                  <a className="prospects-inline-link" href={item.link} target="_blank" rel="noreferrer">
                    <span>Anúncio</span>
                    <ArrowUpRightIcon />
                  </a>
                  {mapsUrl ? (
                    <a className="prospects-inline-link" href={mapsUrl} target="_blank" rel="noreferrer">
                      <MapPinIcon />
                      <span>Mapa</span>
                    </a>
                  ) : null}
                  {comparaveis.map((link) => (
                    <a
                      key={`${item.codigo}-${link.label}`}
                      className="prospects-inline-link"
                      href={link.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <span>{link.label}</span>
                      <ArrowUpRightIcon />
                    </a>
                  ))}
                  {editalUrl ? (
                    <a
                      className="prospects-inline-link prospects-inline-link--highlight"
                      href={editalUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <span>Ver edital</span>
                      <ArrowUpRightIcon />
                    </a>
                  ) : null}
                </div>

                <div className="prospects-capture-card__actions">
                  <button
                    type="button"
                    className="prospects-btn secondary prospects-btn--subtle prospects-btn--card-action prospects-btn--card-details"
                    onClick={() => onAbrirAvaliacaoDetalhada(item, "dados", "capturados")}
                  >
                    Detalhes
                  </button>
                  <button
                    type="button"
                    className={`prospects-btn ghost prospects-btn--subtle prospects-btn--card-action ${item.analiseIaSalva ? "is-active" : ""}`.trim()}
                    onClick={() => onAbrirAvaliacaoDetalhada(item, "ia", "capturados")}
                  >
                    {item.analiseIaSalva ? "IA salva" : "Avaliação IA"}
                  </button>
                  <button
                    type="button"
                    className={`prospects-btn ghost prospects-btn--subtle prospects-btn--card-action ${item.analiseSalva ? "is-active" : ""}`.trim()}
                    onClick={() => onAbrirAvaliacaoDetalhada(item, "viabilidade", "capturados")}
                  >
                    {item.analiseSalva ? "Viabilidade salva" : "Viabilidade"}
                  </button>
                  <button
                    type="button"
                    className={`prospects-btn ${jaSelecionado ? "secondary" : "primary"} prospects-btn--subtle prospects-btn--card-action prospects-btn--card-select`}
                    disabled={includeLoadingIds.has(item.codigo)}
                    onClick={() => onIncluir(item)}
                  >
                    {includeLoadingIds.has(item.codigo) ? "Incluindo..." : jaSelecionado ? "Reenviar ao funil" : "Selecionar"}
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
      <div className="prospects-pagination">
        <div className="prospects-pagination__summary">{renderRange()}</div>
        <div className="prospects-pagination__controls">
          <button type="button" className="prospects-btn secondary" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>Anterior</button>
          <span>Página {page} de {totalPages}</span>
          <button type="button" className="prospects-btn secondary" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>Próxima</button>
        </div>
      </div>
    </div>
  );
}
