import React from "react";
import "./Prospeccoes.css";

const selecionadosMock = [
  { codigo: "8787700428805", cidade: "Imbassaí", uf: "BA", status: "Aprovado", valorMaximo: 320000, prioridade: "Alta" },
  { codigo: "8787702583905", cidade: "Jataizinho", uf: "PR", status: "Candidato", valorMaximo: 210000, prioridade: "Média" },
];

const capturadosMock = [
  { codigo: "8444402764464", cidade: "Pires do Rio", uf: "GO", situacao: "Disponível", modalidade: "Venda Direta", valor: 185000 },
  { codigo: "7788801122334", cidade: "Jacarezinho", uf: "PR", situacao: "Disponível", modalidade: "Venda Direta Online", valor: 265000 },
  { codigo: "6677009988776", cidade: "Porto Alegre", uf: "RS", situacao: "Em análise", modalidade: "Venda Direta", valor: 190000 },
];

const formatarMoeda = (valor) => Number(valor ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function TabelaSelecionados({ dados }) {
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
              <th>Prioridade</th>
            </tr>
          </thead>
          <tbody>
            {dados.map((item) => (
              <tr key={item.codigo}>
                <td className="mono">{item.codigo}</td>
                <td>{item.cidade}</td>
                <td>{item.uf}</td>
                <td>
                  <span className={`prospects-chip status-${item.status.toLowerCase()}`}>{item.status}</span>
                </td>
                <td>{formatarMoeda(item.valorMaximo)}</td>
                <td>
                  <span className={`prospects-chip priority-${item.prioridade.toLowerCase()}`}>{item.prioridade}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TabelaCapturados({ dados }) {
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
            </tr>
          </thead>
          <tbody>
            {dados.map((item) => (
              <tr key={item.codigo}>
                <td className="mono">{item.codigo}</td>
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
  return (
    <div className="prospects-page">
      <div className="prospects-header">
        <div>
          <p className="prospects-eyebrow">Pipeline de oportunidades</p>
          <h1 className="prospects-hero">Prospecções</h1>
          <p className="prospects-subtitle">
            Acompanhe os imóveis em decisão e os últimos capturados pelo garimpo. Dados já estão normalizados no Supabase.
          </p>
        </div>
        <div className="prospects-actions">
          <button type="button" className="prospects-btn secondary">Exportar CSV</button>
          <button type="button" className="prospects-btn primary">Nova coleta</button>
        </div>
      </div>

      <TabelaSelecionados dados={selecionadosMock} />

      <div className="prospects-gap" />

      <TabelaCapturados dados={capturadosMock} />
    </div>
  );
}
