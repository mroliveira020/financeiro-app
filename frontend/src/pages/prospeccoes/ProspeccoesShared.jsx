import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";

const getProspectPhotoAlt = (item) => {
  const local = [item?.bairro, item?.cidade, item?.uf].filter(Boolean).join(" - ");
  return local ? `Foto do imóvel em ${local}` : `Foto do imóvel ${item?.codigo || ""}`.trim();
};

export function ProspectPhoto({ item, className = "" }) {
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

export function ProspectGallery({ item, className = "", compact = false }) {
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

export function DetalhesTexto({ texto, className = "" }) {
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

export function TextoEstruturado({ texto, className = "" }) {
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

function IconBase({ children, label }) {
  return (
    <svg viewBox="0 0 24 24" role="img" aria-label={label} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

export function NoteIcon() {
  return (
    <IconBase label="Observações">
      <path d="M8 3.5h8l4 4V19a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5.5a2 2 0 0 1 2-2Z" />
      <path d="M16 3.5V8h4" />
      <path d="M9 12h6" />
      <path d="M9 16h4" />
    </IconBase>
  );
}

export function UsersIcon() {
  return (
    <IconBase label="Responsáveis">
      <path d="M16 21v-1.5a3.5 3.5 0 0 0-3.5-3.5h-1A3.5 3.5 0 0 0 8 19.5V21" />
      <circle cx="12" cy="9" r="3" />
      <path d="M19 21v-1a3 3 0 0 0-2.2-2.9" />
      <path d="M17 5.5a2.5 2.5 0 0 1 0 5" />
    </IconBase>
  );
}

export function PriorityIcon({ level = 2 }) {
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

export function ChartIcon() {
  return (
    <IconBase label="Análise financeira">
      <path d="M4 19h16" />
      <path d="M7 16v-4" />
      <path d="M12 16V8" />
      <path d="M17 16v-7" />
    </IconBase>
  );
}

export function TrashIcon() {
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

export function EyeIcon({ closed = false }) {
  return (
    <IconBase label={closed ? "Mostrar selecionados" : "Ocultar selecionados"}>
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
      {closed ? <path d="M4 4l16 16" /> : null}
    </IconBase>
  );
}

export function FinanceIcon() {
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

export function QueueIcon() {
  return (
    <IconBase label="Selecionados para prospecção">
      <path d="M4 6.5h16" />
      <path d="M4 12h16" />
      <path d="M4 17.5h10" />
      <circle cx="18" cy="17.5" r="2" />
    </IconBase>
  );
}

export function ProspectIcon() {
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

export function ArrowLeftIcon() {
  return (
    <IconBase label="Voltar">
      <path d="M19 12H5" />
      <path d="m11 18-6-6 6-6" />
    </IconBase>
  );
}

export function MoreIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="5" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="19" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function ArrowUpRightIcon() {
  return (
    <IconBase label="Abrir módulo">
      <path d="M8 16 16 8" />
      <path d="M10 8h6v6" />
    </IconBase>
  );
}

export function MapPinIcon() {
  return (
    <IconBase label="Abrir no mapa">
      <path d="M12 20s6-4.8 6-10a6 6 0 1 0-12 0c0 5.2 6 10 6 10Z" />
      <circle cx="12" cy="10" r="2.2" />
    </IconBase>
  );
}

export function SparklesIcon() {
  return (
    <IconBase label="Indicador">
      <path d="m12 3 1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3Z" />
      <path d="m18.5 15 .7 2.1 2.1.7-2.1.7-.7 2.1-.7-2.1-2.1-.7 2.1-.7.7-2.1Z" />
    </IconBase>
  );
}

export function CloseIcon() {
  return (
    <IconBase label="Fechar">
      <path d="M6 6l12 12" />
      <path d="M18 6 6 18" />
    </IconBase>
  );
}

export function MobileHubCard({
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
