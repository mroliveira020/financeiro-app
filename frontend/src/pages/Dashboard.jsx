import React, { useCallback, useEffect, useRef, useState } from "react";

import DadosCadastrais from "../components/dadosCadastrais/DadosCadastrais";
import FinanceiroCompartilhadoCard from "../components/FinanceiroCompartilhadoCard";
import ResumoFinanceiro from "../components/ResumoFinanceiro";
import TransacoesIncompletas from "../components/TransacoesIncompletas/TransacoesIncompletas";
import TransacoesCompletas from "../components/transacoes/TransacoesCompletas";
import { useCompactLayout } from "../hooks/useCompactLayout";

import "./Dashboard.css";

function DeferredSection({ children, placeholder = "Carregando seção...", rootMargin = "240px" }) {
  const [ativado, setAtivado] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (ativado) return undefined;
    const node = containerRef.current;
    if (!node) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        const visivel = entries.some((entry) => entry.isIntersecting);
        if (visivel) {
          setAtivado(true);
          observer.disconnect();
        }
      },
      { rootMargin }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [ativado, rootMargin]);

  return (
    <div ref={containerRef}>
      {ativado ? (
        children
      ) : (
        <section className="dashboard-card dashboard-section-placeholder">
          <span>{placeholder}</span>
        </section>
      )}
    </div>
  );
}

function Dashboard() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [financeViewMode, setFinanceViewMode] = useState("total");
  const compactLayout = useCompactLayout();
  const dispararAtualizacao = useCallback(() => {
    setRefreshKey((prev) => prev + 1);
  }, []);

  return (
    <div className="dashboard-page">
      <div className="dashboard-container">
        <section className="dashboard-main">
          <section className="dashboard-card dashboard-view-toolbar">
            <div className="dashboard-view-toolbar__copy">
              <h2>Visão financeira</h2>
              <span>Alterne entre os números totais do imóvel e a leitura proporcional da sua participação.</span>
            </div>
            <div className="dashboard-view-toggle" role="tablist" aria-label="Alternar visão financeira">
              <button
                type="button"
                role="tab"
                aria-selected={financeViewMode === "total"}
                className={`dashboard-view-toggle__button ${financeViewMode === "total" ? "is-active" : ""}`.trim()}
                onClick={() => setFinanceViewMode("total")}
              >
                Total
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={financeViewMode === "minha_participacao"}
                className={`dashboard-view-toggle__button ${financeViewMode === "minha_participacao" ? "is-active" : ""}`.trim()}
                onClick={() => setFinanceViewMode("minha_participacao")}
              >
                Minha participação
              </button>
            </div>
          </section>
          <DadosCadastrais refreshKey={refreshKey} onChanged={dispararAtualizacao} />
          <section id="resumo-financeiro">
            <ResumoFinanceiro refreshKey={refreshKey} viewMode={financeViewMode} />
          </section>
          <section id="financeiro-compartilhado">
            <DeferredSection placeholder="Preparando posição compartilhada...">
              <FinanceiroCompartilhadoCard
                refreshKey={refreshKey}
                onChanged={dispararAtualizacao}
                viewMode={financeViewMode}
              />
            </DeferredSection>
          </section>
        </section>

        <section className="dashboard-transactions">
          {!compactLayout && (
            <section id="transacoes-incompletas">
              <DeferredSection placeholder="Preparando transações incompletas...">
                <TransacoesIncompletas refreshKey={refreshKey} onChanged={dispararAtualizacao} />
              </DeferredSection>
            </section>
          )}
          <section id="transacoes-completas">
            <DeferredSection placeholder="Preparando transações completas...">
              <TransacoesCompletas refreshKey={refreshKey} onChanged={dispararAtualizacao} />
            </DeferredSection>
          </section>
        </section>
      </div>
    </div>
  );
}

export default Dashboard;
