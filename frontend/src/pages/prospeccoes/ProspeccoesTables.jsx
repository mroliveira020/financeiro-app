import React, { useEffect, useState } from "react";
import {
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
