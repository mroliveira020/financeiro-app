export const MENSAGEM_VIABILIDADE_PENDENTE =
  "Viabilidade pendente. Informe o valor estimado de venda para calcular o lucro e o ROI.";

export function temVendaEstimadaPendente(analise) {
  return (
    analise?.calculos?.venda_estimada_pendente ??
    (Boolean(analise?.inputs) &&
      Number(analise.inputs.valor_estimado_venda || 0) <= 0)
  );
}
