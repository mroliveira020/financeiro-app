import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import "./Prospeccoes.css";
import useProspeccaoQuery from "./prospeccoes/useProspeccaoQuery";
import ProspeccoesDesktop from "./prospeccoes/ProspeccoesDesktop";

import {
  fetchCapturados,
  mapContextoOferta,
  fetchSelecionados,
  adicionarSelecionado,
  excluirSelecionado,
  fetchProspecMeta,
  fetchAnaliseSelecionado,
  salvarAnaliseSelecionado,
  fetchAvaliacaoAutomatica,
  fetchEnriquecimento,
  fetchResponsaveisDisponiveis,
  salvarScoreRegiao,
  salvarResponsaveisSelecionado,
  fetchAiAnalise,
  salvarAiAnalise,
  enviarMensagemAiChat,
  solicitarMatricula,
  solicitarEnriquecimento,
  pollAiJob,
} from "../services/prospeccoes";
import { fetchImoveisFinanceiroAcessiveis } from "../services/api";
import useProspeccaoSession from "../hooks/useProspeccaoSession";
import { useAuth } from "../context/AuthContext";
import {
  ProspectPhoto,
  ProspectGallery,
  DetalhesTexto,
  TextoEstruturado,
  NoteIcon,
  UsersIcon,
  PriorityIcon,
  ChartIcon,
  TrashIcon,
  EyeIcon,
  FinanceIcon,
  QueueIcon,
  ProspectIcon,
  ArrowLeftIcon,
  MoreIcon,
  ArrowUpRightIcon,
  MapPinIcon,
  SparklesIcon,
  CloseIcon,
  MobileHubCard,
  CapturaFilters,
  CapturaReferencias,
} from "./prospeccoes/ProspeccoesShared";
import {
  ResponsaveisModal,
  ConfirmarExclusaoModal,
  IncluirSelecionadoManualModal,
  ObservacoesModal,
  PrioridadeModal,
} from "./prospeccoes/ProspeccoesModals";
import {
  ANALISE_DEFAULTS,
  ANALISE_PAIR_MODE_DEFAULTS,
  createAnaliseDraft,
  createAnalisePairModes,
  createAnaliseFallbackInputs,
  formatDraftEditableValue,
  formatDraftValue,
  normalizeDraftFieldValue,
  buildAnalisePayload,
  AnaliseModal,
} from "./prospeccoes/ProspeccoesAnalise";
import { AvaliacaoAutomaticaModal, AvaliacaoDetalhadaModal } from "./prospeccoes/ProspeccoesDetailModals";
import {
  MobileSelecionadosList,
  MobileCapturadosList,
} from "./prospeccoes/ProspeccoesMobileSections";

const PRIORIDADE_OPTIONS = [
  { value: 1, label: "Baixa", cls: "baixa" },
  { value: 2, label: "Média", cls: "media" },
  { value: 3, label: "Alta", cls: "alta" },
];

const FONTE_OPTIONS = [
  { value: "todas", label: "Todas" },
  { value: "caixa", label: "Extrajudicial (Caixa)" },
  { value: "tjdft", label: "Judicial (TJDFT)" },
];

const MOBILE_BREAKPOINT = 900;
const AI_JOB_ERROR_STATUSES = new Set(["error", "failed"]);
const AI_JOB_STATUS_LABELS = {
  pending: "Pendente",
  processing: "Processando",
  done: "Concluído",
  error: "Falhou",
  failed: "Falhou",
};

const getAiJobStatusTone = (status) => {
  if (status === "done") return "success";
  if (status === "error" || status === "failed") return "error";
  return "info";
};

const isAiJobExpiredByInactivity = (erro = "") => `${erro}`.toLowerCase().includes("expirado por inatividade");

const buildAiJobStatusState = (job, { fallbackPrefix = "IA", retryAction = null } = {}) => {
  const prefix = job?.tipo === "matricula"
    ? "Matrícula"
    : job?.tipo === "enriquecimento"
      ? "Enriquecimento"
      : fallbackPrefix;
  const status = job?.status;
  const erro = (job?.erro || "").trim();

  if (status === "pending") {
    return { message: `${prefix}: Aguardando processamento...`, tone: "info", action: null };
  }
  if (status === "processing") {
    return { message: `${prefix}: Processando...`, tone: "info", action: null };
  }
  if (status === "done") {
    return {
      message: `${prefix}: resultado disponível.`,
      tone: "success",
      action: null,
    };
  }
  if (status === "error" || status === "failed") {
    if (isAiJobExpiredByInactivity(erro)) {
      return {
        message: "Worker não respondeu. Tente novamente.",
        tone: "error",
        action: retryAction ? { kind: retryAction, label: "Tentar novamente" } : null,
      };
    }
    return {
      message: erro ? `${prefix}: ${erro}` : `${prefix}: o processamento retornou um erro.`,
      tone: "error",
      action: null,
    };
  }

  const label = AI_JOB_STATUS_LABELS[status] || "Em andamento";
  return { message: `${prefix}: ${label}.`, tone: getAiJobStatusTone(status), action: null };
};

const buildAiErrorStatusState = (erro, { fallbackPrefix = "IA", retryAction = null } = {}) => {
  const message = `${erro || ""}`.trim();
  if (isAiJobExpiredByInactivity(message)) {
    return {
      message: "Worker não respondeu. Tente novamente.",
      tone: "error",
      action: retryAction ? { kind: retryAction, label: "Tentar novamente" } : null,
    };
  }
  if (message.toLowerCase().includes("tempo limite excedido")) {
    return {
      message: `${fallbackPrefix}: o processamento demorou mais do que o esperado. Tente novamente em instantes.`,
      tone: "error",
      action: retryAction ? { kind: retryAction, label: "Tentar novamente" } : null,
    };
  }
  return {
    message: message || `${fallbackPrefix}: não foi possível concluir o processamento.`,
    tone: "error",
    action: null,
  };
};

const hasAiUsefulContent = (data) => Boolean(
  data?.historico_chat?.length
  || data?.analise_texto
  || data?.matricula_texto
);

const getUiMessageTone = (message = "") => {
  const normalized = `${message}`.trim().toLowerCase();
  if (!normalized) return "info";
  if (
    normalized.startsWith("erro")
    || normalized.includes("falha")
    || normalized.includes("inválid")
    || normalized.includes("invalid")
    || normalized.includes("não foi possível")
  ) {
    return "error";
  }
  return "success";
};

const formatarMoeda = (valor) => {
  if (valor === null || valor === undefined) return "—";
  return Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

const formatarPercentual = (valor) => {
  if (valor === null || valor === undefined) return "—";
  return `${Number(valor).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}%`;
};

const formatarNumero = (valor) => {
  if (valor === null || valor === undefined) return "—";
  return Number(valor).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
};

const normalizeComparableText = (texto) => `${texto || ""}`
  .replace(/\s+/g, " ")
  .trim()
  .toLowerCase();

const isSelecionadoAtivo = (item) => item?.ativo !== false;

const createManualSelecionadoDraft = () => ({
  numero_bem: "",
  valor_maximo: "",
  prioridade: 2,
  observacoes: "",
});

const getAnaliseIaActionLabel = (item) => (item?.analiseIaSalva ? "Reanalisar" : "Gerar análise inicial");

const calcularDescontoExibicao = (item) => {
  const descontoInformado = Number(item?.desconto);
  const valorAvaliacao = Number(item?.valorAvaliacao);
  const valorMinimo = Number(item?.valorMinimo ?? item?.valor);
  const descontoCalculado = (!Number.isFinite(valorAvaliacao) || valorAvaliacao <= 0 || !Number.isFinite(valorMinimo) || valorMinimo < 0)
    ? null
    : ((valorAvaliacao - valorMinimo) / valorAvaliacao) * 100;

  if (Number.isFinite(descontoInformado) && descontoInformado > 0) {
    const candidatos = [
      descontoInformado,
      descontoInformado / 10,
      descontoInformado / 100,
      descontoInformado / 1000,
    ].filter((valor) => Number.isFinite(valor) && valor > 0 && valor <= 100);

    if (candidatos.length) {
      if (descontoCalculado !== null) {
        return candidatos.reduce((melhor, atual) => (
          Math.abs(atual - descontoCalculado) < Math.abs(melhor - descontoCalculado) ? atual : melhor
        ));
      }
      return candidatos[0];
    }
  }

  if (!Number.isFinite(valorAvaliacao) || valorAvaliacao <= 0 || !Number.isFinite(valorMinimo) || valorMinimo < 0) {
    return null;
  }

  return descontoCalculado > 0 ? descontoCalculado : null;
};

const formatarDataHoraCompacta = (valor) => {
  if (!valor) return "—";
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return "—";
  return data.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "2-digit",
    hour: "2-digit", minute: "2-digit",
  }).replace(",", "");
};

const slugifyTexto = (valor) => `${valor || ""}`
  .toLowerCase()
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9\s-]/g, "")
  .trim()
  .replace(/\s+/g, "-");

const getLeiloesInfo = (item) => ([
  { label: "1º Leilão", data: item?.data_leilao_1, valor: item?.valorLeilao1 },
  { label: "2º Leilão", data: item?.data_leilao_2, valor: item?.valorLeilao2 },
  { label: "Licitação", data: item?.data_licitacao_aberta, valor: item?.valorVenda ?? item?.valorMinimo ?? item?.valor },
  { label: "Encerramento", data: item?.data_hora_encerramento, valor: null },
]).filter((entry) => Boolean(entry.data) || Number(entry.valor) > 0);

const getLeilaoResumo = (item) => item?.etapaRecomendada ? {
  label: item.etapaRecomendada,
  valor: item.lanceRecomendado,
  data: item.dataRecomendada,
} : null;

const getMapsUrl = (item) => {
  if (item?.linkGoogleMaps) return item.linkGoogleMaps;
  const query = [item?.endereco, item?.bairro, item?.cidade, item?.uf].filter(Boolean).join(", ");
  return query ? `https://www.google.com/maps/search/${encodeURIComponent(query)}` : "";
};

const getComparaveisLinks = (item) => {
  const cidadeOriginal = `${item?.cidade || ""}`.trim();
  const cidade = slugifyTexto(cidadeOriginal);
  const uf = `${item?.uf || ""}`.trim().toLowerCase();
  if (!cidade || !uf) return [];
  return [
    { label: "Zap", url: `https://www.zapimoveis.com.br/venda/imoveis/${uf}/${cidade}/` },
    { label: "OLX", url: `https://www.olx.com.br/imoveis/venda/estado-${uf}?q=${encodeURIComponent(cidadeOriginal)}` },
    { label: "Viva", url: `https://www.vivareal.com.br/venda/imoveis/${uf}/${cidade}/` },
  ];
};

const getFonteLabel = (fonte) => {
  if (fonte === "caixa_extrajudicial") return "Extrajudicial";
  if (fonte === "tjdft_judicial") return "Judicial";
  return "";
};

const getFonteFilterValues = (filtroFonte) => {
  if (filtroFonte === "caixa") return ["caixa_extrajudicial"];
  if (filtroFonte === "tjdft") return ["tjdft_judicial"];
  return undefined;
};

const podeAnalisarMatricula = (item) => item?.fonte === "caixa_extrajudicial";

const extrairEditalUrl = (texto) => {
  const match = `${texto || ""}`.match(/Edital PDF:\s*(https?:\/\/\S+)/i);
  return match?.[1] || "";
};

const extrairProcessoNumero = (texto) => {
  const match = `${texto || ""}`.match(/Processo:\s*([\d.-]+)/i);
  return match?.[1] || "";
};


const getScoreClasse = (scoreTotal) => {
  const valor = Number(scoreTotal);
  if (!Number.isFinite(valor)) return "is-neutral";
  if (valor >= 60) return "is-high";
  if (valor >= 40) return "is-medium";
  return "is-low";
};

const getRoiClasse = (roi) => {
  const valor = Number(roi);
  if (!Number.isFinite(valor)) return "is-neutral";
  if (valor < 0) return "is-negative";
  if (valor >= 30) return "is-high";
  return "is-medium";
};

