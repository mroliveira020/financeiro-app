import React, { useState } from "react";
import { handleTabKeys } from "../../utils/handleTabKeys";
import {
  ProspectGallery,
  TextoEstruturado,
  DetalhesTexto,
  OfertaAvisos,
  MapPinIcon,
  ArrowUpRightIcon,
} from "./ProspeccoesShared";
import styles from "./ProspeccaoDetailDesktop.module.css";
import TarefasPainel from "../../components/tarefas/TarefasPainel";
import {
  MENSAGEM_VIABILIDADE_PENDENTE,
  temVendaEstimadaPendente,
} from "../../utils/viabilidade";

const tabs = [
  { key: "dados", label: "Visão geral" },
  { key: "ia", label: "Avaliação IA" },
  { key: "comunicacao", label: "Comunicação" },
  { key: "viabilidade", label: "Viabilidade" },
  { key: "tarefas", label: "Participação e tarefas" },
];

// Textos antigos continuam íntegros. Apenas títulos explícitos viram seções.
function reportSections(text) {
  const sections = [];
  let current = {
    title: "Análise disponível",
    lines: [],
    explicitHeading: false,
  };
  let fenced = false;
  for (const line of `${text || ""}`.split("\n")) {
    if (/^\s*```/.test(line)) fenced = !fenced;
    const heading = !fenced && line.match(/^#{1,3}\s+(.+?)\s*#*\s*$/);
    if (heading) {
      if (current.explicitHeading || current.lines.join("\n").trim())
        sections.push(current);
      current = { title: heading[1], lines: [], explicitHeading: true };
    } else {
      current.lines.push(line);
    }
  }
  if (current.explicitHeading || current.lines.join("\n").trim())
    sections.push(current);
  return sections;
}

function Metrics({ entries }) {
  return (
    <dl className={styles.metrics}>
      {entries.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

function ReportSection({ title, children, open = false, note }) {
  return (
    <details className={styles.reportSection} open={open || undefined}>
      <summary>
        <span>{title}</span>
        {note ? <small>{note}</small> : null}
      </summary>
      <div className={styles.sectionBody}>{children}</div>
    </details>
  );
}

function Comparables({ title, items, rental, money }) {
  return (
    <section className={styles.comparables}>
      <h3>{title}</h3>
      {items.length ? (
        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>Imóvel</th>
                <th>{rental ? "Aluguel/mês" : "Preço de oferta"}</th>
                <th>Área</th>
                <th>Preço/m²</th>
                <th>Bairro</th>
                <th>Fonte</th>
              </tr>
            </thead>
            <tbody>
              {items.map((comp, index) => (
                <tr key={comp.id || `${comp.url}-${index}`}>
                  <td>
                    {comp.url ? (
                      <a href={comp.url} target="_blank" rel="noreferrer">
                        {comp.titulo || "Ver imóvel"}
                      </a>
                    ) : (
                      comp.titulo || "—"
                    )}
                  </td>
                  <td>{money(rental ? comp.aluguel_mensal : comp.preco)}</td>
                  <td>{comp.area_m2 ? `${comp.area_m2} m²` : "—"}</td>
                  <td>{comp.preco_m2 ? money(comp.preco_m2) : "—"}</td>
                  <td>{comp.bairro || "—"}</td>
                  <td>{comp.fonte || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className={styles.empty}>Nenhum comparável disponível.</p>
      )}
    </section>
  );
}

export default function ProspeccaoDetailDesktop({
  item,
  tab,
  aiAnalise,
  analiseDetalhada,
  enriquecimentoDetalhado,
  enriquecimentoDetalhadoLoading,
  analiseDetalhadaLoading,
  financialEditor,
  financialSaving,
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
  getLeiloesInfo,
  getMapsUrl,
  getComparaveisLinks,
  extrairEditalUrl,
  extrairProcessoNumero,
  getFonteLabel,
  formatarPercentual,
  formatarMoeda,
  formatarDataHoraCompacta,
  getMensagemPrefillAnalise,
  podeAnalisarMatricula,
}) {
  const [editingSummary, setEditingSummary] = useState(false);
  const activeTab = ["matricula", "enriquecimento"].includes(tab) ? "ia" : tab;
  const busy = loading || sending || matriculaLoading || enriquecimentoLoading;
  const evaluation =
    enriquecimentoDetalhado?.avaliacao || item.avaliacaoAutomatica;
  const saleComparables = enriquecimentoDetalhado?.comparaveis || [];
  const rentComparables = enriquecimentoDetalhado?.alugueis_comparaveis || [];
  const auctionContext = enriquecimentoDetalhado?.contexto_leilao;
  const neighborhood = enriquecimentoDetalhado?.bairro;
  const enrichmentSummary = enriquecimentoDetalhado?.job?.resultado?.resumo;
  const history = (aiAnalise?.historico_chat || []).filter(
    (message) => message.content !== "__init__",
  );
  const sections = reportSections(aiAnalise?.analise_texto);
  const hasAnalysis = Boolean(
    sections.length ||
      aiAnalise?.matricula_texto ||
      history.some((message) => message.role === "assistant"),
  );
  const analysisStatus = sending
    ? "Solicitada análise IA"
    : hasAnalysis || item.analiseIaSalva
      ? "Concluída análise IA"
      : item.analiseSolicitada
        ? "Solicitada análise IA"
        : "Análise IA ainda não solicitada";
  const maps = getMapsUrl(item);
  const edital = extrairEditalUrl(item.descricao);
  const process = extrairProcessoNumero(item.descricao);
  const auctionEvents = getLeiloesInfo(item);
  const source =
    { caixa_extrajudicial: "CAIXA", tjdft_judicial: "TJDFT" }[item.fonte] ||
    getFonteLabel(item.fonte);
  const money = (value) =>
    value === null || value === undefined || value === ""
      ? "—"
      : formatarMoeda(value);
  const date = (value) =>
    value ? formatarDataHoraCompacta(value) : "Data não informada";
  const financial = analiseDetalhada?.calculos;
  const vendaPendente = temVendaEstimadaPendente(analiseDetalhada);
  const financialEntries = financial
    ? [
        ["Capital investido", money(financial.capital_investido_estimado)],
        ["Custo total", money(financial.custo_total_imovel)],
        ["Lucro esperado", vendaPendente ? "A definir" : money(financial.lucro_esperado_valor)],
        ["ROI estimado", vendaPendente ? "A definir" : formatarPercentual(financial.roi_esperado_percentual)],
      ]
    : [];

  const financialSummary = (
    <>
      {analiseDetalhadaLoading ? (
        <p className={styles.empty}>Carregando análise financeira…</p>
      ) : financial ? (
        <>
          {vendaPendente && (
            <p role="status" className={styles.hint}>
              {MENSAGEM_VIABILIDADE_PENDENTE}
            </p>
          )}
          <Metrics entries={financialEntries} />
          {getMensagemPrefillAnalise(analiseDetalhada?.meta) ? (
            <p className={styles.hint}>
              {getMensagemPrefillAnalise(analiseDetalhada.meta)}
            </p>
          ) : null}
        </>
      ) : (
        <p className={styles.empty}>Nenhuma análise financeira disponível.</p>
      )}
      <button
        className={styles.button}
        type="button"
        onClick={() => onAbrirAnalise(item)}
        disabled={financialSaving}
      >
        {financial && !vendaPendente ? "Editar premissas financeiras" : "Preencher viabilidade"}
      </button>
    </>
  );

  return (
    <section
      className={`prospect-detail-inline ${styles.workspace}`}
      id="desktop-property-panel"
      role="tabpanel"
      aria-labelledby={`desktop-tab-${item.codigo}`}
    >
      <header className={styles.header}>
        <div>
          <button type="button" className={styles.back} onClick={onClose}>
            ← Voltar à prospecção
          </button>
          <h1>
            {[item.cidade, item.uf].filter(Boolean).join(" · ") ||
              `Imóvel ${item.codigo}`}
          </h1>
          <p>
            {[item.bairro, item.endereco].filter(Boolean).join(" · ") ||
              "Endereço não informado"}
          </p>
          <div className={styles.meta}>
            <span>{item.tipoImovel || "Imóvel"}</span>
            <span>Código {item.codigo}</span>
            {source ? <span>{source}</span> : null}
          </div>
        </div>
        <div className={styles.opportunity}>
          <span>Menor lance informado</span>
          <strong>{money(item.melhorLance)}</strong>
          <span>{date(item.melhorData)}</span>
          <small>
            {item.financia == null
              ? "Financiamento não informado"
              : item.financia
                ? "Financia"
                : "Não financia"}
          </small>
        </div>
      </header>

      <div className={styles.nav}>
        <div
          className={styles.tabs}
          role="tablist"
          aria-label="Seções do imóvel"
          onKeyDown={handleTabKeys}
        >
          {tabs.map((entry) => (
            <button
              type="button"
              role="tab"
              key={entry.key}
              id={`property-section-${entry.key}`}
              aria-controls="property-section-panel"
              aria-selected={activeTab === entry.key}
              tabIndex={activeTab === entry.key ? 0 : -1}
              onClick={() => onTabChange(entry.key)}
            >
              {entry.label}
            </button>
          ))}
        </div>
        <div className={styles.links}>
          {maps ? (
            <a href={maps} target="_blank" rel="noreferrer">
              <span aria-hidden="true">
                <MapPinIcon />
              </span>
              Google Maps
            </a>
          ) : null}
          {item.link ? (
            <a href={item.link} target="_blank" rel="noreferrer">
              Site original
              <span aria-hidden="true">
                <ArrowUpRightIcon />
              </span>
            </a>
          ) : null}
          {edital ? (
            <a href={edital} target="_blank" rel="noreferrer">
              Edital
              <span aria-hidden="true">
                <ArrowUpRightIcon />
              </span>
            </a>
          ) : null}
        </div>
      </div>

      {statusMessage ? (
        <div
          role={statusTone === "error" ? "alert" : "status"}
          className={`${styles.status} ${statusTone === "error" ? styles.error : ""}`}
        >
          <span>{statusMessage}</span>
          {statusAction?.label ? (
            <button
              type="button"
              className={styles.button}
              onClick={statusAction.onClick}
              disabled={statusAction.disabled}
            >
              {statusAction.label}
            </button>
          ) : null}
        </div>
      ) : null}

      <div className={styles.body}>
        <div
          id="property-section-panel"
          role="tabpanel"
          aria-labelledby={`property-section-${activeTab}`}
          className={styles.main}
        >
          {activeTab === "dados" ? (
            <>
              <section className={styles.card}>
                <h2>Dados do imóvel</h2>
                <Metrics
                  entries={[
                    ["Valor de avaliação", money(item.valorAvaliacao)],
                    [
                      "Disponibilidade",
                      item.disponivel == null
                        ? "Não informada"
                        : item.disponivel
                          ? "Disponível"
                          : "Indisponível",
                    ],
                    ["Modalidade", item.modalidade || "—"],
                    ...(process ? [["Processo", process]] : []),
                  ]}
                />
                <OfertaAvisos item={item} />
                <DetalhesTexto
                  texto={item.descricao}
                  className={styles.description}
                />
              </section>
              <section className={styles.card}>
                <h2>Datas e valores</h2>
                {auctionEvents.length ? (
                  <div className={styles.events}>
                    {auctionEvents.map((event) => (
                      <div key={event.label}>
                        <span>{event.label}</span>
                        <strong>{money(event.valor)}</strong>
                        <span>{date(event.data)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className={styles.empty}>Datas de venda não informadas.</p>
                )}
              </section>
              <section className={styles.card}>
                <div className={styles.sectionHeading}>
                  <h2>Avaliação IA</h2>
                  <span>{analysisStatus}</span>
                </div>
                {evaluation?.resumo_ia ? (
                  <TextoEstruturado texto={evaluation.resumo_ia} />
                ) : (
                  <p className={styles.empty}>
                    {hasAnalysis
                      ? "A análise está disponível na seção Avaliação IA."
                      : "Solicite a análise para avaliar esta oportunidade."}
                  </p>
                )}
                <button
                  type="button"
                  className={styles.button}
                  onClick={() => onTabChange("ia")}
                >
                  Abrir avaliação IA
                </button>
              </section>
              <section className={styles.card}>
                <h2>Viabilidade financeira</h2>
                {financialSummary}
              </section>
            </>
          ) : null}

          {activeTab === "ia" ? (
            <>
              <div className={styles.sectionHeading}>
                <div>
                  <h2>Avaliação IA</h2>
                  <p className={styles.hint}>
                    {aiAnalise?.updated_at
                      ? `Atualizada em ${date(aiAnalise.updated_at)}`
                      : analysisStatus}
                  </p>
                </div>
                {canChat ? (
                  <button
                    type="button"
                    className={`${styles.button} ${styles.primary}`}
                    onClick={onGerarAnaliseInicial}
                    disabled={busy}
                  >
                    {sending
                      ? "Solicitada análise IA"
                      : hasAnalysis
                        ? "Atualizar análise IA"
                        : "Solicitar análise IA"}
                  </button>
                ) : null}
              </div>
              {loading ? (
                <p role="status" className={styles.empty}>
                  Carregando análise…
                </p>
              ) : (
                <>
                  {sections.length ? (
                    sections.map((section, index) => (
                      <ReportSection
                        key={`${index}-${section.title}`}
                        title={section.title}
                        open={index === 0}
                      >
                        <TextoEstruturado texto={section.lines.join("\n")} />
                      </ReportSection>
                    ))
                  ) : (
                    <section className={styles.card}>
                      <h3>Análise do imóvel</h3>
                      <p className={styles.empty}>
                        {history.length
                          ? "As análises anteriores estão disponíveis no histórico de Comunicação."
                          : "A análise será exibida aqui após o processamento da solicitação."}
                      </p>
                    </section>
                  )}
                  <ReportSection
                    title="Matrícula e situação jurídica"
                    open={tab === "matricula"}
                    note={
                      aiAnalise?.matricula_texto
                        ? "Análise disponível"
                        : "Sem análise disponível"
                    }
                  >
                    {aiAnalise?.matricula_texto ? (
                      <TextoEstruturado texto={aiAnalise.matricula_texto} />
                    ) : (
                      <p className={styles.empty}>
                        Nenhuma análise de matrícula disponível.
                      </p>
                    )}
                    {podeAnalisarMatricula(item) ? (
                      <button
                        type="button"
                        className={styles.button}
                        onClick={onSolicitarMatricula}
                        disabled={!canChat || busy}
                      >
                        {matriculaLoading
                          ? "Analisando matrícula…"
                          : aiAnalise?.matricula_texto
                            ? "Atualizar matrícula"
                            : "Analisar matrícula"}
                      </button>
                    ) : (
                      <p className={styles.hint}>
                        A leitura automática da matrícula está disponível para
                        imóveis da Caixa.
                      </p>
                    )}
                  </ReportSection>
                </>
              )}
              <ReportSection
                title="Mercado e comparáveis"
                open={tab === "enriquecimento"}
                note={
                  enriquecimentoDetalhadoLoading ? "Carregando…" : undefined
                }
              >
                {evaluation ? (
                  <>
                    <Metrics
                      entries={[
                        [
                          "Venda estimada",
                          money(evaluation.valor_estimado_venda),
                        ],
                        [
                          "Preço/m² da região",
                          money(evaluation.preco_m2_regiao),
                        ],
                        ["Fonte da pesquisa", evaluation.fonte_pesquisa || "—"],
                        ["Pesquisado em", date(evaluation.pesquisado_em)],
                        ["Lucro estimado", money(evaluation.lucro_estimado)],
                        [
                          "ROI estimado",
                          formatarPercentual(evaluation.retorno_pct),
                        ],
                        [
                          "Score automático",
                          evaluation.score_total == null
                            ? "—"
                            : `${evaluation.score_total}/85`,
                        ],
                        [
                          "Aquisição estimada",
                          money(evaluation.custo_aquisicao_est),
                        ],
                        [
                          "Reforma estimada",
                          money(evaluation.custo_reforma_est),
                        ],
                        [
                          "Desocupação estimada",
                          money(evaluation.custo_desocupacao_est),
                        ],
                      ]}
                    />
                    {evaluation.resumo_ia ? (
                      <TextoEstruturado texto={evaluation.resumo_ia} />
                    ) : null}
                  </>
                ) : null}
                {enrichmentSummary ? (
                  <TextoEstruturado texto={enrichmentSummary} />
                ) : null}
                <Comparables
                  title="Comparáveis de venda"
                  items={saleComparables}
                  money={money}
                />
                <Comparables
                  title="Comparáveis de aluguel"
                  items={rentComparables}
                  money={money}
                  rental
                />
                <div className={styles.links}>
                  {getComparaveisLinks(item).map((link) => (
                    <a
                      key={link.url}
                      href={link.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {link.label}
                      <span aria-hidden="true">
                        <ArrowUpRightIcon />
                      </span>
                    </a>
                  ))}
                </div>
                <button
                  type="button"
                  className={styles.button}
                  onClick={onSolicitarEnriquecimento}
                  disabled={!canChat || busy}
                >
                  {enriquecimentoLoading
                    ? "Atualizando pesquisa…"
                    : "Atualizar pesquisa de mercado"}
                </button>
              </ReportSection>
              <ReportSection title="Contexto do leilão e do bairro">
                {auctionContext ? (
                  <Metrics
                    entries={[
                      ["Meses em leilão", auctionContext.meses_em_leilao],
                      ["Vezes relistado", auctionContext.vezes_relistado],
                      ["Condomínio", auctionContext.condominio_tipo || "—"],
                      [
                        "FGTS",
                        auctionContext.aceita_fgts == null
                          ? "—"
                          : auctionContext.aceita_fgts
                            ? "Aceita"
                            : "Não aceita",
                      ],
                      ["Praça atual", auctionContext.praca_atual || "—"],
                      ["Atualizado em", date(auctionContext.enriquecido_em)],
                    ]}
                  />
                ) : (
                  <p className={styles.empty}>
                    Contexto do leilão ainda não disponível.
                  </p>
                )}
                {neighborhood ? (
                  <Metrics
                    entries={[
                      ["Score do bairro", neighborhood.score_bairro],
                      ["Pontos de interesse", neighborhood.poi_total],
                      ["IDEB", neighborhood.ideb_nota],
                      [
                        "Risco de alagamento",
                        neighborhood.risco_alagamento || "—",
                      ],
                    ]}
                  />
                ) : (
                  <p className={styles.empty}>
                    Dados do bairro ainda não disponíveis.
                  </p>
                )}
              </ReportSection>
              <ReportSection title="Análise financeira">
                {financialSummary}
              </ReportSection>
              {canChat ? (
                <section className={styles.card}>
                  <button
                    type="button"
                    className={styles.back}
                    onClick={() => setEditingSummary(!editingSummary)}
                    disabled={loading || saving}
                    aria-expanded={editingSummary}
                    aria-controls="property-analysis-editor"
                  >
                    {editingSummary
                      ? "Fechar edição do texto"
                      : "Editar texto da análise"}
                  </button>
                  {editingSummary ? (
                    <div id="property-analysis-editor">
                      <label className={styles.field}>
                        <span>Síntese da análise</span>
                        <textarea
                          rows={8}
                          value={sinteseDraft}
                          onChange={(event) =>
                            onSinteseDraftChange(event.target.value)
                          }
                        />
                      </label>
                      <button
                        type="button"
                        className={styles.button}
                        onClick={onSalvarSintese}
                        disabled={saving || busy}
                      >
                        {saving ? "Salvando…" : "Salvar síntese"}
                      </button>
                    </div>
                  ) : null}
                </section>
              ) : null}
            </>
          ) : null}

          {activeTab === "comunicacao" ? (
            <>
              <div className={styles.sectionHeading}>
                <h2>Comunicação com a IA</h2>
                <span>{history.length} mensagens</span>
              </div>
              {loading ? (
                <p role="status" className={styles.empty}>
                  Carregando histórico…
                </p>
              ) : (
                <div className={styles.messages}>
                  {history.length ? (
                    history.map((message, index) => (
                      <article
                        key={`${message.role}-${index}`}
                        className={`${styles.message} ${message.role === "user" ? styles.userMessage : ""}`}
                      >
                        <header>
                          <strong>
                            {message.role === "user" ? "Você" : "IA"}
                          </strong>
                        </header>
                        <TextoEstruturado texto={message.content || "—"} />
                      </article>
                    ))
                  ) : (
                    <p className={styles.empty}>
                      O histórico de perguntas, observações e ajustes aparecerá
                      aqui.
                    </p>
                  )}
                </div>
              )}
              {canChat ? (
                <form
                  className={`${styles.card} ${styles.composer}`}
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (mensagemDraft.trim() && !busy) onEnviarMensagem();
                  }}
                >
                  <label className={styles.field}>
                    <span>Mensagem ou pedido de ajuste</span>
                    <textarea
                      rows={4}
                      value={mensagemDraft}
                      onChange={(event) =>
                        onMensagemDraftChange(event.target.value)
                      }
                      placeholder="Escreva sua pergunta, informação complementar ou ajuste da análise."
                    />
                  </label>
                  <button
                    type="submit"
                    className={`${styles.button} ${styles.primary}`}
                    disabled={busy || !mensagemDraft.trim()}
                  >
                    {sending ? "Enviando…" : "Enviar para a IA"}
                  </button>
                </form>
              ) : (
                <p className={styles.hint}>
                  Seu acesso permite consultar o histórico. O envio de mensagens
                  exige acesso à IA.
                </p>
              )}
            </>
          ) : null}

        {activeTab === "tarefas" ? <TarefasPainel key={item.codigo} context={{ numero_bem: item.codigo, nome: [item.cidade, item.bairro, item.codigo].filter(Boolean).join(' · ') }} /> : null}
        {activeTab === "viabilidade" ? (
            <section className={styles.card}>
              {financialEditor || (
                <>
                  <h2>Viabilidade financeira</h2>
                  {financialSummary}
                </>
              )}
            </section>
          ) : null}
        </div>

        <aside className={styles.context} aria-label="Referência do imóvel">
          <div className={styles.contextCard}>
            <ProspectGallery item={item} className={styles.photo} />
            <div className={styles.contextInfo}>
              <h2>{item.tipoImovel || "Imóvel"}</h2>
              <p>{item.bairro || item.cidade || item.codigo}</p>
              <dl>
                <div>
                  <dt>Avaliação</dt>
                  <dd>{money(item.valorAvaliacao)}</dd>
                </div>
                <div>
                  <dt>Financiamento</dt>
                  <dd>
                    {item.financia == null
                      ? "Não informado"
                      : item.financia
                        ? "Financia"
                        : "Não financia"}
                  </dd>
                </div>
              </dl>
              <div className={styles.analysisStatus}>{analysisStatus}</div>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
