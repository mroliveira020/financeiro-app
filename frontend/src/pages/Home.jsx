import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  fetchImoveis,
  deleteImovel,
  addImovel,
  fetchUltimaAtualizacao,
  fetchUltimosLancamentos,
  fetchGastosMensais,
  fetchCategorias,
  fetchResumoImoveis,
  fetchDetalhesGastosMensais,
  fetchTransacoesMensais,
} from "../services/api";
import "bootstrap/dist/css/bootstrap.min.css";
import { useAuth } from "../context/AuthContext";
import "./Home.css";
import GastosMensaisChart from "../components/GastosMensaisChart";
import ImovelGrupoPieChart from "../components/ImovelGrupoPieChart";
import GastosMensaisDetalhesModal from "../components/GastosMensaisDetalhesModal";
import { invalidateCatalogo } from "../hooks/useCatalogos";

const GRAFICO_PREF_KEY = "financeiro:gastos-pref";
const DEFAULT_CHART_PREF = { meses: 6, excluir: [8, 15, 18] };
const MES_ANO_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
  month: "2-digit",
  year: "numeric",
});
const MES_EXTENSO_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
  month: "long",
  year: "numeric",
});
const IMOVEIS_MAX_RETRIES = 2;
const GASTOS_MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 2000;
const TOTAL_IMOVEIS_ATTEMPTS = IMOVEIS_MAX_RETRIES + 1;
const TOTAL_GASTOS_ATTEMPTS = GASTOS_MAX_RETRIES + 1;

