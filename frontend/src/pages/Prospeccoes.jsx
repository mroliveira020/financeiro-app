import React, { useEffect, useMemo, useState } from "react";
import "./Prospeccoes.css";

import { fetchCapturados, fetchSelecionados, adicionarSelecionado, excluirSelecionado, fetchProspecMeta } from "../services/prospeccoes";

const PRIORIDADE_OPTIONS = [
  { value: 1, label: "Baixa", cls: "baixa" },
  { value: 2, label: "Média", cls: "media" },
  { value: 3, label: "Alta", cls: "alta" },
];

const formatarMoeda = (valor) => {
  if (valor === null || valor === undefined) return "—";
  return Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

const formatarPercentual = (valor) => {
  if (valor === null || valor === undefined) return "—";
  return `${Number(valor).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}%`;
};

const formatarDataHora = (valor) => {
  if (!valor) return "—";
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return "—";
  const dia = String(data.getDate()).padStart(2, "0");
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const ano = data.getFullYear();
  const hora = String(data.getHours()).padStart(2, "0");
  const minuto = String(data.getMinutes()).padStart(2, "0");
  return `${dia}/${mes}/${ano} ${hora}:${minuto}`;
};

function TabelaSelecionados({
  dados,
  loading,
  erro,
  onExcluir,
  onAtualizarPrioridade,
  onEditarObservacoes,
  removeLoadingIds,
  updateLoadingIds,
  sortDir,
  onToggleSort,
}) {
  if (loading) return <div className="prospects-card"><p className="prospects-empty">Carregando selecionados...</p></div>;
  if (erro) return <div className="prospects-card"><p className="prospects-empty">Erro ao carregar selecionados: {erro}</p></div>;
  if (!dados.length) return <div className="prospects-card"><p className="prospects-empty">Nenhum selecionado encontrado.</p></div>;

  return (
    <div className="prospects-card">
      <div className="prospects-card__header">
        <div>
          <p className="prospects-eyebrow">Fila de decisão</p>
          <h2 className="prospects-title">Selecionados</h2>
          <p className="prospects-subtitle prospects-subtitle--compact">
            Ordenado por data do leilão para facilitar a fila operacional.
          </p>
        </div>
        <span className="prospects-pill">{dados.length} imóveis</span>
      </div>
      <div className="prospects-table-wrap">
        <table className="prospects-table">
          <thead>
            <tr>
              <th>Código</th>
              <th>Cidade</th>
              <th>UF</th>
              <th>Selecionado por</th>
              <th
                className="prospects-sortable"
                role="button"
                tabIndex={0}
                aria-sort={sortDir === "asc" ? "ascending" : "descending"}
                onClick={onToggleSort}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") onToggleSort();
                }}
              >
                Data leilão{sortDir === "asc" ? " ▲" : " ▼"}
              </th>
              <th>Valor máximo</th>
              <th>Valor referência</th>
              <th>Prioridade</th>
              <th>Observações</th>
              <th>Descrição</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {dados.map((item) => (
              <tr key={item.codigo}>
                <td className="mono">
                  <a className="prospects-link" href={item.link} target="_blank" rel="noreferrer">
                    {item.codigo}
                  </a>
                </td>
                <td>{item.cidade}</td>
                <td>{item.uf}</td>
                <td>{item.createdByName || "—"}</td>
                <td>{formatarDataHora(item.dataLeilao)}</td>
                <td>{formatarMoeda(item.valorMaximo)}</td>
                <td>{item.valor ? formatarMoeda(item.valor) : "—"}</td>
                <td>
                  <select
                    className="prospects-priority-select"
                    value={Number(item.prioridade || 2)}
                    disabled={updateLoadingIds.has(`${item.codigo}:prioridade`)}
                    onChange={(e) => onAtualizarPrioridade(item, Number(e.target.value))}
                  >
                    {PRIORIDADE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <button
                    type="button"
                    className={`prospects-note-btn ${item.observacoes ? "has-note" : ""}`}
                    title={item.observacoes || "Nenhuma observação cadastrada."}
                    onClick={() => onEditarObservacoes(item)}
                    disabled={updateLoadingIds.has(`${item.codigo}:observacoes`)}
                  >
                    {item.observacoes ? "Abrir nota" : "Adicionar"}
                  </button>
                </td>
                <td>{item.descricao || "—"}</td>
                <td>
                  <div className="prospects-row-actions">
                    <button
                      type="button"
                      className="prospects-icon-btn danger"
                      title="Remover da fila"
                      disabled={removeLoadingIds.has(item.codigo)}
                      onClick={() => onExcluir(item)}
                    >
                      {removeLoadingIds.has(item.codigo) ? "..." : "Remover"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ConfirmarExclusaoModal({ item, loading, onCancel, onConfirm }) {
  if (!item) return null;

  return (
    <div className="prospects-modal-backdrop" role="presentation">
      <div className="prospects-modal" role="dialog" aria-modal="true" aria-labelledby="confirmar-exclusao-title">
        <div className="prospects-modal__header">
          <div>
            <p className="prospects-eyebrow">Confirmação</p>
            <h3 id="confirmar-exclusao-title" className="prospects-modal__title">Remover da fila</h3>
          </div>
        </div>
        <div className="prospects-modal__body">
          <p>
            O imóvel <strong>{item.codigo}</strong>
            {item.cidade || item.uf ? ` (${[item.cidade, item.uf].filter(Boolean).join("/")})` : ""}
            {" "}será removido apenas da fila de selecionados.
          </p>
          <p>O histórico capturado na prospecção continuará preservado.</p>
        </div>
        <div className="prospects-modal__footer">
          <button type="button" className="prospects-btn secondary" onClick={onCancel} disabled={loading}>
            Cancelar
          </button>
          <button type="button" className="prospects-btn danger" onClick={onConfirm} disabled={loading}>
            {loading ? "Removendo..." : "Confirmar remoção"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ObservacoesModal({ item, value, loading, onChange, onCancel, onSave }) {
  if (!item) return null;

  return (
    <div className="prospects-modal-backdrop" role="presentation">
      <div className="prospects-modal" role="dialog" aria-modal="true" aria-labelledby="observacoes-title">
        <div className="prospects-modal__header">
          <div>
            <p className="prospects-eyebrow">Observações</p>
            <h3 id="observacoes-title" className="prospects-modal__title">Imóvel {item.codigo}</h3>
          </div>
        </div>
        <div className="prospects-modal__body">
          <p className="prospects-modal__hint">
            Use este campo para manter a anotação mais atual e relevante sobre o imóvel.
          </p>
          <textarea
            className="prospects-textarea prospects-textarea--large"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Adicione uma nota objetiva sobre o imóvel. Você pode editar esse texto sempre que houver novidade."
            rows={10}
          />
        </div>
        <div className="prospects-modal__footer">
          <button type="button" className="prospects-btn secondary" onClick={onCancel} disabled={loading}>
            Fechar
          </button>
          <button type="button" className="prospects-btn primary" onClick={onSave} disabled={loading}>
            {loading ? "Salvando..." : "Salvar nota"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TabelaCapturados({
  dados,
  total,
  page,
  pageSize,
  loading,
  erro,
  onIncluir,
  includeLoadingIds,
  expanded,
  toggleExpand,
  onPageChange,
  sortBy,
  sortDir,
  onSortChange,
}) {
  if (loading) return <div className="prospects-card"><p className="prospects-empty">Carregando capturados...</p></div>;
  if (erro) return <div className="prospects-card"><p className="prospects-empty">Erro ao carregar capturados: {erro}</p></div>;

  const totalPages = Math.max(1, Math.ceil((total || 0) / pageSize));
  const isEmpty = !dados.length;
  const renderSort = (key, label) => {
    const isActive = sortBy === key;
    const arrow = isActive ? (sortDir === "asc" ? " ▲" : " ▼") : "";
    const ariaSort = isActive ? (sortDir === "asc" ? "ascending" : "descending") : "none";
    const handleSort = () => {
      const nextDir = isActive && sortDir === "asc" ? "desc" : "asc";
      onSortChange(key, nextDir);
    };
    return (
      <th
        className="prospects-sortable"
        role="button"
        tabIndex={0}
        aria-sort={ariaSort}
        onClick={handleSort}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") handleSort();
        }}
      >
        {label}
        {arrow}
      </th>
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
        </div>
        <span className="prospects-pill">{total} registros</span>
      </div>
      <div className="prospects-table-wrap">
        <table className="prospects-table">
          <thead>
            <tr>
              {renderSort("codigo", "Código")}
              {renderSort("cidade", "Cidade")}
              {renderSort("uf", "UF")}
              {renderSort("modalidade", "Modalidade")}
              {renderSort("valor_minimo", "Valor")}
              {renderSort("ultima_disputa", "Última disputa")}
              <th>Descrição</th>
              <th>Financia</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {isEmpty && (
              <tr>
                <td colSpan={9}>
                  <p className="prospects-empty">Nenhum capturado encontrado.</p>
                </td>
              </tr>
            )}
            {!isEmpty && dados.map((item) => (
              <React.Fragment key={item.codigo}>
                <tr className="prospects-expandable" onClick={() => toggleExpand(item.codigo)}>
                  <td className="mono">
                    <a className="prospects-link" href={item.link} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                      {item.codigo}
                    </a>
                  </td>
                  <td>{item.cidade}</td>
                  <td>{item.uf}</td>
                  <td>{item.modalidade || "—"}</td>
                  <td>{formatarMoeda(item.valorMinimo)}</td>
                  <td>{formatarDataHora(item.ultima_disputa)}</td>
                  <td>{item.descricao || "—"}</td>
                  <td>{item.financia === undefined || item.financia === null ? "—" : item.financia ? "Sim" : "Não"}</td>
                  <td>
                    <button
                      type="button"
                      className="prospects-btn secondary"
                      style={{ padding: "6px 8px", minWidth: "auto" }}
                      disabled={includeLoadingIds.has(item.codigo)}
                      onClick={(e) => {
                        e.stopPropagation();
                        onIncluir(item);
                      }}
                    >
                      {includeLoadingIds.has(item.codigo) ? "…" : "+"}
                    </button>
                  </td>
                </tr>
                {expanded.has(item.codigo) && (
                  <tr className="prospects-extra">
                    <td colSpan={9}>
                      <div className="prospects-detail-grid">
                        <div><strong>Status:</strong> {item.situacao || "—"}</div>
                        <div><strong>Financia:</strong> {item.financia === null || item.financia === undefined ? "—" : item.financia ? "Sim" : "Não"}</div>
                        <div><strong>Tipo do imóvel:</strong> {item.tipoImovel || "—"}</div>
                        <div><strong>Modalidade:</strong> {item.modalidade || "—"}</div>
                        <div><strong>Valor mínimo:</strong> {formatarMoeda(item.valorMinimo)}</div>
                        <div><strong>Valor venda:</strong> {formatarMoeda(item.valorVenda)}</div>
                        <div><strong>Valor leilão 1:</strong> {formatarMoeda(item.valorLeilao1)}</div>
                        <div><strong>Valor leilão 2:</strong> {formatarMoeda(item.valorLeilao2)}</div>
                        <div><strong>Valor avaliação:</strong> {formatarMoeda(item.valorAvaliacao)}</div>
                        <div><strong>Lance atual:</strong> {formatarMoeda(item.lanceAtual)}</div>
                        <div><strong>Desconto:</strong> {formatarPercentual(item.desconto)}</div>
                        <div><strong>Coletado em:</strong> {formatarDataHora(item.coletadoEm)}</div>
                        <div><strong>Última disputa:</strong> {formatarDataHora(item.ultima_disputa)}</div>
                        <div><strong>Data Leilão 1:</strong> {formatarDataHora(item.data_leilao_1)}</div>
                        <div><strong>Data Leilão 2:</strong> {formatarDataHora(item.data_leilao_2)}</div>
                        <div><strong>Licitação aberta:</strong> {formatarDataHora(item.data_licitacao_aberta)}</div>
                        <div><strong>Encerramento:</strong> {formatarDataHora(item.data_hora_encerramento)}</div>
                        <div><strong>Endereço:</strong> {[item.endereco, item.bairro, item.cidade, item.uf].filter(Boolean).join(" - ") || "—"}</div>
                        <div><strong>Fonte:</strong> {item.fonte || "—"}</div>
                        <div><strong>Link:</strong> <a className="prospects-link" href={item.link} target="_blank" rel="noreferrer">Abrir</a></div>
                        <div style={{ gridColumn: "1 / -1" }}><strong>Detalhes:</strong> {item.descricao || "—"}</div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
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

export default function Prospeccoes() {
  const [selecionados, setSelecionados] = useState([]);
  const [capturados, setCapturados] = useState([]);
  const [capturadosTotal, setCapturadosTotal] = useState(0);
  const [loadingSel, setLoadingSel] = useState(false);
  const [loadingCap, setLoadingCap] = useState(false);
  const [erroSel, setErroSel] = useState("");
  const [erroCap, setErroCap] = useState("");
  const [filtroUfCap, setFiltroUfCap] = useState([]);
  const [filtroCidadesCap, setFiltroCidadesCap] = useState([]);
  const [filtroModalidadeCap, setFiltroModalidadeCap] = useState([]);
  const [filtroStatusCap, setFiltroStatusCap] = useState(["disponivel"]);
  const [filtroFinanciaCap, setFiltroFinanciaCap] = useState([]);
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);
  const [includeLoadingIds, setIncludeLoadingIds] = useState(new Set());
  const [removeLoadingIds, setRemoveLoadingIds] = useState(new Set());
  const [updateLoadingIds, setUpdateLoadingIds] = useState(new Set());
  const [mensagem, setMensagem] = useState("");
  const [meta, setMeta] = useState({ ufs: [], modalidades: [], financia: [] });
  const [expanded, setExpanded] = useState(new Set());
  const [sortBy, setSortBy] = useState("ultima_disputa");
  const [sortDir, setSortDir] = useState("desc");
  const [selectedSortDir, setSelectedSortDir] = useState("asc");
  const [confirmDeleteItem, setConfirmDeleteItem] = useState(null);
  const [observacaoItem, setObservacaoItem] = useState(null);
  const [observacaoDraft, setObservacaoDraft] = useState("");

  useEffect(() => {
    const carregarSelecionados = async () => {
      setLoadingSel(true);
      setErroSel("");
      try {
        const sel = await fetchSelecionados({});
        setSelecionados(sel || []);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Erro inesperado";
        setErroSel(message);
      } finally {
        setLoadingSel(false);
      }
    };
    carregarSelecionados();
  }, []);

  useEffect(() => {
    const carregarCapturados = async () => {
      setLoadingCap(true);
      setErroCap("");
      try {
        const resp = await fetchCapturados({
          page,
          pageSize,
          uf: filtroUfCap,
          cidade: filtroCidadesCap,
          modalidade: filtroModalidadeCap,
          financia: filtroFinanciaCap,
          status: filtroStatusCap,
          orderBy: sortBy,
          orderDir: sortDir,
        });
        setCapturados(resp.data || []);
        setCapturadosTotal(resp.total || 0);
        if (resp.page && resp.page !== page) {
          setPage(resp.page);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Erro inesperado";
        setErroCap(message);
        setCapturados([]);
        setCapturadosTotal(0);
      } finally {
        setLoadingCap(false);
      }
    };
    carregarCapturados();
  }, [page, pageSize, filtroUfCap, filtroCidadesCap, filtroModalidadeCap, filtroStatusCap, filtroFinanciaCap, sortBy, sortDir]);

  useEffect(() => {
    fetchProspecMeta()
      .then((resp) => setMeta(resp))
      .catch(() => setMeta({ ufs: [], modalidades: [], financia: [], cidades_por_uf: {} }));
  }, []);

  const ufOptions = useMemo(() => meta.ufs || [], [meta]);
  const modalidadeOptions = useMemo(() => meta.modalidades || [], [meta]);
  const cidadesOptions = useMemo(() => {
    if (!meta.cidades_por_uf) return [];
    const selectedUfs = filtroUfCap.length ? filtroUfCap : Object.keys(meta.cidades_por_uf);
    const set = new Set();
    selectedUfs.forEach((uf) => {
      (meta.cidades_por_uf[uf] || []).forEach((cidade) => set.add(cidade));
    });
    return Array.from(set).sort();
  }, [meta, filtroUfCap]);

  const toggleValue = (value, listSetter) => {
    listSetter((prev) => {
      const next = new Set(prev);
      if (next.has(value)) {
        next.delete(value);
      } else {
        next.add(value);
      }
      return Array.from(next);
    });
    setPage(1);
  };

  const limparFiltros = () => {
    setFiltroUfCap([]);
    setFiltroCidadesCap([]);
    setFiltroModalidadeCap([]);
    setFiltroStatusCap(["disponivel"]);
    setFiltroFinanciaCap([]);
    setPageSize(20);
    setPage(1);
  };

  const handleIncluir = async (item) => {
    setMensagem("");
    setIncludeLoadingIds((prev) => {
      const next = new Set(prev);
      next.add(item.codigo);
      return next;
    });
    try {
      await adicionarSelecionado({
        numero_bem: item.codigo,
        status: "candidato",
        valor_maximo: item.valorMinimo ?? item.valor,
        prioridade: "Média",
        observacoes: "",
      });
      setMensagem(`Imóvel ${item.codigo} incluído em selecionados.`);
      const sel = await fetchSelecionados({});
      setSelecionados(sel || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao incluir";
      setMensagem(message);
    } finally {
      setIncludeLoadingIds((prev) => {
        const next = new Set(prev);
        next.delete(item.codigo);
        return next;
      });
    }
  };

  const confirmDelete = async (item) => {
    setMensagem("");
    setRemoveLoadingIds((prev) => {
      const next = new Set(prev);
      next.add(item.codigo);
      return next;
    });

    try {
      await excluirSelecionado(item.codigo);
      setSelecionados((prev) => prev.filter((row) => row.codigo !== item.codigo));
      setMensagem(`Imóvel ${item.codigo} removido de selecionados.`);
      setConfirmDeleteItem(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao excluir";
      setMensagem(message);
    } finally {
      setRemoveLoadingIds((prev) => {
        const next = new Set(prev);
        next.delete(item.codigo);
        return next;
      });
    }
  };

  const refreshSelecionados = async () => {
    const sel = await fetchSelecionados({});
    setSelecionados(sel || []);
  };

  const handleAtualizarPrioridade = async (item, prioridadeValue) => {
    const key = `${item.codigo}:prioridade`;
    const option = PRIORIDADE_OPTIONS.find((candidate) => candidate.value === prioridadeValue);
    setMensagem("");
    setUpdateLoadingIds((prev) => new Set(prev).add(key));
    try {
      await adicionarSelecionado({
        numero_bem: item.codigo,
        status: item.status,
        valor_maximo: item.valorMaximo,
        prioridade: prioridadeValue,
        observacoes: item.observacoes || "",
      });
      setMensagem(`Prioridade do imóvel ${item.codigo} atualizada${option ? ` para ${option.label}` : ""}.`);
      await refreshSelecionados();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao atualizar prioridade";
      setMensagem(message);
    } finally {
      setUpdateLoadingIds((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const openObservacoesModal = (item) => {
    setObservacaoItem(item);
    setObservacaoDraft(item.observacoes || "");
  };

  const handleSalvarObservacoes = async () => {
    if (!observacaoItem) return;
    const key = `${observacaoItem.codigo}:observacoes`;
    setMensagem("");
    setUpdateLoadingIds((prev) => new Set(prev).add(key));
    try {
      await adicionarSelecionado({
        numero_bem: observacaoItem.codigo,
        status: observacaoItem.status,
        valor_maximo: observacaoItem.valorMaximo,
        prioridade: observacaoItem.prioridade,
        observacoes: observacaoDraft.trim(),
      });
      setMensagem(`Observações do imóvel ${observacaoItem.codigo} atualizadas.`);
      await refreshSelecionados();
      setObservacaoItem(null);
      setObservacaoDraft("");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao atualizar observações";
      setMensagem(message);
    } finally {
      setUpdateLoadingIds((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const selecionadosOrdenados = useMemo(() => {
    const parseDate = (value) => {
      if (!value) return null;
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? null : date.getTime();
    };

    return [...selecionados].sort((a, b) => {
      const dateA = parseDate(a.dataLeilao);
      const dateB = parseDate(b.dataLeilao);

      if (dateA === null && dateB === null) return `${a.codigo}`.localeCompare(`${b.codigo}`);
      if (dateA === null) return 1;
      if (dateB === null) return -1;

      return selectedSortDir === "asc" ? dateA - dateB : dateB - dateA;
    });
  }, [selecionados, selectedSortDir]);

  const toggleExpand = (codigo) => {
    const next = new Set(expanded);
    if (next.has(codigo)) {
      next.delete(codigo);
    } else {
      next.add(codigo);
    }
    setExpanded(next);
  };

  const handlePageChange = (nextPage) => {
    const totalPages = Math.max(1, Math.ceil((capturadosTotal || 0) / pageSize));
    const normalized = Math.min(Math.max(nextPage, 1), totalPages);
    setPage(normalized);
  };

  const handleSortChange = (key, dir) => {
    setSortBy(key);
    setSortDir(dir);
    setPage(1);
  };

  return (
    <div className="prospects-page">
      <div className="prospects-header">
        <div>
          <p className="prospects-eyebrow">Oportunidades</p>
          <h1 className="prospects-hero">Prospecções</h1>
          <p className="prospects-subtitle">
            Acompanhe os imóveis em decisão e os últimos capturados pelo garimpo. Dados carregados do backend.
          </p>
        </div>
        <div className="prospects-actions" aria-hidden />
      </div>

      <div className="prospects-filters">
        <div className="prospects-filter-group">
          <label>UF (capturados)</label>
          <div className="prospects-checklist">
            {ufOptions.map((uf) => (
              <label key={uf} className="prospects-check">
                <input
                  type="checkbox"
                  checked={filtroUfCap.includes(uf)}
                  onChange={() => toggleValue(uf, setFiltroUfCap)}
                />
                <span>{uf}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="prospects-filter-group">
          <label>Cidade</label>
          <div className="prospects-checklist">
            {cidadesOptions.map((c) => (
              <label key={c} className="prospects-check">
                <input
                  type="checkbox"
                  checked={filtroCidadesCap.includes(c)}
                  onChange={() => toggleValue(c, setFiltroCidadesCap)}
                />
                <span>{c}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="prospects-filter-group">
          <label>Modalidade</label>
          <div className="prospects-checklist">
            {modalidadeOptions.map((m) => (
              <label key={m} className="prospects-check">
                <input
                  type="checkbox"
                  checked={filtroModalidadeCap.includes(m)}
                  onChange={() => toggleValue(m, setFiltroModalidadeCap)}
                />
                <span>{m}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="prospects-filter-group">
          <label>Status (capturados)</label>
          <div className="prospects-checklist">
            <label className="prospects-check">
              <input
                type="checkbox"
                checked={filtroStatusCap.includes("disponivel")}
                onChange={() => toggleValue("disponivel", setFiltroStatusCap)}
              />
              <span>Disponível</span>
            </label>
            <label className="prospects-check">
              <input
                type="checkbox"
                checked={filtroStatusCap.includes("indisponivel")}
                onChange={() => toggleValue("indisponivel", setFiltroStatusCap)}
              />
              <span>Indisponível</span>
            </label>
          </div>
        </div>
        <div className="prospects-filter-group">
          <label>Financia</label>
          <div className="prospects-checklist">
            <label className="prospects-check">
              <input
                type="checkbox"
                checked={filtroFinanciaCap.includes("sim")}
                onChange={() => toggleValue("sim", setFiltroFinanciaCap)}
              />
              <span>Sim</span>
            </label>
            <label className="prospects-check">
              <input
                type="checkbox"
                checked={filtroFinanciaCap.includes("nao")}
                onChange={() => toggleValue("nao", setFiltroFinanciaCap)}
              />
              <span>Não</span>
            </label>
          </div>
        </div>
        <div className="prospects-filter-group">
          <label>Itens por página</label>
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
          >
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>
        <div className="prospects-filter-actions">
          <button type="button" className="prospects-btn secondary" onClick={limparFiltros}>Limpar filtros</button>
        </div>
      </div>

      {mensagem && <div className="prospects-message">{mensagem}</div>}

      <TabelaSelecionados
        dados={selecionadosOrdenados}
        loading={loadingSel}
        erro={erroSel}
        onExcluir={setConfirmDeleteItem}
        onAtualizarPrioridade={handleAtualizarPrioridade}
        onEditarObservacoes={openObservacoesModal}
        removeLoadingIds={removeLoadingIds}
        updateLoadingIds={updateLoadingIds}
        sortDir={selectedSortDir}
        onToggleSort={() => setSelectedSortDir((prev) => (prev === "asc" ? "desc" : "asc"))}
      />

      <div className="prospects-gap" />

      <TabelaCapturados
        dados={capturados}
        total={capturadosTotal}
        page={page}
        pageSize={pageSize}
        loading={loadingCap}
        erro={erroCap}
        onIncluir={handleIncluir}
        includeLoadingIds={includeLoadingIds}
        expanded={expanded}
        toggleExpand={toggleExpand}
        onPageChange={handlePageChange}
        sortBy={sortBy}
        sortDir={sortDir}
        onSortChange={handleSortChange}
      />

      <ConfirmarExclusaoModal
        item={confirmDeleteItem}
        loading={Boolean(confirmDeleteItem && removeLoadingIds.has(confirmDeleteItem.codigo))}
        onCancel={() => setConfirmDeleteItem(null)}
        onConfirm={() => confirmDelete(confirmDeleteItem)}
      />

      <ObservacoesModal
        item={observacaoItem}
        value={observacaoDraft}
        loading={Boolean(observacaoItem && updateLoadingIds.has(`${observacaoItem.codigo}:observacoes`))}
        onChange={setObservacaoDraft}
        onCancel={() => {
          setObservacaoItem(null);
          setObservacaoDraft("");
        }}
        onSave={handleSalvarObservacoes}
      />
    </div>
  );
}
