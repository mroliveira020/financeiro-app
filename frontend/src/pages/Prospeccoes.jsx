import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import "./Prospeccoes.css";

import {
  fetchCapturados,
  fetchSelecionados,
  adicionarSelecionado,
  excluirSelecionado,
  fetchProspecMeta,
  fetchAnaliseSelecionado,
  salvarAnaliseSelecionado,
  fetchAvaliacaoAutomatica,
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
} from "./prospeccoes/ProspeccoesShared";
import {
  ResponsaveisModal,
  ConfirmarExclusaoModal,
  IncluirSelecionadoManualModal,
  ObservacoesModal,
  PrioridadeModal,
} from "./prospeccoes/ProspeccoesModals";
import { AvaliacaoAutomaticaModal, AvaliacaoDetalhadaModal } from "./prospeccoes/ProspeccoesDetailModals";
import {
  MobileSelecionadosList,
  MobileCapturadosList,
} from "./prospeccoes/ProspeccoesMobileSections";
import { TabelaCapturados, TabelaSelecionados } from "./prospeccoes/ProspeccoesTables";

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

const resumirObservacao = (texto, limite = 96) => {
  const normalizado = `${texto || ""}`.replace(/\s+/g, " ").trim();
  if (!normalizado) return "";
  if (normalizado.length <= limite) return normalizado;
  return `${normalizado.slice(0, limite - 1).trimEnd()}…`;
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
  const dia = String(data.getDate()).padStart(2, "0");
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const ano = String(data.getFullYear()).slice(-2);
  const hora = String(data.getHours()).padStart(2, "0");
  const minuto = String(data.getMinutes()).padStart(2, "0");
  return `${dia}/${mes}/${ano} ${hora}:${minuto}`;
};

const parseDateSafe = (valor) => {
  if (!valor) return null;
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? null : data;
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
]).filter((entry) => Boolean(entry.data));

const getLeilaoResumo = (item) => {
  const pares = getLeiloesInfo(item)
    .map((entry, index) => ({ ...entry, parsedDate: parseDateSafe(entry.data), orderIndex: index }))
    .filter((entry) => entry.parsedDate);

  if (!pares.length) return null;

  return pares.sort((a, b) => {
    const byDate = b.parsedDate.getTime() - a.parsedDate.getTime();
    if (byDate !== 0) return byDate;
    return b.orderIndex - a.orderIndex;
  })[0];
};

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

function obterClasseRoi(roi) {
  const valor = Number(roi);
  if (!Number.isFinite(valor)) return "is-neutral";
  if (valor >= 40) return "is-best";
  if (valor >= 20) return "is-good";
  if (valor > 0) return "is-caution";
  return "is-risk";
}

const ANALISE_DEFAULTS = {
  link_google_maps: "",
  valor_base_operacao: "",
  tempo_operacao_meses: "12",
  valor_maximo_lance: "",
  percentual_financiamento: "",
  prestacao_mensal_financiamento: "",
  valor_estimado_venda: "",
  reforma: "",
  condominio_atraso: "",
  iptu_atraso: "",
  desocupacao: "",
  itbi_percentual: "",
  itbi_valor: "",
  documentacao: "",
  manutencao_agua_mensal: "",
  manutencao_luz_mensal: "",
  manutencao_condominio_mensal: "",
  manutencao_iptu_mensal: "",
  comissao_leiloeiro_percentual: "",
  comissao_leiloeiro_valor: "",
  comissao_corretor_percentual: "",
  comissao_corretor_valor: "",
  ganho_capital_percentual: "",
  ganho_capital_valor: "",
};

const ANALISE_PAIR_MODE_DEFAULTS = {
  itbi: "percentual",
  leiloeiro: "percentual",
  corretor: "percentual",
  ganhoCapital: "percentual",
};

const MONEY_FIELDS = new Set([
  "valor_base_operacao",
  "valor_maximo_lance",
  "valor_estimado_venda",
  "prestacao_mensal_financiamento",
  "reforma",
  "condominio_atraso",
  "iptu_atraso",
  "desocupacao",
  "itbi_valor",
  "documentacao",
  "manutencao_agua_mensal",
  "manutencao_luz_mensal",
  "manutencao_condominio_mensal",
  "manutencao_iptu_mensal",
  "comissao_leiloeiro_valor",
  "comissao_corretor_valor",
  "ganho_capital_valor",
]);

const PERCENT_FIELDS = new Set([
  "percentual_financiamento",
  "itbi_percentual",
  "comissao_leiloeiro_percentual",
  "comissao_corretor_percentual",
  "ganho_capital_percentual",
]);

const INTEGER_FIELDS = new Set([
  "tempo_operacao_meses",
]);

