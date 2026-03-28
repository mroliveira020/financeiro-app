import React, { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import "bootstrap/dist/css/bootstrap.min.css";

import DadosCadastrais from "../components/dadosCadastrais/DadosCadastrais";
import FinanceiroCompartilhadoCard from "../components/FinanceiroCompartilhadoCard";
import ResumoFinanceiro from "../components/ResumoFinanceiro";
import TransacoesIncompletas from "../components/TransacoesIncompletas/TransacoesIncompletas";
import TransacoesCompletas from "../components/transacoes/TransacoesCompletas";

import "./Dashboard.css";

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
          <FinanceiroCompartilhadoCard refreshKey={refreshKey} />
        </section>

        <section className="dashboard-transactions">
          <TransacoesIncompletas refreshKey={refreshKey} onChanged={dispararAtualizacao} />
          <TransacoesCompletas refreshKey={refreshKey} onChanged={dispararAtualizacao} />
        </section>
      </div>
    </div>
  );
}

export default Dashboard;
