import React, { useEffect, useMemo, useState } from "react";
import "./Prospeccoes.css";

import { fetchCapturados, fetchSelecionados, adicionarSelecionado, fetchProspecMeta } from "../services/prospeccoes";

const formatarMoeda = (valor) => Number(valor ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function TabelaSelecionados({ dados, loading, erro }) {
  if (loading) return <div className="prospects-card"><p className="prospects-empty">Carregando selecionados...</p></div>;
  if (erro) return <div className="prospects-card"><p className="prospects-empty">Erro ao carregar selecionados: {erro}</p></div>;
  if (!dados.length) return <div className="prospects-card"><p className="prospects-empty">Nenhum selecionado encontrado.</p></div>;

  const formatStatus = (status) => {
    if (!status) return { label: "—", cls: "" };
    const label = `${status}`.trim();
    return { label, cls: label.toLowerCase() };
  };

  const formatPrioridade = (pri) => {
    if (pri === null || pri === undefined) return { label: "—", cls: "" };
    if (typeof pri === "number") {
      if (pri >= 3) return { label: "Alta", cls: "alta" };
      if (pri <= 1) return { label: "Baixa", cls: "baixa" };
      return { label: "Média", cls: "media" };
    }
    const label = `${pri}`.trim();
    return { label, cls: label.toLowerCase() };
  };

  return (
    <div className="prospects-card">
      <div className="prospects-card__header">
        <div>
          <p className="prospects-eyebrow">Fila de decisão</p>
          <h2 className="prospects-title">Selecionados</h2>
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
              <th>Status</th>
              <th>Valor máximo</th>
              <th>Valor referência</th>
              <th>Prioridade</th>
              <th>Descrição</th>
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
                <td>
                  {(() => {
                    const { label, cls } = formatStatus(item.status);
                    return <span className={`prospects-chip status-${cls}`}>{label}</span>;
                  })()}
                </td>
                <td>{formatarMoeda(item.valorMaximo)}</td>
                <td>{item.valor ? formatarMoeda(item.valor) : "—"}</td>
                <td>
                  {(() => {
                    const { label, cls } = formatPrioridade(item.prioridade);
                    return <span className={`prospects-chip priority-${cls}`}>{label}</span>;
                  })()}
                </td>
                <td>{item.descricao || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TabelaCapturados({ dados, loading, erro, onIncluir, includeLoadingIds, expanded, toggleExpand }) {
  if (loading) return <div className="prospects-card"><p className="prospects-empty">Carregando capturados...</p></div>;
  if (erro) return <div className="prospects-card"><p className="prospects-empty">Erro ao carregar capturados: {erro}</p></div>;
  if (!dados.length) return <div className="prospects-card"><p className="prospects-empty">Nenhum capturado encontrado.</p></div>;

  return (
    <div className="prospects-card">
      <div className="prospects-card__header">
        <div>
          <p className="prospects-eyebrow">Última coleta</p>
          <h2 className="prospects-title">Capturados</h2>
        </div>
        <span className="prospects-pill">{dados.length} registros</span>
      </div>
      <div className="prospects-table-wrap">
        <table className="prospects-table">
          <thead>
            <tr>
              <th>Código</th>
              <th>Cidade</th>
              <th>UF</th>
              <th>Situação</th>
              <th>Modalidade</th>
              <th>Valor</th>
              <th>Última disputa</th>
              <th>Descrição</th>
              <th>Financia</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {dados.map((item) => (
              <React.Fragment key={item.codigo}>
                <tr className="prospects-expandable" onClick={() => toggleExpand(item.codigo)}>
                  <td className="mono">
                    <a className="prospects-link" href={item.link} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                      {item.codigo}
                    </a>
                  </td>
                  <td>{item.cidade}</td>
                  <td>{item.uf}</td>
                  <td>{item.modalidade}</td>
                  <td>{item.valor ? formatarMoeda(item.valor) : "—"}</td>
                  <td>{formatarData(item.ultima_disputa)}</td>
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
                    <td colSpan={10}>
                      <div><strong>Endereço:</strong> {item.endereco || "—"}</div>
                      <div><strong>Bairro:</strong> {item.bairro || "—"}</div>
                      <div><strong>Coletado em:</strong> {item.coletadoEm || "—"}</div>
                      <div><strong>Data Leilão 1:</strong> {item.data_leilao_1 || "—"}</div>
                      <div><strong>Data Leilão 2:</strong> {item.data_leilao_2 || "—"}</div>
                      <div><strong>Data Licitação Aberta:</strong> {item.data_licitacao_aberta || "—"}</div>
                      <div><strong>Fonte:</strong> {item.fonte || "—"}</div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function Prospeccoes() {
  const [selecionados, setSelecionados] = useState([]);
  const [capturadosBrutos, setCapturadosBrutos] = useState([]);
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
  const [mensagem, setMensagem] = useState("");
  const [meta, setMeta] = useState({ ufs: [], modalidades: [], financia: [] });
  const [expanded, setExpanded] = useState(new Set());
  const [sortBy, setSortBy] = useState("coletado_em");
  const [sortDir, setSortDir] = useState("desc");

  const handleMultiSelect = (event, setter) => {
    const values = Array.from(event.target.selectedOptions || []).map((opt) => opt.value).filter(Boolean);
    setter(values);
  };

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

  useEffect(() => {
    const carregar = async () => {
      setLoadingSel(true);
      setLoadingCap(true);
      setErroSel("");
      setErroCap("");
      try {
        const [sel, cap] = await Promise.all([
          fetchSelecionados({}),
          fetchCapturados({ limit: 200 }),
        ]);
        setSelecionados(sel || []);
        setCapturadosBrutos(cap || []);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Erro inesperado";
        setErroSel(message);
        setErroCap(message);
      } finally {
        setLoadingSel(false);
        setLoadingCap(false);
      }
    };
    carregar();
  }, [filtroUfCap, filtroCidadesCap, filtroModalidadeCap, filtroStatusCap, filtroFinanciaCap, limitCap]);

  useEffect(() => {
    fetchProspecMeta()
      .then((resp) => setMeta(resp))
      .catch(() => setMeta({ ufs: [], modalidades: [], financia: [] }));
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

  const capturados = useMemo(() => {
    const normalize = (v) => `${v || ""}`.trim().toLowerCase();
    const filtrados = (capturadosBrutos || []).filter((item) => {
      if (filtroUfCap.length && !filtroUfCap.map(normalize).includes(normalize(item.uf))) {
        return false;
      }
      if (filtroCidadesCap.length && !filtroCidadesCap.map(normalize).includes(normalize(item.cidade))) {
        return false;
      }
      if (filtroModalidadeCap.length && !filtroModalidadeCap.map(normalize).includes(normalize(item.modalidade))) {
        return false;
      }
      if (filtroStatusCap.length && !filtroStatusCap.map(normalize).includes(normalize(item.situacao))) {
        return false;
      }
      if (filtroFinanciaCap.length) {
        const fin = item.financia ? "sim" : "nao";
        if (!filtroFinanciaCap.map(normalize).includes(fin)) {
          return false;
        }
      }
      return true;
    });
    return filtrados.slice(0, limitCap);
  }, [capturadosBrutos, filtroUfCap, filtroCidadesCap, filtroModalidadeCap, filtroStatusCap, filtroFinanciaCap]);

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
        valor_maximo: item.valor,
        prioridade: "Média",
        observacoes: `Adicionado via UI em ${new Date().toISOString()}`,
      });
      setMensagem(`Imóvel ${item.codigo} incluído em selecionados.`);
      // Recarrega selecionados para refletir
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

  const toggleExpand = (codigo) => {
    const next = new Set(expanded);
    if (next.has(codigo)) {
      next.delete(codigo);
    } else {
      next.add(codigo);
    }
    setExpanded(next);
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
          <label>Exibir</label>
          <select value={limitCap} onChange={(e) => setLimitCap(Number(e.target.value))}>
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

      <TabelaSelecionados dados={selecionados} loading={loadingSel} erro={erroSel} />

      <div className="prospects-gap" />

      <TabelaCapturados
        dados={capturados}
        loading={loadingCap}
        erro={erroCap}
        onIncluir={handleIncluir}
        includeLoadingIds={includeLoadingIds}
        expanded={expanded}
        toggleExpand={toggleExpand}
      />
    </div>
  );
}
