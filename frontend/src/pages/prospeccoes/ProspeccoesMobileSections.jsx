import React, { useState } from "react";
import {
  ProspectGallery,
  DetalhesTexto,
  ArrowLeftIcon,
  ArrowUpRightIcon,
  MapPinIcon,
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

export function MobileSelecionadosList({
  dados,
  loading,
  erro,
  onBack,
  onIncluirManual,
  onOpenObservacoes,
  onOpenPrioridade,
  onOpenResponsaveis,
  onOpenAnalise,
  onOpenAvaliacaoDetalhada,
  onDelete,
  onReativar,
  updateLoadingIds,
  removeLoadingIds,
  selectedSearch,
  onSelectedSearchChange,
  selectedUfFilter,
  onSelectedUfFilterChange,
  selectedUfOptions,
  selectedPrioridadeFilter,
  onSelectedPrioridadeFilterChange,
  selectedResponsavelFilter,
  onSelectedResponsavelFilterChange,
  responsavelOptions,
  selectedActivityFilter,
  onSelectedActivityFilterChange,
  selectedUserFilter,
  onSelectedUserFilterChange,
  selectedUserOptions,
  selectedSortBy,
  onSelectedSortByChange,
  selectedSortDir,
  onSelectedSortDirChange,
  onResetSelectedFilters,
  onToggleFiltersExpanded,
  selectedFiltersExpanded,
  selectedVisibleActiveFilters,
  canFilterByUser,
  canManageResponsaveis,
}) {
  if (loading) return <div className="prospects-card"><p className="prospects-empty">Carregando fila de prospecção...</p></div>;
  if (erro) return <div className="prospects-card"><p className="prospects-empty">Erro ao carregar selecionados: {erro}</p></div>;

  return (
    <section className="prospects-mobile-section">
      <div className="prospects-card">
        <div className="prospects-card__header prospects-card__header--stacked">
          <div>
            <p className="prospects-eyebrow">Mobile</p>
            <h2 className="prospects-title">Fila de prospecção</h2>
            <p className="prospects-subtitle prospects-subtitle--compact">
              Acompanhe a fila operacional, registre contexto e abra rapidamente a viabilidade dos imóveis.
            </p>
          </div>
          <div className="prospects-card__header-actions">
            <span className="prospects-pill">{dados.length} imóveis</span>
            {onIncluirManual ? (
              <button type="button" className="prospects-btn tertiary prospects-btn--toolbar" onClick={onIncluirManual}>
                Adicionar manual
              </button>
            ) : null}
            <button type="button" className="prospects-btn tertiary prospects-btn--toolbar" onClick={onBack}>
              <ArrowLeftIcon />
              <span>Menu mobile</span>
            </button>
          </div>
        </div>
      </div>

      <div className="prospects-card prospects-mobile-filters">
        <div className="prospects-mobile-filters__stack">
          <label className="prospects-toolbar-field">
            <span>Buscar</span>
            <input
              type="search"
              value={selectedSearch}
              onChange={(event) => onSelectedSearchChange(event.target.value)}
              placeholder="Código, cidade, autor, responsável ou descrição"
            />
          </label>

          <div className="prospects-mobile-filters__toggle">
            <button
              type="button"
              className="prospects-btn tertiary prospects-btn--toolbar"
              onClick={onToggleFiltersExpanded}
            >
              {selectedFiltersExpanded ? "Ocultar filtros" : "Mostrar filtros"}
            </button>
            <button type="button" className="prospects-btn tertiary prospects-btn--toolbar" onClick={onResetSelectedFilters}>
              Limpar visão
            </button>
          </div>

          {selectedFiltersExpanded ? (
            <div className="prospects-mobile-filters__grid">
              <label className="prospects-toolbar-field">
                <span>UF</span>
                <select value={selectedUfFilter} onChange={(event) => onSelectedUfFilterChange(event.target.value)}>
                  <option value="todos">Todas</option>
                  {selectedUfOptions.map((uf) => (
                    <option key={uf} value={uf}>{uf}</option>
                  ))}
                </select>
              </label>

              <label className="prospects-toolbar-field">
                <span>Prioridade</span>
                <select value={selectedPrioridadeFilter} onChange={(event) => onSelectedPrioridadeFilterChange(event.target.value)}>
                  <option value="todas">Todas</option>
                  <option value="3">Alta</option>
                  <option value="2">Média</option>
                  <option value="1">Baixa</option>
                </select>
              </label>

              {canFilterByUser ? (
                <label className="prospects-toolbar-field">
                  <span>Status</span>
                  <select value={selectedActivityFilter} onChange={(event) => onSelectedActivityFilterChange(event.target.value)}>
                    <option value="ativos">Ativos</option>
                    <option value="inativos">Inativos</option>
                    <option value="todos">Todos</option>
                  </select>
                </label>
              ) : null}

              <label className="prospects-toolbar-field">
                <span>Responsável</span>
                <select value={selectedResponsavelFilter} onChange={(event) => onSelectedResponsavelFilterChange(event.target.value)}>
                  <option value="todos">Todos</option>
                  <option value="com">Com responsáveis</option>
                  <option value="sem">Sem responsáveis</option>
                  <option value="meus">Atribuídos a mim</option>
                  {responsavelOptions.map((responsavel) => (
                    <option key={responsavel.id} value={responsavel.id}>{responsavel.label}</option>
                  ))}
                </select>
              </label>

              {canFilterByUser ? (
                <label className="prospects-toolbar-field">
                  <span>Autor</span>
                  <select value={selectedUserFilter} onChange={(event) => onSelectedUserFilterChange(event.target.value)}>
                    <option value="todos">Todos</option>
                    {selectedUserOptions.map((author) => (
                      <option key={author.id} value={author.id}>{author.label}</option>
                    ))}
                  </select>
                </label>
              ) : null}

              <label className="prospects-toolbar-field">
                <span>Ordenar por</span>
                <select value={selectedSortBy} onChange={(event) => onSelectedSortByChange(event.target.value)}>
                  <option value="dataLeilao">Data do leilão</option>
                  <option value="cidade">Cidade</option>
                  <option value="codigo">Código</option>
                  <option value="prioridade">Prioridade</option>
                  <option value="valorMaximo">Valor máximo</option>
                  <option value="roi">ROI</option>
                </select>
              </label>

              <label className="prospects-toolbar-field">
                <span>Direção</span>
                <select value={selectedSortDir} onChange={(event) => onSelectedSortDirChange(event.target.value)}>
                  <option value="asc">Crescente</option>
                  <option value="desc">Decrescente</option>
                </select>
              </label>
            </div>
          ) : null}
        </div>

        {selectedVisibleActiveFilters.length ? (
          <div className="prospects-mobile-filters__footer">
            <div className="prospects-mobile-filters__metrics">
              {selectedVisibleActiveFilters.map((filtro) => (
                <span key={filtro} className="prospects-pill prospects-pill--muted">{filtro}</span>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {!dados.length ? (
        <div className="prospects-card">
          <p className="prospects-empty">Nenhum imóvel na fila com os filtros atuais.</p>
        </div>
      ) : null}

      <div className="prospects-mobile-list">
        {dados.map((item) => {
          const isInactive = item.ativo === false;
          const updateKeyPrefix = `${item.codigo}:`;
          return (
            <article key={item.codigo} className={`prospects-mobile-item-card ${isInactive ? "is-inactive" : ""}`.trim()}>
              <div className="prospects-mobile-item-card__top">
                <div>
                  <a className="prospects-link mono" href={item.link} target="_blank" rel="noreferrer">
                    {item.codigo}
                  </a>
                  <p className="prospects-mobile-item-card__location">
                    {[item.cidade, item.uf].filter(Boolean).join("/") || "Sem localização"}
                  </p>
                </div>
                <div className="prospects-mobile-item-card__pills">
                  {item.prioridadeLabel ? <span className={`prospects-chip priority-${item.prioridadeLabel.toLowerCase()}`}>{item.prioridadeLabel}</span> : null}
                  {isInactive ? <span className="prospects-chip prospects-chip--inactive">Inativo</span> : null}
                </div>
              </div>

              <div className="prospects-mobile-item-card__meta">
                <div>
                  <span>Valor máximo</span>
                  <strong>{item.valorMaximo ? item.valorMaximo.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—"}</strong>
                </div>
                <div>
                  <span>Financeira</span>
                  <strong>{item.analiseSalva ? "Salva" : "Pendente"}</strong>
                </div>
                <div>
                  <span>IA</span>
                  <strong>{item.analiseIaSalva ? "Salva" : "Pendente"}</strong>
                </div>
                <div>
                  <span>Responsáveis</span>
                  <strong>{item.responsaveis?.length ? item.responsaveis.map((responsavel) => responsavel.name || responsavel.email).join(", ") : "Sem responsável"}</strong>
                </div>
              </div>

              {item.observacoes ? (
                <DetalhesTexto texto={item.observacoes} className="prospects-mobile-item-card__description" />
              ) : null}

              <div className="prospects-mobile-item-card__actions">
                <button type="button" className="prospects-btn ghost prospects-btn--mobile-action" onClick={() => onOpenObservacoes(item)}>
                  <span>Observação</span>
                </button>
                <button type="button" className="prospects-btn ghost prospects-btn--mobile-action" onClick={() => onOpenAnalise(item)}>
                  <span>Viabilidade</span>
                </button>
                <button type="button" className="prospects-btn ghost prospects-btn--mobile-action" onClick={() => onOpenAvaliacaoDetalhada(item, "ia", "selecionados")}>
                  <span>Análise IA</span>
                </button>
                {canManageResponsaveis ? (
                  <button type="button" className="prospects-btn ghost prospects-btn--mobile-action" onClick={() => onOpenResponsaveis(item)}>
                    <span>Responsáveis</span>
                  </button>
                ) : null}
                <button type="button" className="prospects-btn ghost prospects-btn--mobile-action" onClick={() => onOpenPrioridade(item)}>
                  <span>Prioridade</span>
                </button>
                {isInactive ? (
                  <button
                    type="button"
                    className="prospects-btn secondary prospects-btn--mobile-action"
                    onClick={() => onReativar(item)}
                    disabled={updateLoadingIds.has(`${updateKeyPrefix}reativar`)}
                  >
                    <span>{updateLoadingIds.has(`${updateKeyPrefix}reativar`) ? "Reativando..." : "Reativar"}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    className="prospects-btn danger prospects-btn--mobile-action"
                    onClick={() => onDelete(item)}
                    disabled={removeLoadingIds.has(item.codigo)}
                  >
                    <span>{removeLoadingIds.has(item.codigo) ? "Removendo..." : "Remover"}</span>
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function MobileCapturadosList({
  dados,
  total,
  page,
  pageSize,
  loading,
  erro,
  onBack,
  onIncluir,
  includeLoadingIds,
  selectedCodes,
  filtroFonteCap,
  setFiltroFonteCap,
  filtroUfCap,
  setFiltroUfCap,
  ufOptions,
  filtroCidadesCap,
  onToggleCidade,
  cidadesOptions,
  filtroFinanciaCap,
  setFiltroFinanciaCap,
  sortBy,
  setSortBy,
  sortDir,
  setSortDir,
  pageSizeOptions,
  setPageSize,
  onPageChange,
  onResetFilters,
  onAbrirAvaliacaoDetalhada,
  sourceOptions,
  getLeilaoResumo,
  getMapsUrl,
  getComparaveisLinks,
  extrairEditalUrl,
  getFonteLabel,
  extrairProcessoNumero,
  formatarMoeda,
  formatarPercentual,
  formatarDataHoraCompacta,
  getScoreClasse,
  getRoiClasse,
}) {
  const [citySearch, setCitySearch] = useState("");
  if (loading) return <div className="prospects-card"><p className="prospects-empty">Carregando base de prospecção...</p></div>;
  if (erro) return <div className="prospects-card"><p className="prospects-empty">Erro ao carregar capturados: {erro}</p></div>;

  const totalPages = Math.max(1, Math.ceil((total || 0) / pageSize));
  const normalizedCitySearch = citySearch.trim().toLowerCase();
  const cidadesVisiveis = normalizedCitySearch
    ? cidadesOptions.filter((cidade) => cidade.toLowerCase().includes(normalizedCitySearch))
    : cidadesOptions;

  return (
    <section className="prospects-mobile-section">
      <div className="prospects-card">
        <div className="prospects-card__header prospects-card__header--stacked">
          <div>
            <p className="prospects-eyebrow">Mobile</p>
            <h2 className="prospects-title">Base capturada</h2>
            <p className="prospects-subtitle prospects-subtitle--compact">
              Explore a base capturada e envie imóveis para a fila operacional de prospecção.
            </p>
          </div>
          <div className="prospects-card__header-actions">
            <span className="prospects-pill">{total} capturados</span>
            <button type="button" className="prospects-btn tertiary prospects-btn--toolbar" onClick={onBack}>
              <ArrowLeftIcon />
              <span>Menu mobile</span>
            </button>
          </div>
        </div>
      </div>

      <div className="prospects-card prospects-mobile-filters">
        <div className="prospects-mobile-filters__grid">
          <label className="prospects-toolbar-field">
            <span>Origem</span>
            <select
              value={filtroFonteCap}
              onChange={(e) => {
                setFiltroFonteCap(e.target.value);
                onPageChange(1);
              }}
            >
              {sourceOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <label className="prospects-toolbar-field">
            <span>UF</span>
            <select
              value={filtroUfCap[0] || ""}
              onChange={(e) => setFiltroUfCap(e.target.value ? [e.target.value] : [])}
            >
              <option value="">Todas</option>
              {ufOptions.map((uf) => (
                <option key={uf} value={uf}>{uf}</option>
              ))}
            </select>
          </label>

          <label className="prospects-toolbar-field">
            <span>Financia</span>
            <select
              value={filtroFinanciaCap[0] || ""}
              onChange={(e) => setFiltroFinanciaCap(e.target.value ? [e.target.value] : [])}
            >
              <option value="">Todos</option>
              <option value="sim">Sim</option>
              <option value="nao">Não</option>
            </select>
          </label>

          <label className="prospects-toolbar-field">
            <span>Ordenar por</span>
            <select
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value);
                onPageChange(1);
              }}
            >
              <option value="ultima_disputa">Última disputa</option>
              <option value="codigo">Código</option>
              <option value="cidade">Cidade</option>
              <option value="uf">UF</option>
              <option value="modalidade">Modalidade</option>
              <option value="valor_minimo">Valor mínimo</option>
              <option value="score_total">Score</option>
              <option value="retorno_pct">ROI estimado</option>
            </select>
          </label>

          <label className="prospects-toolbar-field">
            <span>Direção</span>
            <select
              value={sortDir}
              onChange={(e) => {
                setSortDir(e.target.value);
                onPageChange(1);
              }}
            >
              <option value="asc">Crescente</option>
              <option value="desc">Decrescente</option>
            </select>
          </label>

          <label className="prospects-toolbar-field">
            <span>Itens por página</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                onPageChange(1);
              }}
            >
              {pageSizeOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="prospects-mobile-filters__stack">
          <div className="prospects-toolbar-field prospects-toolbar-field--checklist">
            <div className="prospects-mobile-filter-head">
              <span>Cidades</span>
              <strong>{filtroCidadesCap.length ? `${filtroCidadesCap.length} selecionadas` : "Todas"}</strong>
            </div>
            <input
              type="search"
              value={citySearch}
              onChange={(e) => setCitySearch(e.target.value)}
              placeholder="Buscar cidade"
            />
            {filtroCidadesCap.length ? (
              <div className="prospects-mobile-city-selected">
                {filtroCidadesCap.map((cidade) => (
                  <button
                    key={cidade}
                    type="button"
                    className="prospects-mobile-city-chip is-selected"
                    onClick={() => onToggleCidade(cidade)}
                  >
                    <span>{cidade}</span>
                    <strong>x</strong>
                  </button>
                ))}
              </div>
            ) : null}
            <div className="prospects-mobile-city-grid">
              {cidadesVisiveis.length ? cidadesVisiveis.map((cidade) => {
                const ativa = filtroCidadesCap.includes(cidade);
                return (
                  <button
                    key={cidade}
                    type="button"
                    className={`prospects-mobile-city-chip ${ativa ? "is-selected" : ""}`.trim()}
                    onClick={() => onToggleCidade(cidade)}
                  >
                    {cidade}
                  </button>
                );
              }) : (
                <p className="prospects-empty prospects-empty--inline">Nenhuma cidade encontrada.</p>
              )}
            </div>
          </div>
        </div>

        <div className="prospects-mobile-filters__footer">
          <div className="prospects-mobile-filters__metrics">
            <span className="prospects-pill">{dados.length} na página</span>
            <span className="prospects-pill prospects-pill--muted">{selectedCodes.size} na fila</span>
          </div>
          <button type="button" className="prospects-btn tertiary prospects-btn--toolbar" onClick={onResetFilters}>
            Limpar filtros
          </button>
        </div>
      </div>

      {!dados.length ? (
        <div className="prospects-card">
          <p className="prospects-empty">Nenhum imóvel capturado encontrado com os filtros atuais.</p>
        </div>
      ) : null}

      <div className="prospects-mobile-list">
        {dados.map((item) => {
          const jaSelecionado = selectedCodes.has(item.codigo);
          const avaliacao = item.avaliacaoAutomatica;
          const investimentoEstimadoAutomatico = getInvestimentoTotalEstimado(avaliacao);
          const investimentoEstimadoManual = toFiniteNumber(item.capitalInvestidoEstimado);
          const investimentoTotalEstimado = investimentoEstimadoManual ?? investimentoEstimadoAutomatico;
          const roiEstimadoManual = toFiniteNumber(item.roiEsperadoPercentual);
          const roiEstimadoAutomatico = toFiniteNumber(avaliacao?.retorno_pct);
          const roiEstimadoDisponivel = roiEstimadoManual ?? roiEstimadoAutomatico;
          const resumoLeilao = getLeilaoResumo(item);
          const mapsUrl = getMapsUrl(item);
          const comparaveis = getComparaveisLinks(item);
          const editalUrl = extrairEditalUrl(item.descricao);
          const fonteLabel = getFonteLabel(item.fonte);
          const processoNumero = extrairProcessoNumero(item.descricao);
          return (
            <article
              key={item.codigo}
              className="prospects-mobile-item-card"
            >
              <div className="prospects-mobile-item-card__media">
                <ProspectGallery item={item} className="prospects-mobile-item-card__photo" compact />
              </div>

              <div className="prospects-mobile-item-card__top">
                <div>
                  <a className="prospects-link mono" href={item.link} target="_blank" rel="noreferrer">
                    {item.codigo}
                  </a>
                  <p className="prospects-mobile-item-card__location">
                    {[item.cidade, item.uf].filter(Boolean).join("/") || "Sem localização"}
                  </p>
                </div>
                <div className="prospects-mobile-item-card__pills">
                  <span className="prospects-chip">{item.modalidade || "Sem modalidade"}</span>
                  {fonteLabel ? <span className={`prospects-chip ${item.fonte === "tjdft_judicial" ? "prospects-chip--judicial" : "prospects-chip--source"}`.trim()}>{fonteLabel}</span> : null}
                  {jaSelecionado ? (
                    <span className="prospects-chip prospects-chip--selected">Na fila</span>
                  ) : null}
                </div>
              </div>

              <div className="prospects-mobile-item-card__meta">
                <div>
                  <span>{resumoLeilao?.label || "Valor mínimo"}</span>
                  <strong>{formatarMoeda(resumoLeilao?.valor ?? item.valorMinimo)}</strong>
                </div>
                <div>
                  <span>Valor avaliação</span>
                  <strong>{formatarMoeda(item.valorAvaliacao)}</strong>
                </div>
                <div>
                  <span>{resumoLeilao?.data ? "Data do evento" : "Última disputa"}</span>
                  <strong>{formatarDataHoraCompacta(resumoLeilao?.data || item.ultima_disputa)}</strong>
                </div>
                <div>
                  <span>Financia</span>
                  <strong>{item.financia === undefined || item.financia === null ? "—" : item.financia ? "Sim" : "Não"}</strong>
                </div>
                <div>
                  <span>Status</span>
                  <strong>{item.situacao || "—"}</strong>
                </div>
                {processoNumero ? (
                  <div>
                    <span>Processo</span>
                    <strong>{processoNumero}</strong>
                  </div>
                ) : null}
              </div>

              {(avaliacao || item.analiseSalva) ? (
                <div className="prospects-mobile-item-card__auto">
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

              <DetalhesTexto texto={item.descricao} className="prospects-mobile-item-card__description" />

              <div className="prospects-inline-links">
                <a
                  className="prospects-inline-link"
                  href={item.link}
                  target="_blank"
                  rel="noreferrer"
                >
                  <span>Anúncio</span>
                  <ArrowUpRightIcon />
                </a>
                {mapsUrl ? (
                  <a
                    className="prospects-inline-link"
                    href={mapsUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
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

              <div className="prospects-mobile-item-card__actions">
                <button
                  type="button"
                  className="prospects-btn secondary prospects-btn--mobile-action prospects-btn--card-action prospects-btn--card-details"
                  onClick={() => onAbrirAvaliacaoDetalhada(item, "dados", "capturados")}
                >
                  <span>Detalhes</span>
                </button>
                <button
                  type="button"
                  className={`prospects-btn ghost prospects-btn--mobile-action prospects-btn--card-action ${item.analiseIaSalva ? "is-active" : ""}`.trim()}
                  onClick={() => onAbrirAvaliacaoDetalhada(item, "ia", "capturados")}
                >
                  <span>{item.analiseIaSalva ? "IA salva" : "Avaliação IA"}</span>
                </button>
                <button
                  type="button"
                  className={`prospects-btn ghost prospects-btn--mobile-action prospects-btn--card-action ${item.analiseSalva ? "is-active" : ""}`.trim()}
                  onClick={() => onAbrirAvaliacaoDetalhada(item, "viabilidade", "capturados")}
                >
                  <span>{item.analiseSalva ? "Viabilidade salva" : "Viabilidade"}</span>
                </button>
                <button
                  type="button"
                  className={`prospects-btn ${jaSelecionado ? "secondary" : "primary"} prospects-btn--mobile-action prospects-btn--card-action prospects-btn--card-select`}
                  onClick={() => onIncluir(item)}
                  disabled={includeLoadingIds.has(item.codigo)}
                >
                  <span>{includeLoadingIds.has(item.codigo) ? "Incluindo..." : jaSelecionado ? "Reenviar ao funil" : "Selecionar"}</span>
                </button>
              </div>
            </article>
          );
        })}
      </div>

      <div className="prospects-card prospects-mobile-pagination">
        <div className="prospects-pagination__summary">
          Página {page} de {totalPages}
        </div>
        <div className="prospects-pagination__controls">
          <button type="button" className="prospects-btn secondary" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
            Anterior
          </button>
          <button type="button" className="prospects-btn secondary" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
            Próxima
          </button>
        </div>
      </div>
    </section>
  );
}