const toNumber = (value) => {
  if (value === null || value === undefined || value === "") return 0;
  let normalized = `${value}`.trim();
  normalized = normalized.replace(/[^\d,.-]/g, "");
  if (normalized.includes(",")) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const roundMoney = (value) => Math.round((toNumber(value) + Number.EPSILON) * 100) / 100;
const roundPercent = (value) => Math.round((toNumber(value) + Number.EPSILON) * 10000) / 10000;

const resolvePair = (base, percentualRaw, valorRaw, mode) => {
  const baseVal = toNumber(base);
  if (mode === "valor") {
    const valor = roundMoney(valorRaw);
    const percentual = baseVal > 0 ? roundPercent((valor / baseVal) * 100) : 0;
    return { percentual, valor };
  }
  const percentual = roundPercent(percentualRaw);
  const valor = roundMoney(baseVal * (percentual / 100));
  return { percentual, valor };
};

const formatMoneyInput = (value) => {
  if (value === null || value === undefined || value === "") return "";
  const num = toNumber(value);
  return num.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const formatPercentInput = (value) => {
  if (value === null || value === undefined || value === "") return "";
  return `${roundPercent(value)}`.replace(".", ",");
};

const formatIntegerInput = (value) => {
  if (value === null || value === undefined || value === "") return "";
  const inteiro = parseInt(`${value}`, 10);
  return Number.isFinite(inteiro) ? `${inteiro}` : "";
};

const formatDraftValue = (field, value) => {
  if (MONEY_FIELDS.has(field)) return formatMoneyInput(value);
  if (PERCENT_FIELDS.has(field)) return formatPercentInput(value);
  if (INTEGER_FIELDS.has(field)) return formatIntegerInput(value);
  return value ?? "";
};

const formatDraftEditableValue = (field, value) => {
  if (value === null || value === undefined || value === "") return "";
  if (MONEY_FIELDS.has(field)) return `${roundMoney(value)}`.replace(".", ",");
  if (PERCENT_FIELDS.has(field)) return `${roundPercent(value)}`.replace(".", ",");
  if (INTEGER_FIELDS.has(field)) return formatIntegerInput(value);
  return `${value}`;
};

const normalizeDraftFieldValue = (field, value) => {
  if (value === "") return "";
  const raw = `${value}`;
  if (INTEGER_FIELDS.has(field)) {
    return raw.replace(/\D/g, "");
  }
  if (MONEY_FIELDS.has(field) || PERCENT_FIELDS.has(field)) {
    return raw.replace(/[^\d,.-]/g, "");
  }
  return raw;
};

const inferPairMode = (percentual, valor) => {
  if ((percentual === null || percentual === undefined || percentual === "") && valor !== null && valor !== undefined && valor !== "") {
    return "valor";
  }
  return "percentual";
};

const createAnaliseDraft = (inputs = {}) => ({
  ...ANALISE_DEFAULTS,
  ...Object.fromEntries(
    Object.entries(inputs).map(([key, value]) => [key, formatDraftValue(key, value)])
  ),
});

const createAnalisePairModes = (inputs = {}) => ({
  itbi: inferPairMode(inputs.itbi_percentual, inputs.itbi_valor),
  leiloeiro: inferPairMode(inputs.comissao_leiloeiro_percentual, inputs.comissao_leiloeiro_valor),
  corretor: inferPairMode(inputs.comissao_corretor_percentual, inputs.comissao_corretor_valor),
  ganhoCapital: inferPairMode(inputs.ganho_capital_percentual, inputs.ganho_capital_valor),
});

const createAnaliseFallbackInputs = (item = {}) => {
  const valorReferencia = item.valorMaximo || item.valorLeilao1 || item.valorAvaliacao || item.valorVenda || "";
  const valorVendaSugerido = item.valorVenda || item.valorAvaliacao || item.valorMaximo || "";
  return {
    link_google_maps: item.linkGoogleMaps || "",
    valor_base_operacao: valorReferencia,
    tempo_operacao_meses: 12,
    valor_maximo_lance: valorReferencia,
    percentual_financiamento: "",
    prestacao_mensal_financiamento: "",
    valor_estimado_venda: valorVendaSugerido,
    reforma: "",
    condominio_atraso: "",
    iptu_atraso: "",
    desocupacao: "",
    itbi_percentual: "",
    itbi_valor: "",
    documentacao: "",
    manutencao_agua_mensal: "",
    manutencao_luz_mensal: "",
    manutencao_condominio_mensal: "",
    manutencao_iptu_mensal: "",
    comissao_leiloeiro_percentual: "",
    comissao_leiloeiro_valor: "",
    comissao_corretor_percentual: "",
    comissao_corretor_valor: "",
    ganho_capital_percentual: "",
    ganho_capital_valor: "",
  };
};

const computeAnalise = (draft, pairModes) => {
  const valorMaximoLance = roundMoney(draft.valor_maximo_lance);
  const valorBaseOperacao = roundMoney(draft.valor_base_operacao || valorMaximoLance);
  const tempoOperacaoMeses = Math.max(1, parseInt(draft.tempo_operacao_meses || "12", 10) || 12);
  const percentualFinanciamento = roundPercent(draft.percentual_financiamento);
  const prestacaoMensalFinanciamento = roundMoney(draft.prestacao_mensal_financiamento);
  const valorEstimadoVenda = roundMoney(draft.valor_estimado_venda);

  const reforma = roundMoney(draft.reforma);
  const condominioAtraso = roundMoney(draft.condominio_atraso);
  const iptuAtraso = roundMoney(draft.iptu_atraso);
  const desocupacao = roundMoney(draft.desocupacao);
  const documentacao = roundMoney(draft.documentacao);

  const manutencaoAguaMensal = roundMoney(draft.manutencao_agua_mensal);
  const manutencaoLuzMensal = roundMoney(draft.manutencao_luz_mensal);
  const manutencaoCondominioMensal = roundMoney(draft.manutencao_condominio_mensal);
  const manutencaoIptuMensal = roundMoney(draft.manutencao_iptu_mensal);

  const itbi = resolvePair(valorBaseOperacao, draft.itbi_percentual, draft.itbi_valor, pairModes.itbi);
  const leiloeiro = resolvePair(
    valorMaximoLance,
    draft.comissao_leiloeiro_percentual,
    draft.comissao_leiloeiro_valor,
    pairModes.leiloeiro
  );
  const corretor = resolvePair(
    valorEstimadoVenda,
    draft.comissao_corretor_percentual,
    draft.comissao_corretor_valor,
    pairModes.corretor
  );

  const despesasUnicas = roundMoney(
    reforma + condominioAtraso + iptuAtraso + desocupacao + documentacao + itbi.valor
  );
  const despesaMensalOperacional = roundMoney(
    manutencaoAguaMensal + manutencaoLuzMensal + manutencaoCondominioMensal + manutencaoIptuMensal
  );
  const custoFinanciamentoProjetado = roundMoney(prestacaoMensalFinanciamento * tempoOperacaoMeses);
  const despesaMensalTotal = roundMoney(
    despesaMensalOperacional + prestacaoMensalFinanciamento
  );
  const despesasMensaisProjetadas = roundMoney(despesaMensalTotal * tempoOperacaoMeses);
  const valorFinanciado = roundMoney(valorMaximoLance * (percentualFinanciamento / 100));
  const desembolsoAquisicao = roundMoney(valorMaximoLance - valorFinanciado + leiloeiro.valor);
  const custoTotalImovel = roundMoney(
    valorFinanciado + desembolsoAquisicao + despesasUnicas + despesasMensaisProjetadas
  );
  const capitalInvestidoEstimado = roundMoney(
    desembolsoAquisicao + despesasUnicas + despesasMensaisProjetadas
  );
  const baseGanhoCapital = roundMoney(Math.max((valorEstimadoVenda - corretor.valor) - custoTotalImovel, 0));
  const ganhoCapital = resolvePair(
    baseGanhoCapital,
    draft.ganho_capital_percentual,
    draft.ganho_capital_valor,
    pairModes.ganhoCapital
  );
  const lucroEsperadoValor = roundMoney(
    valorEstimadoVenda - corretor.valor - ganhoCapital.valor - custoTotalImovel
  );
  const despesasPosVenda = roundMoney(corretor.valor + ganhoCapital.valor);
  const roiEsperadoPercentual = capitalInvestidoEstimado > 0
    ? roundPercent((lucroEsperadoValor / capitalInvestidoEstimado) * 100)
    : 0;

  return {
    inputs: {
      link_google_maps: (draft.link_google_maps || "").trim(),
      valor_base_operacao: valorBaseOperacao,
      tempo_operacao_meses: tempoOperacaoMeses,
      valor_maximo_lance: valorMaximoLance,
      percentual_financiamento: percentualFinanciamento,
      prestacao_mensal_financiamento: prestacaoMensalFinanciamento,
      valor_estimado_venda: valorEstimadoVenda,
      reforma,
      condominio_atraso: condominioAtraso,
      iptu_atraso: iptuAtraso,
      desocupacao,
      itbi_percentual: itbi.percentual,
      itbi_valor: itbi.valor,
      documentacao,
      manutencao_agua_mensal: manutencaoAguaMensal,
      manutencao_luz_mensal: manutencaoLuzMensal,
      manutencao_condominio_mensal: manutencaoCondominioMensal,
      manutencao_iptu_mensal: manutencaoIptuMensal,
      comissao_leiloeiro_percentual: leiloeiro.percentual,
      comissao_leiloeiro_valor: leiloeiro.valor,
      comissao_corretor_percentual: corretor.percentual,
      comissao_corretor_valor: corretor.valor,
      ganho_capital_percentual: ganhoCapital.percentual,
      ganho_capital_valor: ganhoCapital.valor,
    },
    calculos: {
      despesas_unicas: despesasUnicas,
      despesa_mensal_operacional: despesaMensalOperacional,
      despesa_mensal_total: despesaMensalTotal,
      despesas_mensais_projetadas: despesasMensaisProjetadas,
      custo_financiamento_projetado: custoFinanciamentoProjetado,
      valor_financiado: valorFinanciado,
      desembolso_aquisicao: desembolsoAquisicao,
      custo_total_imovel: custoTotalImovel,
      capital_investido_estimado: capitalInvestidoEstimado,
      base_ganho_capital: baseGanhoCapital,
      despesas_pos_venda: despesasPosVenda,
      lucro_esperado_valor: lucroEsperadoValor,
      roi_esperado_percentual: roiEsperadoPercentual,
      roi_esperado_valor: lucroEsperadoValor,
    },
  };
};

const buildAnalisePayload = (draft, pairModes) => computeAnalise(draft, pairModes).inputs;

function CampoNumerico({ label, value, onChange, onFocus, onBlur }) {
  return (
    <label className="prospects-form-field">
      <span>{label}</span>
      <input
        type="text"
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
      />
    </label>
  );
}

function CampoTextoNumerico({ label, value, onChange, onFocus, onBlur, placeholder = "" }) {
  return (
    <label className="prospects-form-field">
      <span>{label}</span>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        placeholder={placeholder}
      />
    </label>
  );
}

function AnaliseModal({
  item,
  draft,
  meta,
  pairModes,
  loading,
  saving,
  onClose,
  onFieldChange,
  onFieldFocus,
  onFieldBlur,
  onPairModeChange,
  onSave,
}) {
  if (!item) return null;

  const currentDraft = draft || createAnaliseDraft({});
  const analise = computeAnalise(currentDraft, pairModes);
  const { inputs, calculos } = analise;
  const vendaEstimadaPendente = Number(inputs.valor_estimado_venda || 0) <= 0;

  const resolveDisplayValue = (field, pairName, modeName) => {
    if (pairModes[pairName] === modeName) return currentDraft[field];
    return formatDraftValue(field, inputs[field]);
  };

  return (
    <div className="prospects-modal-backdrop" role="presentation">
      <div className="prospects-modal prospects-modal--wide prospects-modal--analise" role="dialog" aria-modal="true" aria-labelledby="analise-title">
        <div className="prospects-modal__header">
          <div>
            <p className="prospects-eyebrow">Viabilidade</p>
            <h3 id="analise-title" className="prospects-modal__title">Imóvel {item.codigo}</h3>
            <p className="prospects-subtitle prospects-subtitle--compact">
              Ajuste as premissas e confira os cálculos antes de salvar.
            </p>
          </div>
        </div>
        <div className="prospects-modal__body">
          {loading ? (
            <p className="prospects-empty">Carregando ficha de análise...</p>
          ) : (
            <>
              {getMensagemPrefillAnalise(meta) ? (
                <div className="prospects-modal__hint">
                  {getMensagemPrefillAnalise(meta)}
                </div>
              ) : null}
              <div className="prospects-analise-grid prospects-analise-grid--sticky-summary">
                <section className="prospects-analise-section prospects-analise-section--full prospects-analise-section--summary">
                  <h4>Resumo financeiro</h4>
                  <div className="prospects-summary-grid">
                    <div className="prospects-summary-card">
                      <span>Desembolso na aquisição</span>
                      <strong>{formatarMoeda(calculos.desembolso_aquisicao)}</strong>
                    </div>
                    <div className="prospects-summary-card">
                      <span>Despesas únicas</span>
                      <strong>{formatarMoeda(calculos.despesas_unicas)}</strong>
                    </div>
                    <div className="prospects-summary-card">
                      <span>Despesas do período</span>
                      <strong>{formatarMoeda(calculos.despesas_mensais_projetadas)}</strong>
                    </div>
                    <div className="prospects-summary-card prospects-summary-card--accent">
                      <span>Capital investido</span>
                      <strong>{formatarMoeda(calculos.capital_investido_estimado)}</strong>
                    </div>
                  </div>
                  <div className="prospects-summary-grid prospects-summary-grid--outcome">
                    <div className="prospects-summary-card">
                      <span>Valor de venda</span>
                      <strong>{formatarMoeda(inputs.valor_estimado_venda)}</strong>
                    </div>
                    <div className="prospects-summary-card">
                      <span>Valor financiado</span>
                      <strong>{formatarMoeda(calculos.valor_financiado)}</strong>
                    </div>
                    <div className="prospects-summary-card">
                      <span>Despesas pós-venda</span>
                      <strong>{formatarMoeda(calculos.despesas_pos_venda)}</strong>
                    </div>
                    <div className="prospects-summary-card prospects-summary-card--accent">
                      <span>Lucro líquido esperado</span>
                      <strong>{formatarMoeda(calculos.lucro_esperado_valor)}</strong>
                    </div>
                    <div className="prospects-summary-card prospects-summary-card--accent">
                      <span>ROI sobre capital investido</span>
                      <strong>{vendaEstimadaPendente ? "A definir" : formatarPercentual(calculos.roi_esperado_percentual)}</strong>
                    </div>
                  </div>
                  {vendaEstimadaPendente ? (
                    <div className="prospects-analise-inline-note prospects-analise-inline-note--warning" role="status" aria-live="polite">
                      O ROI aparece indefinido enquanto o campo <strong>Valor estimado da venda</strong> estiver zerado. Preencha esse valor para ver a projeção real.
                    </div>
                  ) : null}
                </section>

                <section className="prospects-analise-section prospects-analise-section--quarter">
                  <h4>Premissas</h4>
                  <CampoTextoNumerico label="Valor máximo do lance" value={currentDraft.valor_maximo_lance} onChange={(value) => onFieldChange("valor_maximo_lance", value)} onFocus={() => onFieldFocus("valor_maximo_lance")} onBlur={() => onFieldBlur("valor_maximo_lance")} />
                  <CampoTextoNumerico label="Valor base da operação" value={currentDraft.valor_base_operacao} onChange={(value) => onFieldChange("valor_base_operacao", value)} onFocus={() => onFieldFocus("valor_base_operacao")} onBlur={() => onFieldBlur("valor_base_operacao")} />
                  <CampoNumerico label="Tempo de operação (meses)" value={currentDraft.tempo_operacao_meses} onChange={(value) => onFieldChange("tempo_operacao_meses", value)} onFocus={() => onFieldFocus("tempo_operacao_meses")} onBlur={() => onFieldBlur("tempo_operacao_meses")} />
                  <CampoTextoNumerico label="Percentual de financiamento" value={currentDraft.percentual_financiamento} onChange={(value) => onFieldChange("percentual_financiamento", value)} onFocus={() => onFieldFocus("percentual_financiamento")} onBlur={() => onFieldBlur("percentual_financiamento")} />
                  <CampoTextoNumerico label="Valor estimado da venda" value={currentDraft.valor_estimado_venda} onChange={(value) => onFieldChange("valor_estimado_venda", value)} onFocus={() => onFieldFocus("valor_estimado_venda")} onBlur={() => onFieldBlur("valor_estimado_venda")} />
                </section>

                <section className="prospects-analise-section prospects-analise-section--quarter">
                  <h4>Despesas únicas</h4>
                  <CampoTextoNumerico label="Reforma" value={currentDraft.reforma} onChange={(value) => onFieldChange("reforma", value)} onFocus={() => onFieldFocus("reforma")} onBlur={() => onFieldBlur("reforma")} />
                  <CampoTextoNumerico label="Condomínio em atraso" value={currentDraft.condominio_atraso} onChange={(value) => onFieldChange("condominio_atraso", value)} onFocus={() => onFieldFocus("condominio_atraso")} onBlur={() => onFieldBlur("condominio_atraso")} />
                  <CampoTextoNumerico label="IPTU em atraso" value={currentDraft.iptu_atraso} onChange={(value) => onFieldChange("iptu_atraso", value)} onFocus={() => onFieldFocus("iptu_atraso")} onBlur={() => onFieldBlur("iptu_atraso")} />
                  <CampoTextoNumerico label="Desocupação" value={currentDraft.desocupacao} onChange={(value) => onFieldChange("desocupacao", value)} onFocus={() => onFieldFocus("desocupacao")} onBlur={() => onFieldBlur("desocupacao")} />
                  <CampoTextoNumerico label="Documentação" value={currentDraft.documentacao} onChange={(value) => onFieldChange("documentacao", value)} onFocus={() => onFieldFocus("documentacao")} onBlur={() => onFieldBlur("documentacao")} />
                </section>

                <section className="prospects-analise-section prospects-analise-section--quarter">
                  <h4>Despesas mensais</h4>
                  <CampoTextoNumerico label="Água" value={currentDraft.manutencao_agua_mensal} onChange={(value) => onFieldChange("manutencao_agua_mensal", value)} onFocus={() => onFieldFocus("manutencao_agua_mensal")} onBlur={() => onFieldBlur("manutencao_agua_mensal")} />
                  <CampoTextoNumerico label="Luz" value={currentDraft.manutencao_luz_mensal} onChange={(value) => onFieldChange("manutencao_luz_mensal", value)} onFocus={() => onFieldFocus("manutencao_luz_mensal")} onBlur={() => onFieldBlur("manutencao_luz_mensal")} />
                  <CampoTextoNumerico label="Condomínio" value={currentDraft.manutencao_condominio_mensal} onChange={(value) => onFieldChange("manutencao_condominio_mensal", value)} onFocus={() => onFieldFocus("manutencao_condominio_mensal")} onBlur={() => onFieldBlur("manutencao_condominio_mensal")} />
                  <CampoTextoNumerico label="IPTU" value={currentDraft.manutencao_iptu_mensal} onChange={(value) => onFieldChange("manutencao_iptu_mensal", value)} onFocus={() => onFieldFocus("manutencao_iptu_mensal")} onBlur={() => onFieldBlur("manutencao_iptu_mensal")} />
                  <CampoTextoNumerico label="Prestação mensal do financiamento" value={currentDraft.prestacao_mensal_financiamento} onChange={(value) => onFieldChange("prestacao_mensal_financiamento", value)} onFocus={() => onFieldFocus("prestacao_mensal_financiamento")} onBlur={() => onFieldBlur("prestacao_mensal_financiamento")} />
                  <div className="prospects-analise-inline-note">
                    Projeção automática: {formatarMoeda(calculos.despesas_mensais_projetadas)} em {inputs.tempo_operacao_meses} meses, incluindo a prestação.
                  </div>
                </section>

                <section className="prospects-analise-section prospects-analise-section--half">
                  <h4>ITBI e aquisição</h4>
                  <div className="prospects-pair-grid">
                    <CampoNumerico
                      label="ITBI (%)"
                      value={resolveDisplayValue("itbi_percentual", "itbi", "percentual")}
                      onChange={(value) => onPairModeChange("itbi", "percentual", "itbi_percentual", value)}
                      onFocus={() => onFieldFocus("itbi_percentual")}
                      onBlur={() => onFieldBlur("itbi_percentual")}
                    />
                    <CampoTextoNumerico
                      label="ITBI (valor)"
                      value={resolveDisplayValue("itbi_valor", "itbi", "valor")}
                      onChange={(value) => onPairModeChange("itbi", "valor", "itbi_valor", value)}
                      onFocus={() => onFieldFocus("itbi_valor")}
                      onBlur={() => onFieldBlur("itbi_valor")}
                    />
                  </div>
                  <div className="prospects-pair-grid">
                    <CampoNumerico
                      label="Comissão do leiloeiro (%)"
                      value={resolveDisplayValue("comissao_leiloeiro_percentual", "leiloeiro", "percentual")}
                      onChange={(value) => onPairModeChange("leiloeiro", "percentual", "comissao_leiloeiro_percentual", value)}
                      onFocus={() => onFieldFocus("comissao_leiloeiro_percentual")}
                      onBlur={() => onFieldBlur("comissao_leiloeiro_percentual")}
                    />
                    <CampoTextoNumerico
                      label="Comissão do leiloeiro (valor)"
                      value={resolveDisplayValue("comissao_leiloeiro_valor", "leiloeiro", "valor")}
                      onChange={(value) => onPairModeChange("leiloeiro", "valor", "comissao_leiloeiro_valor", value)}
                      onFocus={() => onFieldFocus("comissao_leiloeiro_valor")}
                      onBlur={() => onFieldBlur("comissao_leiloeiro_valor")}
                    />
                  </div>
                </section>

                <section className="prospects-analise-section prospects-analise-section--half">
                  <h4>Venda</h4>
                  <div className="prospects-pair-grid">
                    <CampoNumerico
                      label="Comissão do corretor (%)"
                      value={resolveDisplayValue("comissao_corretor_percentual", "corretor", "percentual")}
                      onChange={(value) => onPairModeChange("corretor", "percentual", "comissao_corretor_percentual", value)}
                      onFocus={() => onFieldFocus("comissao_corretor_percentual")}
                      onBlur={() => onFieldBlur("comissao_corretor_percentual")}
                    />
                    <CampoTextoNumerico
                      label="Comissão do corretor (valor)"
                      value={resolveDisplayValue("comissao_corretor_valor", "corretor", "valor")}
                      onChange={(value) => onPairModeChange("corretor", "valor", "comissao_corretor_valor", value)}
                      onFocus={() => onFieldFocus("comissao_corretor_valor")}
                      onBlur={() => onFieldBlur("comissao_corretor_valor")}
                    />
                  </div>
                  <div className="prospects-pair-grid">
                    <CampoNumerico
                      label="Ganho de capital (%)"
                      value={resolveDisplayValue("ganho_capital_percentual", "ganhoCapital", "percentual")}
                      onChange={(value) => onPairModeChange("ganhoCapital", "percentual", "ganho_capital_percentual", value)}
                      onFocus={() => onFieldFocus("ganho_capital_percentual")}
                      onBlur={() => onFieldBlur("ganho_capital_percentual")}
                    />
                    <CampoTextoNumerico
                      label="Ganho de capital (valor)"
                      value={resolveDisplayValue("ganho_capital_valor", "ganhoCapital", "valor")}
                      onChange={(value) => onPairModeChange("ganhoCapital", "valor", "ganho_capital_valor", value)}
                      onFocus={() => onFieldFocus("ganho_capital_valor")}
                      onBlur={() => onFieldBlur("ganho_capital_valor")}
                    />
                  </div>
                  <div className="prospects-analise-inline-note">
                    Base do ganho de capital: {formatarMoeda(calculos.base_ganho_capital)}
                  </div>
                </section>

                <section className="prospects-analise-section prospects-analise-section--quarter">
                  <h4>Indicadores</h4>
                  <div className="prospects-analise-kpis">
                    <div className="prospects-analise-kpi">
                      <span>Mensal operacional</span>
                      <strong>{formatarMoeda(calculos.despesa_mensal_operacional)}</strong>
                    </div>
                    <div className="prospects-analise-kpi">
                      <span>Prestação mensal</span>
                      <strong>{formatarMoeda(inputs.prestacao_mensal_financiamento)}</strong>
                    </div>
                    <div className="prospects-analise-kpi">
                      <span>Desembolso mensal total</span>
                      <strong>{formatarMoeda(calculos.despesa_mensal_total)}</strong>
                    </div>
                    <div className="prospects-analise-kpi">
                      <span>Capital investido</span>
                      <strong>{formatarMoeda(calculos.capital_investido_estimado)}</strong>
                    </div>
                    <div className="prospects-analise-kpi">
                      <span>Custo total do imóvel</span>
                      <strong>{formatarMoeda(calculos.custo_total_imovel)}</strong>
                    </div>
                    <div className="prospects-analise-kpi">
                      <span>Lucro líquido esperado</span>
                      <strong>{formatarMoeda(calculos.lucro_esperado_valor)}</strong>
                    </div>
                  </div>
                </section>
              </div>
            </>
          )}
        </div>
        <div className="prospects-modal__footer">
          <button type="button" className="prospects-btn secondary" onClick={onClose} disabled={saving}>
            Fechar
          </button>
          <button type="button" className="prospects-btn primary" onClick={onSave} disabled={loading || saving}>
            {saving ? "Salvando..." : "Salvar análise"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Prospeccoes() {
  const outletContext = useOutletContext() || {};
  const setTopbarContent = outletContext.setTopbarContent;
  const { user, hasRole } = useAuth();
  const [selecionados, setSelecionados] = useState([]);
  const [capturados, setCapturados] = useState([]);
  const [capturadosTotal, setCapturadosTotal] = useState(0);
  const [loadingSel, setLoadingSel] = useState(false);
  const [loadingCap, setLoadingCap] = useState(false);
  const [erroSel, setErroSel] = useState("");
  const [erroCap, setErroCap] = useState("");
  const [filtroFonteCap, setFiltroFonteCap] = useState("todas");
  const [filtroUfCap, setFiltroUfCap] = useState([]);
  const [filtroCidadesCap, setFiltroCidadesCap] = useState([]);
  const [filtroModalidadeCap, setFiltroModalidadeCap] = useState([]);
  const [filtroFinanciaCap, setFiltroFinanciaCap] = useState([]);
  const [scoreMinCap, setScoreMinCap] = useState("");
  const [roiMinCap, setRoiMinCap] = useState("");
  const [somenteComAvaliacaoCap, setSomenteComAvaliacaoCap] = useState(false);
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);
  const [includeLoadingIds, setIncludeLoadingIds] = useState(new Set());
  const [removeLoadingIds, setRemoveLoadingIds] = useState(new Set());
  const [updateLoadingIds, setUpdateLoadingIds] = useState(new Set());
  const [mensagem, setMensagem] = useState("");
  const [meta, setMeta] = useState({ ufs: [], fontes: [], modalidades: [], financia: [] });
  const [sortBy, setSortBy] = useState("ultima_disputa");
  const [sortDir, setSortDir] = useState("desc");
  const [activeTab, setActiveTab] = useState("capturados");
  const [capturadosFiltersExpanded, setCapturadosFiltersExpanded] = useState(false);
  const [capturadosCitySearch, setCapturadosCitySearch] = useState("");
  const [selectedSortBy, setSelectedSortBy] = useState("dataLeilao");
  const [selectedSortDir, setSelectedSortDir] = useState("asc");
  const [selectedSearch, setSelectedSearch] = useState("");
  const [selectedUfFilter, setSelectedUfFilter] = useState("todos");
  const [selectedPrioridadeFilter, setSelectedPrioridadeFilter] = useState("todas");
  const [selectedActivityFilter, setSelectedActivityFilter] = useState("ativos");
  const [selectedResponsavelFilter, setSelectedResponsavelFilter] = useState("todos");
  const [selectedUserFilter, setSelectedUserFilter] = useState("todos");
  const [selectedFiltersExpanded, setSelectedFiltersExpanded] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("prospeccoes_selecionados_filters_expanded") === "1";
  });
  const [selecionadosCollapsed, setSelecionadosCollapsed] = useState(() => {
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
  const [analiseDetalhadaLoading, setAnaliseDetalhadaLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSending, setAiSending] = useState(false);
  const [aiSaving, setAiSaving] = useState(false);
  const [matriculaLoading, setMatriculaLoading] = useState(false);
  const [enriquecimentoLoading, setEnriquecimentoLoading] = useState(false);
  const aiAutoInitAttemptRef = useRef(new Set());
  const aiDeferredActionRef = useRef(null);
  const [aiMensagemDraft, setAiMensagemDraft] = useState("");
  const [aiSinteseDraft, setAiSinteseDraft] = useState("");
  const [avaliacaoDetalhadaStatus, setAvaliacaoDetalhadaStatus] = useState("");
  const [avaliacaoDetalhadaStatusTone, setAvaliacaoDetalhadaStatusTone] = useState("info");
  const [avaliacaoDetalhadaStatusActionKind, setAvaliacaoDetalhadaStatusActionKind] = useState(null);
  const [mobileAccess, setMobileAccess] = useState(() => detectMobileAccess());
  const [mobileSection, setMobileSection] = useState("hub");
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
        });
        setCapturados(resp.data || []);
        setCapturadosTotal(resp.total || 0);
        if (resp.page && resp.page !== page) {
          setPage(resp.page);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Erro inesperado";
        setErroCap(message);
        setCapturados([]);
        setCapturadosTotal(0);
      } finally {
        setLoadingCap(false);
      }
    };
    carregarCapturados();
  }, [page, pageSize, filtroFonteCap, filtroUfCap, filtroCidadesCap, filtroModalidadeCap, filtroFinanciaCap, sortBy, sortDir, scoreMinCap, roiMinCap, somenteComAvaliacaoCap]);

  useEffect(() => {
    fetchProspecMeta()
      .then((resp) => setMeta(resp))
      .catch(() => setMeta({ ufs: [], fontes: [], modalidades: [], financia: [], cidades_por_uf: {} }));
  }, []);

  useEffect(() => {
    if (user?.role !== "admin") {
      setResponsaveisDisponiveis([]);
      setSelectedUserFilter("todos");
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

  const ufOptions = useMemo(() => meta.ufs || [], [meta]);
  const modalidadeOptions = useMemo(() => meta.modalidades || [], [meta]);
  const cidadesOptions = useMemo(() => {
    if (!meta.cidades_por_uf) return [];
    const selectedUfs = filtroUfCap.length ? filtroUfCap : Object.keys(meta.cidades_por_uf);
    const set = new Set();
    selectedUfs.forEach((uf) => {
      (meta.cidades_por_uf[uf] || []).forEach((cidade) => set.add(cidade));
    });
    return Array.from(set).sort();
  }, [meta, filtroUfCap]);
  const normalizedCapturadosCitySearch = capturadosCitySearch.trim().toLowerCase();
  const cidadesCapturadasVisiveis = useMemo(() => (
    normalizedCapturadosCitySearch
      ? cidadesOptions.filter((cidade) => cidade.toLowerCase().includes(normalizedCapturadosCitySearch))
      : cidadesOptions
  ), [cidadesOptions, normalizedCapturadosCitySearch]);
  const capturadosAdvancedFiltersCount = [
    filtroUfCap.length,
    filtroCidadesCap.length,
    filtroModalidadeCap.length,
    filtroFinanciaCap.length,
  ].reduce((acc, value) => acc + value, 0);
  const capturadosQuickFiltersCount = [
    filtroFonteCap !== "todas" ? 1 : 0,
    scoreMinCap !== "" ? 1 : 0,
    roiMinCap !== "" ? 1 : 0,
    somenteComAvaliacaoCap ? 1 : 0,
    pageSize !== 20 ? 1 : 0,
  ].reduce((acc, value) => acc + value, 0);
  const capturadosHasFilters = capturadosQuickFiltersCount + capturadosAdvancedFiltersCount > 0;
  const capturadosVisibleActiveFilters = [
    filtroFonteCap !== "todas" ? `Origem: ${FONTE_OPTIONS.find((option) => option.value === filtroFonteCap)?.label || filtroFonteCap}` : null,
    filtroUfCap.length ? `UF: ${filtroUfCap.join(", ")}` : null,
    filtroCidadesCap.length ? `${filtroCidadesCap.length} cidade${filtroCidadesCap.length > 1 ? "s" : ""}` : null,
    filtroModalidadeCap.length ? `${filtroModalidadeCap.length} modalidade${filtroModalidadeCap.length > 1 ? "s" : ""}` : null,
    filtroFinanciaCap.length ? `Financia: ${filtroFinanciaCap.join(", ")}` : null,
    scoreMinCap !== "" ? `Score >= ${scoreMinCap}` : null,
    roiMinCap !== "" ? `ROI >= ${roiMinCap}%` : null,
    somenteComAvaliacaoCap ? "Só com pré-análise" : null,
  ].filter(Boolean);

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
    setCapturadosCitySearch("");
    setCapturadosFiltersExpanded(false);
    setPageSize(20);
    setPage(1);
  };

  const handleIncluir = async (item) => {
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
      if (itemSelecionado) {
        openAnaliseModal(itemSelecionado);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao incluir";
      setMensagem(message);
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

  useEffect(() => {
    if (user?.role === "admin") return;
    setSelectedActivityFilter("ativos");
  }, [user?.role]);

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

  const handleSalvarAnalise = async () => {
    if (!analiseItem || !analiseDraft) return;
    setAnaliseSaving(true);
    setMensagem("");
    try {
      const payload = buildAnalisePayload(analiseDraft, analisePairModes);
      const origem = analiseItem.origem || "selecionados";
      const cacheKey = `${origem}:${analiseItem.codigo}`;
      const data = await salvarAnaliseSelecionado(analiseItem.codigo, payload, origem);
      const inputs = data?.inputs || payload;
      setAnaliseCache((prev) => ({ ...prev, [cacheKey]: data }));
      setAnaliseDraft(createAnaliseDraft(inputs));
      setAnalisePairModes(createAnalisePairModes(inputs));
      setAnaliseMeta(data?.meta || null);
      if (avaliacaoDetalhadaItem?.codigo === analiseItem.codigo) {
        setAnaliseDetalhada(data);
      }
      if (origem === "selecionados") {
        setSelecionados((prev) => prev.map((item) => (
          item.codigo === analiseItem.codigo
            ? {
                ...item,
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

  const canOperateItem = (item) => {
    if (!user) return false;
    if (user.role === "admin") return true;
    if (item?.createdBy && String(item.createdBy) === String(user.id)) return true;
    return Boolean(item?.responsaveis?.some((responsavel) => String(responsavel.id) === String(user.id)));
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
        ? { ...item, analiseIaSalva: true }
        : item
    )));
  }, []);

  const carregarAiAnalise = useCallback(async (numeroBem, { autoInit = false, origem = "selecionados" } = {}) => {
    setAiLoading(true);
    try {
      const data = await fetchAiAnalise(numeroBem, origem);
      setAiAnalise(data);
      setAiSinteseDraft(data?.analise_texto || "");
      sincronizarIndicadorAnaliseIaCapturada(numeroBem, data);
      if (hasAiUsefulContent(data)) {
        setAvaliacaoDetalhadaStatusState();
      }

      const historico = data?.historico_chat || [];
      if (autoInit && !historico.length && (user?.ai_access || user?.role === "admin")) {
        const job = await enviarMensagemAiChat(numeroBem, "__init__", origem);
        const finalJob = await pollAiJob(numeroBem, job.job_id, {
          origem,
          onProgress: (progressJob) => {
            setAvaliacaoDetalhadaStatusState(
              buildAiJobStatusState(progressJob, { fallbackPrefix: "IA", retryAction: "analise_inicial" })
            );
          },
        });
        if (AI_JOB_ERROR_STATUSES.has(finalJob?.status)) {
          throw new Error(finalJob?.erro || "Falha ao gerar avaliação inicial.");
        }
        const refreshed = await fetchAiAnalise(numeroBem, origem);
        setAiAnalise(refreshed);
        setAiSinteseDraft(refreshed?.analise_texto || "");
        sincronizarIndicadorAnaliseIaCapturada(numeroBem, refreshed);
        if (hasAiUsefulContent(refreshed)) {
          setAvaliacaoDetalhadaStatusState();
        }
        await refreshSelecionados();
      }
    } finally {
      setAiLoading(false);
    }
  }, [user, refreshSelecionados, sincronizarIndicadorAnaliseIaCapturada, setAvaliacaoDetalhadaStatusState]);

  const openAvaliacaoDetalhadaModal = async (item, initialTab = "dados", origem = "selecionados") => {
    const aiAttemptKey = `${origem}:${item.codigo}`;
    const needsAiData = initialTab === "ia" || initialTab === "matricula";
    aiAutoInitAttemptRef.current.delete(aiAttemptKey);
    setAvaliacaoDetalhadaItem(item);
    setAvaliacaoDetalhadaOrigem(origem);
    setAvaliacaoDetalhadaTab(initialTab);
    setAiMensagemDraft("");
    setAiSinteseDraft("");
    setAvaliacaoDetalhadaStatusState();
    setAiAnalise(null);
    setAiLoading(needsAiData);
    setAnaliseDetalhada(null);
    setAnaliseDetalhadaLoading(true);
    try {
      const requests = [
        fetchAnaliseSelecionado(item.codigo).catch(() => null),
      ];
      if (needsAiData) {
        requests.push(carregarAiAnalise(item.codigo, { autoInit: false, origem }));
      }
      const [analiseData] = await Promise.all(requests);
      setAnaliseDetalhada(analiseData);
    } catch (err) {
      const message = err?.response?.data?.error || (err instanceof Error ? err.message : "Erro ao carregar avaliação detalhada");
      setMensagem(message);
      setAvaliacaoDetalhadaStatusState(buildAiErrorStatusState(message, { fallbackPrefix: "IA" }));
    } finally {
      setAnaliseDetalhadaLoading(false);
    }
  };

  const handleAcionarAnaliseIa = (item, origem = "selecionados") => {
    if (!item?.codigo) return;
    if (item.analiseIaSalva) {
      openAvaliacaoDetalhadaModal(item, "ia", origem);
      return;
    }
    const aiAttemptKey = `${origem}:${item.codigo}`;
    aiAutoInitAttemptRef.current.add(aiAttemptKey);
    aiDeferredActionRef.current = {
      numeroBem: item.codigo,
      origem,
      tipo: "analise_inicial",
    };
    openAvaliacaoDetalhadaModal(item, "ia", origem);
  };

  const closeAvaliacaoDetalhadaModal = () => {
    setAvaliacaoDetalhadaItem(null);
    setAvaliacaoDetalhadaOrigem("selecionados");
    setAvaliacaoDetalhadaTab("dados");
    setAiAnalise(null);
    setAnaliseDetalhada(null);
    setAnaliseDetalhadaLoading(false);
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

  const handleEnviarMensagemAi = async () => {
    if (!avaliacaoDetalhadaItem || !aiMensagemDraft.trim()) return;
    setAiSending(true);
    setAvaliacaoDetalhadaStatusState({ message: "IA: enviando pergunta...", tone: "info" });
    try {
      const job = await enviarMensagemAiChat(avaliacaoDetalhadaItem.codigo, aiMensagemDraft.trim(), avaliacaoDetalhadaOrigem);
      setAiMensagemDraft("");
      const finalJob = await pollAiJob(avaliacaoDetalhadaItem.codigo, job.job_id, {
        origem: avaliacaoDetalhadaOrigem,
        onProgress: (progressJob) => {
          setAvaliacaoDetalhadaStatusState(buildAiJobStatusState(progressJob, { fallbackPrefix: "IA" }));
        },
      });
      if (AI_JOB_ERROR_STATUSES.has(finalJob?.status)) {
        throw new Error(finalJob?.erro || "Erro ao processar mensagem da IA.");
      }
      const refreshed = await fetchAiAnalise(avaliacaoDetalhadaItem.codigo, avaliacaoDetalhadaOrigem);
      setAiAnalise(refreshed);
      setAiSinteseDraft(refreshed?.analise_texto || "");
      sincronizarIndicadorAnaliseIaCapturada(avaliacaoDetalhadaItem.codigo, refreshed);
      await refreshSelecionados();
      setAvaliacaoDetalhadaStatusState({ message: "IA: resultado disponível.", tone: "success" });
    } catch (err) {
      const message = err?.response?.data?.error || (err instanceof Error ? err.message : "Erro ao enviar mensagem para IA");
      setMensagem(message);
      setAvaliacaoDetalhadaStatusState(buildAiErrorStatusState(message, { fallbackPrefix: "IA" }));
    } finally {
      setAiSending(false);
    }
  };

  const handleGerarAnaliseInicialAi = useCallback(async () => {
    if (!avaliacaoDetalhadaItem) return;
    setAiSending(true);
    setAvaliacaoDetalhadaStatusState({ message: "IA: aguardando processamento...", tone: "info" });
    try {
      const job = await enviarMensagemAiChat(avaliacaoDetalhadaItem.codigo, "__init__", avaliacaoDetalhadaOrigem);
      const finalJob = await pollAiJob(avaliacaoDetalhadaItem.codigo, job.job_id, {
        origem: avaliacaoDetalhadaOrigem,
        onProgress: (progressJob) => {
          setAvaliacaoDetalhadaStatusState(
            buildAiJobStatusState(progressJob, { fallbackPrefix: "IA", retryAction: "analise_inicial" })
          );
        },
      });
      if (AI_JOB_ERROR_STATUSES.has(finalJob?.status)) {
        throw new Error(finalJob?.erro || "Erro ao gerar análise inicial da IA.");
      }
      const refreshed = await fetchAiAnalise(avaliacaoDetalhadaItem.codigo, avaliacaoDetalhadaOrigem);
      setAiAnalise(refreshed);
      setAiSinteseDraft(refreshed?.analise_texto || "");
      sincronizarIndicadorAnaliseIaCapturada(avaliacaoDetalhadaItem.codigo, refreshed);
      await refreshSelecionados();
      setAvaliacaoDetalhadaStatusState({ message: "IA: resultado disponível.", tone: "success" });
    } catch (err) {
      const message = err?.response?.data?.error || (err instanceof Error ? err.message : "Erro ao gerar análise inicial da IA");
      setMensagem(message);
      setAvaliacaoDetalhadaStatusState(
        buildAiErrorStatusState(message, { fallbackPrefix: "IA", retryAction: "analise_inicial" })
      );
    } finally {
      setAiSending(false);
    }
  }, [
    avaliacaoDetalhadaItem,
    avaliacaoDetalhadaOrigem,
    refreshSelecionados,
    setAvaliacaoDetalhadaStatusState,
    sincronizarIndicadorAnaliseIaCapturada,
  ]);

  const handleSalvarAiSintese = async () => {
    if (!avaliacaoDetalhadaItem) return;
    setAiSaving(true);
    setAvaliacaoDetalhadaStatusState({ message: "IA: salvando síntese...", tone: "info" });
    try {
      const data = await salvarAiAnalise(avaliacaoDetalhadaItem.codigo, {
        analise_texto: aiSinteseDraft.trim(),
      }, avaliacaoDetalhadaOrigem);
      setAiAnalise(data);
      sincronizarIndicadorAnaliseIaCapturada(avaliacaoDetalhadaItem.codigo, data);
      setMensagem(`Síntese da avaliação IA do imóvel ${avaliacaoDetalhadaItem.codigo} salva.`);
      await refreshSelecionados();
      setAvaliacaoDetalhadaStatusState({ message: "Síntese salva com sucesso.", tone: "success" });
    } catch (err) {
      const message = err?.response?.data?.error || (err instanceof Error ? err.message : "Erro ao salvar síntese da IA");
      setMensagem(message);
      setAvaliacaoDetalhadaStatusState(buildAiErrorStatusState(message, { fallbackPrefix: "IA" }));
    } finally {
      setAiSaving(false);
    }
  };

  const handleSolicitarMatricula = async () => {
    if (!avaliacaoDetalhadaItem) return;
    setMatriculaLoading(true);
    setAvaliacaoDetalhadaStatusState({ message: "Matrícula: aguardando processamento...", tone: "info" });
    try {
      const job = await solicitarMatricula(avaliacaoDetalhadaItem.codigo, avaliacaoDetalhadaOrigem);
      const finalJob = await pollAiJob(avaliacaoDetalhadaItem.codigo, job.job_id, {
        timeoutMs: 180000,
        origem: avaliacaoDetalhadaOrigem,
        onProgress: (progressJob) => {
          setAvaliacaoDetalhadaStatusState(
            buildAiJobStatusState(progressJob, { fallbackPrefix: "Matrícula", retryAction: "matricula" })
          );
        },
      });
      if (AI_JOB_ERROR_STATUSES.has(finalJob?.status)) {
        throw new Error(finalJob?.erro || "Erro ao processar matrícula.");
      }
      const refreshed = await fetchAiAnalise(avaliacaoDetalhadaItem.codigo, avaliacaoDetalhadaOrigem);
      setAiAnalise(refreshed);
      setAiSinteseDraft(refreshed?.analise_texto || "");
      sincronizarIndicadorAnaliseIaCapturada(avaliacaoDetalhadaItem.codigo, refreshed);
      await refreshSelecionados();
      setAvaliacaoDetalhadaStatusState({ message: "Matrícula: resultado disponível.", tone: "success" });
    } catch (err) {
      const message = err?.response?.data?.error || (err instanceof Error ? err.message : "Erro ao solicitar matrícula");
      setMensagem(message);
      setAvaliacaoDetalhadaStatusState(
        buildAiErrorStatusState(message, { fallbackPrefix: "Matrícula", retryAction: "matricula" })
      );
    } finally {
      setMatriculaLoading(false);
    }
  };

  const handleSolicitarEnriquecimento = async () => {
    if (!avaliacaoDetalhadaItem) return;
    setEnriquecimentoLoading(true);
    setAvaliacaoDetalhadaStatusState({ message: "Enriquecimento: aguardando processamento...", tone: "info" });
    try {
      const job = await solicitarEnriquecimento(avaliacaoDetalhadaItem.codigo, avaliacaoDetalhadaOrigem);
      const finalJob = await pollAiJob(avaliacaoDetalhadaItem.codigo, job.job_id, {
        timeoutMs: 180000,
        origem: avaliacaoDetalhadaOrigem,
        onProgress: (progressJob) => {
          setAvaliacaoDetalhadaStatusState(
            buildAiJobStatusState(progressJob, { fallbackPrefix: "Enriquecimento", retryAction: "enriquecimento" })
          );
        },
      });
      if (AI_JOB_ERROR_STATUSES.has(finalJob?.status)) {
        throw new Error(finalJob?.erro || "Erro ao processar enriquecimento.");
      }
      const avaliacaoAtualizada = await fetchAvaliacaoAutomatica(avaliacaoDetalhadaItem.codigo);
      setAvaliacaoDetalhadaItem((prev) => (prev ? { ...prev, avaliacaoAutomatica: avaliacaoAtualizada } : prev));
      setCapturados((prev) => prev.map((item) => (
        item.codigo === avaliacaoDetalhadaItem.codigo
          ? { ...item, avaliacaoAutomatica: avaliacaoAtualizada }
          : item
      )));
      setSelecionados((prev) => prev.map((item) => (
        item.codigo === avaliacaoDetalhadaItem.codigo
          ? { ...item, avaliacaoAutomatica: avaliacaoAtualizada }
          : item
      )));
      setAvaliacaoDetalhadaStatusState({ message: "Enriquecimento: resultado disponível.", tone: "success" });
    } catch (err) {
      const message = err?.response?.data?.error || (err instanceof Error ? err.message : "Erro ao solicitar enriquecimento");
      setMensagem(message);
      setAvaliacaoDetalhadaStatusState(
        buildAiErrorStatusState(message, { fallbackPrefix: "Enriquecimento", retryAction: "enriquecimento" })
      );
    } finally {
      setEnriquecimentoLoading(false);
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
    if (aiLoading || aiSending) return;
    if (aiAnalise?.historico_chat?.length || aiAnalise?.matricula_texto) return;
    if (!(user?.ai_access || user?.role === "admin")) return;
    const aiAttemptKey = `${avaliacaoDetalhadaOrigem}:${avaliacaoDetalhadaItem.codigo}`;
    if (aiAutoInitAttemptRef.current.has(aiAttemptKey)) return;
    aiAutoInitAttemptRef.current.add(aiAttemptKey);

    carregarAiAnalise(avaliacaoDetalhadaItem.codigo, { autoInit: true, origem: avaliacaoDetalhadaOrigem }).catch((err) => {
      const message = err?.response?.data?.error || (err instanceof Error ? err.message : "Erro ao iniciar avaliação IA");
      setMensagem(message);
      setAvaliacaoDetalhadaStatusState(
        buildAiErrorStatusState(message, { fallbackPrefix: "IA", retryAction: "analise_inicial" })
      );
    });
  }, [avaliacaoDetalhadaItem, avaliacaoDetalhadaTab, avaliacaoDetalhadaOrigem, aiAnalise, aiLoading, aiSending, user, carregarAiAnalise, setAvaliacaoDetalhadaStatusState]);

  useEffect(() => {
    if (!avaliacaoDetalhadaItem || avaliacaoDetalhadaTab !== "matricula") return;
    if (aiLoading || aiSending || matriculaLoading) return;
    if (aiAnalise) return;
    carregarAiAnalise(avaliacaoDetalhadaItem.codigo, { autoInit: false, origem: avaliacaoDetalhadaOrigem }).catch((err) => {
      const message = err?.response?.data?.error || (err instanceof Error ? err.message : "Erro ao carregar matrícula");
      setMensagem(message);
      setAvaliacaoDetalhadaStatusState(
        buildAiErrorStatusState(message, { fallbackPrefix: "Matrícula", retryAction: "matricula" })
      );
    });
  }, [
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

  const canDeleteItem = (item) => {
    if (!user) return false;
    if (user.role === "admin") return true;
    if (!item?.createdBy) return false;
    return String(item.createdBy) === String(user.id);
  };

  const canReactivateItem = (item) => Boolean(user?.role === "admin" && item && !isSelecionadoAtivo(item));

  const selectedPrimaryStatLabel = useMemo(() => {
    if (selectedActivityFilter === "inativos") return "Inativos";
    if (selectedActivityFilter === "todos") return "Selecionados";
    return "Na fila";
  }, [selectedActivityFilter]);

  const selectedHasFilters = useMemo(() => (
    selectedSearch.trim() !== "" ||
    selectedUfFilter !== "todos" ||
    selectedPrioridadeFilter !== "todas" ||
    selectedActivityFilter !== "ativos" ||
    selectedResponsavelFilter !== "todos" ||
    selectedUserFilter !== "todos" ||
    selectedSortBy !== "dataLeilao" ||
    selectedSortDir !== "asc"
  ), [
    selectedSearch,
    selectedUfFilter,
    selectedPrioridadeFilter,
    selectedActivityFilter,
    selectedResponsavelFilter,
    selectedUserFilter,
    selectedSortBy,
    selectedSortDir,
  ]);
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
    setTopbarContent(
      <div className="prospects-header-summary prospects-header-summary--topbar">
        <div className="prospects-stat-card">
          <span>{selectedPrimaryStatLabel}</span>
          <strong>{selectedBaseDados.length}</strong>
        </div>
        <div className="prospects-stat-card">
          <span>Alta prioridade</span>
          <strong>{selectedMetrics.altaPrioridade}</strong>
        </div>
        <div className="prospects-stat-card">
          <span>Sem responsável</span>
          <strong>{selectedMetrics.semResponsavel}</strong>
        </div>
      </div>
    );
    return () => setTopbarContent(null);
  }, [mobileAccess, selectedBaseDados.length, selectedMetrics.altaPrioridade, selectedMetrics.semResponsavel, selectedPrimaryStatLabel, setTopbarContent]);

  return (
    <div className="prospects-page">
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
        <>

      <div className="prospects-tabs" role="tablist" aria-label="Navegação de prospecções">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "capturados"}
          className={`prospects-tab ${activeTab === "capturados" ? "is-active" : ""}`}
          onClick={() => setActiveTab("capturados")}
        >
          <span>Base completa</span>
          <strong>{capturadosTotal}</strong>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "selecionados"}
          className={`prospects-tab ${activeTab === "selecionados" ? "is-active" : ""}`}
          onClick={() => setActiveTab("selecionados")}
        >
          <span>Selecionados</span>
          <strong>{selectedMetrics.ativos}</strong>
        </button>
      </div>

      {activeTab === "selecionados" ? (
        <>
          <section className="prospects-card prospects-card--command">
            <div className="prospects-card__header prospects-card__header--stacked">
              <div>
                <p className="prospects-eyebrow">Filtros da fila</p>
                <h2 className="prospects-title">Explorar fila</h2>
                <p className="prospects-subtitle prospects-subtitle--compact">
                  Refine a visão operacional por busca, usuário, prioridade e ordenação.
                </p>
              </div>
              <div className="prospects-card__header-actions">
                <span className="prospects-pill">{selecionadosFiltradosOrdenados.length} na visão</span>
                <span className="prospects-pill prospects-pill--muted">{selectedMetrics.comAnalise} com análise</span>
                {user?.role === "admin" ? (
                  <span className="prospects-pill prospects-pill--muted">{selectedMetrics.inativos} inativos</span>
                ) : null}
              </div>
            </div>
            <div className="prospects-selected-toolbar">
              <div className="prospects-selected-toolbar__summary">
                <div className="prospects-selected-toolbar__stats">
                  <span><strong>{selecionadosFiltradosOrdenados.length}</strong> na visão</span>
                  <span><strong>{selectedMetrics.comAnalise}</strong> com análise</span>
                  {user?.role === "admin" ? <span><strong>{selectedMetrics.inativos}</strong> inativos</span> : null}
                </div>
                <div className="prospects-selected-toolbar__actions">
                  <button
                    type="button"
                    className={`prospects-btn secondary ${selectedFiltersExpanded ? "is-active" : ""}`.trim()}
                    onClick={() => setSelectedFiltersExpanded((prev) => !prev)}
                  >
                    {selectedFiltersExpanded ? "Ocultar filtros" : "Mostrar filtros"}
                    {selectedHasFilters ? " ativos" : ""}
                  </button>
                  <button
                    type="button"
                    className="prospects-btn tertiary prospects-btn--toolbar"
                    onClick={() => {
                      setSelectedSearch("");
                      setSelectedUfFilter("todos");
                      setSelectedPrioridadeFilter("todas");
                      setSelectedActivityFilter("ativos");
                      setSelectedResponsavelFilter("todos");
                      setSelectedUserFilter("todos");
                      setSelectedSortBy("dataLeilao");
                      setSelectedSortDir("asc");
                    }}
                    disabled={!selectedHasFilters}
                  >
                    Limpar visão
                  </button>
                </div>
              </div>

              {selectedFiltersExpanded ? (
                <div className="prospects-toolbar prospects-toolbar--selected">
                  <label className="prospects-toolbar-field prospects-toolbar-field--search">
                    <span>Buscar</span>
                    <input
                      type="search"
                      value={selectedSearch}
                      onChange={(e) => setSelectedSearch(e.target.value)}
                      placeholder="Código, cidade, autor, responsável ou descrição"
                    />
                  </label>
                  <label className="prospects-toolbar-field">
                    <span>UF</span>
                    <select value={selectedUfFilter} onChange={(e) => setSelectedUfFilter(e.target.value)}>
                      <option value="todos">Todas</option>
                      {selectedUfOptions.map((uf) => (
                        <option key={uf} value={uf}>{uf}</option>
                      ))}
                    </select>
                  </label>
                  <label className="prospects-toolbar-field">
                    <span>Prioridade</span>
                    <select value={selectedPrioridadeFilter} onChange={(e) => setSelectedPrioridadeFilter(e.target.value)}>
                      <option value="todas">Todas</option>
                      {PRIORIDADE_OPTIONS.map((option) => (
                        <option key={option.value} value={String(option.value)}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                  {user?.role === "admin" ? (
                    <label className="prospects-toolbar-field">
                      <span>Estado</span>
                      <select value={selectedActivityFilter} onChange={(e) => setSelectedActivityFilter(e.target.value)}>
                        <option value="ativos">Ativos</option>
                        <option value="inativos">Inativos</option>
                        <option value="todos">Todos</option>
                      </select>
                    </label>
                  ) : null}
                  <label className="prospects-toolbar-field">
                    <span>Responsáveis</span>
                    <select value={selectedResponsavelFilter} onChange={(e) => setSelectedResponsavelFilter(e.target.value)}>
                      <option value="todos">Todos</option>
                      <option value="com">Com responsáveis</option>
                      <option value="sem">Sem responsáveis</option>
                      <option value="meus">Atribuídos a mim</option>
                    </select>
                  </label>
                  {user?.role === "admin" ? (
                    <label className="prospects-toolbar-field">
                      <span>Usuário</span>
                      <select value={selectedUserFilter} onChange={(e) => setSelectedUserFilter(e.target.value)}>
                        <option value="todos">Todos</option>
                        {selectedUserOptions.map((option) => (
                          <option key={option.id} value={option.id}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  <label className="prospects-toolbar-field">
                    <span>Ordenar por</span>
                    <select value={selectedSortBy} onChange={(e) => setSelectedSortBy(e.target.value)}>
                      <option value="dataLeilao">Data do leilão</option>
                      <option value="prioridade">Prioridade</option>
                      <option value="cidade">Cidade</option>
                      <option value="valorMaximo">Valor máximo</option>
                      <option value="roi">ROI</option>
                    </select>
                  </label>
                  <label className="prospects-toolbar-field">
                    <span>Direção</span>
                    <select value={selectedSortDir} onChange={(e) => setSelectedSortDir(e.target.value)}>
                      <option value="asc">Crescente</option>
                      <option value="desc">Decrescente</option>
                    </select>
                  </label>
                </div>
              ) : null}
            </div>
          </section>

          <TabelaSelecionados
            dados={selecionadosFiltradosOrdenados}
            loading={loadingSel}
            erro={erroSel}
            onExcluir={setConfirmDeleteItem}
            onReativar={handleReativarSelecionado}
            onEditarPrioridade={openPrioridadeModal}
            onEditarObservacoes={openObservacoesModal}
            onAbrirAnalise={openAnaliseModal}
            onAbrirEnriquecimentos={openAvaliacaoAutomaticaModal}
            onAbrirAvaliacaoDetalhada={openAvaliacaoDetalhadaModal}
            onAcionarAnaliseIa={handleAcionarAnaliseIa}
            onEditarResponsaveis={openResponsaveisModal}
            onIncluirManual={openIncluirManualModal}
            removeLoadingIds={removeLoadingIds}
            updateLoadingIds={updateLoadingIds}
            canDeleteItem={canDeleteItem}
            canOperateItem={canOperateItem}
            canManageResponsaveis={canManageResponsaveis}
            canReactivateItem={canReactivateItem}
            collapsed={selecionadosCollapsed}
            onToggleCollapse={() => setSelecionadosCollapsed((prev) => !prev)}
            sortLabel={selectedSortLabel}
            getLeilaoResumo={getLeilaoResumo}
            getMapsUrl={getMapsUrl}
            getComparaveisLinks={getComparaveisLinks}
            isSelecionadoAtivo={isSelecionadoAtivo}
            formatarDataHoraCompacta={formatarDataHoraCompacta}
            formatarMoeda={formatarMoeda}
            resumirObservacao={resumirObservacao}
            obterClasseRoi={obterClasseRoi}
            formatarPercentual={formatarPercentual}
            getAnaliseIaActionLabel={getAnaliseIaActionLabel}
          />
        </>
      ) : (
        <>
          <section className="prospects-card prospects-card--command">
            <div className="prospects-card__header prospects-card__header--stacked">
              <div>
                <p className="prospects-eyebrow">Base capturada</p>
                <h2 className="prospects-title">Explorar oportunidades</h2>
                <p className="prospects-subtitle prospects-subtitle--compact">
                  Clique no imóvel para abrir o anúncio. A pré-análise serve como leitura inicial antes da análise manual.
                </p>
              </div>
              <div className="prospects-card__header-actions">
                <span className="prospects-pill">{capturadosTotal} imóveis</span>
                <span className="prospects-pill prospects-pill--muted">{selectedCodes.size} na fila</span>
              </div>
            </div>
            <div className="prospects-captured-toolbar">
              <div className="prospects-captured-toolbar__quick">
                <label className="prospects-toolbar-field">
                  <span>Origem</span>
                  <select
                    value={filtroFonteCap}
                    onChange={(e) => {
                      setFiltroFonteCap(e.target.value);
                      setPage(1);
                    }}
                  >
                    {FONTE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <label className="prospects-toolbar-field">
                  <span>Itens por página</span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setPage(1);
                    }}
                  >
                    {pageSizeOptions.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </label>
                <label className="prospects-toolbar-field">
                  <span>Financia</span>
                  <select
                    value={filtroFinanciaCap[0] || ""}
                    onChange={(e) => {
                      setFiltroFinanciaCap(e.target.value ? [e.target.value] : []);
                      setPage(1);
                    }}
                  >
                    <option value="">Todos</option>
                    <option value="sim">Sim</option>
                    <option value="nao">Não</option>
                  </select>
                </label>
                <label className="prospects-toolbar-field">
                  <span>Score mínimo</span>
                  <input
                    type="number"
                    min="0"
                    max="85"
                    value={scoreMinCap}
                    onChange={(e) => {
                      setScoreMinCap(e.target.value);
                      setPage(1);
                    }}
                    placeholder="0 a 85"
                  />
                </label>
                <label className="prospects-toolbar-field">
                  <span>ROI mínimo (%)</span>
                  <input
                    type="number"
                    value={roiMinCap}
                    onChange={(e) => {
                      setRoiMinCap(e.target.value);
                      setPage(1);
                    }}
                    placeholder="Ex.: 8"
                  />
                </label>
                <div className="prospects-captured-toolbar__actions">
                  <div className="prospects-captured-toolbar__summary-inline">
                    <span><strong>{capturados.length}</strong> na visão</span>
                    <span><strong>{capturadosTotal}</strong> capturados</span>
                    <span><strong>{selectedCodes.size}</strong> na fila</span>
                  </div>
                  <button
                    type="button"
                    className={`prospects-btn secondary ${capturadosFiltersExpanded ? "is-active" : ""}`.trim()}
                    onClick={() => setCapturadosFiltersExpanded((prev) => !prev)}
                  >
                    {capturadosFiltersExpanded ? "Ocultar refinamentos" : "Refinar localização"}
                    {capturadosAdvancedFiltersCount ? ` (${capturadosAdvancedFiltersCount})` : ""}
                  </button>
                  <button
                    type="button"
                    className="prospects-btn secondary"
                    onClick={limparFiltros}
                    disabled={!capturadosHasFilters}
                  >
                    Limpar filtros
                  </button>
                </div>
              </div>

              {capturadosVisibleActiveFilters.length ? (
                <div className="prospects-captured-toolbar__active">
                  {capturadosVisibleActiveFilters.map((label) => (
                    <span key={label} className="prospects-inline-link">{label}</span>
                  ))}
                </div>
              ) : null}

              {capturadosFiltersExpanded ? (
                <div className="prospects-captured-toolbar__advanced">
                  <div className="prospects-filter-panel prospects-filter-panel--uf">
                    <div className="prospects-filter-panel__head">
                      <span>UF</span>
                      <strong>{filtroUfCap.length ? `${filtroUfCap.length} selecionadas` : "Todas"}</strong>
                    </div>
                    <div className="prospects-filter-chip-grid">
                      {ufOptions.map((uf) => (
                        <button
                          key={uf}
                          type="button"
                          className={`prospects-filter-chip ${filtroUfCap.includes(uf) ? "is-active" : ""}`}
                          onClick={() => toggleValue(uf, setFiltroUfCap)}
                        >
                          {uf}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="prospects-filter-panel prospects-filter-panel--cidade">
                    <div className="prospects-filter-panel__head">
                      <span>Cidade</span>
                      <strong>{filtroCidadesCap.length ? `${filtroCidadesCap.length} selecionadas` : "Todas"}</strong>
                    </div>
                    <label className="prospects-toolbar-field prospects-toolbar-field--checklist">
                      <input
                        type="search"
                        value={capturadosCitySearch}
                        onChange={(e) => setCapturadosCitySearch(e.target.value)}
                        placeholder="Buscar cidade"
                      />
                    </label>
                    {filtroCidadesCap.length ? (
                      <div className="prospects-mobile-city-selected">
                        {filtroCidadesCap.map((cidade) => (
                          <button
                            key={cidade}
                            type="button"
                            className="prospects-mobile-city-chip is-selected"
                            onClick={() => toggleValue(cidade, setFiltroCidadesCap)}
                          >
                            <span>{cidade}</span>
                            <strong>x</strong>
                          </button>
                        ))}
                      </div>
                    ) : null}
                    <div className="prospects-mobile-city-grid">
                      {cidadesCapturadasVisiveis.map((cidade) => (
                        <button
                          key={cidade}
                          type="button"
                          className={`prospects-mobile-city-chip ${filtroCidadesCap.includes(cidade) ? "is-selected" : ""}`}
                          onClick={() => toggleValue(cidade, setFiltroCidadesCap)}
                        >
                          <span>{cidade}</span>
                          {filtroCidadesCap.includes(cidade) ? <strong>x</strong> : null}
                        </button>
                      ))}
                      {!cidadesCapturadasVisiveis.length ? (
                        <p className="prospects-empty prospects-empty--inline">Nenhuma cidade encontrada.</p>
                      ) : null}
                    </div>
                  </div>

                  <div className="prospects-filter-panel prospects-filter-panel--modalidade">
                    <div className="prospects-filter-panel__head">
                      <span>Modalidade</span>
                      <strong>{filtroModalidadeCap.length ? `${filtroModalidadeCap.length} selecionadas` : "Todas"}</strong>
                    </div>
                    <div className="prospects-filter-chip-grid">
                      {modalidadeOptions.map((modalidade) => (
                        <button
                          key={modalidade}
                          type="button"
                          className={`prospects-filter-chip ${filtroModalidadeCap.includes(modalidade) ? "is-active" : ""}`}
                          onClick={() => toggleValue(modalidade, setFiltroModalidadeCap)}
                        >
                          {modalidade}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="prospects-filter-panel prospects-filter-panel--financia">
                    <div className="prospects-filter-panel__head">
                      <span>Filtros complementares</span>
                      <strong>{somenteComAvaliacaoCap ? "Pré-análise ativa" : "Opcional"}</strong>
                    </div>
                    <label className="prospects-check prospects-check--panel">
                      <input
                        type="checkbox"
                        checked={somenteComAvaliacaoCap}
                        onChange={(e) => {
                          setSomenteComAvaliacaoCap(e.target.checked);
                          setPage(1);
                        }}
                      />
                      <span>Mostrar só imóveis com pré-análise</span>
                    </label>
                  </div>
                </div>
              ) : null}
            </div>
          </section>
          <TabelaCapturados
            dados={capturados}
            total={capturadosTotal}
            page={page}
            pageSize={pageSize}
            loading={loadingCap}
            erro={erroCap}
            onIncluir={handleIncluir}
            includeLoadingIds={includeLoadingIds}
            onPageChange={handlePageChange}
            sortBy={sortBy}
            sortDir={sortDir}
            onSortChange={handleSortChange}
            selectedCodes={selectedCodes}
            onAbrirAvaliacao={openAvaliacaoAutomaticaModal}
            onAbrirAvaliacaoDetalhada={openAvaliacaoDetalhadaModal}
            onAbrirAnalise={openAnaliseModal}
            getLeilaoResumo={getLeilaoResumo}
            calcularDescontoExibicao={calcularDescontoExibicao}
            getMapsUrl={getMapsUrl}
            getComparaveisLinks={getComparaveisLinks}
            extrairEditalUrl={extrairEditalUrl}
            getFonteLabel={getFonteLabel}
            extrairProcessoNumero={extrairProcessoNumero}
            formatarPercentual={formatarPercentual}
            formatarMoeda={formatarMoeda}
            formatarDataHoraCompacta={formatarDataHoraCompacta}
            getScoreClasse={getScoreClasse}
            getRoiClasse={getRoiClasse}
          />
        </>
      )}
        </>
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
        item={avaliacaoDetalhadaItem}
        tab={avaliacaoDetalhadaTab}
        aiAnalise={aiAnalise}
        analiseDetalhada={analiseDetalhada}
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
        onTabChange={setAvaliacaoDetalhadaTab}
        onClose={closeAvaliacaoDetalhadaModal}
        onEnviarMensagem={handleEnviarMensagemAi}
        onGerarAnaliseInicial={handleGerarAnaliseInicialAi}
        onSalvarSintese={handleSalvarAiSintese}
        onSolicitarMatricula={handleSolicitarMatricula}
        onSolicitarEnriquecimento={handleSolicitarEnriquecimento}
        onAbrirAnalise={openAnaliseModal}
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
