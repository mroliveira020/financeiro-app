import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { fetchFinanceiroCompartilhado, registrarEqualizacao } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { useCompactLayout } from "../hooks/useCompactLayout";

const formatarMoeda = (valor) =>
  Number(valor ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const dataHojeIso = () => new Date().toISOString().slice(0, 10);

const formatarDataBrasil = (valor) => {
  if (!valor) return "—";

  if (typeof valor === "string") {
    const matchIso = valor.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (matchIso) {
      const [, ano, mes, dia] = matchIso;
      return `${dia}/${mes}/${ano}`;
    }

    const matchBr = valor.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (matchBr) {
      return valor;
    }
  }

  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return String(valor);

  return data.toLocaleDateString("pt-BR");
};

function FinanceiroCompartilhadoCard({ refreshKey = 0, onChanged }) {
  const { id } = useParams();
  const { hasRole, user } = useAuth();
  const [estado, setEstado] = useState({
    carregando: true,
    erro: "",
    dados: null,
  });
  const [form, setForm] = useState({
    data: dataHojeIso(),
    paid_by_user_id: "",
    beneficiary_user_id: "",
    valor: "",
    descricao: "",
  });
  const [salvandoEqualizacao, setSalvandoEqualizacao] = useState(false);
  const [erroEqualizacao, setErroEqualizacao] = useState("");
  const [modalEqualizacaoAberto, setModalEqualizacaoAberto] = useState(false);
  const compactLayout = useCompactLayout();

  const carregar = useCallback(() => {
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
  }, [id]);

  useEffect(() => {
    return carregar();
  }, [carregar, refreshKey]);

  const socios = useMemo(() => estado.dados?.socios || [], [estado.dados]);
  const equalizacoes = useMemo(() => estado.dados?.equalizacoes || [], [estado.dados]);
  const totais = estado.dados?.totais || {};
  const canRegisterEqualizacao = hasRole("admin", "editor") || Boolean(user?.finance_access);
  const sociosPorId = useMemo(
    () =>
      socios.reduce((acc, socio) => {
        acc[String(socio.user_id)] = socio;
        return acc;
      }, {}),
    [socios]
  );

  const formatarNomeSocio = useCallback(
    (userId) => {
      const socio = sociosPorId[String(userId)];
      if (!socio) return "—";
      return socio.user_name || socio.user_email || `Usuário ${userId}`;
    },
    [sociosPorId]
  );

  const socioAtual = useMemo(() => socios.find((socio) => Number(socio.user_id) === Number(user?.id)) || null, [socios, user?.id]);
  const saldoAPagar = useMemo(() => {
    const saldo = Number(socioAtual?.saldo_liquido || 0);
    return saldo < 0 ? Math.abs(saldo) : 0;
  }, [socioAtual]);
  const saldoAReceber = useMemo(() => {
    const saldo = Number(socioAtual?.saldo_liquido || 0);
    return saldo > 0 ? saldo : 0;
  }, [socioAtual]);
  const credores = useMemo(
    () =>
      socios
        .filter((socio) => Number(socio.user_id) !== Number(user?.id) && Number(socio.saldo_liquido || 0) > 0)
        .sort((a, b) => Number(b.saldo_liquido || 0) - Number(a.saldo_liquido || 0)),
    [socios, user?.id]
  );
  const devedores = useMemo(
    () =>
      socios
        .filter((socio) => Number(socio.user_id) !== Number(user?.id) && Number(socio.saldo_liquido || 0) < 0)
        .sort((a, b) => Math.abs(Number(b.saldo_liquido || 0)) - Math.abs(Number(a.saldo_liquido || 0))),
    [socios, user?.id]
  );
  const podeRegistrarMinhaEqualizacao =
    canRegisterEqualizacao &&
    Number(user?.id) > 0 &&
    ((saldoAPagar > 0 && credores.length > 0) || (saldoAReceber > 0 && devedores.length > 0));

  const direcaoEqualizacao = saldoAPagar > 0 ? "pagar" : saldoAReceber > 0 ? "receber" : null;
  const contrapartePrincipal = useMemo(() => {
    if (direcaoEqualizacao === "pagar") return credores[0] || null;
    if (direcaoEqualizacao === "receber") return devedores[0] || null;
    return null;
  }, [credores, devedores, direcaoEqualizacao]);
  const chavePixAtual = socioAtual?.user_pix_key || "";
  const chavePixContraparte = contrapartePrincipal?.user_pix_key || "";

  useEffect(() => {
    if (podeRegistrarMinhaEqualizacao && !form.paid_by_user_id && !form.beneficiary_user_id) {
      const valorSugerido = (direcaoEqualizacao === "pagar" ? saldoAPagar : saldoAReceber).toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      if (direcaoEqualizacao === "pagar" && credores[0]) {
        setForm((prev) => ({
          ...prev,
          paid_by_user_id: String(user.id),
          beneficiary_user_id: String(credores[0].user_id),
          valor: valorSugerido,
        }));
      }
      if (direcaoEqualizacao === "receber" && devedores[0]) {
        setForm((prev) => ({
          ...prev,
          paid_by_user_id: String(devedores[0].user_id),
          beneficiary_user_id: String(user.id),
          valor: valorSugerido,
        }));
      }
    }
  }, [
    credores,
    devedores,
    direcaoEqualizacao,
    form.beneficiary_user_id,
    form.paid_by_user_id,
    podeRegistrarMinhaEqualizacao,
    saldoAPagar,
    saldoAReceber,
    user?.id,
  ]);

  const handleChange = (campo, valor) => {
    setForm((prev) => ({ ...prev, [campo]: valor }));
  };

  const handleSubmitEqualizacao = async (event) => {
    event.preventDefault();
    setErroEqualizacao("");

    if (!form.paid_by_user_id || !form.beneficiary_user_id) {
      setErroEqualizacao("Selecione quem pagou e quem recebeu.");
      return;
    }
    if (form.paid_by_user_id === form.beneficiary_user_id) {
      setErroEqualizacao("Pagador e recebedor devem ser diferentes.");
      return;
    }

    const valorNormalizado = Number(String(form.valor || "").replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(valorNormalizado) || valorNormalizado <= 0) {
      setErroEqualizacao("Informe um valor válido para a equalização.");
      return;
    }

    setSalvandoEqualizacao(true);
    try {
      await registrarEqualizacao(id, {
        data: form.data,
        paid_by_user_id: Number(form.paid_by_user_id),
        beneficiary_user_id: Number(form.beneficiary_user_id),
        valor: valorNormalizado,
        descricao: form.descricao?.trim() || "Equalização entre sócios",
      });
      setForm({
        data: dataHojeIso(),
        paid_by_user_id:
          direcaoEqualizacao === "receber" && devedores[0]
            ? String(devedores[0].user_id)
            : String(user?.id || ""),
        beneficiary_user_id:
          direcaoEqualizacao === "pagar"
            ? (credores[0] ? String(credores[0].user_id) : "")
            : String(user?.id || ""),
        valor: "",
        descricao: "",
      });
      setModalEqualizacaoAberto(false);
      onChanged?.();
      carregar();
    } catch (error) {
      setErroEqualizacao(
        error?.response?.data?.error ||
        error?.message ||
        "Não foi possível registrar a equalização."
      );
    } finally {
      setSalvandoEqualizacao(false);
    }
  };

  const statusSocio = useCallback((saldo) => {
    const valor = Number(saldo || 0);
    if (valor > 0) {
      return { classe: "is-positive", icone: "↓", texto: "A receber" };
    }
    if (valor < 0) {
      return { classe: "is-negative", icone: "↑", texto: "A pagar" };
    }
    return { classe: "is-neutral", icone: "•", texto: "Equalizado" };
  }, []);

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

          {podeRegistrarMinhaEqualizacao && (
            <div className="financeiro-compartilhado-card__section">
              <div className="financeiro-compartilhado-card__section-head">
                <h3>Equalização sugerida</h3>
                <span className="text-muted small">
                  {direcaoEqualizacao === "pagar"
                    ? "Você está com saldo a pagar. Registre o acerto sem distorcer o custo operacional do imóvel."
                    : "Você está com saldo a receber. Registre o recebimento do acerto entre sócios."}
                </span>
              </div>
              <div className="financeiro-compartilhado-card__cta">
                <div className="financeiro-compartilhado-card__cta-copy">
                  <strong>{formatarMoeda(direcaoEqualizacao === "pagar" ? saldoAPagar : saldoAReceber)}</strong>
                  {direcaoEqualizacao === "pagar" && contrapartePrincipal ? (
                    <span>
                      Pagar para {contrapartePrincipal.user_name || contrapartePrincipal.user_email}
                      {chavePixContraparte ? ` via Pix: ${chavePixContraparte}` : ""}
                    </span>
                  ) : null}
                  {direcaoEqualizacao === "receber" ? (
                    <span>
                      Receber de {contrapartePrincipal?.user_name || contrapartePrincipal?.user_email || "sócio"}
                      {chavePixAtual ? ` no Pix: ${chavePixAtual}` : " e informe sua chave Pix no cadastro, se necessário"}
                    </span>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => setModalEqualizacaoAberto(true)}
                >
                  {direcaoEqualizacao === "pagar"
                    ? `Registrar pagamento de ${formatarMoeda(saldoAPagar)}`
                    : `Registrar recebimento de ${formatarMoeda(saldoAReceber)}`}
                </button>
              </div>
            </div>
          )}

          <div className="financeiro-compartilhado-card__section">
            <h3>Sócios e posição atual</h3>
            {socios.length ? (
              compactLayout ? (
                <div className="financeiro-compartilhado-card__mobile-list">
                  {socios.map((socio) => (
                    <article key={socio.user_id} className="financeiro-compartilhado-card__mobile-item">
                      <div className="financeiro-compartilhado-card__person">
                        <strong>{socio.user_name || socio.user_email || `Usuário ${socio.user_id}`}</strong>
                        <span>{socio.user_email || "Sem e-mail"}</span>
                        <span className={`financeiro-compartilhado-card__flag ${statusSocio(socio.saldo_liquido).classe}`}>
                          {statusSocio(socio.saldo_liquido).icone} {statusSocio(socio.saldo_liquido).texto}
                        </span>
                        {socio.user_pix_key ? (
                          <span className="financeiro-compartilhado-card__pix">Pix: {socio.user_pix_key}</span>
                        ) : null}
                      </div>
                      <dl>
                        <div>
                          <dt>Participação</dt>
                          <dd>{Number(socio.percentual_participacao || 0).toLocaleString("pt-BR")} %</dd>
                        </div>
                        <div>
                          <dt>Pago</dt>
                          <dd>{formatarMoeda(socio.total_pago_operacional)}</dd>
                        </div>
                        <div>
                          <dt>Devido</dt>
                          <dd>{formatarMoeda(socio.valor_devido_participacao)}</dd>
                        </div>
                        <div>
                          <dt>Env. equalização</dt>
                          <dd>{formatarMoeda(socio.equalizacao_enviada)}</dd>
                        </div>
                        <div>
                          <dt>Rec. equalização</dt>
                          <dd>{formatarMoeda(socio.equalizacao_recebida)}</dd>
                        </div>
                        <div>
                          <dt>Saldo líquido</dt>
                          <dd className={Number(socio.saldo_liquido || 0) >= 0 ? "text-success" : "text-danger"}>
                            {formatarMoeda(socio.saldo_liquido)}
                          </dd>
                        </div>
                      </dl>
                    </article>
                  ))}
                </div>
              ) : (
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
                              <span className={`financeiro-compartilhado-card__flag ${statusSocio(socio.saldo_liquido).classe}`}>
                                {statusSocio(socio.saldo_liquido).icone} {statusSocio(socio.saldo_liquido).texto}
                              </span>
                              {socio.user_pix_key ? (
                                <span className="financeiro-compartilhado-card__pix">Pix: {socio.user_pix_key}</span>
                              ) : null}
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
              )
            ) : (
              <p className="text-muted mb-0">Nenhum sócio configurado para este imóvel.</p>
            )}
          </div>

          <div className="financeiro-compartilhado-card__section">
            <h3>Equalizações registradas</h3>
            {equalizacoes.length ? (
              compactLayout ? (
                <div className="financeiro-compartilhado-card__mobile-list">
                  {equalizacoes.map((item) => (
                    <article key={item.id} className="financeiro-compartilhado-card__mobile-item">
                      <dl>
                        <div>
                          <dt>Data</dt>
                          <dd>{formatarDataBrasil(item.data)}</dd>
                        </div>
                        <div>
                          <dt>Quem pagou</dt>
                          <dd>{formatarNomeSocio(item.paid_by_user_id)}</dd>
                        </div>
                        <div>
                          <dt>Quem recebeu</dt>
                          <dd>{formatarNomeSocio(item.beneficiary_user_id)}</dd>
                        </div>
                        <div>
                          <dt>Descrição</dt>
                          <dd>{item.descricao || "Equalização entre sócios"}</dd>
                        </div>
                        <div>
                          <dt>Valor</dt>
                          <dd>{formatarMoeda(item.valor)}</dd>
                        </div>
                      </dl>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="table-responsive">
                  <table className="table table-sm align-middle mb-0">
                    <thead>
                      <tr>
                        <th>Data</th>
                        <th>Quem pagou</th>
                        <th>Quem recebeu</th>
                        <th>Descrição</th>
                        <th className="text-end">Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {equalizacoes.map((item) => (
                        <tr key={item.id}>
                          <td>{formatarDataBrasil(item.data)}</td>
                          <td>{formatarNomeSocio(item.paid_by_user_id)}</td>
                          <td>{formatarNomeSocio(item.beneficiary_user_id)}</td>
                          <td>{item.descricao || "Equalização entre sócios"}</td>
                          <td className="text-end">{formatarMoeda(item.valor)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            ) : (
              <p className="text-muted mb-0">Nenhuma equalização registrada até o momento.</p>
            )}
          </div>
        </div>
      )}

      {modalEqualizacaoAberto ? (
        <div className="modal fade show" style={{ display: "block" }} tabIndex="-1" aria-hidden="true">
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Registrar equalização</h5>
                <button type="button" className="btn-close" aria-label="Fechar" onClick={() => setModalEqualizacaoAberto(false)}></button>
              </div>
              <form onSubmit={handleSubmitEqualizacao}>
                <div className="modal-body">
                  <div className="mb-2">
                    <label className="form-label">Data</label>
                    <input
                      type="date"
                      className="form-control form-control-sm"
                      value={form.data}
                      onChange={(e) => handleChange("data", e.target.value)}
                      disabled={salvandoEqualizacao}
                    />
                  </div>
                  <div className="mb-2">
                    <label className="form-label">Quem pagou</label>
                    {direcaoEqualizacao === "receber" ? (
                      <select
                        className="form-select form-select-sm"
                        value={form.paid_by_user_id}
                        onChange={(e) => handleChange("paid_by_user_id", e.target.value)}
                        disabled={salvandoEqualizacao}
                      >
                        <option value="">Selecione</option>
                        {devedores.map((socio) => (
                          <option key={socio.user_id} value={socio.user_id}>
                            {socio.user_name || socio.user_email}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        className="form-control form-control-sm"
                        value={formatarNomeSocio(form.paid_by_user_id)}
                        disabled
                      />
                    )}
                  </div>
                  <div className="mb-2">
                    <label className="form-label">Quem recebeu</label>
                    {direcaoEqualizacao === "pagar" ? (
                      <select
                        className="form-select form-select-sm"
                        value={form.beneficiary_user_id}
                        onChange={(e) => handleChange("beneficiary_user_id", e.target.value)}
                        disabled={salvandoEqualizacao}
                      >
                        <option value="">Selecione</option>
                        {credores.map((socio) => (
                          <option key={socio.user_id} value={socio.user_id}>
                            {socio.user_name || socio.user_email}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        className="form-control form-control-sm"
                        value={formatarNomeSocio(form.beneficiary_user_id)}
                        disabled
                      />
                    )}
                  </div>
                  {direcaoEqualizacao === "pagar" && form.beneficiary_user_id ? (
                    <div className="alert alert-info py-2 small">
                      Chave Pix para pagamento: {sociosPorId[String(form.beneficiary_user_id)]?.user_pix_key || "não informada"}
                    </div>
                  ) : null}
                  {direcaoEqualizacao === "receber" ? (
                    <div className="alert alert-info py-2 small">
                      Sua chave Pix para recebimento: {chavePixAtual || "não informada"}
                    </div>
                  ) : null}
                  <div className="mb-2">
                    <label className="form-label">Valor</label>
                    <input
                      type="text"
                      className="form-control form-control-sm text-end"
                      value={form.valor}
                      onChange={(e) => handleChange("valor", e.target.value)}
                      placeholder="0,00"
                      disabled={salvandoEqualizacao}
                    />
                  </div>
                  <div className="mb-2">
                    <label className="form-label">Observação</label>
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      value={form.descricao}
                      onChange={(e) => handleChange("descricao", e.target.value)}
                      placeholder="Opcional"
                      disabled={salvandoEqualizacao}
                    />
                  </div>
                  {erroEqualizacao ? (
                    <div className="alert alert-warning py-2 mb-0" role="alert">
                      {erroEqualizacao}
                    </div>
                  ) : null}
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setModalEqualizacaoAberto(false)}>
                    Cancelar
                  </button>
                  <button type="submit" className="btn btn-primary btn-sm" disabled={salvandoEqualizacao}>
                    {salvandoEqualizacao ? "Registrando..." : "Registrar equalização"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export default FinanceiroCompartilhadoCard;
