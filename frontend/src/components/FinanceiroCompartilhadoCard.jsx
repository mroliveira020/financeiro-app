import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { fetchFinanceiroCompartilhado } from "../services/api";

const formatarMoeda = (valor) =>
  Number(valor ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function FinanceiroCompartilhadoCard({ refreshKey = 0 }) {
  const { id } = useParams();
  const [estado, setEstado] = useState({
    carregando: true,
    erro: "",
    dados: null,
  });

  useEffect(() => {
    let ativo = true;
    setEstado((prev) => ({ ...prev, carregando: true, erro: "" }));

    fetchFinanceiroCompartilhado(id)
      .then((dados) => {
        if (!ativo) return;
        setEstado({ carregando: false, erro: "", dados });
      })
      .catch((error) => {
        if (!ativo) return;
        const mensagem =
          error?.response?.data?.error ||
          error?.message ||
          "Não foi possível carregar a posição compartilhada.";
        setEstado({ carregando: false, erro: mensagem, dados: null });
      });

    return () => {
      ativo = false;
    };
  }, [id, refreshKey]);

  const socios = useMemo(() => estado.dados?.socios || [], [estado.dados]);
  const equalizacoes = useMemo(() => estado.dados?.equalizacoes || [], [estado.dados]);
  const totais = estado.dados?.totais || {};

  return (
    <section className="dashboard-card financeiro-compartilhado-card">
      <header className="financeiro-compartilhado-card__header">
        <div>
          <h2>Financeiro Compartilhado</h2>
          <span className="text-muted small">
            Painel técnico inicial para validar composição, rateio e compensações entre sócios.
          </span>
        </div>
      </header>

      {estado.carregando ? (
        <p className="text-muted mb-0">Carregando posição compartilhada...</p>
      ) : estado.erro ? (
        <div className="alert alert-warning mb-0" role="alert">
          {estado.erro}
        </div>
      ) : (
        <div className="financeiro-compartilhado-card__content">
          <div className="financeiro-compartilhado-card__metrics">
            <article className="financeiro-compartilhado-card__metric">
              <span>Despesas operacionais</span>
              <strong>{formatarMoeda(totais.total_despesas_operacionais)}</strong>
            </article>
            <article className="financeiro-compartilhado-card__metric">
              <span>Equalizações</span>
              <strong>{formatarMoeda(totais.total_equalizacoes)}</strong>
            </article>
            <article className="financeiro-compartilhado-card__metric">
              <span>Não atribuído</span>
              <strong>{formatarMoeda(totais.total_nao_atribuido)}</strong>
            </article>
          </div>

          <div className="financeiro-compartilhado-card__section">
            <h3>Sócios e posição atual</h3>
            {socios.length ? (
              <div className="table-responsive">
                <table className="table table-sm align-middle mb-0">
                  <thead>
                    <tr>
                      <th>Sócio</th>
                      <th className="text-end">Participação</th>
                      <th className="text-end">Pago</th>
                      <th className="text-end">Devido</th>
                      <th className="text-end">Env. equalização</th>
                      <th className="text-end">Rec. equalização</th>
                      <th className="text-end">Saldo líquido</th>
                    </tr>
                  </thead>
                  <tbody>
                    {socios.map((socio) => (
                      <tr key={socio.user_id}>
                        <td>
                          <div className="financeiro-compartilhado-card__person">
                            <strong>{socio.user_name || socio.user_email || `Usuário ${socio.user_id}`}</strong>
                            <span>{socio.user_email || "Sem e-mail"}</span>
                          </div>
                        </td>
                        <td className="text-end">{Number(socio.percentual_participacao || 0).toLocaleString("pt-BR")} %</td>
                        <td className="text-end">{formatarMoeda(socio.total_pago_operacional)}</td>
                        <td className="text-end">{formatarMoeda(socio.valor_devido_participacao)}</td>
                        <td className="text-end">{formatarMoeda(socio.equalizacao_enviada)}</td>
                        <td className="text-end">{formatarMoeda(socio.equalizacao_recebida)}</td>
                        <td className={`text-end ${Number(socio.saldo_liquido || 0) >= 0 ? "text-success" : "text-danger"}`}>
                          {formatarMoeda(socio.saldo_liquido)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-muted mb-0">Nenhum sócio configurado para este imóvel.</p>
            )}
          </div>

          <div className="financeiro-compartilhado-card__section">
            <h3>Equalizações registradas</h3>
            {equalizacoes.length ? (
              <div className="table-responsive">
                <table className="table table-sm align-middle mb-0">
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Descrição</th>
                      <th className="text-end">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {equalizacoes.map((item) => (
                      <tr key={item.id}>
                        <td>{item.data || "—"}</td>
                        <td>{item.descricao || "Equalização entre sócios"}</td>
                        <td className="text-end">{formatarMoeda(item.valor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-muted mb-0">Nenhuma equalização registrada até o momento.</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

export default FinanceiroCompartilhadoCard;
