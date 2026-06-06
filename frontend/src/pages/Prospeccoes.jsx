import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
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

const getProspectPhotoAlt = (item) => {
  const local = [item?.bairro, item?.cidade, item?.uf].filter(Boolean).join(" - ");
  return local ? `Foto do imóvel em ${local}` : `Foto do imóvel ${item?.codigo || ""}`.trim();
};

function ProspectPhoto({ item, className = "" }) {
  if (item?.fotoUrl) {
    return (
      <img
        className={className}
        src={item.fotoUrl}
        alt={getProspectPhotoAlt(item)}
        loading="lazy"
      />
    );
  }

  return (
    <div className={`${className} prospects-photo-placeholder`.trim()} aria-hidden="true">
      <span>{item?.tipoImovel || "Imóvel"}</span>
      <strong>{item?.uf || "Sem foto"}</strong>
    </div>
  );
}

function ProspectGallery({ item, className = "", compact = false }) {
  const fotos = Array.isArray(item?.fotos) ? item.fotos.filter(Boolean) : [];
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    setCurrentIndex(0);
  }, [item?.codigo, fotos.length]);

  if (!fotos.length) {
    return <ProspectPhoto item={item} className={className} />;
  }

  const fotoAtual = fotos[Math.min(currentIndex, fotos.length - 1)];
  const irPara = (index) => {
    if (!fotos.length) return;
    const next = (index + fotos.length) % fotos.length;
    setCurrentIndex(next);
  };

  return (
    <div className={`prospects-gallery ${compact ? "is-compact" : ""}`.trim()}>
      <img
        className={className}
        src={fotoAtual}
        alt={getProspectPhotoAlt(item)}
        loading="lazy"
      />
      {fotos.length > 1 ? (
        <>
          <div className="prospects-gallery__counter">{currentIndex + 1}/{fotos.length}</div>
          <button
            type="button"
            className="prospects-gallery__nav is-prev"
            onClick={(e) => {
              e.stopPropagation();
              irPara(currentIndex - 1);
            }}
            aria-label="Foto anterior"
          >
            ‹
          </button>
          <button
            type="button"
            className="prospects-gallery__nav is-next"
            onClick={(e) => {
              e.stopPropagation();
              irPara(currentIndex + 1);
            }}
            aria-label="Próxima foto"
          >
            ›
          </button>
          {!compact ? (
            <div className="prospects-gallery__dots">
              {fotos.map((foto, index) => (
                <button
                  key={`${foto}-${index}`}
                  type="button"
                  className={`prospects-gallery__dot ${index === currentIndex ? "is-active" : ""}`.trim()}
                  onClick={(e) => {
                    e.stopPropagation();
                    irPara(index);
                  }}
                  aria-label={`Ir para foto ${index + 1}`}
                />
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function DetalhesTexto({ texto, className = "" }) {
  if (!texto) return null;
  const linhas = `${texto}`.split("\n").map((linha) => linha.trim()).filter(Boolean);
  if (!linhas.length) return null;
  return (
    <div className={className}>
      {linhas.map((linha, index) => {
        const urlMatch = linha.match(/(https?:\/\/\S+)/);
        if (!urlMatch) {
          return <p key={`${linha}-${index}`}>{linha}</p>;
        }
        const url = urlMatch[0];
        const start = linha.indexOf(url);
        const antes = linha.slice(0, start);
        const depois = linha.slice(start + url.length);
        return (
          <p key={`${linha}-${index}`}>
            {antes}
            <a href={url} target="_blank" rel="noreferrer">{url}</a>
            {depois}
          </p>
        );
      })}
    </div>
  );
}

const renderTextoInline = (texto) => {
  const partes = `${texto || ""}`.split(/(\[[^\]]+\]\([^)]+\)|`[^`]+`|\*\*[^*]+\*\*)/g).filter(Boolean);
  return partes.map((parte, index) => {
    const markdownLinkMatch = parte.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (markdownLinkMatch) {
      return (
        <a key={`${parte}-${index}`} href={markdownLinkMatch[2]} target="_blank" rel="noreferrer">
          {markdownLinkMatch[1]}
        </a>
      );
    }
    if (parte.startsWith("`") && parte.endsWith("`")) {
      return <code key={`${parte}-${index}`}>{parte.slice(1, -1)}</code>;
    }
    if (parte.startsWith("**") && parte.endsWith("**")) {
      return <strong key={`${parte}-${index}`}>{parte.slice(2, -2)}</strong>;
    }
    return <React.Fragment key={`${parte}-${index}`}>{parte}</React.Fragment>;
  });
};

const isMarkdownTableBlock = (linhas) => {
  if (!Array.isArray(linhas) || linhas.length < 2) return false;
  const [header, separator] = linhas;
  if (!header.includes("|")) return false;
  return /^\|?[\s:-|]+\|?$/.test(separator);
};

const parseMarkdownTableRow = (linha) => linha
  .trim()
  .replace(/^\|/, "")
  .replace(/\|$/, "")
  .split("|")
  .map((coluna) => coluna.trim());

function TextoEstruturado({ texto, className = "" }) {
  const bruto = `${texto || ""}`.trim();
  if (!bruto) return null;

  const blocos = bruto.split(/\n\s*\n/).map((bloco) => bloco.trim()).filter(Boolean);

  return (
    <div className={`prospects-rich-text ${className}`.trim()}>
      {blocos.map((bloco, blocoIndex) => {
        const linhas = bloco.split("\n").map((linha) => linha.trim()).filter(Boolean);
        if (!linhas.length) return null;

        const todosBullet = linhas.every((linha) => /^[-*]\s+/.test(linha));
        if (todosBullet) {
          return (
            <ul key={`b-${blocoIndex}`}>
              {linhas.map((linha, linhaIndex) => <li key={`l-${blocoIndex}-${linhaIndex}`}>{renderTextoInline(linha.replace(/^[-*]\s+/, ""))}</li>)}
            </ul>
          );
        }

        const todosNumerados = linhas.every((linha) => /^\d+[.)]\s+/.test(linha));
        if (todosNumerados) {
          return (
            <ol key={`o-${blocoIndex}`}>
              {linhas.map((linha, linhaIndex) => <li key={`l-${blocoIndex}-${linhaIndex}`}>{renderTextoInline(linha.replace(/^\d+[.)]\s+/, ""))}</li>)}
            </ol>
          );
        }

        if (linhas.length === 1 && /^#{1,3}\s+/.test(linhas[0])) {
          return <h5 key={`h-${blocoIndex}`}>{renderTextoInline(linhas[0].replace(/^#{1,3}\s+/, ""))}</h5>;
        }

        if (isMarkdownTableBlock(linhas)) {
          const [header, , ...rows] = linhas;
          const headers = parseMarkdownTableRow(header);
          const bodyRows = rows
            .map(parseMarkdownTableRow)
            .filter((row) => row.some(Boolean));

          return (
            <div key={`t-${blocoIndex}`} className="prospects-rich-text__table-wrap">
              <table className="prospects-rich-text__table">
                <thead>
                  <tr>
                    {headers.map((cell, index) => (
                      <th key={`th-${blocoIndex}-${index}`}>{renderTextoInline(cell || "—")}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {bodyRows.map((row, rowIndex) => (
                    <tr key={`tr-${blocoIndex}-${rowIndex}`}>
                      {headers.map((_, cellIndex) => (
                        <td key={`td-${blocoIndex}-${rowIndex}-${cellIndex}`}>
                          {renderTextoInline(row[cellIndex] || "—")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        return (
          <div key={`p-${blocoIndex}`} className="prospects-rich-text__block">
            {linhas.map((linha, linhaIndex) => {
              if (/^#{1,3}\s+/.test(linha)) {
                return <h5 key={`h-${blocoIndex}-${linhaIndex}`}>{renderTextoInline(linha.replace(/^#{1,3}\s+/, ""))}</h5>;
              }
              return <p key={`p-${blocoIndex}-${linhaIndex}`}>{renderTextoInline(linha)}</p>;
            })}
          </div>
        );
      })}
    </div>
  );
}

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

function IconBase({ children, label }) {
  return (
    <svg viewBox="0 0 24 24" role="img" aria-label={label} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

function NoteIcon() {
  return (
    <IconBase label="Observações">
      <path d="M8 3.5h8l4 4V19a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5.5a2 2 0 0 1 2-2Z" />
      <path d="M16 3.5V8h4" />
      <path d="M9 12h6" />
      <path d="M9 16h4" />
    </IconBase>
  );
}

function UsersIcon() {
  return (
    <IconBase label="Responsáveis">
      <path d="M16 21v-1.5a3.5 3.5 0 0 0-3.5-3.5h-1A3.5 3.5 0 0 0 8 19.5V21" />
      <circle cx="12" cy="9" r="3" />
      <path d="M19 21v-1a3 3 0 0 0-2.2-2.9" />
      <path d="M17 5.5a2.5 2.5 0 0 1 0 5" />
    </IconBase>
  );
}

function PriorityIcon({ level = 2 }) {
  const activeLevel = Number(level) || 2;
  return (
    <IconBase label={`Prioridade ${activeLevel}`}>
      <path d="M6 18.5h12" opacity="0.35" />
      <path d="M8 17v-3.5" opacity={activeLevel >= 1 ? "1" : "0.22"} />
      <path d="M12 17V10.5" opacity={activeLevel >= 2 ? "1" : "0.22"} />
      <path d="M16 17V7.5" opacity={activeLevel >= 3 ? "1" : "0.22"} />
    </IconBase>
  );
}

function ChartIcon() {
  return (
    <IconBase label="Análise financeira">
      <path d="M4 19h16" />
      <path d="M7 16v-4" />
      <path d="M12 16V8" />
      <path d="M17 16v-7" />
    </IconBase>
  );
}

function TrashIcon() {
  return (
    <IconBase label="Remover">
      <path d="M4 7h16" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      <path d="M7 7l1 12a1 1 0 0 0 1 .9h6a1 1 0 0 0 1-.9L17 7" />
      <path d="M10 11v5" />
      <path d="M14 11v5" />
    </IconBase>
  );
}

function EyeIcon({ closed = false }) {
  return (
    <IconBase label={closed ? "Mostrar selecionados" : "Ocultar selecionados"}>
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
      {closed ? <path d="M4 4l16 16" /> : null}
    </IconBase>
  );
}

function FinanceIcon() {
  return (
    <IconBase label="Controle financeiro">
      <rect x="3.5" y="6" width="17" height="12.5" rx="2" />
      <path d="M3.5 10h17" />
      <path d="M7 15h4" />
      <path d="M16.5 4.5v3" />
      <path d="M7.5 4.5v3" />
    </IconBase>
  );
}

function QueueIcon() {
  return (
    <IconBase label="Selecionados para prospecção">
      <path d="M4 6.5h16" />
      <path d="M4 12h16" />
      <path d="M4 17.5h10" />
      <circle cx="18" cy="17.5" r="2" />
    </IconBase>
  );
}

function ProspectIcon() {
  return (
    <IconBase label="Prospectar imóveis">
      <path d="M10.5 4.5H6.5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-4" />
      <path d="M14.5 4.5h5v5" />
      <path d="m19.5 4.5-7.5 7.5" />
      <path d="M10 12.5h4" />
      <path d="M12 10.5v4" />
    </IconBase>
  );
}

function ArrowLeftIcon() {
  return (
    <IconBase label="Voltar">
      <path d="M19 12H5" />
      <path d="m11 18-6-6 6-6" />
    </IconBase>
  );
}

function MoreIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="5" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="19" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

function ArrowUpRightIcon() {
  return (
    <IconBase label="Abrir módulo">
      <path d="M8 16 16 8" />
      <path d="M10 8h6v6" />
    </IconBase>
  );
}

function MapPinIcon() {
  return (
    <IconBase label="Abrir no mapa">
      <path d="M12 20s6-4.8 6-10a6 6 0 1 0-12 0c0 5.2 6 10 6 10Z" />
      <circle cx="12" cy="10" r="2.2" />
    </IconBase>
  );
}

function SparklesIcon() {
  return (
    <IconBase label="Indicador">
      <path d="m12 3 1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3Z" />
      <path d="m18.5 15 .7 2.1 2.1.7-2.1.7-.7 2.1-.7-2.1-2.1-.7 2.1-.7.7-2.1Z" />
    </IconBase>
  );
}

function CloseIcon() {
  return (
    <IconBase label="Fechar">
      <path d="M6 6l12 12" />
      <path d="M18 6 6 18" />
    </IconBase>
  );
}

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

function TabelaSelecionados({
  dados,
  loading,
  erro,
  onExcluir,
  onReativar,
  onAcionarAnaliseIa,
  onEditarObservacoes,
  onAbrirAnalise,
  onAbrirEnriquecimentos,
  onEditarResponsaveis,
  onEditarPrioridade,
  onIncluirManual,
  removeLoadingIds,
  updateLoadingIds,
  canDeleteItem,
  canOperateItem,
  canManageResponsaveis,
  canReactivateItem,
  collapsed,
  onToggleCollapse,
  sortLabel,
}) {
  const [openActionMenuCodigo, setOpenActionMenuCodigo] = useState(null);

  useEffect(() => {
    if (!openActionMenuCodigo) return undefined;
    const handlePointerDown = (event) => {
      if (event.target.closest("[data-row-menu-root='true']")) return;
      setOpenActionMenuCodigo(null);
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [openActionMenuCodigo]);

  if (loading) return <div className="prospects-card"><p className="prospects-empty">Carregando selecionados...</p></div>;
  if (erro) return <div className="prospects-card"><p className="prospects-empty">Erro ao carregar selecionados: {erro}</p></div>;

  return (
    <div className="prospects-card">
      <div className="prospects-card__header">
        <div>
          <p className="prospects-eyebrow">Fila de decisão</p>
          <h2 className="prospects-title">Itens da fila</h2>
          <p className="prospects-subtitle prospects-subtitle--compact">
            {sortLabel}
          </p>
        </div>
        <div className="prospects-card__header-actions">
          <span className="prospects-pill">{dados.length} imóveis</span>
          {onIncluirManual ? (
            <button type="button" className="prospects-btn tertiary prospects-btn--toolbar" onClick={onIncluirManual}>
              Adicionar manual
            </button>
          ) : null}
          <button
            type="button"
            className="prospects-visibility-btn"
            onClick={onToggleCollapse}
            title={collapsed ? "Mostrar selecionados" : "Ocultar selecionados"}
            aria-label={collapsed ? "Mostrar selecionados" : "Ocultar selecionados"}
            aria-pressed={collapsed}
          >
            <EyeIcon closed={collapsed} />
          </button>
        </div>
      </div>
      {!dados.length && <p className="prospects-empty">Nenhum item da fila encontrado.</p>}
      {!dados.length || collapsed ? null : (
      <div className="prospects-table-wrap">
        <table className="prospects-table">
          <thead>
            <tr>
              <th>Código</th>
              <th className="prospects-col-city">Cidade / UF</th>
              <th>Data leilão</th>
              <th>Valor máximo</th>
              <th>Valor referência</th>
              <th className="prospects-col-description">Descrição</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {dados.map((item) => {
              const resumoLeilao = getLeilaoResumo(item);
              const mapsUrl = getMapsUrl(item);
              const comparaveis = getComparaveisLinks(item);
              const itemAtivo = isSelecionadoAtivo(item);
              const podeOperar = itemAtivo && canOperateItem(item);
              const podeExcluir = itemAtivo && canDeleteItem(item);
              const podeReativar = !itemAtivo && canReactivateItem(item);
              const podeGerenciarResponsaveis = itemAtivo && canManageResponsaveis;
              const actionMenuAberto = openActionMenuCodigo === item.codigo;
              const responsaveisResumo = (() => {
                const pessoas = [];
                const seen = new Set();
                const addPessoa = (id, label, suffix = "") => {
                  const normalizedId = id ? String(id) : "";
                  const normalizedLabel = `${label || ""}`.trim();
                  const key = normalizedId || normalizedLabel.toLowerCase();
                  if (!key || seen.has(key)) return;
                  seen.add(key);
                  pessoas.push(`${normalizedLabel}${suffix}`);
                };
                addPessoa(item.createdBy, item.createdByName, item.createdByName ? " (selecionou)" : "");
                (item.responsaveis || []).forEach((responsavel) => {
                  addPessoa(responsavel.id, responsavel.name || responsavel.email);
                });
                return pessoas.length ? pessoas.join(", ") : "Sem responsáveis definidos.";
              })();
              return (
              <tr key={item.codigo}>
                <td className="mono">
                  <a className="prospects-link" href={item.link} target="_blank" rel="noreferrer">
                    {item.codigo}
                  </a>
                </td>
                <td className="prospects-col-city">
                  <div className="prospects-city-cell">
                    <strong>{item.cidade && item.uf ? `${item.cidade}/${item.uf}` : item.cidade || item.uf || "—"}</strong>
                    <div className="prospects-table-indicators">
                      {item.analiseSalva ? (
                        <span className="prospects-indicator-chip is-financeira" title="Análise financeira salva">
                          <ChartIcon />
                          <span>Financeira</span>
                        </span>
                      ) : null}
                      {item.avaliacaoAutomatica ? (
                        <span className="prospects-indicator-chip is-automatica" title="Pré-análise automática disponível">
                          <SparklesIcon />
                          <span>Pré-análise</span>
                        </span>
                      ) : null}
                      {item.analiseIaSalva ? (
                        <span className="prospects-indicator-chip is-ia" title="Avaliação IA salva">
                          <SparklesIcon />
                          <span>IA salva</span>
                        </span>
                      ) : null}
                      {!itemAtivo ? (
                        <span className="prospects-indicator-chip is-inactive" title="Item fora da fila ativa">
                          <span>Inativo</span>
                        </span>
                      ) : null}
                    </div>
                  </div>
                </td>
                <td>
                  <div className="prospects-date-cell">
                    <strong>{formatarDataHoraCompacta(resumoLeilao?.data || item.dataLeilao)}</strong>
                    <span>{resumoLeilao?.label || "Data principal"}</span>
                    {resumoLeilao?.valor !== null && resumoLeilao?.valor !== undefined ? (
                      <span>{formatarMoeda(resumoLeilao.valor)}</span>
                    ) : null}
                  </div>
                </td>
                <td>{formatarMoeda(item.valorMaximo)}</td>
                <td>{item.valor ? formatarMoeda(item.valor) : "—"}</td>
                <td className="prospects-col-description">
                  <div className="prospects-description-cell" title={item.descricao || "—"}>
                    {item.descricao || "—"}
                  </div>
                  {item.observacoes ? (
                    <div className="prospects-note-snippet" title={item.observacoes}>
                      <span>Observação atual</span>
                      <strong>{resumirObservacao(item.observacoes)}</strong>
                    </div>
                  ) : null}
                  <div className="prospects-inline-links">
                    {mapsUrl ? (
                      <a className="prospects-inline-link" href={mapsUrl} target="_blank" rel="noreferrer">
                        <MapPinIcon />
                        <span>Mapa</span>
                      </a>
                    ) : null}
                    {comparaveis.map((link) => (
                      <a key={`${item.codigo}-${link.label}`} className="prospects-inline-link" href={link.url} target="_blank" rel="noreferrer">
                        <span>{link.label}</span>
                        <ArrowUpRightIcon />
                      </a>
                    ))}
                  </div>
                </td>
                <td>
                  <div className="prospects-row-actions">
                    <button
                      type="button"
                      className={`prospects-table-icon-btn prospects-table-icon-btn--note ${item.observacoes ? "has-note" : "is-empty"}`}
                      title={
                        !podeOperar
                          ? "Somente admin, autor ou responsável atribuído podem editar este imóvel"
                          : item.observacoes || "Nenhuma observação cadastrada."
                      }
                      onClick={() => onEditarObservacoes(item)}
                      disabled={updateLoadingIds.has(`${item.codigo}:observacoes`) || !podeOperar}
                    >
                      <NoteIcon />
                    </button>
                    <button
                      type="button"
                      className={`prospects-table-icon-btn prospects-table-icon-btn--analysis ${item.analiseSalva ? obterClasseRoi(item.roiEsperadoPercentual) : "is-neutral"}`}
                      title={
                        !podeOperar
                          ? "Somente admin, autor ou responsável atribuído podem editar este imóvel"
                          : item.analiseSalva
                            ? `Abrir análise financeira. ROI: ${formatarPercentual(item.roiEsperadoPercentual)}`
                            : "Abrir ficha de viabilidade"
                      }
                      onClick={() => onAbrirAnalise(item)}
                      disabled={!podeOperar}
                    >
                      <ChartIcon />
                    </button>
                    <div className="prospects-row-menu" data-row-menu-root="true">
                      <button
                        type="button"
                        className={`prospects-table-icon-btn prospects-table-icon-btn--menu ${actionMenuAberto ? "is-active" : ""}`.trim()}
                        title="Mais ações"
                        aria-label={`Mais ações do imóvel ${item.codigo}`}
                        aria-expanded={actionMenuAberto}
                        onClick={() => setOpenActionMenuCodigo((prev) => (prev === item.codigo ? null : item.codigo))}
                      >
                        <MoreIcon />
                      </button>
                      {actionMenuAberto ? (
                        <div className="prospects-row-menu__panel" role="menu" aria-label={`Ações do imóvel ${item.codigo}`}>
                          {mapsUrl ? (
                            <a
                              className="prospects-row-menu__item"
                              href={mapsUrl}
                              target="_blank"
                              rel="noreferrer"
                              role="menuitem"
                              onClick={() => setOpenActionMenuCodigo(null)}
                            >
                              <MapPinIcon />
                              <span>Abrir no mapa</span>
                            </a>
                          ) : null}
                          <button
                            type="button"
                            className="prospects-row-menu__item"
                            onClick={() => {
                              setOpenActionMenuCodigo(null);
                              onEditarPrioridade(item);
                            }}
                            disabled={updateLoadingIds.has(`${item.codigo}:prioridade`) || !podeOperar}
                          >
                            <PriorityIcon level={Number(item.prioridade || 2)} />
                            <span>Editar prioridade</span>
                          </button>
                          <button
                            type="button"
                            className="prospects-row-menu__item"
                            title={podeGerenciarResponsaveis ? `${responsaveisResumo} Clique para editar responsáveis.` : responsaveisResumo}
                            onClick={() => {
                              setOpenActionMenuCodigo(null);
                              if (podeGerenciarResponsaveis) onEditarResponsaveis(item);
                            }}
                            disabled={!itemAtivo}
                          >
                            <UsersIcon />
                            <span>{podeGerenciarResponsaveis ? "Editar responsáveis" : "Ver responsáveis"}</span>
                          </button>
                          <button
                            type="button"
                            className="prospects-row-menu__item"
                            onClick={() => {
                              setOpenActionMenuCodigo(null);
                              if (item.avaliacaoAutomatica) onAbrirEnriquecimentos(item);
                            }}
                            disabled={!item.avaliacaoAutomatica || !itemAtivo}
                          >
                            <SparklesIcon />
                            <span>Ver enriquecimentos</span>
                          </button>
                          <button
                            type="button"
                            className="prospects-row-menu__item"
                            aria-label={`${getAnaliseIaActionLabel(item)} do imóvel ${item.codigo}`}
                            onClick={() => {
                              setOpenActionMenuCodigo(null);
                              onAcionarAnaliseIa(item);
                            }}
                            disabled={!itemAtivo}
                          >
                            <SparklesIcon />
                            <span>{getAnaliseIaActionLabel(item)}</span>
                          </button>
                          {podeReativar ? (
                            <button
                              type="button"
                              className="prospects-row-menu__item"
                              title={item.inativadoPorName ? `Reativar item removido por ${item.inativadoPorName}` : "Reativar item"}
                              disabled={updateLoadingIds.has(`${item.codigo}:reativar`)}
                              onClick={() => {
                                setOpenActionMenuCodigo(null);
                                onReativar(item);
                              }}
                            >
                              <ArrowLeftIcon />
                              <span>Reativar item</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="prospects-row-menu__item is-danger"
                              title={podeExcluir ? "Remover da fila" : "Apenas o autor da seleção ou um administrador pode remover este imóvel"}
                              disabled={removeLoadingIds.has(item.codigo) || !podeExcluir}
                              onClick={() => {
                                setOpenActionMenuCodigo(null);
                                onExcluir(item);
                              }}
                            >
                              <TrashIcon />
                              <span>{removeLoadingIds.has(item.codigo) ? "Removendo..." : "Remover da fila"}</span>
                            </button>
                          )}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </td>
              </tr>
            )})}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
}

function ResponsaveisModal({
  item,
  responsaveisDisponiveis,
  selectedIds,
  saving,
  onToggle,
  onCancel,
  onSave,
}) {
  if (!item) return null;

  return (
    <div className="prospects-modal-backdrop" role="presentation">
      <div className="prospects-modal" role="dialog" aria-modal="true" aria-labelledby="responsaveis-title">
        <div className="prospects-modal__header">
          <div>
            <p className="prospects-eyebrow">Responsáveis</p>
            <h3 id="responsaveis-title" className="prospects-modal__title">Imóvel {item.codigo}</h3>
          </div>
        </div>
        <div className="prospects-modal__body">
          <p className="prospects-modal__hint">
            Selecione um ou mais prospectores que podem atuar neste imóvel.
          </p>
          {!responsaveisDisponiveis.length ? (
            <p className="prospects-empty">Nenhum prospector ativo disponível para atribuição.</p>
          ) : (
            <div className="prospects-checklist">
              {responsaveisDisponiveis.map((responsavel) => (
                <label key={responsavel.id} className="prospects-check">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(responsavel.id)}
                    onChange={() => onToggle(responsavel.id)}
                    disabled={saving}
                  />
                  <span>{responsavel.name || responsavel.email} ({responsavel.email})</span>
                </label>
              ))}
            </div>
          )}
        </div>
        <div className="prospects-modal__footer">
          <button type="button" className="prospects-btn secondary" onClick={onCancel} disabled={saving}>
            Fechar
          </button>
          <button type="button" className="prospects-btn primary" onClick={onSave} disabled={saving}>
            {saving ? "Salvando..." : "Salvar responsáveis"}
          </button>
        </div>
      </div>
    </div>
  );
}

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

function ConfirmarExclusaoModal({ item, loading, onCancel, onConfirm }) {
  if (!item) return null;

  return (
    <div className="prospects-modal-backdrop" role="presentation">
      <div className="prospects-modal" role="dialog" aria-modal="true" aria-labelledby="confirmar-exclusao-title">
        <div className="prospects-modal__header">
          <div>
            <p className="prospects-eyebrow">Confirmação</p>
            <h3 id="confirmar-exclusao-title" className="prospects-modal__title">Remover da fila</h3>
          </div>
        </div>
        <div className="prospects-modal__body">
          <p>
            O imóvel <strong>{item.codigo}</strong>
            {item.cidade || item.uf ? ` (${[item.cidade, item.uf].filter(Boolean).join("/")})` : ""}
            {" "}será removido apenas da fila de selecionados.
          </p>
          <p>O histórico capturado na prospecção continuará preservado.</p>
        </div>
        <div className="prospects-modal__footer">
          <button type="button" className="prospects-btn secondary" onClick={onCancel} disabled={loading}>
            Cancelar
          </button>
          <button type="button" className="prospects-btn danger" onClick={onConfirm} disabled={loading}>
            {loading ? "Removendo..." : "Confirmar remoção"}
          </button>
        </div>
      </div>
    </div>
  );
}

function IncluirSelecionadoManualModal({ draft, loading, onChange, onCancel, onSave }) {
  if (!draft) return null;

  return (
    <div className="prospects-modal-backdrop" role="presentation">
      <div className="prospects-modal" role="dialog" aria-modal="true" aria-labelledby="incluir-manual-title">
        <div className="prospects-modal__header">
          <div>
            <p className="prospects-eyebrow">Inclusão manual</p>
            <h3 id="incluir-manual-title" className="prospects-modal__title">Adicionar imóvel fora da base</h3>
          </div>
        </div>
        <div className="prospects-modal__body">
          <p className="prospects-modal__hint">
            Use este fluxo quando o imóvel ainda não estiver na base capturada. O funil passa a controlar o código,
            o teto operacional e as notas, e o restante pode ser refinado depois na ficha de viabilidade.
          </p>
          <div className="prospects-analise-grid">
            <label className="prospects-form-field">
              <span>Código do imóvel</span>
              <input
                type="text"
                value={draft.numero_bem}
                onChange={(e) => onChange("numero_bem", e.target.value)}
                placeholder="Ex.: 8555535398410"
              />
            </label>
            <label className="prospects-form-field">
              <span>Valor máximo</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={draft.valor_maximo}
                onChange={(e) => onChange("valor_maximo", e.target.value)}
                placeholder="0,00"
              />
            </label>
            <label className="prospects-form-field">
              <span>Prioridade</span>
              <select
                value={String(draft.prioridade)}
                onChange={(e) => onChange("prioridade", Number(e.target.value))}
              >
                {PRIORIDADE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="prospects-form-field">
            <span>Observação inicial</span>
            <textarea
              className="prospects-textarea"
              value={draft.observacoes}
              onChange={(e) => onChange("observacoes", e.target.value)}
              placeholder="Contexto curto para quem vai assumir esse imóvel no funil."
              rows={6}
            />
          </label>
        </div>
        <div className="prospects-modal__footer">
          <button type="button" className="prospects-btn secondary" onClick={onCancel} disabled={loading}>
            Cancelar
          </button>
          <button type="button" className="prospects-btn primary" onClick={onSave} disabled={loading}>
            {loading ? "Incluindo..." : "Adicionar à fila"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ObservacoesModal({ item, value, mapLink, loading, onChange, onMapLinkChange, onCancel, onSave }) {
  if (!item) return null;

  return (
    <div className="prospects-modal-backdrop" role="presentation">
      <div className="prospects-modal" role="dialog" aria-modal="true" aria-labelledby="observacoes-title">
        <div className="prospects-modal__header">
          <div>
            <p className="prospects-eyebrow">Observações</p>
            <h3 id="observacoes-title" className="prospects-modal__title">Imóvel {item.codigo}</h3>
          </div>
        </div>
        <div className="prospects-modal__body">
          <p className="prospects-modal__hint">
            Use este campo para manter a anotação mais atual e relevante sobre o imóvel.
          </p>
          <textarea
            className="prospects-textarea prospects-textarea--large"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Adicione uma nota objetiva sobre o imóvel. Você pode editar esse texto sempre que houver novidade."
            rows={10}
          />
          <label className="prospects-form-field">
            <span>Link Google Maps</span>
            <input
              type="url"
              value={mapLink}
              onChange={(e) => onMapLinkChange(e.target.value)}
              placeholder="https://maps.google.com/..."
            />
          </label>
          {mapLink && (
            <a className="prospects-link" href={mapLink} target="_blank" rel="noreferrer">
              Abrir localização
            </a>
          )}
        </div>
        <div className="prospects-modal__footer">
          <button type="button" className="prospects-btn secondary" onClick={onCancel} disabled={loading}>
            Fechar
          </button>
          <button type="button" className="prospects-btn primary" onClick={onSave} disabled={loading}>
            {loading ? "Salvando..." : "Salvar nota"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PrioridadeModal({ item, loading, onCancel, onSelect }) {
  if (!item) return null;

  return (
    <div className="prospects-modal-backdrop" role="presentation">
      <div className="prospects-modal prospects-modal--compact" role="dialog" aria-modal="true" aria-labelledby="prioridade-title">
        <div className="prospects-modal__header">
          <div>
            <p className="prospects-eyebrow">Prioridade</p>
            <h3 id="prioridade-title" className="prospects-modal__title">Imóvel {item.codigo}</h3>
          </div>
        </div>
        <div className="prospects-modal__body">
          <p className="prospects-modal__hint">
            Escolha a prioridade operacional deste imóvel.
          </p>
          <div className="prospects-priority-options">
            {PRIORIDADE_OPTIONS.map((option) => {
              const isActive = Number(item.prioridade || 2) === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  className={`prospects-priority-option ${isActive ? "is-active" : ""}`}
                  onClick={() => onSelect(option.value)}
                  disabled={loading}
                >
                  <span className={`prospects-priority-dot prospects-priority-dot--${option.cls}`} />
                  <strong>{option.label}</strong>
                  <small>{isActive ? "Atual" : "Selecionar"}</small>
                </button>
              );
            })}
          </div>
        </div>
        <div className="prospects-modal__footer">
          <button type="button" className="prospects-btn secondary" onClick={onCancel} disabled={loading}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

function TabelaCapturados({
  dados,
  total,
  page,
  pageSize,
  loading,
  erro,
  onIncluir,
  includeLoadingIds,
  onPageChange,
  sortBy,
  sortDir,
  onSortChange,
  selectedCodes,
  onAbrirAvaliacao,
  onAbrirAvaliacaoDetalhada,
  onAbrirAnalise,
}) {
  if (loading) return <div className="prospects-card"><p className="prospects-empty">Carregando capturados...</p></div>;
  if (erro) return <div className="prospects-card"><p className="prospects-empty">Erro ao carregar capturados: {erro}</p></div>;

  const totalPages = Math.max(1, Math.ceil((total || 0) / pageSize));
  const isEmpty = !dados.length;
  const renderSort = (key, label) => {
    const isActive = sortBy === key;
    const arrow = isActive ? (sortDir === "asc" ? "▲" : "▼") : "";
    const handleSort = () => {
      const nextDir = isActive && sortDir === "asc" ? "desc" : "asc";
      onSortChange(key, nextDir);
    };
    return (
      <button
        type="button"
        className={`prospects-sort-chip ${isActive ? "is-active" : ""}`.trim()}
        onClick={handleSort}
        aria-pressed={isActive}
      >
        <span>{label}</span>
        <strong>{arrow || "↕"}</strong>
      </button>
    );
  };

  const renderRange = () => {
    if (!total) return "0 de 0";
    const start = (page - 1) * pageSize + 1;
    const end = Math.min(page * pageSize, total);
    return `${start} – ${end} de ${total}`;
  };

  return (
    <div className="prospects-card">
      <div className="prospects-card__header">
        <div>
          <p className="prospects-eyebrow">Última coleta</p>
          <h2 className="prospects-title">Capturados</h2>
          <p className="prospects-subtitle prospects-subtitle--compact">
            Visualização em cards com foto, resumo financeiro e dados principais do imóvel.
          </p>
        </div>
        <span className="prospects-pill">{total} registros</span>
      </div>
      <div className="prospects-card-grid">
        <div className="prospects-card-grid__toolbar">
          {renderSort("codigo", "Código")}
          {renderSort("cidade", "Cidade")}
          {renderSort("uf", "UF")}
          {renderSort("modalidade", "Modalidade")}
          {renderSort("valor_minimo", "Valor")}
          {renderSort("ultima_disputa", "Última disputa")}
        </div>

        {isEmpty ? (
          <p className="prospects-empty">Nenhum capturado encontrado.</p>
        ) : dados.map((item) => {
          const jaSelecionado = selectedCodes.has(item.codigo);
          const enderecoCompacto = [item.endereco, item.bairro].filter(Boolean).join(" - ");
          const resumoLeilao = getLeilaoResumo(item);
          const descontoExibicao = calcularDescontoExibicao(item);
          const avaliacao = item.avaliacaoAutomatica;
          const mapsUrl = getMapsUrl(item);
          const comparaveis = getComparaveisLinks(item);
          const editalUrl = extrairEditalUrl(item.descricao);
          const fonteLabel = getFonteLabel(item.fonte);
          const processoNumero = extrairProcessoNumero(item.descricao);
          return (
            <article
              key={item.codigo}
              className="prospects-capture-card"
            >
              <div className="prospects-capture-card__media">
                <ProspectGallery item={item} className="prospects-capture-card__photo" />
                <div className="prospects-capture-card__badges">
                  <span className="prospects-chip">{item.modalidade || "Sem modalidade"}</span>
                  {fonteLabel ? <span className={`prospects-chip ${item.fonte === "tjdft_judicial" ? "prospects-chip--judicial" : "prospects-chip--source"}`.trim()}>{fonteLabel}</span> : null}
                  {jaSelecionado ? <span className="prospects-chip prospects-chip--selected">Na fila</span> : null}
                </div>
                {descontoExibicao !== null ? (
                  <div className="prospects-capture-card__discount">
                    {formatarPercentual(descontoExibicao)}
                  </div>
                ) : null}
              </div>

              <div className="prospects-capture-card__body">
                <div className="prospects-capture-card__headline">
                  <span className="prospects-capture-card__type">{item.tipoImovel || "Imóvel"}</span>
                  <a className="prospects-link mono" href={item.link} target="_blank" rel="noreferrer">
                    {item.codigo}
                  </a>
                </div>
                <h3 className="prospects-capture-card__location">
                  {[item.cidade, item.uf].filter(Boolean).join(" - ") || "Sem localização"}
                </h3>
                <p className="prospects-capture-card__address">
                  {enderecoCompacto || "Endereço não informado"}
                </p>

                <div className="prospects-capture-card__facts">
                  <span>{item.financia === undefined || item.financia === null ? "Financiamento n/d" : item.financia ? "Aceita FGTS/financiamento" : "Sem financiamento"}</span>
                  <span>{item.situacao || "Sem status"}</span>
                </div>

                <div className="prospects-capture-card__meta-grid">
                  <div className="prospects-capture-card__meta-item">
                    <span>Valor avaliação</span>
                    <strong>{formatarMoeda(item.valorAvaliacao)}</strong>
                  </div>
                  <div className="prospects-capture-card__meta-item">
                    <span>{resumoLeilao?.label || "Evento"}</span>
                    <strong>{resumoLeilao?.data ? formatarDataHoraCompacta(resumoLeilao.data) : "Data não informada"}</strong>
                  </div>
                  <div className="prospects-capture-card__meta-item prospects-capture-card__meta-item--accent">
                    <span>{resumoLeilao?.valor !== null && resumoLeilao?.valor !== undefined ? "Lance" : "Valor mínimo"}</span>
                    <strong>{formatarMoeda(resumoLeilao?.valor ?? item.valorMinimo)}</strong>
                  </div>
                  <div className="prospects-capture-card__meta-item">
                    <span>{processoNumero ? "Processo" : "Financia"}</span>
                    <strong>{processoNumero || (item.financia === undefined || item.financia === null ? "—" : item.financia ? "Sim" : "Não")}</strong>
                  </div>
                </div>

                <DetalhesTexto texto={item.descricao} className="prospects-capture-card__description" />

                <div className="prospects-inline-links">
                  <a
                    className="prospects-inline-link"
                    href={item.link}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span>Anúncio</span>
                    <ArrowUpRightIcon />
                  </a>
                  {mapsUrl ? (
                    <a
                      className="prospects-inline-link"
                      href={mapsUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <MapPinIcon />
                      <span>Mapa</span>
                    </a>
                  ) : null}
                  {comparaveis.map((link) => (
                    <a
                      key={`${item.codigo}-${link.label}`}
                      className="prospects-inline-link"
                      href={link.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <span>{link.label}</span>
                      <ArrowUpRightIcon />
                    </a>
                  ))}
                  {editalUrl ? (
                    <a
                      className="prospects-inline-link prospects-inline-link--highlight"
                      href={editalUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <span>Ver edital</span>
                      <ArrowUpRightIcon />
                    </a>
                  ) : null}
                </div>

                {avaliacao ? (
                  <div className="prospects-capture-card__auto">
                    <span className={`prospects-auto-badge ${getScoreClasse(avaliacao.score_total)}`}>
                      Score: {avaliacao.score_total ?? "—"}/85
                    </span>
                    <span className={`prospects-auto-badge ${getRoiClasse(avaliacao.retorno_pct)}`}>
                      ROI: {formatarPercentual(avaliacao.retorno_pct)}
                    </span>
                    <span className="prospects-auto-badge">
                      Venda est.: {formatarMoeda(avaliacao.valor_estimado_venda)}
                    </span>
                  </div>
                ) : null}

                <div className="prospects-capture-card__actions">
                  {avaliacao ? (
                    <button
                    type="button"
                    className="prospects-btn ghost prospects-btn--subtle"
                    onClick={() => onAbrirAvaliacao(item)}
                  >
                    Pré-análise
                  </button>
                  ) : null}
                  <button
                    type="button"
                    className={`prospects-btn ghost prospects-btn--subtle ${item.analiseIaSalva ? "is-active" : ""}`.trim()}
                    onClick={() => onAbrirAvaliacaoDetalhada(item, "ia", "capturados")}
                  >
                    {item.analiseIaSalva ? "IA salva" : "Avaliação IA"}
                  </button>
                  <button
                    type="button"
                    className={`prospects-btn ghost prospects-btn--subtle ${item.analiseSalva ? "is-active" : ""}`.trim()}
                    onClick={() => onAbrirAnalise(item, "capturados")}
                  >
                    {item.analiseSalva ? "Viabilidade salva" : "Viabilidade"}
                  </button>
                  <button
                    type="button"
                    className={`prospects-btn ${jaSelecionado ? "ghost" : "secondary"} prospects-btn--subtle`}
                    disabled={includeLoadingIds.has(item.codigo)}
                    onClick={() => onIncluir(item)}
                  >
                    {includeLoadingIds.has(item.codigo) ? "Incluindo..." : jaSelecionado ? "Reenviar ao funil" : "Selecionar"}
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
      <div className="prospects-pagination">
        <div className="prospects-pagination__summary">{renderRange()}</div>
        <div className="prospects-pagination__controls">
          <button type="button" className="prospects-btn secondary" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>Anterior</button>
          <span>Página {page} de {totalPages}</span>
          <button type="button" className="prospects-btn secondary" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>Próxima</button>
        </div>
      </div>
    </div>
  );
}

function AvaliacaoAutomaticaModal({
  item,
  detalhe,
  loading,
  savingScore,
  scoreRegiaoDraft,
  onScoreRegiaoChange,
  onSalvarScoreRegiao,
  onClose,
  onAdicionarAoFunil,
}) {
  if (!item) return null;

  const avaliacao = detalhe?.avaliacao || item.avaliacaoAutomatica;
  const comparaveis = detalhe?.comparaveis || [];
  const imovel = detalhe?.imovel || item;

  return (
    <div className="prospects-modal-backdrop" role="presentation">
      <div className="prospects-modal prospects-modal--wide prospects-modal--auto" role="dialog" aria-modal="true" aria-labelledby="avaliacao-auto-title">
        <div className="prospects-modal__header">
          <div>
            <p className="prospects-eyebrow">Pré-análise</p>
            <h3 id="avaliacao-auto-title" className="prospects-modal__title">Pré-análise automática do imóvel {item.codigo}</h3>
            <p className="prospects-subtitle prospects-subtitle--compact">
              Use a leitura automática como ponto de partida e refine depois na análise manual.
            </p>
          </div>
        </div>
        <div className="prospects-modal__body">
          {loading ? (
            <p className="prospects-empty">Carregando avaliacao automatica...</p>
          ) : !avaliacao ? (
            <p className="prospects-empty">Este imóvel ainda não possui pré-análise automática disponível.</p>
          ) : (
            <>
              <div className="prospects-auto-hero">
                <div className="prospects-auto-hero__media">
                  <ProspectGallery item={{ ...item, ...imovel }} className="prospects-auto-hero__photo" />
                </div>
                <div className="prospects-auto-hero__summary">
                  <span className="prospects-auto-hero__eyebrow">{imovel?.tipo_imovel || item.tipoImovel || "Imóvel"}</span>
                  <h4>{[imovel?.cidade || item.cidade, imovel?.uf || item.uf].filter(Boolean).join(" - ") || item.codigo}</h4>
                  <p>{[imovel?.endereco || item.endereco, imovel?.bairro || item.bairro].filter(Boolean).join(" - ") || "Endereço não informado"}</p>
                  <div className="prospects-capture-card__auto">
                    <span className={`prospects-auto-badge ${getScoreClasse(avaliacao.score_total)}`}>Score {avaliacao.score_total ?? "—"}/85</span>
                    <span className={`prospects-auto-badge ${getRoiClasse(avaliacao.retorno_pct)}`}>ROI {formatarPercentual(avaliacao.retorno_pct)}</span>
                    <span className="prospects-auto-badge">Venda est. {formatarMoeda(avaliacao.valor_estimado_venda)}</span>
                  </div>
                </div>
              </div>

              <div className="prospects-auto-grid">
                <div className="prospects-auto-card prospects-auto-card--summary">
                  <span>Fonte de comparáveis</span>
                  <strong>{avaliacao.fonte_pesquisa || "—"}</strong>
                </div>
                <div className="prospects-auto-card">
                  <span>Preço/m² da região</span>
                  <strong>{formatarMoeda(avaliacao.preco_m2_regiao)}</strong>
                </div>
                <div className="prospects-auto-card">
                  <span>Venda estimada</span>
                  <strong>{formatarMoeda(avaliacao.valor_estimado_venda)}</strong>
                </div>
                <div className="prospects-auto-card">
                  <span>Lucro estimado</span>
                  <strong>{formatarMoeda(avaliacao.lucro_estimado)}</strong>
                </div>
                <div className={`prospects-auto-card prospects-auto-card--score ${getScoreClasse(avaliacao.score_total)}`}>
                  <span>Score</span>
                  <strong>{avaliacao.score_total ?? "—"}/85</strong>
                </div>
                <div className={`prospects-auto-card prospects-auto-card--roi ${getRoiClasse(avaliacao.retorno_pct)}`}>
                  <span>ROI estimado</span>
                  <strong>{formatarPercentual(avaliacao.retorno_pct)}</strong>
                </div>
              </div>

              <div className="prospects-auto-breakdown">
                <div className="prospects-auto-breakdown__row">
                  <span>Desconto</span>
                  <strong>{avaliacao.score_desconto ?? 0}/40</strong>
                </div>
                <div className="prospects-auto-breakdown__row">
                  <span>Liquidez</span>
                  <strong>{avaliacao.score_liquidez ?? 0}/25</strong>
                </div>
                <div className="prospects-auto-breakdown__row">
                  <span>Risco</span>
                  <strong>{avaliacao.score_risco ?? 0}/5</strong>
                </div>
                <div className="prospects-auto-breakdown__row prospects-auto-breakdown__row--editable">
                  <label htmlFor="score-regiao">Região</label>
                  <div>
                    <input
                      id="score-regiao"
                      type="number"
                      min="0"
                      max="20"
                      value={scoreRegiaoDraft}
                      onChange={(e) => onScoreRegiaoChange(e.target.value)}
                    />
                    <button type="button" className="prospects-btn ghost prospects-btn--subtle" onClick={onSalvarScoreRegiao} disabled={savingScore}>
                      {savingScore ? "Salvando..." : "Salvar"}
                    </button>
                  </div>
                </div>
              </div>

              <div className="prospects-auto-meta">
                <span>Area: {imovel?.area_m2 ? `${formatarNumero(imovel.area_m2)} m2` : "—"}</span>
                <span>Quartos: {imovel?.quartos ?? "—"}</span>
                <span>Vagas: {imovel?.vagas ?? "—"}</span>
                <span>Avaliado em: {avaliacao.pesquisado_em ? formatarDataHoraCompacta(avaliacao.pesquisado_em) : "—"}</span>
              </div>

              {comparaveis.length ? (
                <div className="prospects-auto-comparaveis">
                  <h4>Comparáveis usados</h4>
                  <div className="prospects-table-wrap">
                    <table className="prospects-table prospects-table--compact">
                      <thead>
                        <tr>
                          <th>Titulo</th>
                          <th>Preco</th>
                          <th>Area</th>
                          <th>Preco/m2</th>
                          <th>Quartos</th>
                          <th>Link</th>
                        </tr>
                      </thead>
                      <tbody>
                        {comparaveis.map((comp) => (
                          <tr key={comp.id}>
                            <td>{comp.titulo || "—"}</td>
                            <td>{formatarMoeda(comp.preco)}</td>
                            <td>{comp.area_m2 ? `${formatarNumero(comp.area_m2)} m2` : "—"}</td>
                            <td>{comp.preco_m2 ? formatarMoeda(comp.preco_m2) : "—"}</td>
                            <td>{comp.quartos ?? "—"}</td>
                            <td>{comp.url ? <a className="prospects-link" href={comp.url} target="_blank" rel="noreferrer">Abrir</a> : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
        <div className="prospects-modal__footer prospects-modal__footer--auto">
          <button type="button" className="prospects-btn ghost prospects-btn--subtle" onClick={onClose}>Fechar</button>
          <button type="button" className="prospects-btn secondary prospects-btn--subtle" onClick={() => onAdicionarAoFunil(item)}>
            Levar para análise
          </button>
        </div>
      </div>
    </div>
  );
}

function AvaliacaoDetalhadaModal({
  item,
  tab,
  aiAnalise,
  analiseDetalhada,
  analiseDetalhadaLoading,
  statusMessage,
  statusTone,
  statusAction,
  loading,
  sending,
  saving,
  matriculaLoading,
  enriquecimentoLoading,
  sinteseDraft,
  onSinteseDraftChange,
  mensagemDraft,
  onMensagemDraftChange,
  onTabChange,
  onClose,
  onEnviarMensagem,
  onGerarAnaliseInicial,
  onSalvarSintese,
  onSolicitarMatricula,
  onSolicitarEnriquecimento,
  onAbrirAnalise,
  canChat,
}) {
  if (!item) return null;

  const resumoLeilao = getLeilaoResumo(item);
  const leiloes = getLeiloesInfo(item);
  const mapsUrl = getMapsUrl(item);
  const comparaveis = getComparaveisLinks(item);
  const historico = aiAnalise?.historico_chat || [];
  const historicoExpandido = aiAnalise?.matricula_texto
    ? [...historico, { role: "assistant", content: aiAnalise.matricula_texto, kind: "matricula" }]
    : historico;
  const descontoExibicao = calcularDescontoExibicao(item);
  const quantidadeMensagens = historicoExpandido.length;
  const enderecoCompleto = [item.endereco, item.bairro].filter(Boolean).join(" - ");
  const valorReferencia = resumoLeilao?.valor ?? item.valor;
  const editalUrl = extrairEditalUrl(item.descricao);
  const processoNumero = extrairProcessoNumero(item.descricao);
  const fonteLabel = getFonteLabel(item.fonte);
  const avaliacaoAuto = item.avaliacaoAutomatica;

  return (
    <div className="prospects-modal-backdrop" role="presentation">
      <div className="prospects-modal prospects-modal--wide prospects-modal--auto" role="dialog" aria-modal="true" aria-labelledby="avaliacao-detalhada-title">
        <div className="prospects-modal__header">
          <div className="prospects-modal__header-main">
            <div>
              <p className="prospects-eyebrow">Avaliação detalhada</p>
              <h3 id="avaliacao-detalhada-title" className="prospects-modal__title">Imóvel {item.codigo}</h3>
              <p className="prospects-subtitle prospects-subtitle--compact">
                Combine dados do leilão, análise financeira e conversa com IA em um único lugar.
              </p>
            </div>
            <button
              type="button"
              className="prospects-modal__close"
              onClick={onClose}
              aria-label="Fechar avaliação detalhada"
            >
              <CloseIcon />
            </button>
          </div>
        </div>
        <div className="prospects-modal__body">
          <div className="prospects-auto-hero">
            <div className="prospects-auto-hero__media">
              <ProspectGallery item={item} className="prospects-auto-hero__photo" />
            </div>
            <div className="prospects-auto-hero__summary">
              <div className="prospects-auto-hero__heading">
                <span className="prospects-auto-hero__eyebrow">{item.tipoImovel || "Imóvel"}</span>
                <h4>{[item.cidade, item.uf].filter(Boolean).join(" - ") || item.codigo}</h4>
                <p>{enderecoCompleto || "Endereço não informado"}</p>
              </div>
              <div className="prospects-capture-card__auto prospects-capture-card__auto--hero">
                {descontoExibicao !== null ? (
                  <span className="prospects-auto-badge">Desconto {formatarPercentual(descontoExibicao)}</span>
                ) : null}
                <span className="prospects-auto-badge">{resumoLeilao?.label || "Sem evento"}</span>
                <span className="prospects-auto-badge">{formatarMoeda(valorReferencia)}</span>
                {fonteLabel ? (
                  <span className={`prospects-auto-badge ${item.fonte === "tjdft_judicial" ? "is-judicial" : ""}`.trim()}>{fonteLabel}</span>
                ) : null}
              </div>
              <div className="prospects-auto-hero__status-row">
                <span className="prospects-detail-status-chip">
                  <strong>Status</strong>
                  <span>{item.disponivel === undefined || item.disponivel === null ? "—" : item.disponivel ? "Disponível" : "Indisponível"}</span>
                </span>
                <span className="prospects-detail-status-chip">
                  <strong>Financeira</strong>
                  <span>{item.analiseSalva ? formatarPercentual(item.roiEsperadoPercentual) : "Pendente"}</span>
                </span>
                <span className="prospects-detail-status-chip">
                  <strong>IA</strong>
                  <span>{item.analiseIaSalva ? "Salva" : "Ainda não"}</span>
                </span>
              </div>
              <div className="prospects-auto-hero__facts">
                <div className="prospects-auto-hero__fact">
                  <span>Código</span>
                  <strong>{item.codigo}</strong>
                </div>
                <div className="prospects-auto-hero__fact">
                  <span>Valor avaliação</span>
                  <strong>{formatarMoeda(item.valorAvaliacao)}</strong>
                </div>
                <div className="prospects-auto-hero__fact">
                  <span>Evento foco</span>
                  <strong>{resumoLeilao?.data ? formatarDataHoraCompacta(resumoLeilao.data) : "Não informado"}</strong>
                </div>
                <div className="prospects-auto-hero__fact">
                  <span>Financiamento</span>
                  <strong>{item.financia === undefined || item.financia === null ? "—" : item.financia ? "Aceita" : "Não aceita"}</strong>
                </div>
                {processoNumero ? (
                  <div className="prospects-auto-hero__fact">
                    <span>Processo</span>
                    <strong>{processoNumero}</strong>
                  </div>
                ) : null}
              </div>
              <div className="prospects-auto-hero__links">
                <span className="prospects-ai-section__label">Ações rápidas</span>
                <div className="prospects-inline-links prospects-inline-links--detail">
                <a className="prospects-inline-link" href={item.link} target="_blank" rel="noreferrer">
                  <ArrowUpRightIcon />
                  <span>Anúncio</span>
                </a>
                {mapsUrl ? (
                  <a className="prospects-inline-link" href={mapsUrl} target="_blank" rel="noreferrer">
                    <MapPinIcon />
                    <span>Google Maps</span>
                  </a>
                ) : null}
                {comparaveis.map((link) => (
                  <a key={`${item.codigo}-hero-${link.label}`} className="prospects-inline-link" href={link.url} target="_blank" rel="noreferrer">
                    <span>{link.label}</span>
                    <ArrowUpRightIcon />
                  </a>
                ))}
                {editalUrl ? (
                  <a className="prospects-inline-link prospects-inline-link--highlight" href={editalUrl} target="_blank" rel="noreferrer">
                    <span>Ver edital</span>
                    <ArrowUpRightIcon />
                  </a>
                ) : null}
                </div>
              </div>
            </div>
          </div>

          <div className="prospects-detail-tabs" role="tablist" aria-label="Abas de avaliação detalhada">
            <button type="button" className={`prospects-sort-chip ${tab === "dados" ? "is-active" : ""}`.trim()} onClick={() => onTabChange("dados")}>Dados</button>
            <button type="button" className={`prospects-sort-chip ${tab === "ia" ? "is-active" : ""}`.trim()} onClick={() => onTabChange("ia")}>Análise IA</button>
          </div>

          {statusMessage ? (
            <div className={`prospects-inline-status is-${statusTone || "info"}`.trim()}>
              <span className="prospects-inline-status__content">{statusMessage}</span>
              {statusAction?.label ? (
                <button
                  type="button"
                  className="prospects-btn ghost prospects-btn--subtle prospects-inline-status__action"
                  onClick={statusAction.onClick}
                  disabled={statusAction.disabled}
                >
                  {statusAction.label}
                </button>
              ) : null}
            </div>
          ) : null}

          {tab === "dados" ? (
            <>
              <div className="prospects-auto-grid prospects-auto-grid--detail">
                <div className="prospects-auto-card">
                  <span>Valor avaliação</span>
                  <strong>{formatarMoeda(item.valorAvaliacao)}</strong>
                </div>
                <div className="prospects-auto-card">
                  <span>Valor de referência</span>
                  <strong>{formatarMoeda(item.valor)}</strong>
                </div>
                <div className="prospects-auto-card">
                  <span>Financiamento</span>
                  <strong>{item.financia === undefined || item.financia === null ? "—" : item.financia ? "Aceita" : "Não aceita"}</strong>
                </div>
                <div className="prospects-auto-card">
                  <span>Análise financeira</span>
                  <strong>{item.analiseSalva ? formatarPercentual(item.roiEsperadoPercentual) : "Não salva"}</strong>
                </div>
              </div>

              <div className="prospects-auto-comparaveis">
                <h4>Análise financeira manual</h4>
                {analiseDetalhadaLoading ? (
                  <p className="prospects-empty">Carregando resumo financeiro...</p>
                ) : analiseDetalhada?.calculos ? (
                  <>
                    {getMensagemPrefillAnalise(analiseDetalhada?.meta) ? (
                      <p className="prospects-modal__hint">
                        {getMensagemPrefillAnalise(analiseDetalhada.meta)}
                      </p>
                    ) : null}
                    <div className="prospects-auto-grid prospects-auto-grid--detail">
                      <div className="prospects-auto-card">
                        <span>Capital investido</span>
                        <strong>{formatarMoeda(analiseDetalhada.calculos.capital_investido_estimado)}</strong>
                      </div>
                      <div className="prospects-auto-card">
                        <span>Custo total</span>
                        <strong>{formatarMoeda(analiseDetalhada.calculos.custo_total_imovel)}</strong>
                      </div>
                      <div className="prospects-auto-card">
                        <span>Lucro esperado</span>
                        <strong>{formatarMoeda(analiseDetalhada.calculos.lucro_esperado_valor)}</strong>
                      </div>
                      <div className="prospects-auto-card">
                        <span>ROI estimado</span>
                        <strong>{formatarPercentual(analiseDetalhada.calculos.roi_esperado_percentual)}</strong>
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="prospects-empty">Nenhuma análise financeira disponível.</p>
                )}
              </div>

              {avaliacaoAuto ? (
                <div className="prospects-auto-comparaveis">
                  <h4>Enriquecimentos automáticos</h4>
                  <div className="prospects-auto-grid prospects-auto-grid--detail">
                    <div className="prospects-auto-card">
                      <span>Fonte de comparáveis</span>
                      <strong>{avaliacaoAuto.fonte_pesquisa || "—"}</strong>
                    </div>
                    <div className="prospects-auto-card">
                      <span>Preço m² da região</span>
                      <strong>{formatarMoeda(avaliacaoAuto.preco_m2_regiao)}</strong>
                    </div>
                    <div className="prospects-auto-card">
                      <span>Score automático</span>
                      <strong>{avaliacaoAuto.score_total ?? "—"}/85</strong>
                    </div>
                    <div className="prospects-auto-card">
                      <span>ROI estimado</span>
                      <strong>{formatarPercentual(avaliacaoAuto.retorno_pct)}</strong>
                    </div>
                  </div>
                  {avaliacaoAuto.resumo_ia ? (
                    <>
                      <h5 className="prospects-subsection-title">Resumo automático</h5>
                      <TextoEstruturado texto={avaliacaoAuto.resumo_ia} />
                    </>
                  ) : null}
                </div>
              ) : null}

              <div className="prospects-auto-comparaveis">
                <h4>Detalhes do imóvel</h4>
                <DetalhesTexto texto={item.descricao} className="prospects-detail-text" />
              </div>

              <div className="prospects-auto-comparaveis">
                <h4>Cenários de leilão</h4>
                <div className="prospects-leiloes-timeline">
                  {leiloes.length ? leiloes.map((entry) => (
                    <div key={`${item.codigo}-${entry.label}`} className="prospects-leilao-card">
                      <span>{entry.label}</span>
                      <strong>{formatarDataHoraCompacta(entry.data)}</strong>
                      <p>{entry.valor === null || entry.valor === undefined ? "Valor não informado" : formatarMoeda(entry.valor)}</p>
                    </div>
                  )) : (
                    <p className="prospects-empty">Nenhum cenário de leilão disponível.</p>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="prospects-ai-panel">
              <div className="prospects-ai-toolbar">
                <div className="prospects-ai-toolbar__group">
                  <span className="prospects-ai-toolbar__label">Contexto</span>
                  <div className="prospects-ai-toolbar__meta">
                    <span className="prospects-indicator-chip is-automatica">
                      <SparklesIcon />
                      <span>{quantidadeMensagens} interações</span>
                    </span>
                    <span className={`prospects-indicator-chip ${canChat ? "is-financeira" : "is-ia"}`}>
                      <span>{canChat ? "Chat liberado" : "Somente leitura"}</span>
                    </span>
                    {aiAnalise?.updated_at ? (
                      <span className="prospects-indicator-chip is-ia">
                        <span>Atualizado em {formatarDataHoraCompacta(aiAnalise.updated_at)}</span>
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="prospects-ai-toolbar__group prospects-ai-toolbar__group--actions">
                  <span className="prospects-ai-toolbar__label">Processar</span>
                  <div className="prospects-ai-toolbar__actions">
                    {canChat ? (
                      <button
                        type="button"
                        className="prospects-btn primary prospects-btn--subtle"
                        onClick={onGerarAnaliseInicial}
                        disabled={loading || sending || matriculaLoading || enriquecimentoLoading}
                      >
                        {loading || sending ? "Processando IA..." : getAnaliseIaActionLabel(item)}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className={`prospects-btn secondary prospects-btn--subtle ${avaliacaoAuto ? "is-active" : ""}`.trim()}
                      onClick={onSolicitarEnriquecimento}
                      disabled={!canChat || loading || sending || matriculaLoading || enriquecimentoLoading}
                    >
                      {enriquecimentoLoading ? "Processando enriquecimento..." : avaliacaoAuto ? "Reenriquecer" : "Enriquecer"}
                    </button>
                    {podeAnalisarMatricula(item) ? (
                      <button
                        type="button"
                        className="prospects-btn secondary prospects-btn--subtle"
                        onClick={onSolicitarMatricula}
                        disabled={!canChat || loading || sending || matriculaLoading || enriquecimentoLoading}
                      >
                        {matriculaLoading ? "Processando matrícula..." : "Analisar matrícula"}
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className="prospects-ai-toolbar__group prospects-ai-toolbar__group--utility">
                  <span className="prospects-ai-toolbar__label">Navegação</span>
                  <div className="prospects-ai-toolbar__actions">
                    <button
                      type="button"
                      className={`prospects-btn ghost prospects-btn--subtle ${tab === "dados" ? "is-active" : ""}`.trim()}
                      onClick={() => onTabChange("dados")}
                    >
                      Ver dados do imóvel
                    </button>
                    <button type="button" className="prospects-btn ghost prospects-btn--subtle" onClick={onClose}>
                      Fechar
                    </button>
                  </div>
                </div>
              </div>
              {loading ? (
                <div className="prospects-ai-loading-card">
                  <strong>Preparando a pré-análise por IA</strong>
                  <p>Estamos carregando o histórico e, quando necessário, iniciando a avaliação automática deste imóvel.</p>
                </div>
              ) : (
                <>
                  <section className="prospects-ai-section">
                    <div className="prospects-ai-section__header">
                      <span className="prospects-ai-section__label">Leitura principal da análise</span>
                      <p>Tudo o que a IA respondeu fica concentrado aqui, incluindo a matrícula quando ela existir.</p>
                    </div>
                    <div className="prospects-ai-chat">
                      {historicoExpandido.length ? historicoExpandido.map((mensagem, index) => (
                        <div key={`${mensagem.role}-${mensagem.kind || "chat"}-${index}`} className={`prospects-ai-bubble is-${mensagem.role || "assistant"} ${mensagem.kind === "matricula" ? "is-matricula" : ""}`.trim()}>
                          <span>{mensagem.kind === "matricula" ? "Matrícula" : mensagem.role === "user" ? "Você" : "IA"}</span>
                          <TextoEstruturado texto={mensagem.content || "—"} />
                        </div>
                      )) : (
                        <p className="prospects-empty">Nenhuma análise salva ainda. Ao abrir o chat, a avaliação inicial será gerada automaticamente.</p>
                      )}
                    </div>
                  </section>

                  <section className="prospects-ai-summary">
                    <div className="prospects-ai-section__header">
                      <span className="prospects-ai-section__label">Síntese editável</span>
                      <p>Condense aqui a decisão final, sem abrir uma segunda janela com o mesmo conteúdo.</p>
                    </div>
                    <label className="prospects-form-field">
                      <span>Síntese da análise</span>
                      <textarea
                        rows={5}
                        value={sinteseDraft}
                        onChange={(e) => onSinteseDraftChange(e.target.value)}
                        placeholder="Resumo manual do que ficou decidido para este imóvel"
                      />
                    </label>
                    <div className="prospects-ai-summary__actions">
                      <button type="button" className="prospects-btn primary prospects-btn--subtle" onClick={onSalvarSintese} disabled={saving}>
                        {saving ? "Salvando..." : "Salvar síntese"}
                      </button>
                      <button type="button" className="prospects-btn secondary prospects-btn--subtle" onClick={() => onAbrirAnalise(item)}>
                        Editar análise financeira
                      </button>
                    </div>
                    {podeAnalisarMatricula(item) ? null : (
                      <span className="prospects-modal__hint">Análise de matrícula disponível apenas para imóveis da Caixa.</span>
                    )}
                  </section>

                  {canChat ? (
                    <section className="prospects-ai-composer">
                      <div className="prospects-ai-section__header">
                        <span className="prospects-ai-section__label">Pergunta complementar</span>
                        <p>Use uma nova pergunta só quando precisar expandir a análise já consolidada acima.</p>
                      </div>
                      <label className="prospects-form-field">
                        <span>Pergunta para a IA</span>
                        <textarea
                          rows={3}
                          value={mensagemDraft}
                          onChange={(e) => onMensagemDraftChange(e.target.value)}
                          placeholder="Ex.: quais os maiores riscos deste imóvel?"
                        />
                      </label>
                      <button type="button" className="prospects-btn primary prospects-btn--subtle" onClick={onEnviarMensagem} disabled={sending || !mensagemDraft.trim()}>
                        {sending ? "Enviando..." : "Enviar"}
                      </button>
                    </section>
                  ) : (
                    <p className="prospects-modal__hint">Seu usuário pode visualizar o histórico salvo, mas não enviar novas mensagens para a IA. Se esse acesso já foi liberado pelo administrador, entre novamente para atualizar a sessão.</p>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MobileHubCard({
  eyebrow,
  title,
  description,
  count,
  icon,
  to,
  onClick,
  disabled = false,
}) {
  const content = (
    <>
      <div className="prospects-mobile-hub-card__icon">{icon}</div>
      <div className="prospects-mobile-hub-card__body">
        <span className="prospects-mobile-hub-card__eyebrow">{eyebrow}</span>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
      <div className="prospects-mobile-hub-card__meta">
        <span>{disabled ? "Sem acesso" : "Imóveis"}</span>
        <strong>{count}</strong>
      </div>
      <div className="prospects-mobile-hub-card__arrow">
        <ArrowUpRightIcon />
      </div>
    </>
  );

  if (to && !disabled) {
    return (
      <Link className="prospects-mobile-hub-card" to={to}>
        {content}
      </Link>
    );
  }

  return (
    <button
      type="button"
      className={`prospects-mobile-hub-card ${disabled ? "is-disabled" : ""}`.trim()}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
    >
      {content}
    </button>
  );
}

function MobileSelecionadosList({
  dados,
  loading,
  erro,
  onBack,
  onIncluirManual,
  searchValue,
  onSearchChange,
  selectedUfFilter,
  onUfFilterChange,
  ufOptions,
  selectedPrioridadeFilter,
  onPrioridadeFilterChange,
  selectedActivityFilter,
  onActivityFilterChange,
  selectedResponsavelFilter,
  onResponsavelFilterChange,
  selectedSortBy,
  onSortByChange,
  selectedSortDir,
  onSortDirChange,
  selectedUserFilter,
  onUserFilterChange,
  selectedUserOptions,
  canFilterByUser,
  selectedMetrics,
  onResetFilters,
  onEditarObservacoes,
  onAbrirAnalise,
  onAbrirEnriquecimentos,
  onAcionarAnaliseIa,
  onEditarPrioridade,
  onEditarResponsaveis,
  onExcluir,
  onReativar,
  canOperateItem,
  canManageResponsaveis,
  canDeleteItem,
  canReactivateItem,
  updateLoadingIds,
  removeLoadingIds,
}) {
  if (loading) return <div className="prospects-card"><p className="prospects-empty">Carregando fila...</p></div>;
  if (erro) return <div className="prospects-card"><p className="prospects-empty">Erro ao carregar fila: {erro}</p></div>;

  return (
    <section className="prospects-mobile-section">
      <div className="prospects-card">
        <div className="prospects-card__header prospects-card__header--stacked">
          <div>
            <p className="prospects-eyebrow">Mobile</p>
            <h2 className="prospects-title">Fila de prospecção</h2>
            <p className="prospects-subtitle prospects-subtitle--compact">
              Abra notas, viabilidade e ajustes operacionais sem depender da tabela desktop.
            </p>
          </div>
          <div className="prospects-card__header-actions">
            <span className="prospects-pill">{dados.length} imóveis</span>
            {onIncluirManual ? (
              <button type="button" className="prospects-btn tertiary prospects-btn--toolbar" onClick={onIncluirManual}>
                Adicionar manual
              </button>
            ) : null}
            <button type="button" className="prospects-btn tertiary prospects-btn--toolbar" onClick={onBack}>
              <ArrowLeftIcon />
              <span>Menu mobile</span>
            </button>
          </div>
        </div>
      </div>

      <div className="prospects-card prospects-mobile-filters">
        <label className="prospects-toolbar-field prospects-toolbar-field--search">
          <span>Buscar na fila</span>
          <input
            type="search"
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Código, cidade, responsável ou observação"
          />
        </label>

        <div className="prospects-mobile-filters__grid">
          <label className="prospects-toolbar-field">
            <span>UF</span>
            <select value={selectedUfFilter} onChange={(e) => onUfFilterChange(e.target.value)}>
              <option value="todos">Todas</option>
              {ufOptions.map((uf) => (
                <option key={uf} value={uf}>{uf}</option>
              ))}
            </select>
          </label>

          <label className="prospects-toolbar-field">
            <span>Prioridade</span>
            <select value={selectedPrioridadeFilter} onChange={(e) => onPrioridadeFilterChange(e.target.value)}>
              <option value="todas">Todas</option>
              {PRIORIDADE_OPTIONS.map((option) => (
                <option key={option.value} value={String(option.value)}>{option.label}</option>
              ))}
            </select>
          </label>

          {canFilterByUser ? (
            <label className="prospects-toolbar-field">
              <span>Estado</span>
              <select value={selectedActivityFilter} onChange={(e) => onActivityFilterChange(e.target.value)}>
                <option value="ativos">Ativos</option>
                <option value="inativos">Inativos</option>
                <option value="todos">Todos</option>
              </select>
            </label>
          ) : null}

          <label className="prospects-toolbar-field">
            <span>Responsáveis</span>
            <select value={selectedResponsavelFilter} onChange={(e) => onResponsavelFilterChange(e.target.value)}>
              <option value="todos">Todos</option>
              <option value="com">Com responsáveis</option>
              <option value="sem">Sem responsáveis</option>
              <option value="meus">Atribuídos a mim</option>
            </select>
          </label>

          {canFilterByUser ? (
            <label className="prospects-toolbar-field">
              <span>Usuário</span>
              <select value={selectedUserFilter} onChange={(e) => onUserFilterChange(e.target.value)}>
                <option value="todos">Todos</option>
                {selectedUserOptions.map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
            </label>
          ) : null}

          <label className="prospects-toolbar-field">
            <span>Ordenar por</span>
            <select value={selectedSortBy} onChange={(e) => onSortByChange(e.target.value)}>
              <option value="dataLeilao">Data do leilão</option>
              <option value="prioridade">Prioridade</option>
              <option value="cidade">Cidade</option>
              <option value="valorMaximo">Valor máximo</option>
              <option value="roi">ROI</option>
            </select>
          </label>

          <label className="prospects-toolbar-field">
            <span>Direção</span>
            <select value={selectedSortDir} onChange={(e) => onSortDirChange(e.target.value)}>
              <option value="asc">Crescente</option>
              <option value="desc">Decrescente</option>
            </select>
          </label>
        </div>

        <div className="prospects-mobile-filters__footer">
          <div className="prospects-mobile-filters__metrics">
            <span className="prospects-pill">{dados.length} na visão</span>
            <span className="prospects-pill prospects-pill--muted">{selectedMetrics.comAnalise} com análise</span>
            <span className="prospects-pill prospects-pill--muted">{selectedMetrics.altaPrioridade} alta prioridade</span>
          </div>
          <button type="button" className="prospects-btn tertiary prospects-btn--toolbar" onClick={onResetFilters}>
            Limpar visão
          </button>
        </div>
      </div>

      {!dados.length ? (
        <div className="prospects-card">
          <p className="prospects-empty">Nenhum item disponível na fila.</p>
        </div>
      ) : null}

      <div className="prospects-mobile-list">
        {dados.map((item) => {
          const prioridadeLabel = PRIORIDADE_OPTIONS.find((option) => option.value === Number(item.prioridade || 2))?.label || "Média";
          const itemAtivo = isSelecionadoAtivo(item);
          const podeOperar = itemAtivo && canOperateItem(item);
          const podeExcluir = itemAtivo && canDeleteItem(item);
          const podeReativar = !itemAtivo && canReactivateItem(item);
          const roiClass = obterClasseRoi(item.roiEsperadoPercentual);
          const resumoLeilao = getLeilaoResumo(item);
          const mapsUrl = getMapsUrl(item);
          const comparaveis = getComparaveisLinks(item);
          return (
            <article key={item.codigo} className="prospects-mobile-item-card">
              <div className="prospects-mobile-item-card__top">
                <div>
                  <a className="prospects-link mono" href={item.link} target="_blank" rel="noreferrer">
                    {item.codigo}
                  </a>
                  <p className="prospects-mobile-item-card__location">
                    {[item.cidade, item.uf].filter(Boolean).join("/") || "Sem localização"}
                  </p>
                </div>
                <div className="prospects-mobile-item-card__pills">
                  <span className={`prospects-chip priority-${prioridadeLabel.toLowerCase()}`}>{prioridadeLabel}</span>
                  <span className={`prospects-chip prospects-mobile-chip--roi ${roiClass}`}>{formatarPercentual(item.roiEsperadoPercentual)}</span>
                  {item.analiseSalva ? <span className="prospects-chip prospects-chip--info">Financeira</span> : null}
                  {item.avaliacaoAutomatica ? <span className="prospects-chip prospects-chip--auto">Pré-análise</span> : null}
                  {item.analiseIaSalva ? <span className="prospects-chip prospects-chip--ia">IA salva</span> : null}
                  {!itemAtivo ? <span className="prospects-chip prospects-chip--inactive">Inativo</span> : null}
                </div>
              </div>

              <div className="prospects-mobile-item-card__meta">
                <div>
                  <span>{resumoLeilao?.label || "Leilão"}</span>
                  <strong>{formatarDataHoraCompacta(resumoLeilao?.data || item.dataLeilao)}</strong>
                </div>
                <div>
                  <span>Valor máximo</span>
                  <strong>{formatarMoeda(item.valorMaximo)}</strong>
                </div>
                <div>
                  <span>Lance do evento</span>
                  <strong>{formatarMoeda(resumoLeilao?.valor ?? item.valor)}</strong>
                </div>
                <div>
                  <span>Responsáveis</span>
                  <strong>{item.responsaveis?.length ? item.responsaveis.map((responsavel) => responsavel.name || responsavel.email).join(", ") : "Não definido"}</strong>
                </div>
                <div>
                  <span>Autor</span>
                  <strong>{item.createdByName || "Não informado"}</strong>
                </div>
              </div>

              <p className="prospects-mobile-item-card__description">{item.descricao || "Sem descrição cadastrada."}</p>

              <div className="prospects-inline-links">
                {mapsUrl ? (
                  <a className="prospects-inline-link" href={mapsUrl} target="_blank" rel="noreferrer">
                    <MapPinIcon />
                    <span>Mapa</span>
                  </a>
                ) : null}
                {comparaveis.map((link) => (
                  <a key={`${item.codigo}-${link.label}`} className="prospects-inline-link" href={link.url} target="_blank" rel="noreferrer">
                    <span>{link.label}</span>
                    <ArrowUpRightIcon />
                  </a>
                ))}
              </div>

              {item.observacoes ? (
                <div className="prospects-mobile-item-card__note">
                  <span>Observação atual</span>
                  <strong>{item.observacoes}</strong>
                </div>
              ) : null}

              <div className="prospects-mobile-item-card__actions">
                <button
                  type="button"
                  className="prospects-btn secondary prospects-btn--mobile-action"
                  onClick={() => onEditarObservacoes(item)}
                  disabled={!podeOperar || updateLoadingIds.has(`${item.codigo}:observacoes`)}
                >
                  <NoteIcon />
                  <span>Notas</span>
                </button>
                <button
                  type="button"
                  className="prospects-btn secondary prospects-btn--mobile-action"
                  onClick={() => onAbrirAnalise(item)}
                  disabled={!podeOperar}
                >
                  <ChartIcon />
                  <span>Viabilidade</span>
                </button>
                <button
                  type="button"
                  className={`prospects-btn ghost prospects-btn--mobile-action ${item.avaliacaoAutomatica ? "is-active" : ""}`.trim()}
                  onClick={() => item.avaliacaoAutomatica && onAbrirEnriquecimentos(item)}
                  disabled={!item.avaliacaoAutomatica || !itemAtivo}
                >
                  <SparklesIcon />
                  <span>Enriquecimentos</span>
                </button>
                <button
                  type="button"
                  className="prospects-btn ghost prospects-btn--mobile-action"
                  onClick={() => onAcionarAnaliseIa(item)}
                  disabled={!itemAtivo}
                >
                  <SparklesIcon />
                  <span>{getAnaliseIaActionLabel(item)}</span>
                </button>
                <button
                  type="button"
                  className="prospects-btn tertiary prospects-btn--mobile-action"
                  onClick={() => onEditarPrioridade(item)}
                  disabled={!podeOperar || updateLoadingIds.has(`${item.codigo}:prioridade`)}
                >
                  <PriorityIcon level={Number(item.prioridade || 2)} />
                  <span>Prioridade</span>
                </button>
                {canManageResponsaveis ? (
                  <button
                    type="button"
                    className="prospects-btn tertiary prospects-btn--mobile-action"
                    onClick={() => onEditarResponsaveis(item)}
                  >
                    <UsersIcon />
                    <span>Responsáveis</span>
                  </button>
                ) : null}
                {podeExcluir ? (
                  <button
                    type="button"
                    className="prospects-btn danger prospects-btn--mobile-action"
                    onClick={() => onExcluir(item)}
                    disabled={removeLoadingIds.has(item.codigo)}
                  >
                    <TrashIcon />
                    <span>Remover</span>
                  </button>
                ) : null}
                {podeReativar ? (
                  <button
                    type="button"
                    className="prospects-btn secondary prospects-btn--mobile-action"
                    onClick={() => onReativar(item)}
                    disabled={updateLoadingIds.has(`${item.codigo}:reativar`)}
                  >
                    <ArrowUpRightIcon />
                    <span>Reativar</span>
                  </button>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function MobileCapturadosList({
  dados,
  total,
  page,
  pageSize,
  loading,
  erro,
  onBack,
  onIncluir,
  includeLoadingIds,
  selectedCodes,
  filtroFonteCap,
  setFiltroFonteCap,
  filtroUfCap,
  setFiltroUfCap,
  ufOptions,
  filtroCidadesCap,
  onToggleCidade,
  cidadesOptions,
  filtroFinanciaCap,
  setFiltroFinanciaCap,
  sortBy,
  setSortBy,
  sortDir,
  setSortDir,
  pageSizeOptions,
  setPageSize,
  onPageChange,
  onResetFilters,
  onAbrirAvaliacao,
  onAbrirAvaliacaoDetalhada,
  onAbrirAnalise,
}) {
  const [citySearch, setCitySearch] = useState("");
  if (loading) return <div className="prospects-card"><p className="prospects-empty">Carregando base de prospecção...</p></div>;
  if (erro) return <div className="prospects-card"><p className="prospects-empty">Erro ao carregar capturados: {erro}</p></div>;

  const totalPages = Math.max(1, Math.ceil((total || 0) / pageSize));
  const normalizedCitySearch = citySearch.trim().toLowerCase();
  const cidadesVisiveis = normalizedCitySearch
    ? cidadesOptions.filter((cidade) => cidade.toLowerCase().includes(normalizedCitySearch))
    : cidadesOptions;

  return (
    <section className="prospects-mobile-section">
      <div className="prospects-card">
        <div className="prospects-card__header prospects-card__header--stacked">
          <div>
            <p className="prospects-eyebrow">Mobile</p>
            <h2 className="prospects-title">Selecionar imóveis</h2>
            <p className="prospects-subtitle prospects-subtitle--compact">
              Explore a base capturada e envie imóveis para a fila operacional de prospecção.
            </p>
          </div>
          <div className="prospects-card__header-actions">
            <span className="prospects-pill">{total} capturados</span>
            <button type="button" className="prospects-btn tertiary prospects-btn--toolbar" onClick={onBack}>
              <ArrowLeftIcon />
              <span>Menu mobile</span>
            </button>
          </div>
        </div>
      </div>

      <div className="prospects-card prospects-mobile-filters">
        <div className="prospects-mobile-filters__grid">
          <label className="prospects-toolbar-field">
            <span>Origem</span>
            <select
              value={filtroFonteCap}
              onChange={(e) => {
                setFiltroFonteCap(e.target.value);
                onPageChange(1);
              }}
            >
              {FONTE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <label className="prospects-toolbar-field">
            <span>UF</span>
            <select
              value={filtroUfCap[0] || ""}
              onChange={(e) => setFiltroUfCap(e.target.value ? [e.target.value] : [])}
            >
              <option value="">Todas</option>
              {ufOptions.map((uf) => (
                <option key={uf} value={uf}>{uf}</option>
              ))}
            </select>
          </label>

          <label className="prospects-toolbar-field">
            <span>Financia</span>
            <select
              value={filtroFinanciaCap[0] || ""}
              onChange={(e) => setFiltroFinanciaCap(e.target.value ? [e.target.value] : [])}
            >
              <option value="">Todos</option>
              <option value="sim">Sim</option>
              <option value="nao">Não</option>
            </select>
          </label>

          <label className="prospects-toolbar-field">
            <span>Ordenar por</span>
            <select
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value);
                onPageChange(1);
              }}
            >
              <option value="ultima_disputa">Última disputa</option>
              <option value="codigo">Código</option>
              <option value="cidade">Cidade</option>
              <option value="uf">UF</option>
              <option value="modalidade">Modalidade</option>
              <option value="valor_minimo">Valor mínimo</option>
              <option value="score_total">Score</option>
              <option value="retorno_pct">ROI estimado</option>
            </select>
          </label>

          <label className="prospects-toolbar-field">
            <span>Direção</span>
            <select
              value={sortDir}
              onChange={(e) => {
                setSortDir(e.target.value);
                onPageChange(1);
              }}
            >
              <option value="asc">Crescente</option>
              <option value="desc">Decrescente</option>
            </select>
          </label>

          <label className="prospects-toolbar-field">
            <span>Itens por página</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                onPageChange(1);
              }}
            >
              {pageSizeOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="prospects-mobile-filters__stack">
          <div className="prospects-toolbar-field prospects-toolbar-field--checklist">
            <div className="prospects-mobile-filter-head">
              <span>Cidades</span>
              <strong>{filtroCidadesCap.length ? `${filtroCidadesCap.length} selecionadas` : "Todas"}</strong>
            </div>
            <input
              type="search"
              value={citySearch}
              onChange={(e) => setCitySearch(e.target.value)}
              placeholder="Buscar cidade"
            />
            {filtroCidadesCap.length ? (
              <div className="prospects-mobile-city-selected">
                {filtroCidadesCap.map((cidade) => (
                  <button
                    key={cidade}
                    type="button"
                    className="prospects-mobile-city-chip is-selected"
                    onClick={() => onToggleCidade(cidade)}
                  >
                    <span>{cidade}</span>
                    <strong>x</strong>
                  </button>
                ))}
              </div>
            ) : null}
            <div className="prospects-mobile-city-grid">
              {cidadesVisiveis.length ? cidadesVisiveis.map((cidade) => {
                const ativa = filtroCidadesCap.includes(cidade);
                return (
                  <button
                    key={cidade}
                    type="button"
                    className={`prospects-mobile-city-chip ${ativa ? "is-selected" : ""}`.trim()}
                    onClick={() => onToggleCidade(cidade)}
                  >
                    {cidade}
                  </button>
                );
              }) : (
                <p className="prospects-empty prospects-empty--inline">Nenhuma cidade encontrada.</p>
              )}
            </div>
          </div>
        </div>

        <div className="prospects-mobile-filters__footer">
          <div className="prospects-mobile-filters__metrics">
            <span className="prospects-pill">{dados.length} na página</span>
            <span className="prospects-pill prospects-pill--muted">{selectedCodes.size} na fila</span>
          </div>
          <button type="button" className="prospects-btn tertiary prospects-btn--toolbar" onClick={onResetFilters}>
            Limpar filtros
          </button>
        </div>
      </div>

      {!dados.length ? (
        <div className="prospects-card">
          <p className="prospects-empty">Nenhum imóvel capturado encontrado com os filtros atuais.</p>
        </div>
      ) : null}

      <div className="prospects-mobile-list">
        {dados.map((item) => {
          const jaSelecionado = selectedCodes.has(item.codigo);
          const avaliacao = item.avaliacaoAutomatica;
          const resumoLeilao = getLeilaoResumo(item);
          const mapsUrl = getMapsUrl(item);
          const comparaveis = getComparaveisLinks(item);
          const editalUrl = extrairEditalUrl(item.descricao);
          const fonteLabel = getFonteLabel(item.fonte);
          const processoNumero = extrairProcessoNumero(item.descricao);
          return (
            <article
              key={item.codigo}
              className="prospects-mobile-item-card"
            >
              <div className="prospects-mobile-item-card__media">
                <ProspectGallery item={item} className="prospects-mobile-item-card__photo" compact />
              </div>

              <div className="prospects-mobile-item-card__top">
                <div>
                  <a className="prospects-link mono" href={item.link} target="_blank" rel="noreferrer">
                    {item.codigo}
                  </a>
                  <p className="prospects-mobile-item-card__location">
                    {[item.cidade, item.uf].filter(Boolean).join("/") || "Sem localização"}
                  </p>
                </div>
                <div className="prospects-mobile-item-card__pills">
                  <span className="prospects-chip">{item.modalidade || "Sem modalidade"}</span>
                  {fonteLabel ? <span className={`prospects-chip ${item.fonte === "tjdft_judicial" ? "prospects-chip--judicial" : "prospects-chip--source"}`.trim()}>{fonteLabel}</span> : null}
                  {jaSelecionado ? (
                    <span className="prospects-chip prospects-chip--selected">Na fila</span>
                  ) : null}
                </div>
              </div>

              <div className="prospects-mobile-item-card__meta">
                <div>
                  <span>{resumoLeilao?.label || "Valor mínimo"}</span>
                  <strong>{formatarMoeda(resumoLeilao?.valor ?? item.valorMinimo)}</strong>
                </div>
                <div>
                  <span>Valor avaliação</span>
                  <strong>{formatarMoeda(item.valorAvaliacao)}</strong>
                </div>
                <div>
                  <span>{resumoLeilao?.data ? "Data do evento" : "Última disputa"}</span>
                  <strong>{formatarDataHoraCompacta(resumoLeilao?.data || item.ultima_disputa)}</strong>
                </div>
                <div>
                  <span>Financia</span>
                  <strong>{item.financia === undefined || item.financia === null ? "—" : item.financia ? "Sim" : "Não"}</strong>
                </div>
                <div>
                  <span>Status</span>
                  <strong>{item.situacao || "—"}</strong>
                </div>
                {processoNumero ? (
                  <div>
                    <span>Processo</span>
                    <strong>{processoNumero}</strong>
                  </div>
                ) : null}
              </div>

              {avaliacao ? (
                <div className="prospects-mobile-item-card__auto">
                  <span className={`prospects-auto-badge ${getScoreClasse(avaliacao.score_total)}`}>{avaliacao.score_total ?? "—"}/85</span>
                  <span className={`prospects-auto-badge ${getRoiClasse(avaliacao.retorno_pct)}`}>{formatarPercentual(avaliacao.retorno_pct)}</span>
                </div>
              ) : null}

              <DetalhesTexto texto={item.descricao} className="prospects-mobile-item-card__description" />

              <div className="prospects-inline-links">
                <a
                  className="prospects-inline-link"
                  href={item.link}
                  target="_blank"
                  rel="noreferrer"
                >
                  <span>Anúncio</span>
                  <ArrowUpRightIcon />
                </a>
                {mapsUrl ? (
                  <a
                    className="prospects-inline-link"
                    href={mapsUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <MapPinIcon />
                    <span>Mapa</span>
                  </a>
                ) : null}
                {comparaveis.map((link) => (
                  <a
                    key={`${item.codigo}-${link.label}`}
                    className="prospects-inline-link"
                    href={link.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span>{link.label}</span>
                    <ArrowUpRightIcon />
                  </a>
                ))}
                {editalUrl ? (
                  <a
                    className="prospects-inline-link prospects-inline-link--highlight"
                    href={editalUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span>Ver edital</span>
                    <ArrowUpRightIcon />
                  </a>
                ) : null}
              </div>

              <div className="prospects-mobile-item-card__actions">
                {avaliacao ? (
                  <button
                    type="button"
                    className="prospects-btn ghost prospects-btn--mobile-action"
                    onClick={() => onAbrirAvaliacao(item)}
                  >
                    <span>Pré-análise</span>
                  </button>
                ) : null}
                <button
                  type="button"
                  className={`prospects-btn ghost prospects-btn--mobile-action ${item.analiseIaSalva ? "is-active" : ""}`.trim()}
                  onClick={() => onAbrirAvaliacaoDetalhada(item, "ia", "capturados")}
                >
                  <span>{item.analiseIaSalva ? "IA salva" : "Avaliação IA"}</span>
                </button>
                <button
                  type="button"
                  className={`prospects-btn ghost prospects-btn--mobile-action ${item.analiseSalva ? "is-active" : ""}`.trim()}
                  onClick={() => onAbrirAnalise(item, "capturados")}
                >
                  <span>{item.analiseSalva ? "Viabilidade salva" : "Viabilidade"}</span>
                </button>
                <button
                  type="button"
                  className={`prospects-btn ${jaSelecionado ? "ghost" : "secondary"} prospects-btn--mobile-action`}
                  onClick={() => onIncluir(item)}
                  disabled={includeLoadingIds.has(item.codigo)}
                >
                  <span>{includeLoadingIds.has(item.codigo) ? "Incluindo..." : jaSelecionado ? "Reenviar ao funil" : "Selecionar"}</span>
                </button>
              </div>
            </article>
          );
        })}
      </div>

      <div className="prospects-card prospects-mobile-pagination">
        <div className="prospects-pagination__summary">
          Página {page} de {totalPages}
        </div>
        <div className="prospects-pagination__controls">
          <button type="button" className="prospects-btn secondary" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
            Anterior
          </button>
          <button type="button" className="prospects-btn secondary" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
            Próxima
          </button>
        </div>
      </div>
    </section>
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

  const setAvaliacaoDetalhadaStatusState = useCallback(({ message = "", tone = "info", action = null } = {}) => {
    setAvaliacaoDetalhadaStatus(message);
    setAvaliacaoDetalhadaStatusTone(tone);
    setAvaliacaoDetalhadaStatusActionKind(action?.kind || null);
  }, []);
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
    const possuiHistorico = Boolean(
      data?.historico_chat?.length
      || data?.analise_texto
      || data?.matricula_texto
    );
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
        await refreshSelecionados();
      }
    } finally {
      setAiLoading(false);
    }
  }, [user, refreshSelecionados, sincronizarIndicadorAnaliseIaCapturada, setAvaliacaoDetalhadaStatusState]);

  const openAvaliacaoDetalhadaModal = async (item, initialTab = "dados", origem = "selecionados") => {
    const aiAttemptKey = `${origem}:${item.codigo}`;
    aiAutoInitAttemptRef.current.delete(aiAttemptKey);
    setAvaliacaoDetalhadaItem(item);
    setAvaliacaoDetalhadaOrigem(origem);
    setAvaliacaoDetalhadaTab(initialTab);
    setAiMensagemDraft("");
    setAiSinteseDraft("");
    setAvaliacaoDetalhadaStatusState();
    setAiAnalise(null);
    setAiLoading(initialTab === "ia");
    setAnaliseDetalhada(null);
    setAnaliseDetalhadaLoading(true);
    try {
      const [analiseData] = await Promise.all([
        fetchAnaliseSelecionado(item.codigo).catch(() => null),
        carregarAiAnalise(item.codigo, { autoInit: false, origem }),
      ]);
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
      {mensagem && <div className="prospects-message">{mensagem}</div>}

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
                  title="Controle financeiro"
                  description={descricaoFinanceiroMobile}
                  count={financeiroCount ?? 0}
                  icon={<FinanceIcon />}
                  to={canAccessFinance ? financeiroDestino : undefined}
                  disabled={!canAccessFinance}
                />
                <MobileHubCard
                  eyebrow="Prospecção"
                  title="Selecionar imóveis"
                  description="Consulte a base capturada e inclua rapidamente novos imóveis na fila de prospecção."
                  count={capturadosTotal}
                  icon={<ProspectIcon />}
                  onClick={() => setMobileSection("capturados")}
                />
                <MobileHubCard
                  eyebrow="Prospecção"
                  title="Selecionados para prospecção"
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
              searchValue={selectedSearch}
              onSearchChange={setSelectedSearch}
              selectedUfFilter={selectedUfFilter}
              onUfFilterChange={setSelectedUfFilter}
              ufOptions={selectedUfOptions}
              selectedPrioridadeFilter={selectedPrioridadeFilter}
              onPrioridadeFilterChange={setSelectedPrioridadeFilter}
              selectedActivityFilter={selectedActivityFilter}
              onActivityFilterChange={setSelectedActivityFilter}
              selectedResponsavelFilter={selectedResponsavelFilter}
              onResponsavelFilterChange={setSelectedResponsavelFilter}
              selectedSortBy={selectedSortBy}
              onSortByChange={setSelectedSortBy}
              selectedSortDir={selectedSortDir}
              onSortDirChange={setSelectedSortDir}
              selectedUserFilter={selectedUserFilter}
              onUserFilterChange={setSelectedUserFilter}
              selectedUserOptions={selectedUserOptions}
              canFilterByUser={user?.role === "admin"}
              selectedMetrics={selectedMetrics}
              onResetFilters={() => {
                setSelectedSearch("");
                setSelectedUfFilter("todos");
                setSelectedPrioridadeFilter("todas");
                setSelectedActivityFilter("ativos");
                setSelectedResponsavelFilter("todos");
                setSelectedUserFilter("todos");
                setSelectedSortBy("dataLeilao");
                setSelectedSortDir("asc");
              }}
              onEditarObservacoes={openObservacoesModal}
              onAbrirAnalise={openAnaliseModal}
              onAbrirEnriquecimentos={openAvaliacaoAutomaticaModal}
              onAbrirAvaliacaoDetalhada={openAvaliacaoDetalhadaModal}
              onAcionarAnaliseIa={handleAcionarAnaliseIa}
              onEditarPrioridade={openPrioridadeModal}
              onEditarResponsaveis={openResponsaveisModal}
              onExcluir={setConfirmDeleteItem}
              onReativar={handleReativarSelecionado}
              canOperateItem={canOperateItem}
              canManageResponsaveis={canManageResponsaveis}
              canDeleteItem={canDeleteItem}
              canReactivateItem={canReactivateItem}
              updateLoadingIds={updateLoadingIds}
              removeLoadingIds={removeLoadingIds}
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
        onCancel={() => {
          if (manualSelecionadoSaving) return;
          setManualSelecionadoDraft(null);
        }}
        onSave={handleSalvarSelecionadoManual}
      />

      <PrioridadeModal
        item={prioridadeItem}
        loading={Boolean(prioridadeItem && updateLoadingIds.has(`${prioridadeItem.codigo}:prioridade`))}
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
