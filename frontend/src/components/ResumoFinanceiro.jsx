import React, { useEffect, useMemo, useState } from "react";
import api from "../services/http";
import ModalEditarOrcamento from "./ModalEditarOrcamento";
import { useAuth } from "../context/AuthContext";

function ResumoFinanceiro() {
  const [resumo, setResumo] = useState([]);
  const [mostrarModalOrcamento, setMostrarModalOrcamento] = useState(false);
  const [mostrarSegundaTabela, setMostrarSegundaTabela] = useState(false);
  const { hasRole } = useAuth();
  const canEdit = hasRole("editor", "admin");

  const id_imovel = window.location.pathname.split("/").pop();

  useEffect(() => {
    carregarResumo();
  }, [id_imovel]);

  const carregarResumo = async () => {
    try {
      const { data } = await api.get(`/dashboard/resumo-financeiro/${id_imovel}`);
      setResumo(data);
    } catch (error) {
      console.error("Erro ao buscar resumo financeiro", error);
      // Considerar uma mensagem de erro na UI para o usuário
    }
  };

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
    ganhoCapitalBase > 0 ? ganhoCapitalBase * 0.15 : 0 // usa taxa fixa de 15%
  );
  
  const resultadoLiquido = valorDeVenda - custoDoImovel - corretor - irGanhoDeCapital;

  // ROI = Resultado Líquido / Investimento Total (apenas a parte investida, não o custo total)
  const roi = investimentoTotal > 0 ? (resultadoLiquido / investimentoTotal) : 0;

   // Nota: A variável 'imovel' usada no cálculo do IR Ganho de Capital não está sendo buscada neste componente.
   // Ela é usada no componente DadosCadastrais. Para usar 'imovel.ganho_capital' aqui, você precisaria:
   // 1. Buscar os dados do imóvel também neste componente ResumoFinanceiro, OU
   // 2. Passar os dados do imóvel (ou apenas 'imovel.ganho_capital') como prop de Dashboard para ResumoFinanceiro.
   // Por enquanto, estou assumindo 0.15 (15%) se 'imovel' não existir aqui. Se você já busca 'imovel' e está apenas omitindo no contexto fornecido, ignore esta nota.

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

        {tabelaPrimeira}
        {tabelaFechamento}
        {tabelaFechamentoDetalhada}
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
