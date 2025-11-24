import React, { useEffect, useMemo, useState } from "react";
import "./Prospeccoes.css";

import { fetchCapturados, fetchSelecionados } from "../services/prospeccoes";

const formatarMoeda = (valor) => Number(valor ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function TabelaSelecionados({ dados, loading, erro }) {
  if (loading) return <div className="prospects-card"><p className="prospects-empty">Carregando selecionados...</p></div>;
  if (erro) return <div className="prospects-card"><p className="prospects-empty">Erro ao carregar selecionados: {erro}</p></div>;
  if (!dados.length) return <div className="prospects-card"><p className="prospects-empty">Nenhum selecionado encontrado.</p></div>;

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
              <th>Link</th>
              <th>Cidade</th>
              <th>UF</th>
              <th>Status</th>
              <th>Valor máximo</th>
              <th>Valor referência</th>
              <th>Prioridade</th>
            </tr>
          </thead>
          <tbody>
            {dados.map((item) => (
              <tr key={item.codigo}>
                <td className="mono">{item.codigo}</td>
                <td>
                  <a className="prospects-link" href={item.link} target="_blank" rel="noreferrer">
                    Abrir
                  </a>
                </td>
                <td>{item.cidade}</td>
                <td>{item.uf}</td>
                <td>
                  <span className={`prospects-chip status-${(item.status || "").toLowerCase()}`}>{item.status || "—"}</span>
                </td>
                <td>{formatarMoeda(item.valorMaximo)}</td>
                <td>{item.valor ? formatarMoeda(item.valor) : "—"}</td>
                <td>
                  <span className={`prospects-chip priority-${(item.prioridade || "").toLowerCase()}`}>{item.prioridade || "—"}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TabelaCapturados({ dados, loading, erro }) {
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
              <th>Link</th>
              <th>Cidade</th>
              <th>UF</th>
              <th>Situação</th>
              <th>Modalidade</th>
              <th>Valor</th>
            </tr>
          </thead>
          <tbody>
            {dados.map((item) => (
              <tr key={item.codigo}>
                <td className="mono">{item.codigo}</td>
                <td>
                  <a className="prospects-link" href={item.link} target="_blank" rel="noreferrer">
                    Abrir
                  </a>
                </td>
                <td>{item.cidade}</td>
                <td>{item.uf}</td>
                <td>{item.situacao}</td>
                <td>{item.modalidade}</td>
                <td>{formatarMoeda(item.valor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function Prospeccoes() {
  const [selecionados, setSelecionados] = useState([]);
  const [capturados, setCapturados] = useState([]);
  const [loadingSel, setLoadingSel] = useState(false);
  const [loadingCap, setLoadingCap] = useState(false);
  const [erroSel, setErroSel] = useState("");
  const [erroCap, setErroCap] = useState("");

  const totalSel = useMemo(() => selecionados.length, [selecionados]);
  const totalCap = useMemo(() => capturados.length, [capturados]);

  useEffect(() => {
    const carregar = async () => {
      setLoadingSel(true);
      setLoadingCap(true);
      setErroSel("");
      setErroCap("");
      try {
        const [sel, cap] = await Promise.all([fetchSelecionados(), fetchCapturados({ limit: 50 })]);
        setSelecionados(sel || []);
        setCapturados(cap || []);
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
  }, []);

  return (
    <div className="prospects-page">
      <div className="prospects-header">
        <div>
          <p className="prospects-eyebrow">Pipeline de oportunidades</p>
          <h1 className="prospects-hero">Prospecções</h1>
          <p className="prospects-subtitle">
            Acompanhe os imóveis em decisão e os últimos capturados pelo garimpo. Dados carregados do Supabase.
          </p>
        </div>
        <div className="prospects-actions" aria-hidden />
      </div>

      <TabelaSelecionados dados={selecionados} loading={loadingSel} erro={erroSel} />

      <div className="prospects-gap" />

      <TabelaCapturados dados={capturados} loading={loadingCap} erro={erroCap} />
    </div>
  );
}
