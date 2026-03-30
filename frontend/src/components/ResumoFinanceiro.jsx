import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../services/http";
import ModalEditarOrcamento from "./ModalEditarOrcamento";
import { useAuth } from "../context/AuthContext";
import { useCompactLayout } from "../hooks/useCompactLayout";

function ResumoFinanceiro({ refreshKey = 0 }) {
  const [resumo, setResumo] = useState([]);
  const [aliquotaGanhoCapital, setAliquotaGanhoCapital] = useState(0.15);
  const [mostrarModalOrcamento, setMostrarModalOrcamento] = useState(false);
  const [mostrarSegundaTabela, setMostrarSegundaTabela] = useState(false);
  const [mostrarDetalheOrcamentoMobile, setMostrarDetalheOrcamentoMobile] = useState(false);
  const { hasRole } = useAuth();
  const canEdit = hasRole("editor", "admin");
  const compactLayout = useCompactLayout();

  const { id: idImovelParam } = useParams();
  const id_imovel = idImovelParam;

  const carregarResumo = useCallback(async () => {
    if (!id_imovel) return;
    try {
      const { data } = await api.get(`/dashboard/resumo-financeiro/${id_imovel}`);
      const itens = Array.isArray(data) ? data : data?.items || [];
      setResumo(itens);
      const taxa = Number(data?.ganho_capital);
      setAliquotaGanhoCapital(Number.isFinite(taxa) && taxa >= 0 ? taxa : 0.15);
    } catch (error) {
      console.error("Erro ao buscar resumo financeiro", error);
      setAliquotaGanhoCapital(0.15);
    }
  }, [id_imovel]);

  useEffect(() => {
    carregarResumo();
  }, [carregarResumo, refreshKey]);

  // Funções auxiliares
  const calcularEfetivadoMaisContratacao = (item) => {
    return (item.valor_efetivado || 0) + (item.valor_em_contratacao || 0);
  };

  const calcularTotalEstimado = (item) => {
    const orcamento = item.orcamento || 0;
    const efetivadoMaisContratacao = calcularEfetivadoMaisContratacao(item);
    return Math.max(orcamento, efetivadoMaisContratacao);
  };

  const calcularSaldoAInvestir = (item) => {
     // Saldo individual = Total Estimado para o item - Valor Efetivado do item
    return calcularTotalEstimado(item) - (item.valor_efetivado || 0);
  };


  // Filtra os dados para as tabelas
  const primeiraTabela = resumo.filter(item => ![6, 7, 8, 9].includes(item.id_grupo));
  const terceiraTabela = resumo.filter(item => [6, 7, 8, 9].includes(item.id_grupo));

  // Calcula os totais para a primeira tabela, INCLUINDO o novo total de Saldo a Investir
  const calcularTotais = (dados) => {
    return {
      orcamento: dados.reduce((acc, item) => acc + (item.orcamento || 0), 0),
      valor_efetivado: dados.reduce((acc, item) => acc + (item.valor_efetivado || 0), 0),
      valor_em_contratacao: dados.reduce((acc, item) => acc + (item.valor_em_contratacao || 0), 0),
      efetivado_mais_contratacao: dados.reduce((acc, item) => {
        const soma = (item.valor_efetivado || 0) + (item.valor_em_contratacao || 0);
        return acc + soma;
      }, 0),
      valor_total_estimado: dados.reduce((acc, item) => {
        const efetivadoMaisContratacao = (item.valor_efetivado || 0) + (item.valor_em_contratacao || 0);
        const maiorValor = Math.max(item.orcamento || 0, efetivadoMaisContratacao);
        return acc + maiorValor;
      }, 0),
      // NOVO CÁLCULO: Soma dos saldos individuais a investir de cada item
      saldo_a_investir_total: dados.reduce((acc, item) => {
          const saldoIndividual = calcularSaldoAInvestir(item); // Reutiliza a função de cálculo individual
          return acc + saldoIndividual;
      }, 0)
    };
  };

  const totaisPrimeira = calcularTotais(primeiraTabela);

  // Busca dos grupos necessários para o Fechamento
  const grupo6 = terceiraTabela.find(item => item.id_grupo === 6); // Financiamento a Quitar
  const grupo7 = terceiraTabela.find(item => item.id_grupo === 7); // Corretor
  const grupo8 = terceiraTabela.find(item => item.id_grupo === 8); // Valor de Venda
  const grupo9 = terceiraTabela.find(item => item.id_grupo === 9); // IR Ganho de Capital

  const totalEstimadoGrupo6 = grupo6 ? calcularTotalEstimado(grupo6) : 0; // B2
  const totalEstimadoGrupo7 = grupo7 ? calcularTotalEstimado(grupo7) : 0; // B6
  const totalEstimadoGrupo8 = grupo8 ? calcularTotalEstimado(grupo8) : 0; // B5
  const totalEstimadoGrupo9 = grupo9 ? calcularTotalEstimado(grupo9) : 0; // B8

  const investimentoTotal = totaisPrimeira.valor_total_estimado; // B1
  const custoDoImovel = investimentoTotal + totalEstimadoGrupo6; // B3

  const valorDeVenda = totalEstimadoGrupo8; // B5
  const corretor = totalEstimadoGrupo7; // B6

  // Cálculo do Ganho de Capital antes do IR
  const ganhoCapitalBase = valorDeVenda - custoDoImovel - corretor;

  // Cálculo do IR Ganho de Capital: Máximo entre o orçado (grupo 9) e o cálculo baseado no ganho real
  const irGanhoDeCapital = Math.max(
    totalEstimadoGrupo9,
    ganhoCapitalBase > 0 ? ganhoCapitalBase * aliquotaGanhoCapital : 0
  );
  
  const resultadoLiquido = valorDeVenda - custoDoImovel - corretor - irGanhoDeCapital;

  // ROI = Resultado Líquido / Investimento Total (apenas a parte investida, não o custo total)
  const roi = investimentoTotal > 0 ? (resultadoLiquido / investimentoTotal) : 0;

  const formatarMoeda = (valor) => {
    const numerico = Number(valor || 0);
    return numerico.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  };

  const kpis = useMemo(
    () => [
      { titulo: "Investimento total", valor: formatarMoeda(investimentoTotal || 0) },
      { titulo: "Saldo a investir", valor: formatarMoeda(totaisPrimeira.saldo_a_investir_total || 0) },
      { titulo: "Resultado líquido", valor: formatarMoeda(resultadoLiquido || 0) },
      {
        titulo: "ROI projetado",
        valor: `${(roi * 100).toLocaleString("pt-BR", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}%`,
      },
    ],
    [investimentoTotal, totaisPrimeira.saldo_a_investir_total, resultadoLiquido, roi]
  );

  const graficoOrcamento = useMemo(() => {
    const itens = primeiraTabela.map((item) => ({
      id: item.id_grupo,
      grupo: item.grupo,
      orcamento: Number(item.orcamento || 0),
      efetivado: Number(item.valor_efetivado || 0),
      contratado: Number(item.valor_em_contratacao || 0),
      totalEstimado: Number(
        Math.max(
          Number(item.orcamento || 0),
          Number(item.valor_efetivado || 0) + Number(item.valor_em_contratacao || 0)
        ) || 0
      ),
    }));

    return itens.map((item) => ({
      ...item,
      orcamentoPct: item.totalEstimado > 0 ? Math.min(100, (item.orcamento / item.totalEstimado) * 100) : 0,
      totalEstimadoPct: item.totalEstimado > 0 ? 100 : 0,
      efetivadoPct:
        item.totalEstimado > 0
          ? Math.min(100, ((item.efetivado + item.contratado) / item.totalEstimado) * 100)
          : 0,
    }));
  }, [primeiraTabela]);

  const tabelaPrimeira = (
    <div className="resumo-card__table table-responsive">
      <table className="table align-middle">
        <thead>
          <tr>
            <th>Grupo</th>
            <th className="text-end">Orçamento</th>
            <th className="text-end">Efetivado</th>
            <th className="text-end">Em Contratação</th>
            <th className="text-end">Efetivado + Em Contratação</th>
            <th className="text-end">Saldo a Investir</th>
            <th className="text-end">Total Estimado</th>
          </tr>
        </thead>
        <tbody>
          {primeiraTabela.map((item) => (
            <tr key={item.id_grupo}>
              <td>{item.grupo}</td>
              <td className="text-end">{formatarMoeda(item.orcamento)}</td>
              <td className="text-end">{formatarMoeda(item.valor_efetivado)}</td>
              <td className="text-end">{formatarMoeda(item.valor_em_contratacao)}</td>
              <td className="text-end">{formatarMoeda(calcularEfetivadoMaisContratacao(item))}</td>
              <td className="text-end">{formatarMoeda(calcularSaldoAInvestir(item))}</td>
              <td className="text-end">{formatarMoeda(calcularTotalEstimado(item))}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td>Total</td>
            <td className="text-end">{formatarMoeda(totaisPrimeira.orcamento)}</td>
            <td className="text-end">{formatarMoeda(totaisPrimeira.valor_efetivado)}</td>
            <td className="text-end">{formatarMoeda(totaisPrimeira.valor_em_contratacao)}</td>
            <td className="text-end">{formatarMoeda(totaisPrimeira.efetivado_mais_contratacao)}</td>
            <td className="text-end">{formatarMoeda(totaisPrimeira.saldo_a_investir_total)}</td>
            <td className="text-end">{formatarMoeda(totaisPrimeira.valor_total_estimado)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );

  const tabelaPrimeiraCompacta = (
    <div className="resumo-card__mobile-list">
      {primeiraTabela.map((item) => (
        <article key={item.id_grupo} className="resumo-card__mobile-item">
          <header>
            <strong>{item.grupo}</strong>
          </header>
          <dl>
            <div>
              <dt>Orçamento</dt>
              <dd>{formatarMoeda(item.orcamento)}</dd>
            </div>
            <div>
              <dt>Efetivado</dt>
              <dd>{formatarMoeda(item.valor_efetivado)}</dd>
            </div>
            <div>
              <dt>Em contratação</dt>
              <dd>{formatarMoeda(item.valor_em_contratacao)}</dd>
            </div>
            <div>
              <dt>Efetivado + contratação</dt>
              <dd>{formatarMoeda(calcularEfetivadoMaisContratacao(item))}</dd>
            </div>
            <div>
              <dt>Saldo a investir</dt>
              <dd>{formatarMoeda(calcularSaldoAInvestir(item))}</dd>
            </div>
            <div>
              <dt>Total estimado</dt>
              <dd>{formatarMoeda(calcularTotalEstimado(item))}</dd>
            </div>
          </dl>
        </article>
      ))}
      <article className="resumo-card__mobile-item resumo-card__mobile-item--total">
        <header>
          <strong>Total</strong>
        </header>
        <dl>
          <div>
            <dt>Orçamento</dt>
            <dd>{formatarMoeda(totaisPrimeira.orcamento)}</dd>
          </div>
          <div>
            <dt>Efetivado</dt>
            <dd>{formatarMoeda(totaisPrimeira.valor_efetivado)}</dd>
          </div>
          <div>
            <dt>Em contratação</dt>
            <dd>{formatarMoeda(totaisPrimeira.valor_em_contratacao)}</dd>
          </div>
          <div>
            <dt>Efetivado + contratação</dt>
            <dd>{formatarMoeda(totaisPrimeira.efetivado_mais_contratacao)}</dd>
          </div>
          <div>
            <dt>Saldo a investir</dt>
            <dd>{formatarMoeda(totaisPrimeira.saldo_a_investir_total)}</dd>
          </div>
          <div>
            <dt>Total estimado</dt>
            <dd>{formatarMoeda(totaisPrimeira.valor_total_estimado)}</dd>
          </div>
        </dl>
      </article>
    </div>
  );

  const tabelaFechamento = (
    <div className="resumo-card__table resumo-card__closing">
      <table className="table align-middle mb-0">
        <tbody>
          <tr>
            <td>Investimento Total</td>
            <td className="text-end">{formatarMoeda(investimentoTotal)}</td>
          </tr>
          <tr>
            <td>Financiamento a Quitar</td>
            <td className="text-end">{formatarMoeda(totalEstimadoGrupo6)}</td>
          </tr>
          <tr className="fw-bold">
            <td>Custo do Imóvel</td>
            <td className="text-end">{formatarMoeda(custoDoImovel)}</td>
          </tr>
          <tr className="table-separator">
            <td colSpan={2}>&nbsp;</td>
          </tr>
          <tr>
            <td>Valor de Venda</td>
            <td className="text-end">{formatarMoeda(valorDeVenda)}</td>
          </tr>
          <tr>
            <td>Corretor</td>
            <td className="text-end">{formatarMoeda(corretor)}</td>
          </tr>
          <tr>
            <td>IR Ganho de Capital</td>
            <td className="text-end">{formatarMoeda(irGanhoDeCapital)}</td>
          </tr>
          <tr className="fw-bold">
            <td>Resultado Líquido</td>
            <td className="text-end">{formatarMoeda(resultadoLiquido)}</td>
          </tr>
          <tr className="fw-bold">
            <td>ROI</td>
            <td className="text-end">
              {(roi * 100).toLocaleString("pt-BR", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}%
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );

  const tabelaFechamentoCompacta = (
    <div className="resumo-card__mobile-list resumo-card__mobile-list--closing">
      {[
        ["Investimento Total", investimentoTotal],
        ["Financiamento a Quitar", totalEstimadoGrupo6],
        ["Custo do Imóvel", custoDoImovel, true],
        ["Valor de Venda", valorDeVenda],
        ["Corretor", corretor],
        ["IR Ganho de Capital", irGanhoDeCapital],
        ["Resultado Líquido", resultadoLiquido, true],
      ].map(([label, valor, destaque]) => (
        <article
          key={label}
          className={`resumo-card__mobile-line ${destaque ? "resumo-card__mobile-line--highlight" : ""}`.trim()}
        >
          <span>{label}</span>
          <strong>{formatarMoeda(valor)}</strong>
        </article>
      ))}
      <article className="resumo-card__mobile-line resumo-card__mobile-line--highlight">
        <span>ROI</span>
        <strong>
          {(roi * 100).toLocaleString("pt-BR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
          %
        </strong>
      </article>
    </div>
  );

  const tabelaFechamentoDetalhada = mostrarSegundaTabela ? (
    <div className="resumo-card__table table-responsive">
      <h3 className="fs-6 fw-bold mb-2">Detalhamento Fechamento</h3>
      <table className="table align-middle">
        <thead>
          <tr>
            <th>Grupo</th>
            <th className="text-end">Orçamento</th>
            <th className="text-end">Efetivado</th>
            <th className="text-end">Em Contratação</th>
            <th className="text-end">Efetivado + Em Contratação</th>
            <th className="text-end">Total Estimado</th>
          </tr>
        </thead>
        <tbody>
          {terceiraTabela.map((item) => (
            <tr key={item.id_grupo}>
              <td>{item.grupo}</td>
              <td className="text-end">{formatarMoeda(item.orcamento)}</td>
              <td className="text-end">{formatarMoeda(item.valor_efetivado)}</td>
              <td className="text-end">{formatarMoeda(item.valor_em_contratacao)}</td>
              <td className="text-end">{formatarMoeda(calcularEfetivadoMaisContratacao(item))}</td>
              <td className="text-end">{formatarMoeda(calcularTotalEstimado(item))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : null;

  const tabelaFechamentoDetalhadaCompacta = mostrarSegundaTabela ? (
    <div className="resumo-card__mobile-list">
      {terceiraTabela.map((item) => (
        <article key={item.id_grupo} className="resumo-card__mobile-item">
          <header>
            <strong>{item.grupo}</strong>
          </header>
          <dl>
            <div>
              <dt>Orçamento</dt>
              <dd>{formatarMoeda(item.orcamento)}</dd>
            </div>
            <div>
              <dt>Efetivado</dt>
              <dd>{formatarMoeda(item.valor_efetivado)}</dd>
            </div>
            <div>
              <dt>Em contratação</dt>
              <dd>{formatarMoeda(item.valor_em_contratacao)}</dd>
            </div>
            <div>
              <dt>Efetivado + contratação</dt>
              <dd>{formatarMoeda(calcularEfetivadoMaisContratacao(item))}</dd>
            </div>
            <div>
              <dt>Total estimado</dt>
              <dd>{formatarMoeda(calcularTotalEstimado(item))}</dd>
            </div>
          </dl>
        </article>
      ))}
    </div>
  ) : null;

  return (
    <>
      <section className="dashboard-card resumo-card">
        <header className="d-flex justify-content-between align-items-start flex-wrap gap-3">
          <div>
            <h2>Resumo Financeiro</h2>
            <small className="text-muted">Síntese dos grupos orçamentários e projeções do imóvel</small>
          </div>
          <div className="resumo-card__toggle">
            <button
              type="button"
              className="resumo-card__toggle-btn"
              onClick={() => setMostrarSegundaTabela((prev) => !prev)}
            >
              {mostrarSegundaTabela ? "Ocultar detalhamento" : "Mostrar detalhamento"}
            </button>
            {canEdit && (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setMostrarModalOrcamento(true)}>
                Atualizar orçamento
              </button>
            )}
          </div>
        </header>

        <div className="resumo-card__metrics">
          {kpis.map((kpi) => (
            <div key={kpi.titulo} className="resumo-card__metric">
              <span>{kpi.titulo}</span>
              <strong>{kpi.valor}</strong>
            </div>
          ))}
        </div>

        <section className="resumo-card__chart">
          <header className="resumo-card__chart-header">
            <div>
              <h3>Visão do orçamento</h3>
              <p>Compare orçamento, valor comprometido e total estimado por grupo.</p>
            </div>
          </header>
          <div className="resumo-card__chart-list">
            {graficoOrcamento.map((item) => (
              <article key={item.id} className="resumo-card__chart-item">
                <div className="resumo-card__chart-item-head">
                  <strong>{item.grupo}</strong>
                  <span>{formatarMoeda(item.totalEstimado)}</span>
                </div>
                <div className="resumo-card__chart-bar">
                  <div
                    className="resumo-card__chart-bar--budget"
                    style={{ width: `${item.orcamentoPct}%` }}
                    title={`Orçamento: ${formatarMoeda(item.orcamento)}`}
                  />
                  <div
                    className="resumo-card__chart-bar--committed"
                    style={{ width: `${item.efetivadoPct}%` }}
                    title={`Efetivado + contratação: ${formatarMoeda(item.efetivado + item.contratado)}`}
                  />
                  <div
                    className="resumo-card__chart-bar--estimate"
                    style={{ width: `${item.totalEstimadoPct}%` }}
                    title={`Total estimado: ${formatarMoeda(item.totalEstimado)}`}
                  />
                </div>
                <div className="resumo-card__chart-legend">
                  <span><i className="budget"></i> Orçamento</span>
                  <span><i className="committed"></i> Comprometido</span>
                  <span><i className="estimate"></i> Estimado</span>
                </div>
              </article>
            ))}
          </div>
        </section>

        {compactLayout ? (
          <div className="resumo-card__toggle resumo-card__toggle--mobile">
            <button
              type="button"
              className="resumo-card__toggle-btn"
              onClick={() => setMostrarDetalheOrcamentoMobile((prev) => !prev)}
            >
              {mostrarDetalheOrcamentoMobile ? "Ocultar detalhamento do orçamento" : "Detalhar orçamento"}
            </button>
          </div>
        ) : null}

        {compactLayout ? (mostrarDetalheOrcamentoMobile ? tabelaPrimeiraCompacta : null) : tabelaPrimeira}
        {compactLayout ? tabelaFechamentoCompacta : tabelaFechamento}
        {compactLayout ? tabelaFechamentoDetalhadaCompacta : tabelaFechamentoDetalhada}
      </section>

      {mostrarModalOrcamento && (
        <ModalEditarOrcamento
          id_imovel={id_imovel}
          onClose={() => setMostrarModalOrcamento(false)}
          onSave={() => {
            setMostrarModalOrcamento(false);
            carregarResumo();
          }}
        />
      )}
    </>
  );
}

export default ResumoFinanceiro;
