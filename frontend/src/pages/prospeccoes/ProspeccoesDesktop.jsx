import { useState } from "react";
import ProspeccaoSearch from "./ProspeccaoSearch";
import {
  ProspectPhoto,
  MapPinIcon,
  ArrowUpRightIcon,
  SparklesIcon,
} from "./ProspeccoesShared";
import styles from "./ProspeccoesDesktop.module.css";
import { handleTabKeys } from "../../utils/handleTabKeys";

const currency = (value) =>
  value == null
    ? "Valor não informado"
    : Number(value).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      });

function auctionDate(value) {
  if (!value) return "Data não informada";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Data não informada"
    : date.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function sourceLabel(source) {
  return (
    { caixa_extrajudicial: "CAIXA", tjdft_judicial: "TJDFT" }[source] ||
    source ||
    ""
  );
}

function Field({ label, value, onChange, children }) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {children}
      </select>
    </label>
  );
}

function BidRange({ minimum, maximum, limit, onChange }) {
  const lower = Number(minimum) || 0;
  const upper = maximum === "" ? limit : Number(maximum);
  return (
    <fieldset className={styles.bidFilter}>
      <legend>Valor do lance</legend>
      <div className={styles.bidValues}>
        <label>
          <span className={styles.srOnly}>Lance mínimo em reais</span>
          <span aria-hidden="true">R$</span>
          <input
            type="number"
            min="0"
            max={upper}
            step="1000"
            value={minimum}
            placeholder="0"
            onChange={(event) =>
              onChange(
                Math.min(Math.max(0, Number(event.target.value)), upper),
                undefined,
              )
            }
          />
        </label>
        <label>
          <span className={styles.srOnly}>Lance máximo em reais</span>
          <input
            type="number"
            min={lower}
            step="1000"
            value={maximum}
            placeholder="Sem limite"
            onChange={(event) =>
              onChange(
                undefined,
                event.target.value === ""
                  ? ""
                  : Math.max(lower, Number(event.target.value)),
              )
            }
          />
        </label>
      </div>
      <div className={styles.bidSlider}>
        <div className={styles.bidTrack} aria-hidden="true">
          <span
            style={{
              left: `${(lower / limit) * 100}%`,
              right: `${100 - (upper / limit) * 100}%`,
            }}
          />
        </div>
        <input
          type="range"
          aria-label="Valor mínimo do lance"
          aria-valuetext={currency(lower)}
          min="0"
          max={limit}
          step="1000"
          value={lower}
          onChange={(event) =>
            onChange(Math.min(Number(event.target.value), upper), undefined)
          }
        />
        <input
          type="range"
          aria-label="Valor máximo do lance"
          aria-valuetext={maximum === "" ? "Sem limite" : currency(upper)}
          min="0"
          max={limit}
          step="1000"
          value={upper}
          onChange={(event) => {
            const next = Math.max(lower, Number(event.target.value));
            onChange(undefined, next === limit ? "" : next);
          }}
        />
      </div>
    </fieldset>
  );
}