const getMensagemPrefillAnalise = (meta) => {
  const source = meta?.prefill_source;
  const data = meta?.avaliacao_automatica?.pesquisado_em;
  const dataFmt = data ? formatarDataHoraCompacta(data) : "data não informada";
  if (source === "motor2") {
    return `Valores pre-preenchidos pelo Motor de Avaliacao Automatica (comparaveis coletados em ${dataFmt}). Ajuste conforme seu conhecimento do imovel.`;
  }
  if (source === "fallback_local") {
    return "Nao foi possivel carregar a analise salva agora. Abrimos a ficha com um pre-preenchimento basico do imovel para nao travar a operacao.";
  }
  return "";
};

const detectMobileAccess = () => {
  if (typeof window === "undefined") return false;
  const width = window.innerWidth <= MOBILE_BREAKPOINT;
  const coarsePointer = typeof window.matchMedia === "function"
    ? window.matchMedia("(pointer: coarse)").matches
    : false;
  const touchPoints = navigator.maxTouchPoints || 0;
  const userAgent = /Android|iPhone|iPad|iPod|IEMobile|Opera Mini/i.test(navigator.userAgent || "");
  return width && (coarsePointer || touchPoints > 0 || userAgent);
};

export default function Prospeccoes() {
  const outletContext = useOutletContext() || {};
  const setTopbarContent = outletContext.setTopbarContent;
  const { user, hasRole } = useAuth();
  const [mobileAccess, setMobileAccess] = useState(() => detectMobileAccess());
  const [query, setQuery] = useProspeccaoQuery({ desktop: !mobileAccess });
  const {
    fonte: filtroFonteCap,
    uf: filtroUfCap,
    cidade: filtroCidadesCap,
    modalidade: filtroModalidadeCap,
    financia: filtroFinanciaCap,
    score: scoreMinCap,
    roi: roiMinCap,
    pre_analise: somenteComAvaliacaoCap,
    presenca: presencaCap,
    revisao: somenteRevisaoCap,
    por_pagina: pageSize,
    pagina: page,
    ordenar: sortBy,
    direcao: sortDir,
    fila_ordenar: selectedSortBy,
    fila_direcao: selectedSortDir,
    fila_busca: selectedSearch,
    fila_uf: selectedUfFilter,
    fila_prioridade: selectedPrioridadeFilter,
    fila_atividade: queryActivityFilter,
    fila_responsavel: selectedResponsavelFilter,
  } = query;
  const {
    fonte: setFiltroFonteCap,
    uf: setFiltroUfCap,
    cidade: setFiltroCidadesCap,
    modalidade: setFiltroModalidadeCap,
    financia: setFiltroFinanciaCap,
    score: setScoreMinCap,
    roi: setRoiMinCap,
    pre_analise: setSomenteComAvaliacaoCap,
    presenca: setPresencaCap,
    revisao: setSomenteRevisaoCap,
    por_pagina: setPageSize,
    pagina: setPage,
    ordenar: setSortBy,
    direcao: setSortDir,
    fila_ordenar: setSelectedSortBy,
    fila_direcao: setSelectedSortDir,
    fila_busca: setSelectedSearch,
    fila_uf: setSelectedUfFilter,
    fila_prioridade: setSelectedPrioridadeFilter,
    fila_atividade: setSelectedActivityFilter,
    fila_responsavel: setSelectedResponsavelFilter,
    fila_autor: setSelectedUserFilter,
    aba: setActiveTab,
  } = setQuery;

  const mobileSection = query.aba || "hub";
  const setMobileSection = (section) => setActiveTab(section === "hub" ? "" : section);
  const selectedActivityFilter = user?.role === "admin" ? queryActivityFilter : "ativos";
  const selectedUserFilter = user?.role === "admin" ? query.fila_autor : "todos";
  const [selecionados, setSelecionados] = useState([]);
  const [capturados, setCapturados] = useState([]);
  const [capturadosTotal, setCapturadosTotal] = useState(0);
  const [loadingSel, setLoadingSel] = useState(false);
  const [loadingCap, setLoadingCap] = useState(false);
  const [erroSel, setErroSel] = useState("");
  const [erroCap, setErroCap] = useState("");
  const [includeLoadingIds, setIncludeLoadingIds] = useState(new Set());
  const [removeLoadingIds, setRemoveLoadingIds] = useState(new Set());
  const [updateLoadingIds, setUpdateLoadingIds] = useState(new Set());
  const [mensagem, setMensagem] = useState("");
  const [meta, setMeta] = useState({ ufs: [], fontes: [], modalidades: [], financia: [] });
  const [, setCapturadosFiltersExpanded] = useState(false);
  const [, setCapturadosCitySearch] = useState("");
  const [selectedFiltersExpanded, setSelectedFiltersExpanded] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("prospeccoes_selecionados_filters_expanded") === "1";
  });
  const [selecionadosCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("prospeccoes_selecionados_collapsed") === "1";
  });
  const [confirmDeleteItem, setConfirmDeleteItem] = useState(null);
  const [manualSelecionadoDraft, setManualSelecionadoDraft] = useState(null);
  const [manualSelecionadoSaving, setManualSelecionadoSaving] = useState(false);
  const [prioridadeItem, setPrioridadeItem] = useState(null);
  const [observacaoItem, setObservacaoItem] = useState(null);
  const [observacaoDraft, setObservacaoDraft] = useState("");
  const [observacaoMapLink, setObservacaoMapLink] = useState("");
  const [observacaoAnaliseBase, setObservacaoAnaliseBase] = useState(null);
  const [analiseItem, setAnaliseItem] = useState(null);
  const [analiseDraft, setAnaliseDraft] = useState(null);
  const [analiseMeta, setAnaliseMeta] = useState(null);
  const [analiseCache, setAnaliseCache] = useState({});
  const [analisePairModes, setAnalisePairModes] = useState(ANALISE_PAIR_MODE_DEFAULTS);
  const [analiseLoading, setAnaliseLoading] = useState(false);
  const [analiseSaving, setAnaliseSaving] = useState(false);
  const [responsaveisDisponiveis, setResponsaveisDisponiveis] = useState([]);
  const [responsaveisItem, setResponsaveisItem] = useState(null);
  const [responsaveisDraftIds, setResponsaveisDraftIds] = useState([]);
  const [responsaveisSaving, setResponsaveisSaving] = useState(false);
  const [avaliacaoAutomaticaItem, setAvaliacaoAutomaticaItem] = useState(null);
  const [avaliacaoAutomaticaDetalhe, setAvaliacaoAutomaticaDetalhe] = useState(null);
  const [avaliacaoAutomaticaLoading, setAvaliacaoAutomaticaLoading] = useState(false);
  const [avaliacaoScoreSaving, setAvaliacaoScoreSaving] = useState(false);
  const [avaliacaoScoreRegiaoDraft, setAvaliacaoScoreRegiaoDraft] = useState("");
  const [avaliacaoDetalhadaItem, setAvaliacaoDetalhadaItem] = useState(null);
  const [avaliacaoDetalhadaOrigem, setAvaliacaoDetalhadaOrigem] = useState("selecionados");
  const [avaliacaoDetalhadaTab, setAvaliacaoDetalhadaTab] = useState("dados");
  const [aiAnalise, setAiAnalise] = useState(null);
  const [analiseDetalhada, setAnaliseDetalhada] = useState(null);
  const [enriquecimentoDetalhado, setEnriquecimentoDetalhado] = useState(null);
  const [enriquecimentoDetalhadoLoading, setEnriquecimentoDetalhadoLoading] = useState(false);
  const [analiseDetalhadaLoading, setAnaliseDetalhadaLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSending, setAiSending] = useState(false);
  const [aiSaving, setAiSaving] = useState(false);
  const [matriculaLoading, setMatriculaLoading] = useState(false);
  const [enriquecimentoLoading, setEnriquecimentoLoading] = useState(false);
  const hubSession = useProspeccaoSession();
  const aiAutoInitAttemptRef = useRef(new Set());
  const [desktopTabs, setDesktopTabs] = useState([]);
  const desktopScrollRef = useRef(null);
  const desktopDraftsRef = useRef(new Map());
  const aiDeferredActionRef = useRef(null);
  const enriquecimentoFetchAttemptRef = useRef(new Set());
  const [aiMensagemDraft, setAiMensagemDraft] = useState("");
  const [aiSinteseDraft, setAiSinteseDraft] = useState("");
  const [avaliacaoDetalhadaStatus, setAvaliacaoDetalhadaStatus] = useState("");
  const [avaliacaoDetalhadaStatusTone, setAvaliacaoDetalhadaStatusTone] = useState("info");
  const [avaliacaoDetalhadaStatusActionKind, setAvaliacaoDetalhadaStatusActionKind] = useState(null);
  const [financeiroCount, setFinanceiroCount] = useState(null);
  const [financeiroImoveis, setFinanceiroImoveis] = useState([]);
  const pageSizeOptions = [20, 50, 100];
  const deferredSelectedSearch = useDeferredValue(selectedSearch);
  const canAccessFinance = user?.finance_access ?? hasRole("admin");
  const includeInactiveSelecionados = user?.role === "admin";
  const mensagemTone = useMemo(() => getUiMessageTone(mensagem), [mensagem]);

  const setAvaliacaoDetalhadaStatusState = useCallback(({ message = "", tone = "info", action = null } = {}) => {
    setAvaliacaoDetalhadaStatus(message);
    setAvaliacaoDetalhadaStatusTone(tone);
    setAvaliacaoDetalhadaStatusActionKind(action?.kind || null);
  }, []);

  useEffect(() => {
    if (!mensagem) return undefined;
    const timeoutId = window.setTimeout(() => {
      setMensagem("");
    }, 5000);
    return () => window.clearTimeout(timeoutId);
  }, [mensagem]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handleViewportChange = () => {
      setMobileAccess(detectMobileAccess());
    };
    handleViewportChange();
    window.addEventListener("resize", handleViewportChange);
    return () => window.removeEventListener("resize", handleViewportChange);
  }, []);

  useEffect(() => {
    const carregarSelecionados = async () => {
      setLoadingSel(true);
      setErroSel("");
      try {
        const sel = await fetchSelecionados({ incluirInativos: includeInactiveSelecionados });
        setSelecionados(sel || []);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Erro inesperado";
        setErroSel(message);
      } finally {
        setLoadingSel(false);
      }
    };
    carregarSelecionados();
  }, [includeInactiveSelecionados]);

  useEffect(() => {
    let active = true;
    const carregarCapturados = async () => {
      setLoadingCap(true);
      setErroCap("");
      try {
        const resp = await fetchCapturados({
          page,
          pageSize,
          fonte: getFonteFilterValues(filtroFonteCap),
          uf: filtroUfCap,
          cidade: filtroCidadesCap,
          modalidade: filtroModalidadeCap,
          financia: filtroFinanciaCap,
          orderBy: sortBy,
          orderDir: sortDir,
          scoreMin: scoreMinCap === "" ? undefined : Number(scoreMinCap),
          roiMin: roiMinCap === "" ? undefined : Number(roiMinCap),
          somenteComAvaliacao: somenteComAvaliacaoCap,
          presenca: presencaCap,
          somenteRevisao: somenteRevisaoCap,
          busca: mobileAccess ? undefined : query.busca,
          buscaCampo: mobileAccess ? undefined : query.busca_campo,
          lanceMin: mobileAccess || query.lance_min === "" ? undefined : Number(query.lance_min),
          lanceMax: mobileAccess || query.lance_max === "" ? undefined : Number(query.lance_max),
          avaliados: mobileAccess ? undefined : query.avaliados,
          oportunidade: !mobileAccess,
        });
        if (!active) return;
        setCapturados(resp.data || []);
        setCapturadosTotal(resp.total || 0);
        const ultimaPagina = Math.max(1, Math.ceil((resp.total || 0) / pageSize));
        const paginaDisponivel = Math.min(resp.page || page, ultimaPagina);
        if (paginaDisponivel !== page) {
          setPage(paginaDisponivel);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Erro inesperado";
        if (!active) return;
        setErroCap(message);
        setCapturados([]);
        setCapturadosTotal(0);
      } finally {
        if (active) setLoadingCap(false);
      }
    };
    const timer = window.setTimeout(carregarCapturados, mobileAccess ? 0 : 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [setPage, page, pageSize, filtroFonteCap, filtroUfCap, filtroCidadesCap, filtroModalidadeCap, filtroFinanciaCap, sortBy, sortDir, scoreMinCap, roiMinCap, somenteComAvaliacaoCap, presencaCap, somenteRevisaoCap, mobileAccess, query.busca, query.busca_campo, query.lance_min, query.lance_max, query.avaliados]);

  useEffect(() => {
    fetchProspecMeta()
      .then((resp) => setMeta(resp))
      .catch(() => setMeta({ ufs: [], fontes: [], modalidades: [], financia: [], cidades_por_uf: {} }));
  }, []);

  useEffect(() => {
    if (user?.role !== "admin") {
      setResponsaveisDisponiveis([]);
      return;
    }
    fetchResponsaveisDisponiveis()
      .then((data) => setResponsaveisDisponiveis(data || []))
      .catch(() => setResponsaveisDisponiveis([]));
  }, [user]);

  useEffect(() => {
    if (!mobileAccess || !canAccessFinance) return undefined;
    let active = true;
    fetchImoveisFinanceiroAcessiveis()
      .then((data) => {
        if (!active) return;
        const ativos = (data || []).filter((item) => !item?.vendido);
        setFinanceiroImoveis(ativos);
        setFinanceiroCount(ativos.length);
      })
      .catch(() => {
        if (!active) return;
        setFinanceiroImoveis([]);
        setFinanceiroCount(0);
      });
    return () => {
      active = false;
    };
  }, [mobileAccess, canAccessFinance]);

  const financeiroDestino = useMemo(() => {
    if (!canAccessFinance) return undefined;
    if (financeiroImoveis.length === 1) {
      return `/dashboard/${financeiroImoveis[0].id}`;
    }
    return "/financeiro";
  }, [canAccessFinance, financeiroImoveis]);

  const descricaoFinanceiroMobile = useMemo(() => {
    if (!canAccessFinance) {
      return "Seu perfil atual não possui acesso ao controle financeiro.";
    }
    if (financeiroImoveis.length === 1) {
      return "Abra direto o dashboard do imóvel disponível no seu perfil.";
    }
    if (financeiroImoveis.length > 1) {
      return "Acompanhe os imóveis adquiridos e escolha rapidamente o imóvel que deseja operar.";
    }
    return "Abra o módulo financeiro e acompanhe os imóveis adquiridos.";
  }, [canAccessFinance, financeiroImoveis]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      "prospeccoes_selecionados_collapsed",
      selecionadosCollapsed ? "1" : "0"
    );
  }, [selecionadosCollapsed]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      "prospeccoes_selecionados_filters_expanded",
      selectedFiltersExpanded ? "1" : "0"
    );
  }, [selectedFiltersExpanded]);

  const capturasReferenciaVisiveis = useMemo(() => (meta.capturas_referencia || []).filter((r) =>
    (!filtroUfCap.length || filtroUfCap.includes(r.uf))
    && (filtroFonteCap === "todas" || getFonteFilterValues(filtroFonteCap)?.includes(r.fonte))
  ), [meta, filtroUfCap, filtroFonteCap]);
  const ufOptions = useMemo(() => meta.ufs || [], [meta]);

  const cidadesOptions = useMemo(() => {
    if (!meta.cidades_por_uf) return [];
    const selectedUfs = filtroUfCap.length ? filtroUfCap : Object.keys(meta.cidades_por_uf);
    const set = new Set();
    selectedUfs.forEach((uf) => {
      (meta.cidades_por_uf[uf] || []).forEach((cidade) => set.add(cidade));
    });
    return Array.from(set).sort();
  }, [meta, filtroUfCap]);

  const selectedBaseDados = useMemo(() => {
    if (selectedActivityFilter === "inativos") {
      return selecionados.filter((item) => !isSelecionadoAtivo(item));
    }
    if (selectedActivityFilter === "todos") {
      return selecionados;
    }
    return selecionados.filter((item) => isSelecionadoAtivo(item));
  }, [selecionados, selectedActivityFilter]);

  const selectedUfOptions = useMemo(
    () => Array.from(new Set(selectedBaseDados.map((item) => item.uf).filter(Boolean))).sort(),
    [selectedBaseDados]
  );
  const selectedUserOptions = useMemo(() => {
    const usersMap = new Map();
    selectedBaseDados.forEach((item) => {
      if (item.createdBy) {
        usersMap.set(String(item.createdBy), {
          id: String(item.createdBy),
          label: item.createdByName || `Usuário ${item.createdBy}`,
        });
      }
      (item.responsaveis || []).forEach((responsavel) => {
        if (!responsavel?.id) return;
        usersMap.set(String(responsavel.id), {
          id: String(responsavel.id),
          label: responsavel.name || responsavel.email || `Usuário ${responsavel.id}`,
        });
      });
    });
    return Array.from(usersMap.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [selectedBaseDados]);
  const selectedResponsavelOptions = useMemo(() => {
    const responsaveisMap = new Map();
    selectedBaseDados.forEach((item) => {
      (item.responsaveis || []).forEach((responsavel) => {
        if (!responsavel?.id) return;
        responsaveisMap.set(String(responsavel.id), {
          id: String(responsavel.id),
          label: responsavel.name || responsavel.email || `Usuário ${responsavel.id}`,
        });
      });
    });
    return Array.from(responsaveisMap.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [selectedBaseDados]);
  const selectedCodes = useMemo(
    () => new Set(selecionados.filter((item) => isSelecionadoAtivo(item)).map((item) => item.codigo)),
    [selecionados]
  );

  const toggleValue = (value, listSetter) => {
    listSetter((prev) => {
      const next = new Set(prev);
      if (next.has(value)) {
        next.delete(value);
      } else {
        next.add(value);
      }
      return Array.from(next);
    });
    setPage(1);
  };

  const limparFiltros = () => {
    setFiltroFonteCap("todas");
    setFiltroUfCap([]);
    setFiltroCidadesCap([]);
    setFiltroModalidadeCap([]);
    setFiltroFinanciaCap([]);
    setScoreMinCap("");
    setRoiMinCap("");
    setSomenteComAvaliacaoCap(false);
    setPresencaCap("presentes");
    setSomenteRevisaoCap(false);
    setCapturadosCitySearch("");
    setCapturadosFiltersExpanded(false);
    setPageSize(20);
    setPage(1);
  };

  const handleIncluir = async (item, { openAnalise = true } = {}) => {
    setMensagem("");
    setIncludeLoadingIds((prev) => {
      const next = new Set(prev);
      next.add(item.codigo);
      return next;
    });
    try {
      await adicionarSelecionado({
        numero_bem: item.codigo,
        status: "candidato",
        valor_maximo: item.valorMinimo ?? item.valor,
        prioridade: "Média",
        observacoes: "",
      });
      setMensagem(`Imóvel ${item.codigo} incluído em selecionados.`);
      const sel = await refreshSelecionados();
      setSelecionados(sel || []);
      const itemSelecionado = (sel || []).find((candidate) => candidate.codigo === item.codigo);
      if (openAnalise && itemSelecionado) {
        openAnaliseModal(itemSelecionado);
      }
      return { ok: true, itemSelecionado };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao incluir";
      setMensagem(message);
      return { ok: false, error: message };
    } finally {
      setIncludeLoadingIds((prev) => {
        const next = new Set(prev);
        next.delete(item.codigo);
        return next;
      });
    }
  };

  const confirmDelete = async (item) => {
    setMensagem("");
    setRemoveLoadingIds((prev) => {
      const next = new Set(prev);
      next.add(item.codigo);
      return next;
    });

    try {
      await excluirSelecionado(item.codigo);
      setSelecionados((prev) => prev.filter((row) => row.codigo !== item.codigo));
      setMensagem(`Imóvel ${item.codigo} removido de selecionados.`);
      setConfirmDeleteItem(null);
    } catch (err) {
      const message = err?.response?.data?.error || (err instanceof Error ? err.message : "Erro ao excluir");
      setMensagem(message);
    } finally {
      setRemoveLoadingIds((prev) => {
        const next = new Set(prev);
        next.delete(item.codigo);
        return next;
      });
    }
  };

  const refreshSelecionados = useCallback(async () => {
    const sel = await fetchSelecionados({ incluirInativos: includeInactiveSelecionados });
    setSelecionados(sel || []);
    return sel || [];
  }, [includeInactiveSelecionados]);

  const openIncluirManualModal = () => {
    setManualSelecionadoDraft(createManualSelecionadoDraft());
  };

  const handleManualSelecionadoFieldChange = (field, value) => {
    setManualSelecionadoDraft((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const handleSalvarSelecionadoManual = async () => {
    if (!manualSelecionadoDraft) return;
    const numeroBem = `${manualSelecionadoDraft.numero_bem || ""}`.trim();
    if (!numeroBem) {
      setMensagem("Informe o código do imóvel para adicionar manualmente.");
      return;
    }

    const valorMaximo = manualSelecionadoDraft.valor_maximo === ""
      ? null
      : Number(manualSelecionadoDraft.valor_maximo);

    if (valorMaximo !== null && (!Number.isFinite(valorMaximo) || valorMaximo < 0)) {
      setMensagem("Informe um valor máximo válido para o imóvel manual.");
      return;
    }

    setMensagem("");
    setManualSelecionadoSaving(true);
    try {
      await adicionarSelecionado({
        numero_bem: numeroBem,
        status: "candidato",
        valor_maximo: valorMaximo,
        prioridade: manualSelecionadoDraft.prioridade,
        observacoes: manualSelecionadoDraft.observacoes.trim(),
      });
      await refreshSelecionados();
      setMensagem(`Imóvel ${numeroBem} incluído manualmente na fila.`);
      setManualSelecionadoDraft(null);
    } catch (err) {
      const message = err?.response?.data?.error || (err instanceof Error ? err.message : "Erro ao incluir imóvel manual");
      setMensagem(message);
    } finally {
      setManualSelecionadoSaving(false);
    }
  };

  const handleReativarSelecionado = async (item) => {
    if (!item?.codigo) return;
    const key = `${item.codigo}:reativar`;
    setMensagem("");
    setUpdateLoadingIds((prev) => new Set(prev).add(key));
    try {
      await adicionarSelecionado({
        numero_bem: item.codigo,
        status: item.status,
        valor_maximo: item.valorMaximo,
        prioridade: item.prioridade,
        observacoes: item.observacoes || "",
      });
      await refreshSelecionados();
      setMensagem(`Imóvel ${item.codigo} reativado na fila.`);
    } catch (err) {
      const message = err?.response?.data?.error || (err instanceof Error ? err.message : "Erro ao reativar imóvel");
      setMensagem(message);
    } finally {
      setUpdateLoadingIds((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const handleAtualizarPrioridade = async (item, prioridadeValue) => {
    const key = `${item.codigo}:prioridade`;
    const option = PRIORIDADE_OPTIONS.find((candidate) => candidate.value === prioridadeValue);
    setMensagem("");
    setUpdateLoadingIds((prev) => new Set(prev).add(key));
    try {
      await adicionarSelecionado({
        numero_bem: item.codigo,
        status: item.status,
        valor_maximo: item.valorMaximo,
        prioridade: prioridadeValue,
        observacoes: item.observacoes || "",
      });
      setMensagem(`Prioridade do imóvel ${item.codigo} atualizada${option ? ` para ${option.label}` : ""}.`);
      await refreshSelecionados();
      setPrioridadeItem(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao atualizar prioridade";
      setMensagem(message);
    } finally {
      setUpdateLoadingIds((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const openPrioridadeModal = (item) => {
    setPrioridadeItem(item);
  };

  const openObservacoesModal = async (item) => {
    setObservacaoItem(item);
    setObservacaoDraft(item.observacoes || "");
    setObservacaoMapLink("");
    setObservacaoAnaliseBase(null);
    try {
      const data = await fetchAnaliseSelecionado(item.codigo);
      setObservacaoAnaliseBase(data?.inputs || null);
      setObservacaoMapLink(data?.inputs?.link_google_maps || "");
    } catch {
      setObservacaoMapLink("");
    }
  };

  const handleSalvarObservacoes = async () => {
    if (!observacaoItem) return;
    const key = `${observacaoItem.codigo}:observacoes`;
    setMensagem("");
    setUpdateLoadingIds((prev) => new Set(prev).add(key));
    try {
      await adicionarSelecionado({
        numero_bem: observacaoItem.codigo,
        status: observacaoItem.status,
        valor_maximo: observacaoItem.valorMaximo,
        prioridade: observacaoItem.prioridade,
        observacoes: observacaoDraft.trim(),
      });
      await salvarAnaliseSelecionado(observacaoItem.codigo, {
        ...(observacaoAnaliseBase || {}),
        link_google_maps: observacaoMapLink.trim(),
      });
      setMensagem(`Observações do imóvel ${observacaoItem.codigo} atualizadas.`);
      await refreshSelecionados();
      setObservacaoItem(null);
      setObservacaoDraft("");
      setObservacaoMapLink("");
      setObservacaoAnaliseBase(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao atualizar observações";
      setMensagem(message);
    } finally {
      setUpdateLoadingIds((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const openAnaliseModal = async (item, origem = "selecionados") => {
    const fallbackInputs = createAnaliseFallbackInputs(item);
    const cacheKey = `${origem}:${item.codigo}`;
    const cachedAnalise = analiseCache[cacheKey];
    setAnaliseItem({ ...item, origem });
    setAnaliseDraft(createAnaliseDraft(cachedAnalise?.inputs || fallbackInputs));
    setAnaliseMeta(cachedAnalise?.meta || { prefill_source: "fallback_local" });
    setAnalisePairModes(createAnalisePairModes(cachedAnalise?.inputs || fallbackInputs));
    setAnaliseLoading(true);
    try {
      const data = await fetchAnaliseSelecionado(item.codigo, origem);
      const inputs = data?.inputs || {};
      setAnaliseCache((prev) => ({ ...prev, [cacheKey]: data }));
      setAnaliseDraft(createAnaliseDraft(inputs));
      setAnalisePairModes(createAnalisePairModes(inputs));
      setAnaliseMeta(data?.meta || null);
    } catch (err) {
      const message = err?.response?.data?.error || (err instanceof Error ? err.message : "Erro ao carregar análise");
      setMensagem(message);
      const fallbackData = cachedAnalise || {
        inputs: fallbackInputs,
        meta: { prefill_source: "fallback_local" },
      };
      setAnaliseDraft(createAnaliseDraft(fallbackData.inputs));
      setAnalisePairModes(createAnalisePairModes(fallbackData.inputs));
      setAnaliseMeta(fallbackData.meta || { prefill_source: "fallback_local" });
    } finally {
      setAnaliseLoading(false);
    }
  };

  const closeAnaliseModal = () => {
    setAnaliseItem(null);
    setAnaliseDraft(null);
    setAnaliseMeta(null);
    setAnalisePairModes({ ...ANALISE_PAIR_MODE_DEFAULTS });
    setAnaliseLoading(false);
    setAnaliseSaving(false);
  };

  const handleAnaliseFieldChange = (field, value) => {
    setAnaliseDraft((prev) => ({
      ...(prev || ANALISE_DEFAULTS),
      [field]: normalizeDraftFieldValue(field, value),
    }));
  };

  const handleAnaliseFieldFocus = (field) => {
    setAnaliseDraft((prev) => ({
      ...(prev || ANALISE_DEFAULTS),
      [field]: formatDraftEditableValue(field, prev?.[field] ?? ""),
    }));
  };

  const handleAnaliseFieldBlur = (field) => {
    setAnaliseDraft((prev) => ({
      ...(prev || ANALISE_DEFAULTS),
      [field]: formatDraftValue(field, prev?.[field] ?? ""),
    }));
  };

  const handleAnalisePairModeChange = (pairName, mode, field, value) => {
    setAnalisePairModes((prev) => ({ ...prev, [pairName]: mode }));
    setAnaliseDraft((prev) => ({
      ...(prev || ANALISE_DEFAULTS),
      [field]: normalizeDraftFieldValue(field, value),
    }));
  };

  const handleSimularOfertaAtual = () => {
    const valor = analiseItem?.lanceRecomendado;
    if (!(valor > 0)) return;
    setAnaliseDraft((prev) => ({
      ...prev,
      valor_base_operacao: formatDraftValue("valor_base_operacao", valor),
      valor_maximo_lance: formatDraftValue("valor_maximo_lance", valor),
    }));
    setAnaliseMeta((prev) => ({ ...prev, simulacao_oferta_atual: true }));
  };

  const handleSalvarAnalise = async () => {
    if (!analiseItem || !analiseDraft) return;
    const hubOnSave = hubSession.get(analiseItem.codigo, analiseItem.origem || "selecionados");
    setAnaliseSaving(true);
    setMensagem("");
    try {
      const payload = buildAnalisePayload(analiseDraft, analisePairModes);
      const origem = analiseItem.origem || "selecionados";
      const cacheKey = `${origem}:${analiseItem.codigo}`;
      const data = await salvarAnaliseSelecionado(analiseItem.codigo, payload, origem);
      const inputs = data?.inputs || payload;
      const contextoAtual = mapContextoOferta(data?.meta?.contexto_oferta || {});
      setAnaliseItem((prev) => ({ ...prev, ...contextoAtual, analiseSalva: true }));
      setAnaliseCache((prev) => ({ ...prev, [cacheKey]: data }));
      setAnaliseDraft(createAnaliseDraft(inputs));
      setAnalisePairModes(createAnalisePairModes(inputs));
      setAnaliseMeta(data?.meta || null);
      if (hubOnSave?.isCurrent()) {
        setAnaliseDetalhada(data);
        setAvaliacaoDetalhadaItem((prev) => ({ ...prev, ...contextoAtual, analiseSalva: true }));
      }
      if (origem === "selecionados") {
        setSelecionados((prev) => prev.map((item) => (
          item.codigo === analiseItem.codigo
            ? {
                ...item,
                ...contextoAtual,
                analiseSalva: true,
                roiEsperadoPercentual: data?.calculos?.roi_esperado_percentual ?? item.roiEsperadoPercentual,
                lucroEsperadoValor: data?.calculos?.lucro_esperado_valor ?? item.lucroEsperadoValor,
              }
            : item
        )));
      } else {
        setCapturados((prev) => prev.map((item) => (
          item.codigo === analiseItem.codigo
            ? {
                ...item,
                ...contextoAtual,
                analiseSalva: true,
              }
            : item
        )));
      }
      await refreshSelecionados();
      setMensagem(`Análise do imóvel ${analiseItem.codigo} salva com sucesso.`);
    } catch (err) {
      const message = err?.response?.data?.error || (err instanceof Error ? err.message : "Erro ao salvar análise");
      setMensagem(message);
    } finally {
      setAnaliseSaving(false);
    }
  };

  const canManageResponsaveis = user?.role === "admin";

  const openAvaliacaoAutomaticaModal = async (item) => {
    setAvaliacaoAutomaticaItem(item);
    setAvaliacaoAutomaticaDetalhe(null);
    setAvaliacaoAutomaticaLoading(true);
    setAvaliacaoScoreRegiaoDraft(String(item?.avaliacaoAutomatica?.score_regiao ?? ""));
    try {
      const data = await fetchAvaliacaoAutomatica(item.codigo);
      setAvaliacaoAutomaticaDetalhe(data);
      setAvaliacaoScoreRegiaoDraft(String(data?.avaliacao?.score_regiao ?? ""));
    } catch (err) {
      const message = err?.response?.data?.error || (err instanceof Error ? err.message : "Erro ao carregar avaliacao automatica");
      setMensagem(message);
      setAvaliacaoAutomaticaItem(null);
      setAvaliacaoAutomaticaDetalhe(null);
    } finally {
      setAvaliacaoAutomaticaLoading(false);
    }
  };

  const closeAvaliacaoAutomaticaModal = () => {
    setAvaliacaoAutomaticaItem(null);
    setAvaliacaoAutomaticaDetalhe(null);
    setAvaliacaoAutomaticaLoading(false);
    setAvaliacaoScoreSaving(false);
    setAvaliacaoScoreRegiaoDraft("");
  };

  const handleSalvarScoreRegiao = async () => {
    if (!avaliacaoAutomaticaItem) return;
    setAvaliacaoScoreSaving(true);
    try {
      const data = await salvarScoreRegiao(avaliacaoAutomaticaItem.codigo, Number(avaliacaoScoreRegiaoDraft || 0));
      setAvaliacaoAutomaticaDetalhe((prev) => ({ ...(prev || {}), avaliacao: data }));
      setCapturados((prev) => prev.map((item) => (
        item.codigo === avaliacaoAutomaticaItem.codigo
          ? { ...item, avaliacaoAutomatica: data }
          : item
      )));
      setSelecionados((prev) => prev.map((item) => (
        item.codigo === avaliacaoAutomaticaItem.codigo
          ? { ...item, avaliacaoAutomatica: data }
          : item
      )));
      setMensagem(`Score de regiao do imovel ${avaliacaoAutomaticaItem.codigo} atualizado.`);
    } catch (err) {
      const message = err?.response?.data?.error || (err instanceof Error ? err.message : "Erro ao salvar score de regiao");
      setMensagem(message);
    } finally {
      setAvaliacaoScoreSaving(false);
    }
  };

  const sincronizarIndicadorAnaliseIaCapturada = useCallback((numeroBem, data) => {
    const possuiHistorico = hasAiUsefulContent(data);
    if (!possuiHistorico) return;
    setCapturados((prev) => prev.map((item) => (
      item.codigo === numeroBem
        ? { ...item, analiseIaSalva: true, avaliado: true, analiseSolicitada: false }
        : item
    )));
  }, []);

  const carregarAiAnalise = useCallback(async (numeroBem, { autoInit = false, origem = "selecionados" } = {}) => {
    const session = hubSession.get(numeroBem, origem);
    if (!session) return;
    setAiLoading(true);
    try {
      const data = await session.wait(fetchAiAnalise(numeroBem, origem, { signal: session.signal }));
      setAiAnalise(data);
      setAiSinteseDraft(data?.analise_texto || "");
      sincronizarIndicadorAnaliseIaCapturada(numeroBem, data);
      if (hasAiUsefulContent(data)) {
        setAvaliacaoDetalhadaStatusState();
      }

      if (autoInit && !hasAiUsefulContent(data) && (user?.ai_access || user?.role === "admin")) {
        const job = await session.wait(enviarMensagemAiChat(numeroBem, "__init__", origem));
        const finalJob = await session.wait(pollAiJob(numeroBem, job.job_id, {
          signal: session.signal,
          origem,
          onProgress: (progressJob) => {
            if (!session.isCurrent()) return;
            setAvaliacaoDetalhadaStatusState(
              buildAiJobStatusState(progressJob, { fallbackPrefix: "IA", retryAction: "analise_inicial" })
            );
          },
        }));
        if (AI_JOB_ERROR_STATUSES.has(finalJob?.status)) {
          throw new Error(finalJob?.erro || "Falha ao gerar avaliação inicial.");
        }
        const refreshed = await session.wait(fetchAiAnalise(numeroBem, origem, { signal: session.signal }));
        setAiAnalise(refreshed);
        setAiSinteseDraft(refreshed?.analise_texto || "");
        sincronizarIndicadorAnaliseIaCapturada(numeroBem, refreshed);
        if (hasAiUsefulContent(refreshed)) {
          setAvaliacaoDetalhadaStatusState();
        }
        await session.wait(refreshSelecionados());
      }
    } finally {
      if (session.isCurrent()) setAiLoading(false);
    }
  }, [hubSession, user, refreshSelecionados, sincronizarIndicadorAnaliseIaCapturada, setAvaliacaoDetalhadaStatusState]);

  const openAvaliacaoDetalhadaModal = async (item, initialTab = "dados", origem = "selecionados", { gerarAnaliseInicial = false } = {}) => {
    if (!mobileAccess) {
      if (avaliacaoDetalhadaItem) desktopDraftsRef.current.set(avaliacaoDetalhadaItem.codigo, { mensagem: aiMensagemDraft, sintese: aiSinteseDraft !== (aiAnalise?.analise_texto || "") ? aiSinteseDraft : undefined, tab: avaliacaoDetalhadaTab });
      setDesktopTabs((current) => current.some((tab) => tab.codigo === item.codigo) ? current : [...current, item]);
    }
    const session = hubSession.begin(item.codigo, origem);
    const aiAttemptKey = `${origem}:${item.codigo}`;
    const enriquecimentoAttemptKey = `${origem}:${item.codigo}`;
    const needsAiData = initialTab === "ia" || initialTab === "matricula";
    const needsEnriquecimentoData = initialTab === "enriquecimento";
    aiAutoInitAttemptRef.current.clear();
    enriquecimentoFetchAttemptRef.current.clear();
    aiDeferredActionRef.current = gerarAnaliseInicial ? { numeroBem: item.codigo, origem, tipo: "analise_inicial" } : null;
    if (gerarAnaliseInicial) aiAutoInitAttemptRef.current.add(aiAttemptKey);
    if (needsEnriquecimentoData) enriquecimentoFetchAttemptRef.current.add(enriquecimentoAttemptKey);
    setAvaliacaoDetalhadaItem(item);
    setAvaliacaoDetalhadaOrigem(origem);
    setAvaliacaoDetalhadaTab(initialTab);
    const savedDraft = !mobileAccess ? desktopDraftsRef.current.get(item.codigo) : null;
    setAiMensagemDraft(savedDraft?.mensagem || "");
    setAiSinteseDraft(savedDraft?.sintese || "");
    setAvaliacaoDetalhadaStatusState();
    setAiAnalise(null);
    setAiLoading(needsAiData);
    setAiSending(false);
    setAiSaving(false);
    setMatriculaLoading(false);
    setEnriquecimentoLoading(false);
    setEnriquecimentoDetalhado(null);
    setEnriquecimentoDetalhadoLoading(needsEnriquecimentoData);
    setAnaliseDetalhada(null);
    setAnaliseDetalhadaLoading(true);
    try {
      const analisePromise = session.wait(fetchAnaliseSelecionado(item.codigo, origem, { signal: session.signal })).catch(() => null);
      const aiPromise = needsAiData
        ? carregarAiAnalise(item.codigo, { autoInit: false, origem })
        : Promise.resolve(null);
      const enriquecimentoPromise = needsEnriquecimentoData
        ? session.wait(fetchEnriquecimento(item.codigo, origem, { signal: session.signal })).catch(() => null)
        : Promise.resolve(null);
      const [analiseData, , enriquecimentoData] = await session.wait(Promise.all([
        analisePromise,
        aiPromise,
        enriquecimentoPromise,
      ]));
      setAnaliseDetalhada(analiseData);
      if (savedDraft?.sintese !== undefined) setAiSinteseDraft(savedDraft.sintese);
      if (needsEnriquecimentoData) {
        setEnriquecimentoDetalhado(enriquecimentoData || null);
      }
    } catch (err) {
      if (!session.isCurrent()) return;
      const message = err?.response?.data?.error || (err instanceof Error ? err.message : "Erro ao carregar avaliação detalhada");
      setMensagem(message);
      setAvaliacaoDetalhadaStatusState(buildAiErrorStatusState(message, { fallbackPrefix: "IA" }));
    } finally {
      if (session.isCurrent()) setAnaliseDetalhadaLoading(false);
      if (session.isCurrent()) setEnriquecimentoDetalhadoLoading(false);
    }
  };

  const closeAvaliacaoDetalhadaModal = () => {
    hubSession.cancel();
    if (avaliacaoDetalhadaItem?.codigo) {
      enriquecimentoFetchAttemptRef.current.delete(`${avaliacaoDetalhadaOrigem}:${avaliacaoDetalhadaItem.codigo}`);
    }
    setAvaliacaoDetalhadaItem(null);
    setAvaliacaoDetalhadaOrigem("selecionados");
    setAvaliacaoDetalhadaTab("dados");
    setAiAnalise(null);
    setAnaliseDetalhada(null);
    setEnriquecimentoDetalhado(null);
    setAnaliseDetalhadaLoading(false);
    setEnriquecimentoDetalhadoLoading(false);
    setAiLoading(false);
    setAiSending(false);
    setAiSaving(false);
    setMatriculaLoading(false);
    setEnriquecimentoLoading(false);
    setAiMensagemDraft("");
    setAiSinteseDraft("");
    setAvaliacaoDetalhadaStatusState();
    aiDeferredActionRef.current = null;
  };

  const handleSelecionarNoHub = async () => {
    if (!avaliacaoDetalhadaItem) return;
    const session = hubSession.get(avaliacaoDetalhadaItem.codigo, avaliacaoDetalhadaOrigem);
    if (!session) return;
    const result = await session.wait(handleIncluir(avaliacaoDetalhadaItem, { openAnalise: false })).catch(() => null);
    if (!session.isCurrent()) return;
    if (result?.ok) {
      setAvaliacaoDetalhadaStatusState({
        message: `Imóvel ${avaliacaoDetalhadaItem.codigo} incluído na fila de prospecção.`,
        tone: "success",
      });
    } else if (result?.error) {
      setAvaliacaoDetalhadaStatusState({
        message: result.error,
        tone: "error",
      });
    }
  };

  const handleEnviarMensagemAi = async () => {
    if (!avaliacaoDetalhadaItem || !aiMensagemDraft.trim()) return;
    const session = hubSession.get(avaliacaoDetalhadaItem.codigo, avaliacaoDetalhadaOrigem);
    if (!session) return;
    setAiSending(true);
    setAvaliacaoDetalhadaStatusState({ message: "IA: enviando pergunta...", tone: "info" });
    try {
      const job = await session.wait(enviarMensagemAiChat(avaliacaoDetalhadaItem.codigo, aiMensagemDraft.trim(), avaliacaoDetalhadaOrigem));
      setAiMensagemDraft("");
      const finalJob = await session.wait(pollAiJob(avaliacaoDetalhadaItem.codigo, job.job_id, {
        signal: session.signal,
        origem: avaliacaoDetalhadaOrigem,
        onProgress: (progressJob) => {
          if (!session.isCurrent()) return;
          setAvaliacaoDetalhadaStatusState(buildAiJobStatusState(progressJob, { fallbackPrefix: "IA" }));
        },
      }));
      if (AI_JOB_ERROR_STATUSES.has(finalJob?.status)) {
        throw new Error(finalJob?.erro || "Erro ao processar mensagem da IA.");
      }
      const refreshed = await session.wait(fetchAiAnalise(avaliacaoDetalhadaItem.codigo, avaliacaoDetalhadaOrigem, { signal: session.signal }));
      setAiAnalise(refreshed);
      setAiSinteseDraft(refreshed?.analise_texto || "");
      sincronizarIndicadorAnaliseIaCapturada(avaliacaoDetalhadaItem.codigo, refreshed);
      await session.wait(refreshSelecionados());
      setAvaliacaoDetalhadaStatusState({ message: "IA: resultado disponível.", tone: "success" });
    } catch (err) {
      if (!session.isCurrent()) return;
      const message = err?.response?.data?.error || (err instanceof Error ? err.message : "Erro ao enviar mensagem para IA");
      setMensagem(message);
      setAvaliacaoDetalhadaStatusState(buildAiErrorStatusState(message, { fallbackPrefix: "IA" }));
    } finally {
      if (session.isCurrent()) setAiSending(false);
    }
  };

  const handleGerarAnaliseInicialAi = useCallback(async () => {
    if (!avaliacaoDetalhadaItem) return;
    const session = hubSession.get(avaliacaoDetalhadaItem.codigo, avaliacaoDetalhadaOrigem);
    if (!session) return;
    setAiSending(true);
    setAvaliacaoDetalhadaStatusState({ message: "IA: aguardando processamento...", tone: "info" });
    try {
      const job = await session.wait(enviarMensagemAiChat(avaliacaoDetalhadaItem.codigo, "__init__", avaliacaoDetalhadaOrigem));
      const finalJob = await session.wait(pollAiJob(avaliacaoDetalhadaItem.codigo, job.job_id, {
        signal: session.signal,
        origem: avaliacaoDetalhadaOrigem,
        onProgress: (progressJob) => {
          if (!session.isCurrent()) return;
          setAvaliacaoDetalhadaStatusState(
            buildAiJobStatusState(progressJob, { fallbackPrefix: "IA", retryAction: "analise_inicial" })
          );
        },
      }));
      if (AI_JOB_ERROR_STATUSES.has(finalJob?.status)) {
        throw new Error(finalJob?.erro || "Erro ao gerar análise inicial da IA.");
      }
      const refreshed = await session.wait(fetchAiAnalise(avaliacaoDetalhadaItem.codigo, avaliacaoDetalhadaOrigem, { signal: session.signal }));
      setAiAnalise(refreshed);
      setAiSinteseDraft(refreshed?.analise_texto || "");
      sincronizarIndicadorAnaliseIaCapturada(avaliacaoDetalhadaItem.codigo, refreshed);
      await session.wait(refreshSelecionados());
      setAvaliacaoDetalhadaStatusState({ message: "IA: resultado disponível.", tone: "success" });
    } catch (err) {
      if (!session.isCurrent()) return;
      const message = err?.response?.data?.error || (err instanceof Error ? err.message : "Erro ao gerar análise inicial da IA");
      setMensagem(message);
      setAvaliacaoDetalhadaStatusState(
        buildAiErrorStatusState(message, { fallbackPrefix: "IA", retryAction: "analise_inicial" })
      );
    } finally {
      if (session.isCurrent()) setAiSending(false);
    }
  }, [
    hubSession,
    avaliacaoDetalhadaItem,
    avaliacaoDetalhadaOrigem,
    refreshSelecionados,
    setAvaliacaoDetalhadaStatusState,
    sincronizarIndicadorAnaliseIaCapturada,
  ]);

  const handleSalvarAiSintese = async () => {
    if (!avaliacaoDetalhadaItem) return;
    const session = hubSession.get(avaliacaoDetalhadaItem.codigo, avaliacaoDetalhadaOrigem);
    if (!session) return;
    setAiSaving(true);
    setAvaliacaoDetalhadaStatusState({ message: "IA: salvando síntese...", tone: "info" });
    try {
      const data = await session.wait(salvarAiAnalise(avaliacaoDetalhadaItem.codigo, {
        analise_texto: aiSinteseDraft.trim(),
      }, avaliacaoDetalhadaOrigem));
      setAiAnalise(data);
      sincronizarIndicadorAnaliseIaCapturada(avaliacaoDetalhadaItem.codigo, data);
      setMensagem(`Síntese da avaliação IA do imóvel ${avaliacaoDetalhadaItem.codigo} salva.`);
      await session.wait(refreshSelecionados());
      setAvaliacaoDetalhadaStatusState({ message: "Síntese salva com sucesso.", tone: "success" });
    } catch (err) {
      if (!session.isCurrent()) return;
      const message = err?.response?.data?.error || (err instanceof Error ? err.message : "Erro ao salvar síntese da IA");
      setMensagem(message);
      setAvaliacaoDetalhadaStatusState(buildAiErrorStatusState(message, { fallbackPrefix: "IA" }));
    } finally {
      if (session.isCurrent()) setAiSaving(false);
    }
  };

  const handleSolicitarMatricula = async () => {
    if (!avaliacaoDetalhadaItem) return;
    const session = hubSession.get(avaliacaoDetalhadaItem.codigo, avaliacaoDetalhadaOrigem);
    if (!session) return;
    setMatriculaLoading(true);
    setAvaliacaoDetalhadaStatusState({ message: "Matrícula: aguardando processamento...", tone: "info" });
    try {
      const job = await session.wait(solicitarMatricula(avaliacaoDetalhadaItem.codigo, avaliacaoDetalhadaOrigem));
      const finalJob = await session.wait(pollAiJob(avaliacaoDetalhadaItem.codigo, job.job_id, {
        signal: session.signal,
        timeoutMs: 180000,
        origem: avaliacaoDetalhadaOrigem,
        onProgress: (progressJob) => {
          if (!session.isCurrent()) return;
          setAvaliacaoDetalhadaStatusState(
            buildAiJobStatusState(progressJob, { fallbackPrefix: "Matrícula", retryAction: "matricula" })
          );
        },
      }));
      if (AI_JOB_ERROR_STATUSES.has(finalJob?.status)) {
        throw new Error(finalJob?.erro || "Erro ao processar matrícula.");
      }
      const refreshed = await session.wait(fetchAiAnalise(avaliacaoDetalhadaItem.codigo, avaliacaoDetalhadaOrigem, { signal: session.signal }));
      setAiAnalise(refreshed);
      setAiSinteseDraft(refreshed?.analise_texto || "");
      sincronizarIndicadorAnaliseIaCapturada(avaliacaoDetalhadaItem.codigo, refreshed);
      await session.wait(refreshSelecionados());
      setAvaliacaoDetalhadaStatusState({ message: "Matrícula: resultado disponível.", tone: "success" });
    } catch (err) {
      if (!session.isCurrent()) return;
      const message = err?.response?.data?.error || (err instanceof Error ? err.message : "Erro ao solicitar matrícula");
      setMensagem(message);
      setAvaliacaoDetalhadaStatusState(
        buildAiErrorStatusState(message, { fallbackPrefix: "Matrícula", retryAction: "matricula" })
      );
    } finally {
      if (session.isCurrent()) setMatriculaLoading(false);
    }
  };

  const handleSolicitarEnriquecimento = async () => {
    if (!avaliacaoDetalhadaItem) return;
    const session = hubSession.get(avaliacaoDetalhadaItem.codigo, avaliacaoDetalhadaOrigem);
    if (!session) return;
    enriquecimentoFetchAttemptRef.current.delete(`${avaliacaoDetalhadaOrigem}:${avaliacaoDetalhadaItem.codigo}`);
    setEnriquecimentoLoading(true);
    setAvaliacaoDetalhadaStatusState({ message: "Enriquecimento: aguardando processamento...", tone: "info" });
    try {
      const job = await session.wait(solicitarEnriquecimento(avaliacaoDetalhadaItem.codigo, avaliacaoDetalhadaOrigem));
      const finalJob = await session.wait(pollAiJob(avaliacaoDetalhadaItem.codigo, job.job_id, {
        signal: session.signal,
        timeoutMs: 180000,
        origem: avaliacaoDetalhadaOrigem,
        onProgress: (progressJob) => {
          if (!session.isCurrent()) return;
          setAvaliacaoDetalhadaStatusState(
            buildAiJobStatusState(progressJob, { fallbackPrefix: "Enriquecimento", retryAction: "enriquecimento" })
          );
        },
      }));
      if (AI_JOB_ERROR_STATUSES.has(finalJob?.status)) {
        throw new Error(finalJob?.erro || "Erro ao processar enriquecimento.");
      }
      const enriquecimentoAtualizado = await session.wait(fetchEnriquecimento(avaliacaoDetalhadaItem.codigo, avaliacaoDetalhadaOrigem, { signal: session.signal }));
      const detalheAvaliacao = await session.wait(fetchAvaliacaoAutomatica(avaliacaoDetalhadaItem.codigo, { signal: session.signal })).catch(() => null);
      const avaliacaoAtualizada = detalheAvaliacao?.avaliacao || enriquecimentoAtualizado?.avaliacao || null;
      const analiseAtualizada = await session.wait(fetchAnaliseSelecionado(avaliacaoDetalhadaItem.codigo, avaliacaoDetalhadaOrigem, { signal: session.signal })).catch(() => null);
      if (!session.isCurrent()) return;
      const contextoAtual = analiseAtualizada?.meta?.contexto_oferta ? mapContextoOferta(analiseAtualizada.meta.contexto_oferta) : {};
      if (analiseAtualizada) setAnaliseDetalhada(analiseAtualizada);
      setAvaliacaoDetalhadaItem((prev) => (
        prev ? { ...prev, ...contextoAtual, avaliacaoAutomatica: avaliacaoAtualizada || prev.avaliacaoAutomatica || enriquecimentoAtualizado?.avaliacao || null } : prev
      ));
      setEnriquecimentoDetalhado(enriquecimentoAtualizado);
      setCapturados((prev) => prev.map((item) => (
        item.codigo === avaliacaoDetalhadaItem.codigo
          ? { ...item, ...contextoAtual, avaliacaoAutomatica: avaliacaoAtualizada || enriquecimentoAtualizado?.avaliacao || item.avaliacaoAutomatica }
          : item
      )));
      setSelecionados((prev) => prev.map((item) => (
        item.codigo === avaliacaoDetalhadaItem.codigo
          ? { ...item, ...contextoAtual, avaliacaoAutomatica: avaliacaoAtualizada || enriquecimentoAtualizado?.avaliacao || item.avaliacaoAutomatica }
          : item
      )));
      setAvaliacaoDetalhadaStatusState({ message: "Enriquecimento: resultado disponível.", tone: "success" });
    } catch (err) {
      if (!session.isCurrent()) return;
      const message = err?.response?.data?.error || (err instanceof Error ? err.message : "Erro ao solicitar enriquecimento");
      setMensagem(message);
      setAvaliacaoDetalhadaStatusState(
        buildAiErrorStatusState(message, { fallbackPrefix: "Enriquecimento", retryAction: "enriquecimento" })
      );
    } finally {
      if (session.isCurrent()) setEnriquecimentoLoading(false);
    }
  };

  const handleStatusAction = () => {
    if (avaliacaoDetalhadaStatusActionKind === "analise_inicial") {
      handleGerarAnaliseInicialAi();
      return;
    }
    if (avaliacaoDetalhadaStatusActionKind === "matricula") {
      handleSolicitarMatricula();
      return;
    }
    if (avaliacaoDetalhadaStatusActionKind === "enriquecimento") {
      handleSolicitarEnriquecimento();
    }
  };

  const handleAvaliacaoDetalhadaTabChange = useCallback((nextTab) => {
    setAvaliacaoDetalhadaTab(nextTab);
    setAvaliacaoDetalhadaStatusState();
  }, [setAvaliacaoDetalhadaStatusState]);

  const avaliacaoDetalhadaStatusAction = (() => {
    if (!avaliacaoDetalhadaStatusActionKind) return null;
    return {
      label: "Tentar novamente",
      onClick: handleStatusAction,
      disabled: aiLoading || aiSending || matriculaLoading || enriquecimentoLoading,
    };
  })();

  useEffect(() => {
    if (!avaliacaoDetalhadaItem || avaliacaoDetalhadaTab !== "ia") return;
    const session = hubSession.get(avaliacaoDetalhadaItem.codigo, avaliacaoDetalhadaOrigem);
    if (!session) return;
    if (aiLoading || aiSending) return;
    if (aiAnalise?.historico_chat?.length || aiAnalise?.matricula_texto) return;
    if (!(user?.ai_access || user?.role === "admin")) return;
    const aiAttemptKey = `${avaliacaoDetalhadaOrigem}:${avaliacaoDetalhadaItem.codigo}`;
    if (aiAutoInitAttemptRef.current.has(aiAttemptKey)) return;
    aiAutoInitAttemptRef.current.add(aiAttemptKey);

    carregarAiAnalise(avaliacaoDetalhadaItem.codigo, { autoInit: mobileAccess, origem: avaliacaoDetalhadaOrigem }).catch((err) => {
      if (!session.isCurrent()) return;
      const message = err?.response?.data?.error || (err instanceof Error ? err.message : "Erro ao iniciar avaliação IA");
      setMensagem(message);
      setAvaliacaoDetalhadaStatusState(
        buildAiErrorStatusState(message, { fallbackPrefix: "IA", retryAction: "analise_inicial" })
      );
    });
  }, [hubSession, avaliacaoDetalhadaItem, avaliacaoDetalhadaTab, avaliacaoDetalhadaOrigem, aiAnalise, aiLoading, aiSending, user, carregarAiAnalise, setAvaliacaoDetalhadaStatusState, mobileAccess]);

  useEffect(() => {
    if (!avaliacaoDetalhadaItem || avaliacaoDetalhadaTab !== "enriquecimento") return;
    const session = hubSession.get(avaliacaoDetalhadaItem.codigo, avaliacaoDetalhadaOrigem);
    if (!session) return;
    if (enriquecimentoLoading || enriquecimentoDetalhadoLoading || enriquecimentoDetalhado) return;
    const attemptKey = `${avaliacaoDetalhadaOrigem}:${avaliacaoDetalhadaItem.codigo}`;
    if (enriquecimentoFetchAttemptRef.current.has(attemptKey)) return;
    enriquecimentoFetchAttemptRef.current.add(attemptKey);
    setEnriquecimentoDetalhadoLoading(true);
    setAvaliacaoDetalhadaStatusState();
    session.wait(fetchEnriquecimento(avaliacaoDetalhadaItem.codigo, avaliacaoDetalhadaOrigem, { signal: session.signal }))
      .then((data) => {
        setEnriquecimentoDetalhado(data || null);
        setAvaliacaoDetalhadaStatusState();
      })
      .catch((err) => {
        if (!session.isCurrent()) return;
        const message = err?.response?.data?.error || (err instanceof Error ? err.message : "Erro ao carregar enriquecimento");
        setMensagem(message);
        setEnriquecimentoDetalhado(null);
      })
      .finally(() => { if (session.isCurrent()) setEnriquecimentoDetalhadoLoading(false); });
  }, [
    hubSession,
    avaliacaoDetalhadaItem,
    avaliacaoDetalhadaTab,
    avaliacaoDetalhadaOrigem,
    enriquecimentoDetalhado,
    enriquecimentoLoading,
    enriquecimentoDetalhadoLoading,
    setAvaliacaoDetalhadaStatusState,
  ]);

  useEffect(() => {
    if (!avaliacaoDetalhadaItem || avaliacaoDetalhadaTab !== "matricula") return;
    const session = hubSession.get(avaliacaoDetalhadaItem.codigo, avaliacaoDetalhadaOrigem);
    if (!session) return;
    if (aiLoading || aiSending || matriculaLoading) return;
    if (aiAnalise) return;
    carregarAiAnalise(avaliacaoDetalhadaItem.codigo, { autoInit: false, origem: avaliacaoDetalhadaOrigem }).catch((err) => {
      if (!session.isCurrent()) return;
      const message = err?.response?.data?.error || (err instanceof Error ? err.message : "Erro ao carregar matrícula");
      setMensagem(message);
      setAvaliacaoDetalhadaStatusState(
        buildAiErrorStatusState(message, { fallbackPrefix: "Matrícula", retryAction: "matricula" })
      );
    });
  }, [
    hubSession,
    avaliacaoDetalhadaItem,
    avaliacaoDetalhadaTab,
    avaliacaoDetalhadaOrigem,
    aiAnalise,
    aiLoading,
    aiSending,
    matriculaLoading,
    carregarAiAnalise,
    setAvaliacaoDetalhadaStatusState,
  ]);

  useEffect(() => {
    const pendingAction = aiDeferredActionRef.current;
    if (!pendingAction || pendingAction.tipo !== "analise_inicial") return;
    if (!avaliacaoDetalhadaItem || avaliacaoDetalhadaTab !== "ia") return;
    if (pendingAction.numeroBem !== avaliacaoDetalhadaItem.codigo || pendingAction.origem !== avaliacaoDetalhadaOrigem) return;
    if (aiLoading || aiSending || matriculaLoading || enriquecimentoLoading) return;
    aiDeferredActionRef.current = null;
    handleGerarAnaliseInicialAi();
  }, [avaliacaoDetalhadaItem, avaliacaoDetalhadaOrigem, avaliacaoDetalhadaTab, aiLoading, aiSending, matriculaLoading, enriquecimentoLoading, handleGerarAnaliseInicialAi]);

  const openResponsaveisModal = (item) => {
    setResponsaveisItem(item);
    setResponsaveisDraftIds((item.responsaveis || []).map((responsavel) => responsavel.id));
  };

  const toggleResponsavelDraft = (userId) => {
    setResponsaveisDraftIds((prev) => (
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    ));
  };

  const handleSalvarResponsaveis = async () => {
    if (!responsaveisItem) return;
    setResponsaveisSaving(true);
    setMensagem("");
    try {
      await salvarResponsaveisSelecionado(responsaveisItem.codigo, responsaveisDraftIds);
      setMensagem(`Responsáveis do imóvel ${responsaveisItem.codigo} atualizados.`);
      await refreshSelecionados();
      setResponsaveisItem(null);
      setResponsaveisDraftIds([]);
    } catch (err) {
      const message = err?.response?.data?.error || (err instanceof Error ? err.message : "Erro ao salvar responsáveis");
      setMensagem(message);
    } finally {
      setResponsaveisSaving(false);
    }
  };

  const selecionadosFiltradosOrdenados = useMemo(() => {
    const parseDate = (value) => {
      if (!value) return null;
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? null : date.getTime();
    };

    const normalizedSearch = deferredSelectedSearch.trim().toLowerCase();
    const filtered = selectedBaseDados.filter((item) => {
      if (selectedUfFilter !== "todos" && item.uf !== selectedUfFilter) return false;
      if (selectedPrioridadeFilter !== "todas" && String(item.prioridade || 2) !== selectedPrioridadeFilter) return false;
      if (selectedResponsavelFilter === "com" && !(item.responsaveis?.length)) return false;
      if (selectedResponsavelFilter === "sem" && item.responsaveis?.length) return false;
      if (
        user?.role === "admin" &&
        selectedUserFilter !== "todos" &&
        String(item.createdBy) !== selectedUserFilter &&
        !item.responsaveis?.some((responsavel) => String(responsavel.id) === selectedUserFilter)
      ) {
        return false;
      }
      if (
        selectedResponsavelFilter === "meus" &&
        !item.responsaveis?.some((responsavel) => String(responsavel.id) === String(user?.id))
      ) {
        return false;
      }
      if (!normalizedSearch) return true;
      const haystack = [
        item.codigo,
        item.cidade,
        item.uf,
        item.createdByName,
        item.descricao,
        item.observacoes,
        ...(item.responsaveis || []).map((responsavel) => responsavel.name || responsavel.email),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalizedSearch);
    });

    const direction = selectedSortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (selectedSortBy === "dataLeilao") {
        const dateA = parseDate(a.dataLeilao);
        const dateB = parseDate(b.dataLeilao);
        if (dateA === null && dateB === null) return `${a.codigo}`.localeCompare(`${b.codigo}`) * direction;
        if (dateA === null) return 1;
        if (dateB === null) return -1;
        return (dateA - dateB) * direction;
      }
      if (selectedSortBy === "prioridade") {
        return ((Number(a.prioridade || 2) - Number(b.prioridade || 2)) || `${a.codigo}`.localeCompare(`${b.codigo}`)) * direction;
      }
      if (selectedSortBy === "cidade") {
        return `${a.cidade || ""}`.localeCompare(`${b.cidade || ""}`) * direction;
      }
      if (selectedSortBy === "valorMaximo") {
        return ((Number(a.valorMaximo || 0) - Number(b.valorMaximo || 0)) || `${a.codigo}`.localeCompare(`${b.codigo}`)) * direction;
      }
      if (selectedSortBy === "roi") {
        return ((Number(a.roiEsperadoPercentual || 0) - Number(b.roiEsperadoPercentual || 0)) || `${a.codigo}`.localeCompare(`${b.codigo}`)) * direction;
      }
      return `${a.codigo}`.localeCompare(`${b.codigo}`) * direction;
    });
  }, [
    selectedBaseDados,
    deferredSelectedSearch,
    selectedUfFilter,
    selectedPrioridadeFilter,
    selectedResponsavelFilter,
    selectedUserFilter,
    selectedSortBy,
    selectedSortDir,
    user?.role,
    user?.id,
  ]);

  const selectedMetrics = useMemo(() => {
    const ativos = selecionados.filter((item) => isSelecionadoAtivo(item));
    const inativos = selecionados.filter((item) => !isSelecionadoAtivo(item));
    const universo = selectedBaseDados;
    const comAnalise = universo.filter((item) => item.analiseSalva).length;
    const semResponsavel = universo.filter((item) => !(item.responsaveis?.length)).length;
    const altaPrioridade = universo.filter((item) => Number(item.prioridade || 2) === 3).length;
    return {
      ativos: ativos.length,
      inativos: inativos.length,
      comAnalise,
      semResponsavel,
      altaPrioridade,
    };
  }, [selecionados, selectedBaseDados]);

  const selectedSortLabel = useMemo(() => {
    const labels = {
      dataLeilao: "data do leilão",
      prioridade: "prioridade",
      cidade: "cidade",
      valorMaximo: "valor máximo",
      roi: "ROI",
    };
    return `Ordenado por ${labels[selectedSortBy] || "data do leilão"} em ${selectedSortDir === "asc" ? "ordem crescente" : "ordem decrescente"}.`;
  }, [selectedSortBy, selectedSortDir]);

  const handlePageChange = (nextPage) => {
    const totalPages = Math.max(1, Math.ceil((capturadosTotal || 0) / pageSize));
    const normalized = Math.min(Math.max(nextPage, 1), totalPages);
    setPage(normalized);
  };

  const handleSortChange = (key, dir) => {
    setSortBy(key);
    setSortDir(dir);
    setPage(1);
  };

  const selectedPrimaryStatLabel = useMemo(() => {
    if (selectedActivityFilter === "inativos") return "Inativos";
    if (selectedActivityFilter === "todos") return "Selecionados";
    return "Na fila";
  }, [selectedActivityFilter]);


  const selectedVisibleActiveFilters = useMemo(() => ([
    selectedSearch.trim() !== "" ? `Busca: ${selectedSearch.trim()}` : null,
    selectedUfFilter !== "todos" ? `UF: ${selectedUfFilter}` : null,
    selectedPrioridadeFilter !== "todas"
      ? `Prioridade: ${PRIORIDADE_OPTIONS.find((option) => String(option.value) === selectedPrioridadeFilter)?.label || selectedPrioridadeFilter}`
      : null,
    selectedActivityFilter !== "ativos" ? `Status: ${selectedActivityFilter}` : null,
    selectedResponsavelFilter === "com" ? "Com responsáveis" : null,
    selectedResponsavelFilter === "sem" ? "Sem responsáveis" : null,
    selectedResponsavelFilter === "meus" ? "Atribuídos a mim" : null,
    selectedUserFilter !== "todos"
      ? `Autor: ${selectedUserOptions.find((option) => option.id === selectedUserFilter)?.label || selectedUserFilter}`
      : null,
    selectedSortBy !== "dataLeilao" ? selectedSortLabel : null,
    selectedSortDir !== "asc" && selectedSortBy === "dataLeilao" ? selectedSortLabel : null,
  ].filter(Boolean)), [
    selectedSearch,
    selectedUfFilter,
    selectedPrioridadeFilter,
    selectedActivityFilter,
    selectedResponsavelFilter,
    selectedUserFilter,
    selectedUserOptions,
    selectedSortBy,
    selectedSortDir,
    selectedSortLabel,
  ]);

  useEffect(() => {
    if (!setTopbarContent) return undefined;
    if (mobileAccess) {
      setTopbarContent(null);
      return () => setTopbarContent(null);
    }
    setTopbarContent(null);
    return () => setTopbarContent(null);
  }, [mobileAccess, selectedBaseDados.length, selectedMetrics.altaPrioridade, selectedMetrics.semResponsavel, selectedPrimaryStatLabel, setTopbarContent]);

  return (
    <div className={`prospects-page ${mobileAccess ? "" : "prospects-page--desktop"}`}>
      {mensagem ? (
        <div
          className={`prospects-message is-${mensagemTone}`.trim()}
          role="alert"
          aria-live="polite"
        >
          {mensagem}
        </div>
      ) : null}

      {mobileAccess ? (
        <>
          {mobileSection === "hub" ? (
            <section className="prospects-mobile-hub">
              <div className="prospects-card prospects-mobile-hub__intro">
                <div className="prospects-mobile-hub__intro-copy">
                  <p className="prospects-eyebrow">Mobile</p>
                  <h2 className="prospects-title">Central de operação</h2>
                  <p className="prospects-subtitle">
                    Acesse rapidamente a gestão financeira, a seleção de oportunidades e a fila de prospecção no celular.
                  </p>
                </div>
                <div className="prospects-mobile-hub__intro-stats">
                  <div className="prospects-mobile-hub__stat">
                    <span>Capturados</span>
                    <strong>{capturadosTotal}</strong>
                  </div>
                  <div className="prospects-mobile-hub__stat">
                    <span>Na fila</span>
                    <strong>{selectedMetrics.ativos}</strong>
                  </div>
                  <div className="prospects-mobile-hub__stat">
                    <span>Alta prioridade</span>
                    <strong>{selectedMetrics.altaPrioridade}</strong>
                  </div>
                </div>
              </div>

              <div className="prospects-mobile-hub__grid">
                <MobileHubCard
                  eyebrow="Financeiro"
                  title="Financeiro"
                  description={descricaoFinanceiroMobile}
                  count={financeiroCount ?? 0}
                  icon={<FinanceIcon />}
                  to={canAccessFinance ? financeiroDestino : undefined}
                  disabled={!canAccessFinance}
                />
                <MobileHubCard
                  eyebrow="Prospecção"
                  title="Base capturada"
                  description="Consulte a base capturada e inclua rapidamente novos imóveis na fila de prospecção."
                  count={capturadosTotal}
                  icon={<ProspectIcon />}
                  onClick={() => setMobileSection("capturados")}
                />
                <MobileHubCard
                  eyebrow="Prospecção"
                  title="Fila de prospecção"
                  description="Abra a fila operacional para registrar notas e ajustar a viabilidade dos imóveis."
                  count={selectedMetrics.ativos}
                  icon={<QueueIcon />}
                  onClick={() => setMobileSection("selecionados")}
                />
              </div>
            </section>
          ) : mobileSection === "selecionados" ? (
            <MobileSelecionadosList
              formatarMoeda={formatarMoeda}
              formatarDataHoraCompacta={formatarDataHoraCompacta}
              dados={selecionadosFiltradosOrdenados}
              loading={loadingSel}
              erro={erroSel}
              onBack={() => setMobileSection("hub")}
              onIncluirManual={openIncluirManualModal}
              onOpenObservacoes={openObservacoesModal}
              onOpenPrioridade={openPrioridadeModal}
              onOpenResponsaveis={openResponsaveisModal}
              onOpenAnalise={openAnaliseModal}
              onOpenAvaliacaoDetalhada={openAvaliacaoDetalhadaModal}
              onDelete={setConfirmDeleteItem}
              onReativar={handleReativarSelecionado}
              updateLoadingIds={updateLoadingIds}
              removeLoadingIds={removeLoadingIds}
              selectedSearch={selectedSearch}
              onSelectedSearchChange={setSelectedSearch}
              selectedUfFilter={selectedUfFilter}
              onSelectedUfFilterChange={setSelectedUfFilter}
              selectedUfOptions={selectedUfOptions}
              selectedPrioridadeFilter={selectedPrioridadeFilter}
              onSelectedPrioridadeFilterChange={setSelectedPrioridadeFilter}
              selectedResponsavelFilter={selectedResponsavelFilter}
              onSelectedResponsavelFilterChange={setSelectedResponsavelFilter}
              responsavelOptions={selectedResponsavelOptions}
              selectedActivityFilter={selectedActivityFilter}
              onSelectedActivityFilterChange={setSelectedActivityFilter}
              selectedUserFilter={selectedUserFilter}
              onSelectedUserFilterChange={setSelectedUserFilter}
              selectedUserOptions={selectedUserOptions}
              selectedSortBy={selectedSortBy}
              onSelectedSortByChange={setSelectedSortBy}
              selectedSortDir={selectedSortDir}
              onSelectedSortDirChange={setSelectedSortDir}
              onResetSelectedFilters={() => {
                setSelectedSearch("");
                setSelectedUfFilter("todos");
                setSelectedPrioridadeFilter("todas");
                setSelectedActivityFilter("ativos");
                setSelectedResponsavelFilter("todos");
                setSelectedUserFilter("todos");
                setSelectedSortBy("dataLeilao");
                setSelectedSortDir("asc");
              }}
              onToggleFiltersExpanded={() => setSelectedFiltersExpanded((prev) => !prev)}
              selectedFiltersExpanded={selectedFiltersExpanded}
              selectedVisibleActiveFilters={selectedVisibleActiveFilters}
              canFilterByUser={user?.role === "admin"}
              canManageResponsaveis={canManageResponsaveis}
            />
          ) : (
            <MobileCapturadosList
              presenca={presencaCap}
              onPresencaChange={(value) => { setPresencaCap(value); setPage(1); }}
              somenteRevisao={somenteRevisaoCap}
              onRevisaoChange={(value) => { setSomenteRevisaoCap(value); setPage(1); }}
              referencias={capturasReferenciaVisiveis}
              dados={capturados}
              total={capturadosTotal}
              page={page}
              pageSize={pageSize}
              loading={loadingCap}
              erro={erroCap}
              onBack={() => setMobileSection("hub")}
              onIncluir={handleIncluir}
              includeLoadingIds={includeLoadingIds}
              selectedCodes={selectedCodes}
              filtroFonteCap={filtroFonteCap}
              setFiltroFonteCap={setFiltroFonteCap}
              filtroUfCap={filtroUfCap}
              setFiltroUfCap={(value) => {
                setFiltroUfCap(value);
                setPage(1);
              }}
              ufOptions={ufOptions}
              filtroCidadesCap={filtroCidadesCap}
              onToggleCidade={(cidade) => toggleValue(cidade, setFiltroCidadesCap)}
              cidadesOptions={cidadesOptions}
              filtroFinanciaCap={filtroFinanciaCap}
              setFiltroFinanciaCap={(value) => {
                setFiltroFinanciaCap(value);
                setPage(1);
              }}
              onAbrirAvaliacao={openAvaliacaoAutomaticaModal}
              onAbrirAvaliacaoDetalhada={openAvaliacaoDetalhadaModal}
              onAbrirAnalise={openAnaliseModal}
              sourceOptions={FONTE_OPTIONS}
              getLeilaoResumo={getLeilaoResumo}
              getMapsUrl={getMapsUrl}
              getComparaveisLinks={getComparaveisLinks}
              extrairEditalUrl={extrairEditalUrl}
              getFonteLabel={getFonteLabel}
              extrairProcessoNumero={extrairProcessoNumero}
              formatarMoeda={formatarMoeda}
              formatarPercentual={formatarPercentual}
              formatarDataHoraCompacta={formatarDataHoraCompacta}
              getScoreClasse={getScoreClasse}
              getRoiClasse={getRoiClasse}
              sortBy={sortBy}
              setSortBy={setSortBy}
              sortDir={sortDir}
              setSortDir={setSortDir}
              pageSizeOptions={pageSizeOptions}
              setPageSize={setPageSize}
              onPageChange={handlePageChange}
              onResetFilters={() => {
                limparFiltros();
                setSortBy("ultima_disputa");
                setSortDir("desc");
              }}
            />
          )}
        </>
      ) : (
        <ProspeccoesDesktop
          dados={capturados}
          total={capturadosTotal}
          loading={loadingCap}
          erro={erroCap}
          query={query}
          setters={setQuery}
          meta={meta}
          pageSize={pageSize}
          page={page}
          sortBy={sortBy}
          sortDir={sortDir}
          onSortChange={handleSortChange}
          onPageChange={handlePageChange}
          onOpen={(item, tab = "dados", origem = "capturados") => openAvaliacaoDetalhadaModal(item, tab, origem)}
          onRequest={(item) => openAvaliacaoDetalhadaModal(item, "ia", "capturados", { gerarAnaliseInicial: true })}
          canAnalyze={Boolean(user?.ai_access || user?.role === "admin")}
          getMapsUrl={getMapsUrl}
          tabs={desktopTabs}
          activeCode={avaliacaoDetalhadaItem?.codigo}
          scrollRef={desktopScrollRef}
          onActivate={(item) => {
            if (avaliacaoDetalhadaItem) desktopDraftsRef.current.set(avaliacaoDetalhadaItem.codigo, { mensagem: aiMensagemDraft, sintese: aiSinteseDraft !== (aiAnalise?.analise_texto || "") ? aiSinteseDraft : undefined, tab: avaliacaoDetalhadaTab });
            if (item) openAvaliacaoDetalhadaModal(item, desktopDraftsRef.current.get(item.codigo)?.tab || "dados", "capturados");
            else closeAvaliacaoDetalhadaModal();
          }}
          onCloseTab={(codigo) => {
            setDesktopTabs((current) => current.filter((item) => item.codigo !== codigo));
            desktopDraftsRef.current.delete(codigo);
            if (avaliacaoDetalhadaItem?.codigo === codigo) closeAvaliacaoDetalhadaModal();
          }}
        />
      )}

      <ConfirmarExclusaoModal
        item={confirmDeleteItem}
        loading={Boolean(confirmDeleteItem && removeLoadingIds.has(confirmDeleteItem.codigo))}
        onCancel={() => setConfirmDeleteItem(null)}
        onConfirm={() => confirmDelete(confirmDeleteItem)}
      />

      <IncluirSelecionadoManualModal
        draft={manualSelecionadoDraft}
        loading={manualSelecionadoSaving}
        onChange={handleManualSelecionadoFieldChange}
        prioridadeOptions={PRIORIDADE_OPTIONS}
        onCancel={() => {
          if (manualSelecionadoSaving) return;
          setManualSelecionadoDraft(null);
        }}
        onSave={handleSalvarSelecionadoManual}
      />

      <PrioridadeModal
        item={prioridadeItem}
        loading={Boolean(prioridadeItem && updateLoadingIds.has(`${prioridadeItem.codigo}:prioridade`))}
        prioridadeOptions={PRIORIDADE_OPTIONS}
        onCancel={() => setPrioridadeItem(null)}
        onSelect={(prioridadeValue) => handleAtualizarPrioridade(prioridadeItem, prioridadeValue)}
      />

      <ObservacoesModal
        item={observacaoItem}
        value={observacaoDraft}
        mapLink={observacaoMapLink}
        loading={Boolean(observacaoItem && updateLoadingIds.has(`${observacaoItem.codigo}:observacoes`))}
        onChange={setObservacaoDraft}
        onMapLinkChange={setObservacaoMapLink}
        onCancel={() => {
          setObservacaoItem(null);
          setObservacaoDraft("");
          setObservacaoMapLink("");
          setObservacaoAnaliseBase(null);
        }}
        onSave={handleSalvarObservacoes}
      />

      <AnaliseModal
        item={analiseItem}
        draft={analiseDraft}
        meta={analiseMeta}
        pairModes={analisePairModes}
        loading={analiseLoading}
        saving={analiseSaving}
        onClose={closeAnaliseModal}
        onFieldChange={handleAnaliseFieldChange}
        onFieldFocus={handleAnaliseFieldFocus}
        onFieldBlur={handleAnaliseFieldBlur}
        onPairModeChange={handleAnalisePairModeChange}
        onSave={handleSalvarAnalise}
        onSimularOfertaAtual={handleSimularOfertaAtual}
      />

      <AvaliacaoAutomaticaModal
        item={avaliacaoAutomaticaItem}
        detalhe={avaliacaoAutomaticaDetalhe}
        loading={avaliacaoAutomaticaLoading}
        savingScore={avaliacaoScoreSaving}
        scoreRegiaoDraft={avaliacaoScoreRegiaoDraft}
        onScoreRegiaoChange={setAvaliacaoScoreRegiaoDraft}
        onSalvarScoreRegiao={handleSalvarScoreRegiao}
        onClose={closeAvaliacaoAutomaticaModal}
        onAdicionarAoFunil={handleIncluir}
        getScoreClasse={getScoreClasse}
        getRoiClasse={getRoiClasse}
        formatarPercentual={formatarPercentual}
        formatarMoeda={formatarMoeda}
        formatarNumero={formatarNumero}
        formatarDataHoraCompacta={formatarDataHoraCompacta}
      />

      <AvaliacaoDetalhadaModal
        inline={!mobileAccess}
        key={`${avaliacaoDetalhadaOrigem}:${avaliacaoDetalhadaItem?.codigo || "fechado"}`}
        item={avaliacaoDetalhadaItem}
        tab={avaliacaoDetalhadaTab}
        origem={avaliacaoDetalhadaOrigem}
        aiAnalise={aiAnalise}
        analiseDetalhada={analiseDetalhada}
        enriquecimentoDetalhado={enriquecimentoDetalhado}
        enriquecimentoDetalhadoLoading={enriquecimentoDetalhadoLoading}
        analiseDetalhadaLoading={analiseDetalhadaLoading}
        statusMessage={avaliacaoDetalhadaStatus}
        statusTone={avaliacaoDetalhadaStatusTone}
        statusAction={avaliacaoDetalhadaStatusAction}
        loading={aiLoading}
        sending={aiSending}
        saving={aiSaving}
        matriculaLoading={matriculaLoading}
        enriquecimentoLoading={enriquecimentoLoading}
        sinteseDraft={aiSinteseDraft}
        onSinteseDraftChange={setAiSinteseDraft}
        mensagemDraft={aiMensagemDraft}
        onMensagemDraftChange={setAiMensagemDraft}
        onTabChange={handleAvaliacaoDetalhadaTabChange}
        onClose={closeAvaliacaoDetalhadaModal}
        onEnviarMensagem={handleEnviarMensagemAi}
        onGerarAnaliseInicial={handleGerarAnaliseInicialAi}
        onSalvarSintese={handleSalvarAiSintese}
        onSolicitarMatricula={handleSolicitarMatricula}
        onSolicitarEnriquecimento={handleSolicitarEnriquecimento}
        onSelecionarNoFunil={handleSelecionarNoHub}
        onAbrirAnalise={openAnaliseModal}
        selecionandoNoFunil={Boolean(avaliacaoDetalhadaItem && includeLoadingIds.has(avaliacaoDetalhadaItem.codigo))}
        jaSelecionadoNoFunil={Boolean(avaliacaoDetalhadaItem && selectedCodes.has(avaliacaoDetalhadaItem.codigo))}
        canChat={Boolean(user?.ai_access || user?.role === "admin")}
        getLeilaoResumo={getLeilaoResumo}
        getLeiloesInfo={getLeiloesInfo}
        getMapsUrl={getMapsUrl}
        getComparaveisLinks={getComparaveisLinks}
        normalizeComparableText={normalizeComparableText}
        calcularDescontoExibicao={calcularDescontoExibicao}
        extrairEditalUrl={extrairEditalUrl}
        extrairProcessoNumero={extrairProcessoNumero}
        getFonteLabel={getFonteLabel}
        formatarPercentual={formatarPercentual}
        formatarMoeda={formatarMoeda}
        formatarDataHoraCompacta={formatarDataHoraCompacta}
        getMensagemPrefillAnalise={getMensagemPrefillAnalise}
        getAnaliseIaActionLabel={getAnaliseIaActionLabel}
        podeAnalisarMatricula={podeAnalisarMatricula}
      />

      <ResponsaveisModal
        item={responsaveisItem}
        responsaveisDisponiveis={responsaveisDisponiveis}
        selectedIds={responsaveisDraftIds}
        saving={responsaveisSaving}
        onToggle={toggleResponsavelDraft}
        onCancel={() => {
          setResponsaveisItem(null);
          setResponsaveisDraftIds([]);
        }}
        onSave={handleSalvarResponsaveis}
      />
    </div>
  );
}