const normalizarGrupos = (raw) => {
  if (!raw) {
    return [];
  }
  if (Array.isArray(raw)) {
    return raw;
  }
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

const formatarPeriodo = (inicio, fim) => {
  if (!inicio || !fim) {
    return null;
  }
  try {
    const inicioData = new Date(inicio);
    const fimData = new Date(fim);
    if (Number.isNaN(inicioData.getTime()) || Number.isNaN(fimData.getTime())) {
      return null;
    }
    return `Período ${MES_ANO_FORMATTER.format(inicioData)} a ${MES_ANO_FORMATTER.format(fimData)}`;
  } catch {
    return null;
  }
};

const formatarMoeda = (valor) =>
  Number(valor ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const formatarPercentual = (valorFracionario) =>
  `${(Number(valorFracionario ?? 0) * 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;

const formatarMesExtenso = (mesISO) => {
  if (!mesISO) return "";
  const normalizado = `${mesISO}`.slice(0, 7);
  try {
    const data = new Date(`${normalizado}-01T00:00:00`);
    if (Number.isNaN(data.getTime())) {
      return normalizado;
    }
    const texto = MES_EXTENSO_FORMATTER.format(data);
    return texto.charAt(0).toUpperCase() + texto.slice(1);
  } catch {
    return normalizado;
  }
};

const toNumber = (valor, padrao = 0) => {
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : padrao;
};

const RESUMO_INICIAL = {
  totalEfetivado: 0,
  totalAInvestir: 0,
  lucroProjetado: 0,
  investimentoTotal: 0,
  imoveisConsiderados: 0,
};

function Home() {
  const [imoveis, setImoveis] = useState([]);
  const [loadingImoveis, setLoadingImoveis] = useState(true);
  const [erroImoveis, setErroImoveis] = useState(false);
  const [newImovel, setNewImovel] = useState({ nome: "", vendido: false });
  const [showAddImovelModal, setShowAddImovelModal] = useState(false);
  const [addingImovel, setAddingImovel] = useState(false);
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState(null);
  const [showUltimos, setShowUltimos] = useState(false);
  const [ultimos, setUltimos] = useState([]);
  const [loadingUltimos, setLoadingUltimos] = useState(false);
  const [gastosMensais, setGastosMensais] = useState([]);
  const [loadingGastos, setLoadingGastos] = useState(true);
  const [erroGastos, setErroGastos] = useState(false);
  const [resumoImoveis, setResumoImoveis] = useState(RESUMO_INICIAL);
  const [loadingResumo, setLoadingResumo] = useState(true);
  const [erroResumo, setErroResumo] = useState(false);
  const [mostrarVendidos, setMostrarVendidos] = useState(false);
  const [chartPref, setChartPref] = useState(() => ({
    meses: DEFAULT_CHART_PREF.meses,
    excluir: [...DEFAULT_CHART_PREF.excluir],
  }));
  const [prefReady, setPrefReady] = useState(false);
  const [showConfigChart, setShowConfigChart] = useState(false);
  const [configDraft, setConfigDraft] = useState(() => ({
    meses: DEFAULT_CHART_PREF.meses,
    excluir: [...DEFAULT_CHART_PREF.excluir],
  }));
  const [categoriasDisponiveis, setCategoriasDisponiveis] = useState([]);
  const [categoriasLoading, setCategoriasLoading] = useState(false);
  const [categoriasErro, setCategoriasErro] = useState(false);
  const [detalhesMensaisModal, setDetalhesMensaisModal] = useState({
    aberto: false,
    carregando: false,
    mesISO: null,
    mesRotulo: "",
    imovelId: null,
    nomeImovel: "",
    valorSegmento: 0,
    dados: null,
    erro: null,
    transacoesPorCategoria: {},
  });
  const [imoveisRetryState, setImoveisRetryState] = useState({
    status: "idle",
    attempt: 1,
    totalAttempts: TOTAL_IMOVEIS_ATTEMPTS,
  });
  const [gastosRetryState, setGastosRetryState] = useState({
    status: "idle",
    attempt: 1,
    totalAttempts: TOTAL_GASTOS_ATTEMPTS,
  });
  const [gastosReloadKey, setGastosReloadKey] = useState(0);
  const { hasRole } = useAuth();
  const canEdit = hasRole("editor", "admin");

  const imoveisVisiveis = useMemo(() => {
    if (mostrarVendidos) {
      return imoveis;
    }
    return imoveis.filter((imovel) => !imovel.vendido);
  }, [imoveis, mostrarVendidos]);

  useEffect(() => {
    let storedPref = {
      meses: DEFAULT_CHART_PREF.meses,
      excluir: [...DEFAULT_CHART_PREF.excluir],
    };
    const raw = localStorage.getItem(GRAFICO_PREF_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        const meses = Number(parsed?.meses);
        const mesesValidos = Number.isFinite(meses)
          ? Math.max(1, Math.min(24, meses))
          : DEFAULT_CHART_PREF.meses;
        let excluir = parsed?.excluir;
        if (Array.isArray(excluir)) {
          excluir = excluir
            .map((item) => {
              const num = Number(item);
              return Number.isFinite(num) ? num : null;
            })
            .filter((item) => item !== null);
        } else {
          excluir = DEFAULT_CHART_PREF.excluir;
        }
        storedPref = {
          meses: mesesValidos,
          excluir: Array.from(new Set(excluir)),
        };
      } catch {
        storedPref = {
          meses: DEFAULT_CHART_PREF.meses,
          excluir: [...DEFAULT_CHART_PREF.excluir],
        };
      }
    }
    setChartPref(storedPref);
    setConfigDraft(storedPref);
    setPrefReady(true);
  }, []);

  const carregarImoveis = useCallback(async () => {
    setLoadingImoveis(true);
    setErroImoveis(false);
    setImoveisRetryState({ status: "running", attempt: 1, totalAttempts: TOTAL_IMOVEIS_ATTEMPTS });

    try {
      const data = await fetchImoveis({
        retries: IMOVEIS_MAX_RETRIES,
        baseDelayMs: RETRY_BASE_DELAY_MS,
        onRetry: ({ attempt }) => {
          setImoveisRetryState({
            status: "retrying",
            attempt: Math.min(attempt + 1, TOTAL_IMOVEIS_ATTEMPTS),
            totalAttempts: TOTAL_IMOVEIS_ATTEMPTS,
          });
        },
      });

      const imoveisNormalizados = (data || []).map((imovel) => {
        const totalInvestidoRaw =
          imovel.total_investido ?? imovel.totalInvestido ?? imovel.totallancamentos ?? 0;
        const valorEfetivado = toNumber(imovel.valor_efetivado, toNumber(totalInvestidoRaw));
        const totalInvestido = valorEfetivado;
        const valorAInvestir = toNumber(imovel.valor_a_investir);
        const lucroProjetado = toNumber(imovel.lucro_projetado);
        const ativoEsperado = toNumber(
          imovel.ativo_esperado,
          valorEfetivado + valorAInvestir + lucroProjetado,
        );
        const roiProjetado = toNumber(imovel.roi_projetado);
        const investimentoTotal = toNumber(imovel.investimento_total);
        const periodoInicio = imovel.periodo_inicio ?? null;
        const periodoFim = imovel.periodo_fim ?? null;
        return {
          ...imovel,
          totalInvestido,
          valorEfetivado,
          valorAInvestir,
          lucroProjetado,
          ativoEsperado,
          roiProjetado,
          investimentoTotal,
          fotoUrl: imovel.foto_url ?? null,
          grupos: normalizarGrupos(imovel.grupos),
          periodoInicio,
          periodoFim,
        };
      });
      setImoveis(imoveisNormalizados);
      setImoveisRetryState({ status: "success", attempt: 1, totalAttempts: TOTAL_IMOVEIS_ATTEMPTS });
    } catch (error) {
      console.error("Erro ao carregar imóveis:", error);
      setErroImoveis(true);
      setImoveis([]);
      setImoveisRetryState({
        status: "failed",
        attempt: TOTAL_IMOVEIS_ATTEMPTS,
        totalAttempts: TOTAL_IMOVEIS_ATTEMPTS,
      });
    } finally {
      setLoadingImoveis(false);
    }
  }, []);

  useEffect(() => {
    carregarImoveis();

    fetchUltimaAtualizacao()
      .then((res) => setUltimaAtualizacao(res?.data || null))
      .catch(() => setUltimaAtualizacao(null));
  }, [carregarImoveis]);

  useEffect(() => {
    setLoadingResumo(true);
    setErroResumo(false);

    fetchResumoImoveis(mostrarVendidos)
      .then((dados) => {
        const totais = dados?.totais || {};
        setResumoImoveis({
          totalEfetivado: Number(totais.total_efetivado ?? 0),
          totalAInvestir: Number(totais.total_a_investir ?? 0),
          lucroProjetado: Number(totais.lucro_projetado ?? 0),
          investimentoTotal: Number(totais.investimento_total ?? 0),
          imoveisConsiderados: Number(totais.imoveis_considerados ?? 0),
        });
        setErroResumo(false);
      })
      .catch(() => {
        setResumoImoveis(RESUMO_INICIAL);
        setErroResumo(true);
      })
      .finally(() => setLoadingResumo(false));
  }, [mostrarVendidos]);

  const chartPrefExclusoesArray = useMemo(() => chartPref.excluir || [], [chartPref.excluir]);
  const chartPrefExclusoes = useMemo(() => chartPrefExclusoesArray.join(","), [chartPrefExclusoesArray]);

  useEffect(() => {
    if (!prefReady) {
      return;
    }

    let ativo = true;
    setLoadingGastos(true);
    setErroGastos(false);
    setGastosRetryState({ status: "running", attempt: 1, totalAttempts: TOTAL_GASTOS_ATTEMPTS });

    fetchGastosMensais(chartPref.meses, chartPrefExclusoesArray, {
      retries: GASTOS_MAX_RETRIES,
      baseDelayMs: RETRY_BASE_DELAY_MS,
      onRetry: ({ attempt }) => {
        if (!ativo) return;
        setGastosRetryState({
          status: "retrying",
          attempt: Math.min(attempt + 1, TOTAL_GASTOS_ATTEMPTS),
          totalAttempts: TOTAL_GASTOS_ATTEMPTS,
        });
      },
      includeVendidos: mostrarVendidos,
    })
      .then((dados) => {
        if (!ativo) return;
        setGastosMensais(dados || []);
        setErroGastos(false);
        setGastosRetryState({ status: "success", attempt: 1, totalAttempts: TOTAL_GASTOS_ATTEMPTS });
      })
      .catch((error) => {
        if (!ativo) return;
        console.error("Erro ao carregar gastos mensais:", error);
        setGastosMensais([]);
        setErroGastos(true);
        setGastosRetryState({
          status: "failed",
          attempt: TOTAL_GASTOS_ATTEMPTS,
          totalAttempts: TOTAL_GASTOS_ATTEMPTS,
        });
      })
      .finally(() => {
        if (ativo) {
          setLoadingGastos(false);
        }
      });

    return () => {
      ativo = false;
    };
  }, [prefReady, chartPref.meses, chartPrefExclusoes, chartPrefExclusoesArray, gastosReloadKey, mostrarVendidos]);

  const handleTentarNovamenteImoveis = () => {
    carregarImoveis();
  };

  const handleTentarNovamenteGastos = () => {
    setGastosReloadKey((valor) => valor + 1);
  };

  useEffect(() => {
    if (!prefReady) return;
    localStorage.setItem(GRAFICO_PREF_KEY, JSON.stringify(chartPref));
  }, [chartPref, prefReady]);

  const closeAddImovelModal = useCallback(() => {
    if (addingImovel) {
      return;
    }
    setShowAddImovelModal(false);
    setNewImovel({ nome: "", vendido: false });
  }, [addingImovel]);

  const handleAddImovel = async (event) => {
    event?.preventDefault();
    if (!newImovel.nome.trim()) return;

    setAddingImovel(true);

    try {
      const novoImovel = await addImovel(newImovel);
      setImoveis((prevImoveis) => [
        ...prevImoveis,
        {
          ...novoImovel,
          totalInvestido: 0,
          grupos: [],
          periodoInicio: null,
          periodoFim: null,
        },
      ]);
      setShowAddImovelModal(false);
      setNewImovel({ nome: "", vendido: false });
      invalidateCatalogo("imoveis");
    } catch (error) {
      console.error("Erro ao cadastrar imóvel:", error);
    } finally {
      setAddingImovel(false);
    }
  };

  const carregarCategorias = async () => {
    setCategoriasLoading(true);
    setCategoriasErro(false);
    try {
      const lista = await fetchCategorias();
      const ordenadas = (lista || [])
        .map((item) => ({ id: item.id, nome: item.categoria }))
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
      setCategoriasDisponiveis(ordenadas);
    } catch (error) {
      console.error("Erro ao carregar categorias: ", error);
      setCategoriasErro(true);
    } finally {
      setCategoriasLoading(false);
    }
  };

  const handleToggleConfig = () => {
    const next = !showConfigChart;
    if (!showConfigChart) {
      setConfigDraft({
        meses: chartPref.meses,
        excluir: [...(chartPref.excluir || [])],
      });
      if (!categoriasDisponiveis.length && !categoriasLoading) {
        carregarCategorias();
      }
    }
    setShowConfigChart(next);
  };

  const toggleCategoriaExcluida = (idCategoria) => {
    setConfigDraft((prev) => {
      const atual = prev.excluir || [];
      const existe = atual.includes(idCategoria);
      const atualizado = existe
        ? atual.filter((item) => item !== idCategoria)
        : [...atual, idCategoria];
      return { ...prev, excluir: atualizado };
    });
  };

  const incluirTodasCategorias = () => {
    setConfigDraft((prev) => ({ ...prev, excluir: [] }));
  };

  const restaurarPadraoCategorias = () => {
    setConfigDraft({
      meses: DEFAULT_CHART_PREF.meses,
      excluir: [...DEFAULT_CHART_PREF.excluir],
    });
  };

  const handleToggleVendidos = () => {
    setMostrarVendidos((prev) => !prev);
  };

  const handleAplicarConfiguracao = (event) => {
    event.preventDefault();
    const mesesBrutos = configDraft.meses;
    let mesesNormalizados = DEFAULT_CHART_PREF.meses;
    if (mesesBrutos !== "" && mesesBrutos !== null) {
      const mesesNumero = Number(mesesBrutos);
      if (Number.isFinite(mesesNumero)) {
        mesesNormalizados = Math.max(1, Math.min(24, mesesNumero));
      }
    }

    const excluir = Array.from(
      new Set((configDraft.excluir || []).map((item) => Number(item)).filter((item) => Number.isFinite(item)))
    );

    setChartPref({ meses: mesesNormalizados, excluir });
    setShowConfigChart(false);
  };

  const handleAbrirDetalhesMensais = useCallback(
    ({ imovelId, nomeImovel, mes, valor }) => {
      if (!imovelId || !mes) {
        return;
      }
      const mesLabel = formatarMesExtenso(mes);
      setDetalhesMensaisModal({
        aberto: true,
        carregando: true,
        mesISO: mes,
        mesRotulo: mesLabel,
        imovelId,
        nomeImovel,
        valorSegmento: Number(valor || 0),
        dados: null,
        erro: null,
        transacoesPorCategoria: {},
      });

      const categoriasExcluidas = chartPref.excluir || [];
      fetchDetalhesGastosMensais({
        imovelId,
        mes: `${mes}`.slice(0, 7),
        categoriasExcluidas,
      })
        .then((resposta) => {
          setDetalhesMensaisModal((prev) => ({
            ...prev,
            carregando: false,
            dados: resposta,
            mesRotulo: formatarMesExtenso(resposta?.mes || mes) || prev.mesRotulo,
            valorSegmento: Number(resposta?.total ?? prev.valorSegmento),
            transacoesPorCategoria: {},
          }));
        })
        .catch((error) => {
          const mensagem =
            error?.response?.data?.error || "Não foi possível carregar os detalhes deste mês.";
          setDetalhesMensaisModal((prev) => ({
            ...prev,
            carregando: false,
            erro: mensagem,
            transacoesPorCategoria: {},
          }));
        });
    },
    [chartPref.excluir]
  );

  const handleFecharDetalhesMensais = useCallback(() => {
    setDetalhesMensaisModal((prev) => ({ ...prev, aberto: false }));
  }, []);

  const handleCarregarTransacoesCategoria = useCallback(
    ({ categoriaId }) => {
      if (!detalhesMensaisModal.aberto) {
        return;
      }
      const chave = String(categoriaId ?? "sem");
      setDetalhesMensaisModal((prev) => {
        const atual = prev.transacoesPorCategoria[chave];
        if (atual?.carregando) {
          return prev;
        }
        return {
          ...prev,
          transacoesPorCategoria: {
            ...prev.transacoesPorCategoria,
            [chave]: {
              itens: atual?.itens,
              carregando: true,
              erro: null,
            },
          },
        };
      });

      const imovelId = detalhesMensaisModal.imovelId;
      const mesConsulta = (detalhesMensaisModal.dados?.mes || detalhesMensaisModal.mesISO || "").slice(0, 7);

      fetchTransacoesMensais({ imovelId, mes: mesConsulta, categoriaId })
        .then((itens) => {
          setDetalhesMensaisModal((prev) => ({
            ...prev,
            transacoesPorCategoria: {
              ...prev.transacoesPorCategoria,
              [chave]: {
                itens: itens || [],
                carregando: false,
                erro: null,
              },
            },
          }));
        })
        .catch((error) => {
          const mensagem =
            error?.response?.data?.error || "Não foi possível carregar as transações.";
          setDetalhesMensaisModal((prev) => ({
            ...prev,
            transacoesPorCategoria: {
              ...prev.transacoesPorCategoria,
              [chave]: {
                itens: [],
                carregando: false,
                erro: mensagem,
              },
            },
          }));
        });
    },
    [detalhesMensaisModal.aberto, detalhesMensaisModal.dados, detalhesMensaisModal.imovelId, detalhesMensaisModal.mesISO]
  );

  return (
    <div className="container py-4">
      <header className="d-flex flex-column flex-md-row align-items-md-center justify-content-between mb-4 gap-3">
        <div>
          <h1 className="fs-3 fw-bold mb-1">Painel de Imóveis</h1>
          <p className="text-muted mb-0">Acompanhe os resultados e acesse os dashboards de cada operação.</p>
        </div>
        {canEdit && (
          <button
            type="button"
            className="btn btn-primary add-imovel-trigger align-self-start align-self-md-center"
            onClick={() => {
              setShowAddImovelModal(true);
              setNewImovel({ nome: "", vendido: false });
            }}
            title="Cadastrar novo imóvel"
          >
            <span aria-hidden="true">＋</span>
            <span className="visually-hidden">Cadastrar novo imóvel</span>
          </button>
        )}
      </header>

      {showAddImovelModal && (
        <>
          <div className="modal fade show d-block" tabIndex={-1} role="dialog" aria-modal="true">
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">Cadastrar imóvel</h5>
                  <button
                    type="button"
                    className="btn-close"
                    onClick={closeAddImovelModal}
                    aria-label="Fechar"
                    disabled={addingImovel}
                  />
                </div>
                <form onSubmit={handleAddImovel}>
                  <div className="modal-body d-flex flex-column gap-3">
                    <div>
                      <label className="form-label small text-muted text-uppercase" htmlFor="novo-imovel-nome">
                        Nome do imóvel
                      </label>
                      <input
                        id="novo-imovel-nome"
                        type="text"
                        className="form-control form-control-sm"
                        placeholder="Ex.: Apartamento Bela Vista"
                        value={newImovel.nome}
                        onChange={(e) => setNewImovel((prev) => ({ ...prev, nome: e.target.value }))}
                        disabled={addingImovel}
                        autoFocus
                      />
                    </div>
                    <div>
                      <label className="form-label small text-muted text-uppercase" htmlFor="novo-imovel-status">
                        Status
                      </label>
                      <select
                        id="novo-imovel-status"
                        className="form-select form-select-sm"
                        value={newImovel.vendido ? "true" : "false"}
                        onChange={(e) =>
                          setNewImovel((prev) => ({ ...prev, vendido: e.target.value === "true" }))
                        }
                        disabled={addingImovel}
                      >
                        <option value="false">Disponível</option>
                        <option value="true">Vendido</option>
                      </select>
                    </div>
                  </div>
                  <div className="modal-footer">
                    <button
                      type="button"
                      className="btn btn-outline-secondary"
                      onClick={closeAddImovelModal}
                      disabled={addingImovel}
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={addingImovel || !newImovel.nome.trim()}
                    >
                      {addingImovel ? "Salvando..." : "Cadastrar"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
          <div className="modal-backdrop fade show" />
        </>
      )}

      <div className="home-filter-bar card border-0 shadow-sm mb-4">
        <div className="card-body d-flex flex-column flex-lg-row align-items-lg-center justify-content-between gap-3">
          <div>
            <h2 className="fs-6 fw-semibold mb-1">Visibilidade dos imóveis</h2>
            <small className="text-muted">Controle se os imóveis vendidos devem aparecer nas métricas e na listagem.</small>
          </div>
          <div className="ios-toggle-wrapper">
            <span className="ios-toggle__label">Exibir imóveis vendidos</span>
            <button
              type="button"
              className={`ios-switch ${mostrarVendidos ? "ios-switch--on" : ""}`}
              onClick={handleToggleVendidos}
              aria-pressed={mostrarVendidos}
            >
              <span className="ios-switch__handle" />
            </button>
          </div>
        </div>
      </div>

      {/* Gráfico de desembolsos mensais */}
      <section className="card border-0 shadow-sm mb-4">
        <div className="card-body">
          <div className="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center mb-3 gap-2">
            <div>
              <h2 className="fs-5 fw-semibold mb-0">Desembolsos mensais</h2>
              <small className="text-muted">
                Valores confirmados (situação 1) nos últimos {chartPref.meses} meses.
              </small>
            </div>
            <button
              type="button"
              className="btn btn-light btn-sm border-0 text-secondary d-flex align-items-center gap-1"
              onClick={handleToggleConfig}
            >
              <span aria-hidden="true">⚙️</span>
              <span>Configurar</span>
            </button>
          </div>

          {showConfigChart && (
            <div className="border rounded bg-light-subtle p-3 mb-3">
              <form className="d-flex flex-column gap-3" onSubmit={handleAplicarConfiguracao}>
                <div className="row g-3">
                  <div className="col-sm-4 col-12">
                    <label className="form-label small text-muted text-uppercase">Meses de histórico</label>
                    <input
                      type="number"
                      min="1"
                      max="24"
                      className="form-control form-control-sm"
                      value={configDraft.meses === "" ? "" : configDraft.meses}
                      onChange={(e) => {
                        const valor = e.target.value;
                        setConfigDraft((prev) => ({
                          ...prev,
                          meses: valor === "" ? "" : Number(valor),
                        }));
                      }}
                    />
                    <small className="text-muted">Digite entre 1 e 24 meses.</small>
                  </div>
                  <div className="col-12">
                    <label className="form-label small text-muted text-uppercase">Categorias a ocultar</label>
                    {categoriasLoading ? (
                      <p className="text-muted small mb-0">Carregando categorias...</p>
                    ) : categoriasErro ? (
                      <p className="text-danger small mb-0">Não foi possível carregar as categorias.</p>
                    ) : (
                      <div className="d-flex flex-wrap gap-2">
                        {categoriasDisponiveis.map((categoria) => (
                          <label key={categoria.id} className="form-check form-check-inline small mb-0">
                            <input
                              type="checkbox"
                              className="form-check-input me-1"
                              checked={(configDraft.excluir || []).includes(categoria.id)}
                              onChange={() => toggleCategoriaExcluida(categoria.id)}
                            />
                            <span className="form-check-label">{categoria.nome}</span>
                          </label>
                        ))}
                        {!categoriasDisponiveis.length && !categoriasLoading && !categoriasErro && (
                          <span className="text-muted small">Nenhuma categoria disponível.</span>
                        )}
                      </div>
                    )}
                    <div className="d-flex gap-3 mt-2">
                      <button
                        type="button"
                        className="btn btn-link btn-sm p-0"
                        onClick={incluirTodasCategorias}
                      >
                        Incluir todas
                      </button>
                      <button
                        type="button"
                        className="btn btn-link btn-sm p-0"
                        onClick={restaurarPadraoCategorias}
                      >
                        Restaurar padrão
                      </button>
                    </div>
                  </div>
                </div>
                <div className="d-flex justify-content-end gap-2">
                  <button
                    type="button"
                    className="btn btn-outline-secondary btn-sm"
                    onClick={() => setShowConfigChart(false)}
                  >
                    Cancelar
                  </button>
                  <button type="submit" className="btn btn-primary btn-sm">
                    Aplicar
                  </button>
                </div>
              </form>
            </div>
          )}
          {gastosRetryState.status === "retrying" && (
            <div className="alert alert-info py-2 px-3 small mb-3" role="status">
              Tentando novamente ({gastosRetryState.attempt}/{gastosRetryState.totalAttempts})...
            </div>
          )}
          {loadingGastos ? (
            <div className="text-center text-muted py-4">Carregando gráfico...</div>
          ) : erroGastos ? (
            <div className="text-center text-muted py-4">
              <p className="mb-1">Não foi possível carregar os dados.</p>
              <small className="d-block mb-3">Tente novamente mais tarde.</small>
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm"
                onClick={handleTentarNovamenteGastos}
              >
                Tentar novamente agora
              </button>
            </div>
          ) : (
            <GastosMensaisChart dados={gastosMensais} onSegmentClick={handleAbrirDetalhesMensais} />
          )}
        </div>
      </section>

      {/* Resumo agregado dos imóveis */}
      <section className="card border-0 shadow-sm mb-4 resumo-imoveis-card">
        <div className="card-body">
          <div className="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center gap-2 mb-3">
            <div>
              <h2 className="fs-5 fw-semibold mb-0">Resumo geral dos imóveis</h2>
              <small className="text-muted">
                Totais considerando {mostrarVendidos ? "todos os imóveis (incluindo vendidos)" : "apenas os imóveis ativos"}.
              </small>
            </div>
            {resumoImoveis.imoveisConsiderados > 0 && (
              <span className="badge text-bg-light fw-semibold">
                {resumoImoveis.imoveisConsiderados} {resumoImoveis.imoveisConsiderados === 1 ? "imóvel" : "imóveis"}
              </span>
            )}
          </div>

          {loadingResumo ? (
            <div className="text-muted">Calculando resumo...</div>
          ) : erroResumo ? (
            <div className="alert alert-warning mb-0" role="alert">
              Não foi possível carregar o resumo dos imóveis. Tente novamente mais tarde.
            </div>
          ) : (
            <div className="resumo-imoveis-card__metrics">
              <article className="resumo-imoveis-card__metric">
                <span>Total efetivado</span>
                <strong>{formatarMoeda(resumoImoveis.totalEfetivado)}</strong>
              </article>
              <article className="resumo-imoveis-card__metric">
                <span>Total a investir</span>
                <strong>{formatarMoeda(resumoImoveis.totalAInvestir)}</strong>
              </article>
              <article className="resumo-imoveis-card__metric">
                <span>Lucro projetado</span>
                <strong>{formatarMoeda(resumoImoveis.lucroProjetado)}</strong>
              </article>
            </div>
          )}
        </div>
      </section>

      {/* Lista de imóveis */}
      {imoveisRetryState.status === "retrying" && (
        <div className="alert alert-info py-2 px-3 small" role="status">
          Tentando novamente ({imoveisRetryState.attempt}/{imoveisRetryState.totalAttempts})...
        </div>
      )}
      {loadingImoveis ? (
        <p className="fs-6 text-muted">Carregando imóveis...</p>
      ) : erroImoveis ? (
        <div className="alert alert-warning" role="alert">
          <div>Não foi possível carregar a lista de imóveis. Verifique sua conexão ou tente novamente mais tarde.</div>
          <button
            type="button"
            className="btn btn-outline-secondary btn-sm mt-3"
            onClick={handleTentarNovamenteImoveis}
          >
            Tentar novamente
          </button>
        </div>
      ) : imoveisVisiveis.length === 0 ? (
        imoveis.length > 0 ? (
          <div className="alert alert-light" role="alert">
            Nenhum imóvel atende ao filtro atual.
          </div>
        ) : (
          <p className="fs-6 text-muted">Nenhum imóvel cadastrado ainda.</p>
        )
      ) : (
        <div className="row g-4">
          {imoveisVisiveis.map((imovel) => {
            const valorEfetivadoCard = toNumber(
              imovel.valorEfetivado,
              toNumber(imovel.totalInvestido),
            );
            const valorAInvestirCard = toNumber(imovel.valorAInvestir);
            const ativoEsperadoCard = toNumber(
              imovel.ativoEsperado,
              valorEfetivadoCard + valorAInvestirCard + toNumber(imovel.lucroProjetado),
            );
            const roiProjetadoCard = toNumber(imovel.roiProjetado);
            const periodo = formatarPeriodo(imovel.periodoInicio, imovel.periodoFim);
            const metrics = [
              {
                label: "Valor a investir",
                value: formatarMoeda(valorAInvestirCard),
                valueClass:
                  valorAInvestirCard > 0
                    ? "property-card__metrics-value--pending"
                    : valorAInvestirCard < 0
                      ? "property-card__metrics-value--negative"
                      : "",
              },
              {
                label: "Ativo esperado",
                value: formatarMoeda(ativoEsperadoCard),
                valueClass: "property-card__metrics-value--accent",
              },
              {
                label: "ROI esperado",
                value: formatarPercentual(roiProjetadoCard),
                valueClass:
                  roiProjetadoCard > 0
                    ? "property-card__metrics-value--positive"
                    : roiProjetadoCard < 0
                      ? "property-card__metrics-value--negative"
                      : "",
              },
            ];
            return (
              <div key={imovel.id} className="col-12 col-md-6 col-lg-4 d-flex">
                <div className="card border-0 shadow-sm w-100 property-card">
                  <div className="property-card__header">
                    <div className="d-flex align-items-center text-body">
                      <img
                        src="/img/dashboard.png"
                        alt="Dashboard"
                        className="property-card__icon"
                      />
                      <Link to={`/dashboard/${imovel.id}`} className="property-card__title text-decoration-none">
                        {imovel.nome}
                      </Link>
                    </div>
                    <span
                      className={`property-card__status ${imovel.vendido ? "property-card__status--sold" : "property-card__status--available"}`}
                    >
                      {imovel.vendido ? "Vendido" : "Disponível"}
                    </span>
                  </div>

                  <div className="property-card__body">
                    <div className="property-card__summary">
                      <div className="property-card__summary-info">
                        <p
                          className={`property-card__amount ${valorEfetivadoCard >= 0 ? "property-card__amount--positive" : "property-card__amount--negative"}`}
                        >
                          {formatarMoeda(valorEfetivadoCard)}
                        </p>
                        <p className="property-card__label">Valor efetivado</p>
                        <p className="property-card__periodo">{periodo || "Sem período disponível"}</p>
                        <div className="property-card__metrics">
                          {metrics.map(({ label, value, valueClass }) => {
                            const metricValueClass = valueClass
                              ? `property-card__metrics-value ${valueClass}`
                              : "property-card__metrics-value";
                            return (
                              <div key={label} className="property-card__metrics-item">
                                <span className="property-card__metrics-label">{label}</span>
                                <span className={metricValueClass}>{value}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      <div className="property-card__summary-aside">
                        <ImovelGrupoPieChart grupos={imovel.grupos} />
                      </div>
                    </div>

                    <div className="property-card__footer">
                      <div className="property-card__actions">
                        <img
                          src="/img/google-maps.png"
                          alt="Ver no mapa"
                          title="Ver no mapa"
                          onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(imovel.nome)}`, "_blank")}
                        />
                        {canEdit && (
                          <>
                            <img
                              src="/img/editar.png"
                              alt="Editar"
                              title="Editar imóvel"
                              onClick={() => console.log("Editar imóvel:", imovel.id)}
                            />
                            {valorEfetivadoCard === 0 && (
                              <img
                                src="/img/excluir.png"
                                alt="Excluir"
                                title="Excluir imóvel"
                                onClick={() => deleteImovel(imovel.id)}
                              />
                            )}
                          </>
                        )}
                        <img
                          src={imovel.vendido ? "/img/casa_indisponivel.png" : "/img/casa_disponivel.png"}
                          alt={imovel.vendido ? "Vendido" : "Disponível"}
                          title={imovel.vendido ? "Vendido" : "Disponível"}
                        />
                      </div>

                      <Link
                        to={`/dashboard/${imovel.id}`}
                        className="property-card__cta-icon"
                        aria-label="Abrir dashboard"
                      >
                        <span aria-hidden="true">↗</span>
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Rodapé com Data de Atualização e Ação */}
      <div className="mt-5 pt-3 border-top d-flex justify-content-between align-items-center small text-muted flex-wrap gap-2">
        <span>
          Data de atualização: <strong>{ultimaAtualizacao || "—"}</strong>
        </span>
        <button
          type="button"
          className="btn btn-link btn-sm p-0"
          onClick={async () => {
            setShowUltimos(true);
            setLoadingUltimos(true);
            try {
              const itens = await fetchUltimosLancamentos(10);
              setUltimos(itens || []);
            } catch {
              setUltimos([]);
            } finally {
              setLoadingUltimos(false);
            }
          }}
        >
          Ver últimos 10 lançamentos
        </button>
      </div>

      <GastosMensaisDetalhesModal
        show={detalhesMensaisModal.aberto}
        onClose={handleFecharDetalhesMensais}
        carregando={detalhesMensaisModal.carregando}
        erro={detalhesMensaisModal.erro}
        detalhes={detalhesMensaisModal.dados}
        mesLabel={detalhesMensaisModal.mesRotulo || formatarMesExtenso(detalhesMensaisModal.mesISO)}
        nomeImovel={detalhesMensaisModal.nomeImovel}
        valorSegmento={detalhesMensaisModal.valorSegmento}
        mesISO={detalhesMensaisModal.mesISO}
        onCarregarTransacoes={handleCarregarTransacoesCategoria}
        transacoesPorCategoria={detalhesMensaisModal.transacoesPorCategoria}
      />

      {/* Modal simples para últimos lançamentos */}
      {showUltimos && (
        <div
          className="position-fixed top-0 start-0 w-100 h-100"
          style={{ background: "rgba(0,0,0,0.4)", zIndex: 1050 }}
          onClick={() => setShowUltimos(false)}
        >
          <div
            className="card shadow position-absolute p-3"
            style={{ maxWidth: 700, width: "95%", top: "10%", left: "50%", transform: "translateX(-50%)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="d-flex justify-content-between align-items-center mb-2">
              <h2 className="fs-6 fw-semibold mb-0">Últimos 10 lançamentos</h2>
              <button className="btn btn-sm btn-outline-secondary" onClick={() => setShowUltimos(false)}>Fechar</button>
            </div>
            {loadingUltimos ? (
              <p className="text-muted mb-0">Carregando...</p>
            ) : (
              <div className="table-responsive" style={{ maxHeight: 400, overflowY: "auto" }}>
                <table className="table table-sm">
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Descrição</th>
                      <th className="text-end">Valor</th>
                      <th>Imóvel</th>
                      <th>Categoria</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(ultimos || []).map((item, idx) => (
                      <tr key={idx}>
                        <td>{item.data}</td>
                        <td>{item.descricao}</td>
                        <td className="text-end">
                          {Number(item.valor ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                        </td>
                        <td>{item.imovel}</td>
                        <td>{item.categoria}</td>
                      </tr>
                    ))}
                    {(!ultimos || ultimos.length === 0) && (
                      <tr>
                        <td colSpan={5} className="text-center text-muted">Nenhum lançamento encontrado.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default Home;