function PropertyCard({ item, onOpen, onRequest, canAnalyze, getMapsUrl }) {
  const mapsUrl = getMapsUrl(item);
  const originalUrl = /^https?:\/\//i.test(item.link || "") ? item.link : null;
  const hasAnalysis =
    item.avaliado ?? Boolean(item.analiseIaSalva || item.avaliacaoAutomatica);
  const price = item.melhorLance;
  return (
    <article className={styles.card}>
      <button
        type="button"
        className={styles.openCard}
        onClick={() => onOpen(item)}
        aria-label={`Abrir imóvel ${item.codigo}`}
      >
        <ProspectPhoto item={item} className={styles.photo} />
        <span className={styles.facts}>
          <strong className={styles.name}>
            {[item.cidade, item.uf].filter(Boolean).join(" / ") ||
              "Localização não informada"}
          </strong>
          <span className={styles.location}>
            {item.bairro || item.endereco || "Bairro não informado"}
            <span className={styles.source}>
              {item.fonte ? ` · ${sourceLabel(item.fonte)}` : ""}
            </span>
          </span>
          <span className={styles.opportunity}>
            <strong>{currency(price)}</strong>
            <span> · {auctionDate(item.melhorData)}</span>
          </span>
          <span className={styles.reference}>
            Ref. {currency(item.valorAvaliacao)}
          </span>
          <span className={styles.features}>
            {item.tipoImovel || "Imóvel"} ·{" "}
            {item.financia == null
              ? "Financiamento não informado"
              : item.financia
                ? "Financia"
                : "Não financia"}
          </span>
        </span>
      </button>
      <div className={styles.cardFooter}>
        {item.analiseSolicitada ? (
          <button
            type="button"
            className={styles.analysis}
            onClick={() => onOpen(item, "ia")}
          >
            Solicitada análise IA
          </button>
        ) : hasAnalysis ? (
          <button
            type="button"
            className={`${styles.analysis} ${styles.complete}`}
            aria-label="Concluída análise IA"
            onClick={() => onOpen(item, "ia")}
          >
            <SparklesIcon />
            Concluída análise IA
          </button>
        ) : (
          <button
            type="button"
            className={styles.analysis}
            disabled={!canAnalyze}
            title={
              canAnalyze
                ? "Solicitar avaliação deste imóvel"
                : "Seu usuário precisa de acesso à IA"
            }
            onClick={() => onRequest(item)}
          >
            Solicitar análise IA
          </button>
        )}
        <div className={styles.externalLinks}>
          {mapsUrl && (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noreferrer"
              aria-label={`Mapa do imóvel ${item.codigo}`}
              title="Google Maps"
            >
              <MapPinIcon />
              <span>Mapa</span>
            </a>
          )}
          {originalUrl && (
            <a
              href={originalUrl}
              target="_blank"
              rel="noreferrer"
              aria-label={`Anúncio original do imóvel ${item.codigo}`}
              title="Anúncio original"
            >
              <ArrowUpRightIcon />
              <span>Anúncio</span>
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

export default function ProspeccoesDesktop({
  dados,
  total,
  loading,
  erro,
  query,
  setters,
  meta,
  onOpen,
  onRequest,
  canAnalyze,
  getMapsUrl,
  pageSize,
  page,
  sortBy,
  sortDir,
  onSortChange,
  onPageChange,
  tabs,
  activeCode,
  onActivate,
  onCloseTab,
  scrollRef,
}) {
  const [advanced, setAdvanced] = useState(false);
  const [citySearch, setCitySearch] = useState("");
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const limit = Math.max(
    1000000,
    Math.ceil(Number(meta.lance_maximo || 0) / 100000) * 100000,
    Number(query.lance_max) || 0,
    Number(query.lance_min) || 0,
  );
  function changeFilter(key, value) {
    setters[key](value);
    if (key === "busca") setters.busca_campo("");
    setters.pagina(1);
    scrollRef.current?.scrollTo({ top: 0 });
  }
  function changeBid(minimum, maximum) {
    if (minimum !== undefined) setters.lance_min(minimum === 0 ? "" : minimum);
    if (maximum !== undefined) setters.lance_max(maximum);
    setters.pagina(1);
  }
  const filters = [
    [
      "busca",
      query.busca_campo
        ? `${{ cidade: "Cidade", bairro: "Bairro", tipo: "Tipo" }[query.busca_campo]} · ${query.busca}`
        : query.busca,
      "",
    ],
    ["uf", query.uf.join(", "), []],
    [
      "financia",
      query.financia.length
        ? query.financia[0] === "sim"
          ? "Financia"
          : "Não financia"
        : "",
      [],
    ],
    [
      "avaliados",
      query.avaliados === "sim"
        ? "Avaliados"
        : query.avaliados === "nao"
          ? "Não avaliados"
          : "",
      "",
    ],
    [
      "fonte",
      query.fonte === "todas"
        ? ""
        : query.fonte === "caixa"
          ? "CAIXA"
          : "TJDFT",
      "todas",
    ],
    ["modalidade", query.modalidade.join(", "), []],
    ...query.cidade.map((cidade) => [
      "cidade",
      cidade,
      query.cidade.filter((value) => value !== cidade),
    ]),
    [
      "presenca",
      query.presenca === "presentes"
        ? ""
        : query.presenca === "todos"
          ? "Todas as capturas"
          : "Ausentes na captura",
      "presentes",
    ],
    ["revisao", query.revisao ? "Precisam de revisão" : "", false],
    ["pre_analise", query.pre_analise ? "Com pré-análise" : "", false],
    ["score", query.score !== "" ? `Score ≥ ${query.score}` : "", ""],
    ["roi", query.roi !== "" ? `ROI ≥ ${query.roi}` : "", ""],
  ].filter(([, label]) => label);
  const hasBid = query.lance_min !== "" || query.lance_max !== "";
  function resetFilters() {
    filters.forEach(([key, , initial]) => setters[key](initial));
    setters.busca_campo("");
    setters.cidade([]);
    setCitySearch("");
    changeBid("", "");
  }
  return (
    <div className={styles.workspace}>
      <div
        className={styles.tabs}
        role="tablist"
        aria-label="Abas de prospecção"
        onKeyDown={handleTabKeys}
      >
        <button
          type="button"
          id="desktop-research-tab"
          role="tab"
          aria-selected={!activeCode}
          aria-controls="desktop-research-panel"
          tabIndex={activeCode ? -1 : 0}
          className={!activeCode ? styles.selectedTab : ""}
          onClick={() => onActivate(null)}
        >
          Prospecção
        </button>
        {tabs.map((item) => (
          <div key={item.codigo} className={styles.propertyTab}>
            <button
              type="button"
              id={`desktop-tab-${item.codigo}`}
              role="tab"
              aria-selected={activeCode === item.codigo}
              aria-controls="desktop-property-panel"
              tabIndex={activeCode === item.codigo ? 0 : -1}
              className={activeCode === item.codigo ? styles.selectedTab : ""}
              onClick={() => onActivate(item)}
            >
              {item.bairro || item.cidade || item.codigo} · {item.uf}
              <span className={styles.tabCode}>{item.codigo}</span>
            </button>
            <button
              type="button"
              className={styles.closeTab}
              aria-label={`Fechar aba do imóvel ${item.codigo}`}
              onClick={() => onCloseTab(item.codigo)}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <section
        ref={scrollRef}
        className={styles.research}
        id="desktop-research-panel"
        role="tabpanel"
        aria-labelledby="desktop-research-tab"
        hidden={Boolean(activeCode)}
      >
        <h1>Prospecção</h1>
        <div className={styles.filters}>
          <ProspeccaoSearch
            value={query.busca}
            ufs={query.uf}
            onChange={(value) => changeFilter("busca", value)}
            onSelect={(option) => {
              if (option.categoria === "cidade") {
                changeFilter("cidade", (current) =>
                  current.includes(option.valor)
                    ? current
                    : [...current, option.valor],
                );
                changeFilter("busca", "");
              } else {
                changeFilter("busca", option.valor);
                setters.busca_campo(option.categoria);
              }
            }}
          />
          <Field
            label="UF"
            value={query.uf[0] || ""}
            onChange={(value) => {
              changeFilter("uf", value ? [value] : []);
              setters.cidade([]);
            }}
          >
            <option value="">Todas</option>
            {(meta.ufs || []).map((uf) => (
              <option key={uf}>{uf}</option>
            ))}
          </Field>
          <ProspeccaoSearch
            label="Cidades"
            value={citySearch}
            ufs={query.uf}
            category="cidade"
            multiple
            selectedValues={query.cidade}
            placeholder={
              query.cidade.length
                ? `${query.cidade.length} cidade(s) selecionada(s)`
                : "Selecione cidades"
            }
            onChange={setCitySearch}
            onSelect={(option) => {
              changeFilter("cidade", (current) =>
                current.includes(option.valor)
                  ? current.filter((cidade) => cidade !== option.valor)
                  : [...current, option.valor],
              );
              setCitySearch("");
            }}
          />
          <Field
            label="Financia"
            value={query.financia[0] || ""}
            onChange={(value) => changeFilter("financia", value ? [value] : [])}
          >
            <option value="">Todos</option>
            <option value="sim">Financia</option>
            <option value="nao">Não financia</option>
          </Field>
          <Field
            label="Avaliados"
            value={query.avaliados}
            onChange={(value) => changeFilter("avaliados", value)}
          >
            <option value="">Todos</option>
            <option value="sim">Avaliados</option>
            <option value="nao">Não avaliados</option>
          </Field>
          <button
            type="button"
            className={styles.advancedToggle}
            aria-expanded={advanced}
            aria-controls="desktop-extra-filters"
            onClick={() => setAdvanced(!advanced)}
          >
            Filtros avançados{" "}
            <span aria-hidden="true">{advanced ? "⌃" : "⌄"}</span>
            <small>Origem e modalidade</small>
          </button>
        </div>
        {advanced && (
          <div id="desktop-extra-filters" className={styles.advanced}>
            <Field
              label="Origem"
              value={query.fonte}
              onChange={(value) => changeFilter("fonte", value)}
            >
              <option value="todas">Todas</option>
              <option value="caixa">CAIXA</option>
              <option value="tjdft">TJDFT</option>
            </Field>
            <Field
              label="Modalidade"
              value={query.modalidade[0] || ""}
              onChange={(value) =>
                changeFilter("modalidade", value ? [value] : [])
              }
            >
              <option value="">Todas</option>
              {(meta.modalidades || []).map((value) => (
                <option key={value}>{value}</option>
              ))}
            </Field>
            <Field
              label="Presença na captura"
              value={query.presenca}
              onChange={(value) => changeFilter("presenca", value)}
            >
              <option value="presentes">Presentes</option>
              <option value="ausentes">Ausentes</option>
              <option value="todos">Todos</option>
            </Field>
            <label className={styles.checkbox}>
              <input
                type="checkbox"
                checked={query.revisao}
                onChange={(event) =>
                  changeFilter("revisao", event.target.checked)
                }
              />
              Precisam de revisão
            </label>
          </div>
        )}
        {(filters.length > 0 || hasBid) && (
          <div className={styles.chips}>
            {filters.map(([key, label, initial]) => (
              <button
                type="button"
                key={`${key}:${label}`}
                onClick={() => changeFilter(key, initial)}
                aria-label={`Remover filtro ${label}`}
              >
                {label}
                <span aria-hidden="true">×</span>
              </button>
            ))}
            {hasBid && (
              <button
                type="button"
                onClick={() => changeBid("", "")}
                aria-label="Remover faixa de lance"
              >
                {currency(Number(query.lance_min) || 0)} –{" "}
                {query.lance_max === ""
                  ? "sem limite"
                  : currency(query.lance_max)}
                <span aria-hidden="true">×</span>
              </button>
            )}
            <button type="button" onClick={resetFilters}>
              Limpar filtros
            </button>
          </div>
        )}
        <div className={styles.toolbar}>
          <strong aria-live="polite">
            {total
              ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)}`
              : "0"}{" "}
            de {total.toLocaleString("pt-BR")} imóveis
          </strong>
          <BidRange
            minimum={query.lance_min}
            maximum={query.lance_max}
            limit={limit}
            onChange={changeBid}
          />
          <div>
            <label className={styles.srOnly} htmlFor="desktop-page-size">
              Itens por página
            </label>
            <select
              id="desktop-page-size"
              value={pageSize}
              onChange={(event) => {
                setters.por_pagina(Number(event.target.value));
                setters.pagina(1);
              }}
            >
              {[20, 50, 100].map((size) => (
                <option value={size} key={size}>
                  {size} por página
                </option>
              ))}
            </select>
            <label className={styles.srOnly} htmlFor="desktop-sort">
              Ordenação
            </label>
            <select
              id="desktop-sort"
              value={`${sortBy}:${sortDir}`}
              onChange={(event) =>
                onSortChange(...event.target.value.split(":"))
              }
            >
              <option value="valor_minimo:asc">Menor preço</option>
              <option value="valor_minimo:desc">Maior preço</option>
              <option value="ultima_disputa:asc">Data da oportunidade</option>
              <option value="ultima_disputa:desc">Data mais distante</option>
              {!["valor_minimo", "ultima_disputa"].includes(sortBy) && (
                <option value={`${sortBy}:${sortDir}`}>Ordenação atual</option>
              )}
            </select>
          </div>
        </div>
        {erro ? (
          <p className={styles.error} role="alert">
            Não foi possível carregar os imóveis. {erro}
          </p>
        ) : null}
        {loading ? (
          <p className={styles.empty} role="status">
            Carregando imóveis…
          </p>
        ) : !erro && dados.length === 0 ? (
          <div className={styles.empty}>
            <h2>Nenhum imóvel encontrado</h2>
            <button type="button" onClick={resetFilters}>
              Limpar filtros
            </button>
          </div>
        ) : (
          !erro && (
            <div className={styles.grid}>
              {dados.map((item) => (
                <PropertyCard
                  key={item.codigo}
                  item={item}
                  onOpen={onOpen}
                  onRequest={onRequest}
                  canAnalyze={canAnalyze}
                  getMapsUrl={getMapsUrl}
                />
              ))}
            </div>
          )
        )}
        {pages > 1 && (
          <nav className={styles.pagination} aria-label="Paginação de imóveis">
            <span>
              Página {page} de {pages}
            </span>
            <button
              type="button"
              disabled={page === 1 || loading}
              onClick={() => onPageChange(page - 1)}
            >
              Anterior
            </button>
            <button
              type="button"
              disabled={page >= pages || loading}
              onClick={() => onPageChange(page + 1)}
            >
              Próxima
            </button>
          </nav>
        )}
      </section>
    </div>
  );
}
