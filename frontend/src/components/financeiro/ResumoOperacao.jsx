import { useEffect, useState } from "react";
import { fetchFinanceiroCompartilhado } from "../../services/api";

const moeda = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const percentual = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 2,
});
const retorno = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export default function ResumoOperacao({
  imovelId,
  userId,
  refreshKey,
  valores,
  scaleMoney,
  onNavigate,
}) {
  const [posicao, setPosicao] = useState(null);
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    let ativo = true;
    if (!imovelId || !userId) return undefined;
    setPosicao(null);
    fetchFinanceiroCompartilhado(imovelId)
      .then((data) => {
        if (!Array.isArray(data?.socios))
          throw new Error("Posição indisponível");
        if (ativo) setPosicao({ imovelId, userId, data });
      })
      .catch(() => {
        if (ativo) setPosicao({ imovelId, userId, erro: true });
      });
    return () => {
      ativo = false;
    };
  }, [imovelId, userId, refreshKey, tentativa]);

  const posicaoAtual =
    posicao?.imovelId === imovelId && posicao?.userId === userId;
  const socios = posicaoAtual ? posicao.data?.socios || [] : [];
  const socio = socios.find(
    (item) =>
      Number(item.user_id) === Number(userId) &&
      item.ativo !== false &&
      Number(item.percentual_participacao) > 0,
  );
  const participacao = Number(socio?.percentual_participacao || 0) / 100;
  const saldo =
    socio?.saldo_liquido == null ? NaN : Number(socio.saldo_liquido);
  const saldoDisponivel = Number.isFinite(saldo);
  const equalizado = saldoDisponivel && Math.abs(saldo) < 0.005;
  const contraparte =
    socios.length === 2
      ? socios.find((item) => Number(item.user_id) !== Number(userId))
      : null;
  const contraparteCoerente =
    contraparte && saldo * Number(contraparte.saldo_liquido) < 0;
  let observacao = "Considerando os acertos registrados.";
  if (contraparteCoerente && contraparte.user_name) {
    observacao = `${saldo > 0 ? "De" : "Para"} ${contraparte.user_name}, considerando os acertos registrados.`;
  }

  const indicadores = [
    ["Investimento previsto", valores.investimento],
    ["Efetivado", valores.efetivado],
    ["A investir", valores.saldo],
    ["Resultado projetado", valores.resultado],
  ];
  const fechamento = [
    ["Valor de venda previsto", valores.venda],
    ["Investimento previsto", valores.investimento],
    ["Financiamento a quitar", valores.financiamento],
    ["Corretagem", valores.corretagem],
    ["IR estimado sobre ganho de capital", valores.imposto],
  ];

  return (
    <div className="resumo-operacao">
      <dl className="financeiro-metricas resumo-operacao__indicadores">
        {indicadores.map(([titulo, valor]) => (
          <div key={titulo}>
            <dt>{titulo}</dt>
            <dd>{moeda.format(scaleMoney(valor))}</dd>
          </div>
        ))}
      </dl>
      <div className="resumo-operacao__colunas">
        <section aria-labelledby={`projecao-${imovelId}`}>
          <h3 id={`projecao-${imovelId}`}>Projeção de fechamento</h3>
          <dl className="resumo-operacao__valores">
            {fechamento.map(([titulo, valor]) => (
              <div key={titulo}>
                <dt>{titulo}</dt>
                <dd>{moeda.format(scaleMoney(valor))}</dd>
              </div>
            ))}
            <div className="resumo-operacao__resultado">
              <dt>Resultado líquido projetado</dt>
              <dd>{moeda.format(scaleMoney(valores.resultado))}</dd>
            </div>
            <div className="resumo-operacao__roi">
              <dt>ROI projetado</dt>
              <dd>{retorno.format(valores.roi)}</dd>
            </div>
          </dl>
          <button
            className="fin-button"
            onClick={() => onNavigate("orcamento")}
          >
            Ver orçamento
          </button>
        </section>
        <section
          className="resumo-operacao__socios"
          aria-labelledby={`posicao-${imovelId}`}
        >
          <h3 id={`posicao-${imovelId}`}>Sua posição entre sócios</h3>
          {!userId ? (
            <p>Sua participação está indisponível.</p>
          ) : !posicaoAtual ? (
            <p role="status">Carregando sua posição…</p>
          ) : posicao.erro ? (
            <div role="alert">
              <p>Não foi possível carregar sua posição entre sócios.</p>
              <button
                className="fin-button"
                onClick={() => setTentativa((atual) => atual + 1)}
              >
                Tentar novamente
              </button>
            </div>
          ) : !socio ? (
            <p>Você não possui participação ativa neste imóvel.</p>
          ) : (
            <>
              <p className="resumo-operacao__participacao">
                {socio.user_name || "Você"} ·{" "}
                {percentual.format(participacao * 100)}% de participação
              </p>
              <dl className="resumo-operacao__valores">
                <div>
                  <dt>Sua parte no investimento</dt>
                  <dd>{moeda.format(valores.investimento * participacao)}</dd>
                </div>
                <div>
                  <dt>Sua parte a investir</dt>
                  <dd>{moeda.format(valores.saldo * participacao)}</dd>
                </div>
              </dl>
              <div className="resumo-operacao__acertos">
                <h4>Saldo dos acertos</h4>
                {!saldoDisponivel ? (
                  <p>Saldo indisponível.</p>
                ) : (
                  <>
                    <p
                      className={`resumo-operacao__saldo ${saldo > 0 ? "financeiro-positivo" : ""}`}
                    >
                      {equalizado
                        ? "Acertos equalizados"
                        : `${moeda.format(Math.abs(saldo))} ${saldo > 0 ? "a receber" : "a pagar"}`}
                    </p>
                    <p>{observacao}</p>
                  </>
                )}
                {Number(posicao.data.totais?.total_nao_atribuido) > 0 && (
                  <p className="financeiro-pendente">
                    Há lançamentos sem pagador atribuído. Revise em Sócios e
                    acertos.
                  </p>
                )}
              </div>
            </>
          )}
          <button className="fin-button" onClick={() => onNavigate("socios")}>
            Ver sócios e acertos
          </button>
        </section>
      </div>
    </div>
  );
}
