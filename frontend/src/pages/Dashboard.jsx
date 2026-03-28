import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import DadosCadastrais from "../components/dadosCadastrais/DadosCadastrais";
import FinanceiroCompartilhadoCard from "../components/FinanceiroCompartilhadoCard";
import ResumoFinanceiro from "../components/ResumoFinanceiro";
import TransacoesIncompletas from "../components/TransacoesIncompletas/TransacoesIncompletas";
import TransacoesCompletas from "../components/transacoes/TransacoesCompletas";

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
  const dispararAtualizacao = useCallback(() => {
    setRefreshKey((prev) => prev + 1);
  }, []);

  return (
    <div className="dashboard-page">
      <div className="dashboard-container">
        <header className="dashboard-header">
          <div className="dashboard-header__title">
            <h1>Dashboard</h1>
            <span>Acompanhe o desempenho financeiro e operacional do imóvel</span>
          </div>
          <div className="dashboard-header__actions">
            <Link to="/" className="btn btn-outline-secondary">
              ← Voltar para a Home
            </Link>
          </div>
        </header>

        <section className="dashboard-main">
          <DadosCadastrais />
          <ResumoFinanceiro refreshKey={refreshKey} />
          <DeferredSection placeholder="Preparando posição compartilhada...">
            <FinanceiroCompartilhadoCard refreshKey={refreshKey} />
          </DeferredSection>
        </section>

        <section className="dashboard-transactions">
          <DeferredSection placeholder="Preparando transações incompletas...">
            <TransacoesIncompletas refreshKey={refreshKey} onChanged={dispararAtualizacao} />
          </DeferredSection>
          <DeferredSection placeholder="Preparando transações completas...">
            <TransacoesCompletas refreshKey={refreshKey} onChanged={dispararAtualizacao} />
          </DeferredSection>
        </section>
      </div>
    </div>
  );
}

export default Dashboard;
