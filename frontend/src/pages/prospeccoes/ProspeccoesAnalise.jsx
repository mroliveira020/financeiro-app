/* eslint-disable react-refresh/only-export-components */
import React from "react";

const formatarMoeda = (valor) => {
  const numero = Number(valor || 0);
  return numero.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

const formatarPercentual = (valor) => {
  if (valor === null || valor === undefined || Number.isNaN(Number(valor))) return "—";
  return `${Number(valor).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
};

const getMensagemPrefillAnalise = (meta) => {
  if (!meta?.prefill_source) return "";
  if (meta.prefill_source === "analise_salva") return "Dados carregados da análise já salva para este imóvel.";
  if (meta.prefill_source === "capturado_defaults") return "Ficha inicial preenchida com referências do imóvel capturado. Revise antes de salvar.";
  if (meta.prefill_source === "selecionado_defaults") return "Ficha inicial preenchida com referências do imóvel selecionado. Revise antes de salvar.";
  if (meta.prefill_source === "fallback_local") return "Não foi possível carregar a análise salva agora. Mantivemos um rascunho local com base nos dados do imóvel.";
  return "";
};

export const ANALISE_DEFAULTS = {
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

export const ANALISE_PAIR_MODE_DEFAULTS = {
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

const INTEGER_FIELDS = new Set(["tempo_operacao_meses"]);

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

export const formatDraftValue = (field, value) => {
  if (MONEY_FIELDS.has(field)) return formatMoneyInput(value);
  if (PERCENT_FIELDS.has(field)) return formatPercentInput(value);
  if (INTEGER_FIELDS.has(field)) return formatIntegerInput(value);
  return value ?? "";
};

export const formatDraftEditableValue = (field, value) => {
  if (value === null || value === undefined || value === "") return "";
  if (MONEY_FIELDS.has(field)) return `${roundMoney(value)}`.replace(".", ",");
  if (PERCENT_FIELDS.has(field)) return `${roundPercent(value)}`.replace(".", ",");
  if (INTEGER_FIELDS.has(field)) return formatIntegerInput(value);
  return `${value}`;
};

export const normalizeDraftFieldValue = (field, value) => {
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

export const createAnaliseDraft = (inputs = {}) => ({
  ...ANALISE_DEFAULTS,
  ...Object.fromEntries(
    Object.entries(inputs).map(([key, value]) => [key, formatDraftValue(key, value)])
  ),
});

export const createAnalisePairModes = (inputs = {}) => ({
  itbi: inferPairMode(inputs.itbi_percentual, inputs.itbi_valor),
  leiloeiro: inferPairMode(inputs.comissao_leiloeiro_percentual, inputs.comissao_leiloeiro_valor),
  corretor: inferPairMode(inputs.comissao_corretor_percentual, inputs.comissao_corretor_valor),
  ganhoCapital: inferPairMode(inputs.ganho_capital_percentual, inputs.ganho_capital_valor),
});

export const createAnaliseFallbackInputs = (item = {}) => {
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
    itbi_percentual: 2,
    itbi_valor: "",
    documentacao: 2500,
    manutencao_agua_mensal: "",
    manutencao_luz_mensal: "",
    manutencao_condominio_mensal: "",
    manutencao_iptu_mensal: "",
    comissao_leiloeiro_percentual: 5,
    comissao_leiloeiro_valor: "",
    comissao_corretor_percentual: 6,
    comissao_corretor_valor: "",
    ganho_capital_percentual: 15,
    ganho_capital_valor: "",
  };
};

const computeAnalise = (draft, pairModes) => {
  const valorMaximoLance = roundMoney(draft.valor_maximo_lance);
  const valorBaseOperacao = roundMoney(draft.valor_base_operacao || valorMaximoLance);
  const tempoOperacaoMeses = Math.max(parseInt(draft.tempo_operacao_meses || 0, 10) || 0, 0);
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
    pairModes.leiloeiro,
  );
  const corretor = resolvePair(
    valorEstimadoVenda,
    draft.comissao_corretor_percentual,
    draft.comissao_corretor_valor,
    pairModes.corretor,
  );

  const despesasUnicas = roundMoney(
    reforma + condominioAtraso + iptuAtraso + desocupacao + itbi.valor + documentacao
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
    valorMaximoLance + leiloeiro.valor + despesasUnicas + despesasMensaisProjetadas
  );
  const capitalInvestidoEstimado = roundMoney(
    desembolsoAquisicao + despesasUnicas + despesasMensaisProjetadas
  );
  const baseGanhoCapital = roundMoney(Math.max((valorEstimadoVenda - corretor.valor) - custoTotalImovel, 0));
  const ganhoCapital = resolvePair(
    baseGanhoCapital,
    draft.ganho_capital_percentual,
    draft.ganho_capital_valor,
    pairModes.ganhoCapital,
  );
  const lucroEsperadoValor = roundMoney(
    valorEstimadoVenda - custoTotalImovel - corretor.valor - ganhoCapital.valor
  );
  const despesasPosVenda = roundMoney(corretor.valor + ganhoCapital.valor);
  const roiEsperadoPercentual = capitalInvestidoEstimado > 0
    ? roundPercent((lucroEsperadoValor / capitalInvestidoEstimado) * 100)
    : 0;

  const inputs = {
    link_google_maps: draft.link_google_maps || "",
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
  };

  const calculos = {
    valor_financiado: valorFinanciado,
    desembolso_aquisicao: desembolsoAquisicao,
    despesas_unicas: despesasUnicas,
    despesa_mensal_operacional: despesaMensalOperacional,
    despesa_mensal_total: despesaMensalTotal,
    despesas_mensais_projetadas: despesasMensaisProjetadas,
    custo_financiamento_projetado: custoFinanciamentoProjetado,
    custo_total_imovel: custoTotalImovel,
    capital_investido_estimado: capitalInvestidoEstimado,
    base_ganho_capital: baseGanhoCapital,
    despesas_pos_venda: despesasPosVenda,
    lucro_esperado_valor: lucroEsperadoValor,
    roi_esperado_percentual: roiEsperadoPercentual,
  };

  return { inputs, calculos };
};

export const buildAnalisePayload = (draft, pairModes) => computeAnalise(draft, pairModes).inputs;

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

export function AnaliseModal({
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
