import React, { useDeferredValue, useEffect, useMemo, useState } from "react";
import "./Prospeccoes.css";

import {
  fetchCapturados,
  fetchSelecionados,
  adicionarSelecionado,
  excluirSelecionado,
  fetchProspecMeta,
  fetchAnaliseSelecionado,
  salvarAnaliseSelecionado,
  fetchResponsaveisDisponiveis,
  salvarResponsaveisSelecionado,
} from "../services/prospeccoes";
import { useAuth } from "../context/AuthContext";

const PRIORIDADE_OPTIONS = [
  { value: 1, label: "Baixa", cls: "baixa" },
  { value: 2, label: "Média", cls: "media" },
  { value: 3, label: "Alta", cls: "alta" },
];

const formatarMoeda = (valor) => {
  if (valor === null || valor === undefined) return "—";
  return Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

const formatarPercentual = (valor) => {
  if (valor === null || valor === undefined) return "—";
  return `${Number(valor).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}%`;
};

const formatarDataHora = (valor) => {
  if (!valor) return "—";
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return "—";
  const dia = String(data.getDate()).padStart(2, "0");
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const ano = data.getFullYear();
  const hora = String(data.getHours()).padStart(2, "0");
  const minuto = String(data.getMinutes()).padStart(2, "0");
  return `${dia}/${mes}/${ano} ${hora}:${minuto}`;
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
  const despesaMensalTotal = roundMoney(
    manutencaoAguaMensal + manutencaoLuzMensal + manutencaoCondominioMensal + manutencaoIptuMensal
  );
  const despesasMensaisProjetadas = roundMoney(despesaMensalTotal * tempoOperacaoMeses);
  const custoFinanciamentoProjetado = roundMoney(prestacaoMensalFinanciamento * tempoOperacaoMeses);
  const valorFinanciado = roundMoney(valorMaximoLance * (percentualFinanciamento / 100));
  const desembolsoAquisicao = roundMoney(valorMaximoLance - valorFinanciado + leiloeiro.valor);
  const custoTotalImovel = roundMoney(
    valorMaximoLance + leiloeiro.valor + despesasUnicas + despesasMensaisProjetadas
  );
  const capitalInvestidoEstimado = roundMoney(
    desembolsoAquisicao + despesasUnicas + despesasMensaisProjetadas + custoFinanciamentoProjetado
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
      despesa_mensal_total: despesaMensalTotal,
      despesas_mensais_projetadas: despesasMensaisProjetadas,
      custo_financiamento_projetado: custoFinanciamentoProjetado,
      valor_financiado: valorFinanciado,
      desembolso_aquisicao: desembolsoAquisicao,
      custo_total_imovel: custoTotalImovel,
      capital_investido_estimado: capitalInvestidoEstimado,
      base_ganho_capital: baseGanhoCapital,
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
  onAtualizarPrioridade,
  onEditarObservacoes,
  onAbrirAnalise,
  onEditarResponsaveis,
  removeLoadingIds,
  updateLoadingIds,
  canDeleteItem,
  canOperateItem,
  canManageResponsaveis,
  collapsed,
  onToggleCollapse,
  sortLabel,
}) {
  if (loading) return <div className="prospects-card"><p className="prospects-empty">Carregando selecionados...</p></div>;
  if (erro) return <div className="prospects-card"><p className="prospects-empty">Erro ao carregar selecionados: {erro}</p></div>;

  return (
    <div className="prospects-card">
      <div className="prospects-card__header">
        <div>
          <p className="prospects-eyebrow">Fila de decisão</p>
          <h2 className="prospects-title">Selecionados</h2>
          <p className="prospects-subtitle prospects-subtitle--compact">
            {sortLabel}
          </p>
        </div>
        <div className="prospects-card__header-actions">
          <span className="prospects-pill">{dados.length} imóveis</span>
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
      {!dados.length && <p className="prospects-empty">Nenhum selecionado encontrado.</p>}
      {!dados.length || collapsed ? null : (
      <div className="prospects-table-wrap">
        <table className="prospects-table">
          <thead>
            <tr>
              <th>Código</th>
              <th>Cidade / UF</th>
              <th>Responsáveis</th>
              <th>Data leilão</th>
              <th>Valor máximo</th>
              <th>Valor referência</th>
              <th>Prioridade</th>
              <th>Descrição</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {dados.map((item) => (
              <tr key={item.codigo}>
                <td className="mono">
                  <a className="prospects-link" href={item.link} target="_blank" rel="noreferrer">
                    {item.codigo}
                  </a>
                </td>
                <td>
                  <div className="prospects-city-cell">
                    <strong>{item.cidade || "—"}</strong>
                    <span>{item.uf || "—"}</span>
                  </div>
                </td>
                <td>
                  <div className="prospects-people-cell">
                  {(() => {
                    const pessoas = [];
                    const seen = new Set();
                    const addPessoa = (id, label, variant = "default") => {
                      const normalizedId = id ? String(id) : "";
                      const normalizedLabel = `${label || ""}`.trim();
                      const key = normalizedId || normalizedLabel.toLowerCase();
                      if (!key || seen.has(key)) return;
                      seen.add(key);
                      pessoas.push({ key, label: normalizedLabel, variant });
                    };

                    addPessoa(item.createdBy, item.createdByName, "author");
                    (item.responsaveis || []).forEach((responsavel) => {
                      addPessoa(responsavel.id, responsavel.name || responsavel.email, "default");
                    });

                    if (!pessoas.length) return "—";

                    return (
                      <div className="prospects-people-list">
                        {pessoas.map((pessoa) => (
                          <span
                            key={pessoa.key}
                            className={`prospects-inline-pill ${pessoa.variant === "author" ? "prospects-inline-pill--author" : ""}`.trim()}
                            title={pessoa.variant === "author" ? "Usuário que selecionou o imóvel" : undefined}
                          >
                            {pessoa.label}
                          </span>
                        ))}
                      </div>
                    );
                  })()}
                    {canManageResponsaveis ? (
                      <button
                        type="button"
                        className="prospects-table-icon-btn prospects-table-icon-btn--responsaveis"
                        title={item.responsaveis?.length ? "Editar responsáveis" : "Adicionar responsáveis"}
                        onClick={() => onEditarResponsaveis(item)}
                      >
                        <UsersIcon />
                      </button>
                    ) : null}
                  </div>
                </td>
                <td>
                  <div className="prospects-date-cell">
                    <strong>{formatarDataHoraCompacta(item.dataLeilao)}</strong>
                  </div>
                </td>
                <td>{formatarMoeda(item.valorMaximo)}</td>
                <td>{item.valor ? formatarMoeda(item.valor) : "—"}</td>
                <td>
                  <select
                    className="prospects-priority-select"
                    value={Number(item.prioridade || 2)}
                    title={canOperateItem(item) ? "Editar prioridade" : "Somente admin, editor, autor ou responsável atribuído podem editar este imóvel"}
                    disabled={updateLoadingIds.has(`${item.codigo}:prioridade`) || !canOperateItem(item)}
                    onChange={(e) => onAtualizarPrioridade(item, Number(e.target.value))}
                  >
                    {PRIORIDADE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <div className="prospects-description-cell" title={item.descricao || "—"}>
                    {item.descricao || "—"}
                  </div>
                </td>
                <td>
                  <div className="prospects-row-actions">
                    <button
                      type="button"
                      className={`prospects-table-icon-btn prospects-table-icon-btn--note ${item.observacoes ? "has-note" : "is-empty"}`}
                      title={
                        !canOperateItem(item)
                          ? "Somente admin, editor, autor ou responsável atribuído podem editar este imóvel"
                          : item.observacoes || "Nenhuma observação cadastrada."
                      }
                      onClick={() => onEditarObservacoes(item)}
                      disabled={updateLoadingIds.has(`${item.codigo}:observacoes`) || !canOperateItem(item)}
                    >
                      <NoteIcon />
                    </button>
                    <button
                      type="button"
                      className={`prospects-table-icon-btn prospects-table-icon-btn--analysis ${item.analiseSalva ? obterClasseRoi(item.roiEsperadoPercentual) : "is-neutral"}`}
                      title={
                        !canOperateItem(item)
                          ? "Somente admin, editor, autor ou responsável atribuído podem editar este imóvel"
                          : item.analiseSalva
                            ? `Abrir análise financeira. ROI: ${formatarPercentual(item.roiEsperadoPercentual)}`
                            : "Abrir ficha de viabilidade"
                      }
                      onClick={() => onAbrirAnalise(item)}
                      disabled={!canOperateItem(item)}
                    >
                      <ChartIcon />
                    </button>
                    <button
                      type="button"
                      className="prospects-table-icon-btn prospects-table-icon-btn--danger"
                      title={canDeleteItem(item) ? "Remover da fila" : "Apenas o autor da seleção ou um administrador pode remover este imóvel"}
                      disabled={removeLoadingIds.has(item.codigo) || !canDeleteItem(item)}
                      onClick={() => onExcluir(item)}
                    >
                      {removeLoadingIds.has(item.codigo) ? "..." : <TrashIcon />}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
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

  const resolveDisplayValue = (field, pairName, modeName) => {
    if (pairModes[pairName] === modeName) return currentDraft[field];
    return formatDraftValue(field, inputs[field]);
  };

  return (
    <div className="prospects-modal-backdrop" role="presentation">
      <div className="prospects-modal prospects-modal--wide" role="dialog" aria-modal="true" aria-labelledby="analise-title">
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
              <div className="prospects-analise-grid">
                <section className="prospects-analise-section prospects-analise-section--full prospects-analise-section--summary">
                  <h4>Resumo financeiro</h4>
                  <div className="prospects-summary-grid">
                    <div className="prospects-summary-card">
                      <span>Valor financiado</span>
                      <strong>{formatarMoeda(calculos.valor_financiado)}</strong>
                    </div>
                    <div className="prospects-summary-card">
                      <span>Desembolso na aquisição</span>
                      <strong>{formatarMoeda(calculos.desembolso_aquisicao)}</strong>
                    </div>
                    <div className="prospects-summary-card">
                      <span>Despesas únicas</span>
                      <strong>{formatarMoeda(calculos.despesas_unicas)}</strong>
                    </div>
                    <div className="prospects-summary-card">
                      <span>Custos mensais projetados</span>
                      <strong>{formatarMoeda(calculos.despesas_mensais_projetadas)}</strong>
                    </div>
                    <div className="prospects-summary-card">
                      <span>Prestação projetada</span>
                      <strong>{formatarMoeda(calculos.custo_financiamento_projetado)}</strong>
                    </div>
                    <div className="prospects-summary-card">
                      <span>Custo total do imóvel</span>
                      <strong>{formatarMoeda(calculos.custo_total_imovel)}</strong>
                    </div>
                    <div className="prospects-summary-card prospects-summary-card--accent">
                      <span>ROI esperado</span>
                      <strong>{formatarPercentual(calculos.roi_esperado_percentual)}</strong>
                    </div>
                  </div>
                </section>

                <section className="prospects-analise-section prospects-analise-section--quarter">
                  <h4>Premissas</h4>
                  <CampoTextoNumerico label="Valor máximo do lance" value={currentDraft.valor_maximo_lance} onChange={(value) => onFieldChange("valor_maximo_lance", value)} onFocus={() => onFieldFocus("valor_maximo_lance")} onBlur={() => onFieldBlur("valor_maximo_lance")} />
                  <CampoTextoNumerico label="Valor base da operação" value={currentDraft.valor_base_operacao} onChange={(value) => onFieldChange("valor_base_operacao", value)} onFocus={() => onFieldFocus("valor_base_operacao")} onBlur={() => onFieldBlur("valor_base_operacao")} />
                  <CampoNumerico label="Tempo da operação (meses)" value={currentDraft.tempo_operacao_meses} onChange={(value) => onFieldChange("tempo_operacao_meses", value)} onFocus={() => onFieldFocus("tempo_operacao_meses")} onBlur={() => onFieldBlur("tempo_operacao_meses")} />
                  <CampoTextoNumerico label="% financiamento" value={currentDraft.percentual_financiamento} onChange={(value) => onFieldChange("percentual_financiamento", value)} onFocus={() => onFieldFocus("percentual_financiamento")} onBlur={() => onFieldBlur("percentual_financiamento")} />
                  <CampoTextoNumerico label="Prestação mensal financiamento" value={currentDraft.prestacao_mensal_financiamento} onChange={(value) => onFieldChange("prestacao_mensal_financiamento", value)} onFocus={() => onFieldFocus("prestacao_mensal_financiamento")} onBlur={() => onFieldBlur("prestacao_mensal_financiamento")} />
                  <CampoTextoNumerico label="Valor estimado da venda" value={currentDraft.valor_estimado_venda} onChange={(value) => onFieldChange("valor_estimado_venda", value)} onFocus={() => onFieldFocus("valor_estimado_venda")} onBlur={() => onFieldBlur("valor_estimado_venda")} />
                </section>

                <section className="prospects-analise-section prospects-analise-section--quarter">
                  <h4>Custos únicos</h4>
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
                  <div className="prospects-analise-inline-note">
                    Projeção automática: {formatarMoeda(calculos.despesas_mensais_projetadas)} em {inputs.tempo_operacao_meses} meses.
                  </div>
                </section>

                <section className="prospects-analise-section prospects-analise-section--half">
                  <h4>ITBI e aquisição</h4>
                  <div className="prospects-pair-grid">
                    <CampoNumerico
                      label="ITBI %"
                      value={resolveDisplayValue("itbi_percentual", "itbi", "percentual")}
                      onChange={(value) => onPairModeChange("itbi", "percentual", "itbi_percentual", value)}
                      onFocus={() => onFieldFocus("itbi_percentual")}
                      onBlur={() => onFieldBlur("itbi_percentual")}
                    />
                    <CampoTextoNumerico
                      label="ITBI valor"
                      value={resolveDisplayValue("itbi_valor", "itbi", "valor")}
                      onChange={(value) => onPairModeChange("itbi", "valor", "itbi_valor", value)}
                      onFocus={() => onFieldFocus("itbi_valor")}
                      onBlur={() => onFieldBlur("itbi_valor")}
                    />
                  </div>
                  <div className="prospects-pair-grid">
                    <CampoNumerico
                      label="Comissão leiloeiro %"
                      value={resolveDisplayValue("comissao_leiloeiro_percentual", "leiloeiro", "percentual")}
                      onChange={(value) => onPairModeChange("leiloeiro", "percentual", "comissao_leiloeiro_percentual", value)}
                      onFocus={() => onFieldFocus("comissao_leiloeiro_percentual")}
                      onBlur={() => onFieldBlur("comissao_leiloeiro_percentual")}
                    />
                    <CampoTextoNumerico
                      label="Comissão leiloeiro valor"
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
                      label="Comissão corretor %"
                      value={resolveDisplayValue("comissao_corretor_percentual", "corretor", "percentual")}
                      onChange={(value) => onPairModeChange("corretor", "percentual", "comissao_corretor_percentual", value)}
                      onFocus={() => onFieldFocus("comissao_corretor_percentual")}
                      onBlur={() => onFieldBlur("comissao_corretor_percentual")}
                    />
                    <CampoTextoNumerico
                      label="Comissão corretor valor"
                      value={resolveDisplayValue("comissao_corretor_valor", "corretor", "valor")}
                      onChange={(value) => onPairModeChange("corretor", "valor", "comissao_corretor_valor", value)}
                      onFocus={() => onFieldFocus("comissao_corretor_valor")}
                      onBlur={() => onFieldBlur("comissao_corretor_valor")}
                    />
                  </div>
                  <div className="prospects-pair-grid">
                    <CampoNumerico
                      label="Ganho de capital %"
                      value={resolveDisplayValue("ganho_capital_percentual", "ganhoCapital", "percentual")}
                      onChange={(value) => onPairModeChange("ganhoCapital", "percentual", "ganho_capital_percentual", value)}
                      onFocus={() => onFieldFocus("ganho_capital_percentual")}
                      onBlur={() => onFieldBlur("ganho_capital_percentual")}
                    />
                    <CampoTextoNumerico
                      label="Ganho de capital valor"
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
                      <span>Despesa mensal total</span>
                      <strong>{formatarMoeda(calculos.despesa_mensal_total)}</strong>
                    </div>
                    <div className="prospects-analise-kpi">
                      <span>Prestação mensal</span>
                      <strong>{formatarMoeda(inputs.prestacao_mensal_financiamento)}</strong>
                    </div>
                    <div className="prospects-analise-kpi">
                      <span>Financiamento no período</span>
                      <strong>{formatarMoeda(calculos.custo_financiamento_projetado)}</strong>
                    </div>
                    <div className="prospects-analise-kpi">
                      <span>Capital investido</span>
                      <strong>{formatarMoeda(calculos.capital_investido_estimado)}</strong>
                    </div>
                    <div className="prospects-analise-kpi">
                      <span>Lucro esperado</span>
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

function TabelaCapturados({
  dados,
  total,
  page,
  pageSize,
  loading,
  erro,
  onIncluir,
  includeLoadingIds,
  expanded,
  toggleExpand,
  onPageChange,
  sortBy,
  sortDir,
  onSortChange,
  selectedCodes,
}) {
  if (loading) return <div className="prospects-card"><p className="prospects-empty">Carregando capturados...</p></div>;
  if (erro) return <div className="prospects-card"><p className="prospects-empty">Erro ao carregar capturados: {erro}</p></div>;

  const totalPages = Math.max(1, Math.ceil((total || 0) / pageSize));
  const isEmpty = !dados.length;
  const renderSort = (key, label) => {
    const isActive = sortBy === key;
    const arrow = isActive ? (sortDir === "asc" ? " ▲" : " ▼") : "";
    const ariaSort = isActive ? (sortDir === "asc" ? "ascending" : "descending") : "none";
    const handleSort = () => {
      const nextDir = isActive && sortDir === "asc" ? "desc" : "asc";
      onSortChange(key, nextDir);
    };
    return (
      <th
        className="prospects-sortable"
        role="button"
        tabIndex={0}
        aria-sort={ariaSort}
        onClick={handleSort}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") handleSort();
        }}
      >
        {label}
        {arrow}
      </th>
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
        </div>
        <span className="prospects-pill">{total} registros</span>
      </div>
      <div className="prospects-table-wrap">
        <table className="prospects-table">
          <thead>
            <tr>
              {renderSort("codigo", "Código")}
              {renderSort("cidade", "Cidade")}
              {renderSort("uf", "UF")}
              {renderSort("modalidade", "Modalidade")}
              {renderSort("valor_minimo", "Valor")}
              {renderSort("ultima_disputa", "Última disputa")}
              <th>Descrição</th>
              <th>Financia</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {isEmpty && (
              <tr>
                <td colSpan={9}>
                  <p className="prospects-empty">Nenhum capturado encontrado.</p>
                </td>
              </tr>
            )}
            {!isEmpty && dados.map((item) => (
              <React.Fragment key={item.codigo}>
                <tr className="prospects-expandable" onClick={() => toggleExpand(item.codigo)}>
                  <td className="mono">
                    <div className="prospects-code-stack">
                      <a className="prospects-link" href={item.link} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                        {item.codigo}
                      </a>
                      {selectedCodes.has(item.codigo) ? (
                        <span className="prospects-inline-pill prospects-inline-pill--selected">Na fila</span>
                      ) : null}
                    </div>
                  </td>
                  <td>{item.cidade}</td>
                  <td>{item.uf}</td>
                  <td>{item.modalidade || "—"}</td>
                  <td>{formatarMoeda(item.valorMinimo)}</td>
                  <td>{formatarDataHora(item.ultima_disputa)}</td>
                  <td>{item.descricao || "—"}</td>
                  <td>{item.financia === undefined || item.financia === null ? "—" : item.financia ? "Sim" : "Não"}</td>
                  <td>
                    <button
                      type="button"
                      className="prospects-btn secondary"
                      style={{ padding: "6px 8px", minWidth: "auto" }}
                      disabled={includeLoadingIds.has(item.codigo)}
                      onClick={(e) => {
                        e.stopPropagation();
                        onIncluir(item);
                      }}
                    >
                      {includeLoadingIds.has(item.codigo) ? "…" : "+"}
                    </button>
                  </td>
                </tr>
                {expanded.has(item.codigo) && (
                  <tr className="prospects-extra">
                    <td colSpan={9}>
                      <div className="prospects-detail-grid">
                        <div><strong>Status:</strong> {item.situacao || "—"}</div>
                        <div><strong>Financia:</strong> {item.financia === null || item.financia === undefined ? "—" : item.financia ? "Sim" : "Não"}</div>
                        <div><strong>Tipo do imóvel:</strong> {item.tipoImovel || "—"}</div>
                        <div><strong>Modalidade:</strong> {item.modalidade || "—"}</div>
                        <div><strong>Valor mínimo:</strong> {formatarMoeda(item.valorMinimo)}</div>
                        <div><strong>Valor venda:</strong> {formatarMoeda(item.valorVenda)}</div>
                        <div><strong>Valor leilão 1:</strong> {formatarMoeda(item.valorLeilao1)}</div>
                        <div><strong>Valor leilão 2:</strong> {formatarMoeda(item.valorLeilao2)}</div>
                        <div><strong>Valor avaliação:</strong> {formatarMoeda(item.valorAvaliacao)}</div>
                        <div><strong>Lance atual:</strong> {formatarMoeda(item.lanceAtual)}</div>
                        <div><strong>Desconto:</strong> {formatarPercentual(item.desconto)}</div>
                        <div><strong>Coletado em:</strong> {formatarDataHora(item.coletadoEm)}</div>
                        <div><strong>Última disputa:</strong> {formatarDataHora(item.ultima_disputa)}</div>
                        <div><strong>Data Leilão 1:</strong> {formatarDataHora(item.data_leilao_1)}</div>
                        <div><strong>Data Leilão 2:</strong> {formatarDataHora(item.data_leilao_2)}</div>
                        <div><strong>Licitação aberta:</strong> {formatarDataHora(item.data_licitacao_aberta)}</div>
                        <div><strong>Encerramento:</strong> {formatarDataHora(item.data_hora_encerramento)}</div>
                        <div><strong>Endereço:</strong> {[item.endereco, item.bairro, item.cidade, item.uf].filter(Boolean).join(" - ") || "—"}</div>
                        <div><strong>Fonte:</strong> {item.fonte || "—"}</div>
                        <div><strong>Link:</strong> <a className="prospects-link" href={item.link} target="_blank" rel="noreferrer">Abrir</a></div>
                        <div style={{ gridColumn: "1 / -1" }}><strong>Detalhes:</strong> {item.descricao || "—"}</div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
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

export default function Prospeccoes() {
  const { user } = useAuth();
  const [selecionados, setSelecionados] = useState([]);
  const [capturados, setCapturados] = useState([]);
  const [capturadosTotal, setCapturadosTotal] = useState(0);
  const [loadingSel, setLoadingSel] = useState(false);
  const [loadingCap, setLoadingCap] = useState(false);
  const [erroSel, setErroSel] = useState("");
  const [erroCap, setErroCap] = useState("");
  const [filtroUfCap, setFiltroUfCap] = useState([]);
  const [filtroCidadesCap, setFiltroCidadesCap] = useState([]);
  const [filtroModalidadeCap, setFiltroModalidadeCap] = useState([]);
  const [filtroStatusCap, setFiltroStatusCap] = useState(["disponivel"]);
  const [filtroFinanciaCap, setFiltroFinanciaCap] = useState([]);
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);
  const [includeLoadingIds, setIncludeLoadingIds] = useState(new Set());
  const [removeLoadingIds, setRemoveLoadingIds] = useState(new Set());
  const [updateLoadingIds, setUpdateLoadingIds] = useState(new Set());
  const [mensagem, setMensagem] = useState("");
  const [meta, setMeta] = useState({ ufs: [], modalidades: [], financia: [] });
  const [expanded, setExpanded] = useState(new Set());
  const [sortBy, setSortBy] = useState("ultima_disputa");
  const [sortDir, setSortDir] = useState("desc");
  const [activeTab, setActiveTab] = useState("capturados");
  const [selectedSortBy, setSelectedSortBy] = useState("dataLeilao");
  const [selectedSortDir, setSelectedSortDir] = useState("asc");
  const [selectedSearch, setSelectedSearch] = useState("");
  const [selectedUfFilter, setSelectedUfFilter] = useState("todos");
  const [selectedPrioridadeFilter, setSelectedPrioridadeFilter] = useState("todas");
  const [selectedResponsavelFilter, setSelectedResponsavelFilter] = useState("todos");
  const [selectedUserFilter, setSelectedUserFilter] = useState("todos");
  const [selecionadosCollapsed, setSelecionadosCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("prospeccoes_selecionados_collapsed") === "1";
  });
  const [confirmDeleteItem, setConfirmDeleteItem] = useState(null);
  const [observacaoItem, setObservacaoItem] = useState(null);
  const [observacaoDraft, setObservacaoDraft] = useState("");
  const [observacaoMapLink, setObservacaoMapLink] = useState("");
  const [observacaoAnaliseBase, setObservacaoAnaliseBase] = useState(null);
  const [analiseItem, setAnaliseItem] = useState(null);
  const [analiseDraft, setAnaliseDraft] = useState(null);
  const [analisePairModes, setAnalisePairModes] = useState(ANALISE_PAIR_MODE_DEFAULTS);
  const [analiseLoading, setAnaliseLoading] = useState(false);
  const [analiseSaving, setAnaliseSaving] = useState(false);
  const [responsaveisDisponiveis, setResponsaveisDisponiveis] = useState([]);
  const [responsaveisItem, setResponsaveisItem] = useState(null);
  const [responsaveisDraftIds, setResponsaveisDraftIds] = useState([]);
  const [responsaveisSaving, setResponsaveisSaving] = useState(false);
  const deferredSelectedSearch = useDeferredValue(selectedSearch);

  useEffect(() => {
    const carregarSelecionados = async () => {
      setLoadingSel(true);
      setErroSel("");
      try {
        const sel = await fetchSelecionados({});
        setSelecionados(sel || []);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Erro inesperado";
        setErroSel(message);
      } finally {
        setLoadingSel(false);
      }
    };
    carregarSelecionados();
  }, []);

  useEffect(() => {
    const carregarCapturados = async () => {
      setLoadingCap(true);
      setErroCap("");
      try {
        const resp = await fetchCapturados({
          page,
          pageSize,
          uf: filtroUfCap,
          cidade: filtroCidadesCap,
          modalidade: filtroModalidadeCap,
          financia: filtroFinanciaCap,
          status: filtroStatusCap,
          orderBy: sortBy,
          orderDir: sortDir,
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
  }, [page, pageSize, filtroUfCap, filtroCidadesCap, filtroModalidadeCap, filtroStatusCap, filtroFinanciaCap, sortBy, sortDir]);

  useEffect(() => {
    fetchProspecMeta()
      .then((resp) => setMeta(resp))
      .catch(() => setMeta({ ufs: [], modalidades: [], financia: [], cidades_por_uf: {} }));
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
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      "prospeccoes_selecionados_collapsed",
      selecionadosCollapsed ? "1" : "0"
    );
  }, [selecionadosCollapsed]);

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

  const selectedUfOptions = useMemo(
    () => Array.from(new Set(selecionados.map((item) => item.uf).filter(Boolean))).sort(),
    [selecionados]
  );
  const selectedUserOptions = useMemo(() => {
    const usersMap = new Map();
    selecionados.forEach((item) => {
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
  }, [selecionados]);
  const selectedCodes = useMemo(
    () => new Set(selecionados.map((item) => item.codigo)),
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
    setFiltroUfCap([]);
    setFiltroCidadesCap([]);
    setFiltroModalidadeCap([]);
    setFiltroStatusCap(["disponivel"]);
    setFiltroFinanciaCap([]);
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
      const sel = await fetchSelecionados({});
      setSelecionados(sel || []);
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

  const refreshSelecionados = async () => {
    const sel = await fetchSelecionados({});
    setSelecionados(sel || []);
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

  const openAnaliseModal = async (item) => {
    setAnaliseItem(item);
    setAnaliseDraft(createAnaliseDraft({ valor_maximo_lance: item.valorMaximo || "" }));
    setAnalisePairModes({ ...ANALISE_PAIR_MODE_DEFAULTS });
    setAnaliseLoading(true);
    try {
      const data = await fetchAnaliseSelecionado(item.codigo);
      const inputs = data?.inputs || {};
      setAnaliseDraft(createAnaliseDraft(inputs));
      setAnalisePairModes(createAnalisePairModes(inputs));
    } catch (err) {
      const message = err?.response?.data?.error || (err instanceof Error ? err.message : "Erro ao carregar análise");
      setMensagem(message);
      setAnaliseItem(null);
      setAnaliseDraft(null);
    } finally {
      setAnaliseLoading(false);
    }
  };

  const closeAnaliseModal = () => {
    setAnaliseItem(null);
    setAnaliseDraft(null);
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
      const data = await salvarAnaliseSelecionado(analiseItem.codigo, payload);
      const inputs = data?.inputs || payload;
      setAnaliseDraft(createAnaliseDraft(inputs));
      setAnalisePairModes(createAnalisePairModes(inputs));
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
    if (user.role === "admin" || user.role === "editor") return true;
    if (item?.createdBy && String(item.createdBy) === String(user.id)) return true;
    return Boolean(item?.responsaveis?.some((responsavel) => String(responsavel.id) === String(user.id)));
  };

  const canManageResponsaveis = user?.role === "admin";

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
    const filtered = selecionados.filter((item) => {
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
    selecionados,
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
    const comAnalise = selecionados.filter((item) => item.analiseSalva).length;
    const semResponsavel = selecionados.filter((item) => !(item.responsaveis?.length)).length;
    const altaPrioridade = selecionados.filter((item) => Number(item.prioridade || 2) === 3).length;
    return { comAnalise, semResponsavel, altaPrioridade };
  }, [selecionados]);

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

  const toggleExpand = (codigo) => {
    const next = new Set(expanded);
    if (next.has(codigo)) {
      next.delete(codigo);
    } else {
      next.add(codigo);
    }
    setExpanded(next);
  };

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

  return (
    <div className="prospects-page">
      <div className="prospects-header">
        <div>
          <p className="prospects-eyebrow">Oportunidades</p>
          <h1 className="prospects-hero">Prospecções</h1>
          <p className="prospects-subtitle">
            Central de decisão para acompanhar imóveis priorizados e a última captura do garimpo com mais clareza operacional.
          </p>
        </div>
        <div className="prospects-header-summary">
          <div className="prospects-stat-card">
            <span>Selecionados</span>
            <strong>{selecionados.length}</strong>
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
      </div>

      <div className="prospects-filters">
        <div className="prospects-filter-group">
          <label>UF (capturados)</label>
          <div className="prospects-checklist">
            {ufOptions.map((uf) => (
              <label key={uf} className="prospects-check">
                <input
                  type="checkbox"
                  checked={filtroUfCap.includes(uf)}
                  onChange={() => toggleValue(uf, setFiltroUfCap)}
                />
                <span>{uf}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="prospects-filter-group">
          <label>Cidade</label>
          <div className="prospects-checklist">
            {cidadesOptions.map((c) => (
              <label key={c} className="prospects-check">
                <input
                  type="checkbox"
                  checked={filtroCidadesCap.includes(c)}
                  onChange={() => toggleValue(c, setFiltroCidadesCap)}
                />
                <span>{c}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="prospects-filter-group">
          <label>Modalidade</label>
          <div className="prospects-checklist">
            {modalidadeOptions.map((m) => (
              <label key={m} className="prospects-check">
                <input
                  type="checkbox"
                  checked={filtroModalidadeCap.includes(m)}
                  onChange={() => toggleValue(m, setFiltroModalidadeCap)}
                />
                <span>{m}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="prospects-filter-group">
          <label>Status (capturados)</label>
          <div className="prospects-checklist">
            <label className="prospects-check">
              <input
                type="checkbox"
                checked={filtroStatusCap.includes("disponivel")}
                onChange={() => toggleValue("disponivel", setFiltroStatusCap)}
              />
              <span>Disponível</span>
            </label>
            <label className="prospects-check">
              <input
                type="checkbox"
                checked={filtroStatusCap.includes("indisponivel")}
                onChange={() => toggleValue("indisponivel", setFiltroStatusCap)}
              />
              <span>Indisponível</span>
            </label>
          </div>
        </div>
        <div className="prospects-filter-group">
          <label>Financia</label>
          <div className="prospects-checklist">
            <label className="prospects-check">
              <input
                type="checkbox"
                checked={filtroFinanciaCap.includes("sim")}
                onChange={() => toggleValue("sim", setFiltroFinanciaCap)}
              />
              <span>Sim</span>
            </label>
            <label className="prospects-check">
              <input
                type="checkbox"
                checked={filtroFinanciaCap.includes("nao")}
                onChange={() => toggleValue("nao", setFiltroFinanciaCap)}
              />
              <span>Não</span>
            </label>
          </div>
        </div>
        <div className="prospects-filter-group">
          <label>Itens por página</label>
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
          >
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>
        <div className="prospects-filter-actions">
          <button type="button" className="prospects-btn secondary" onClick={limparFiltros}>Limpar filtros</button>
        </div>
      </div>

      {mensagem && <div className="prospects-message">{mensagem}</div>}

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
          <strong>{selecionados.length}</strong>
        </button>
      </div>

      {activeTab === "selecionados" ? (
        <>
          <section className="prospects-card prospects-card--command">
            <div className="prospects-card__header prospects-card__header--stacked">
              <div>
                <p className="prospects-eyebrow">Operação</p>
                <h2 className="prospects-title">Controle dos selecionados</h2>
                <p className="prospects-subtitle prospects-subtitle--compact">
                  Filtre e ordene a fila para chegar mais rápido aos imóveis que pedem ação.
                </p>
              </div>
              <div className="prospects-card__header-actions">
                <span className="prospects-pill">{selecionadosFiltradosOrdenados.length} visíveis</span>
                <span className="prospects-pill prospects-pill--muted">{selectedMetrics.comAnalise} com análise</span>
              </div>
            </div>
            <div className="prospects-toolbar">
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
              <div className="prospects-toolbar-actions">
                <button
                  type="button"
                  className="prospects-btn secondary"
                  onClick={() => {
                    setSelectedSearch("");
                    setSelectedUfFilter("todos");
                    setSelectedPrioridadeFilter("todas");
                    setSelectedResponsavelFilter("todos");
                    setSelectedUserFilter("todos");
                    setSelectedSortBy("dataLeilao");
                    setSelectedSortDir("asc");
                  }}
                >
                  Limpar visão
                </button>
              </div>
            </div>
          </section>

          <TabelaSelecionados
            dados={selecionadosFiltradosOrdenados}
            loading={loadingSel}
            erro={erroSel}
            onExcluir={setConfirmDeleteItem}
            onAtualizarPrioridade={handleAtualizarPrioridade}
            onEditarObservacoes={openObservacoesModal}
            onAbrirAnalise={openAnaliseModal}
            onEditarResponsaveis={openResponsaveisModal}
            removeLoadingIds={removeLoadingIds}
            updateLoadingIds={updateLoadingIds}
            canDeleteItem={canDeleteItem}
            canOperateItem={canOperateItem}
            canManageResponsaveis={canManageResponsaveis}
            collapsed={selecionadosCollapsed}
            onToggleCollapse={() => setSelecionadosCollapsed((prev) => !prev)}
            sortLabel={selectedSortLabel}
          />
        </>
      ) : (
        <>
          <div className="prospects-gap" />
          <TabelaCapturados
            dados={capturados}
            total={capturadosTotal}
            page={page}
            pageSize={pageSize}
            loading={loadingCap}
            erro={erroCap}
            onIncluir={handleIncluir}
            includeLoadingIds={includeLoadingIds}
            expanded={expanded}
            toggleExpand={toggleExpand}
            onPageChange={handlePageChange}
            sortBy={sortBy}
            sortDir={sortDir}
            onSortChange={handleSortChange}
            selectedCodes={selectedCodes}
          />
        </>
      )}

      <ConfirmarExclusaoModal
        item={confirmDeleteItem}
        loading={Boolean(confirmDeleteItem && removeLoadingIds.has(confirmDeleteItem.codigo))}
        onCancel={() => setConfirmDeleteItem(null)}
        onConfirm={() => confirmDelete(confirmDeleteItem)}
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
