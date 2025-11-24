import api from "./http";

const normalizeLink = (numeroBem, linkConsulta) => {
  const cleaned = `${linkConsulta || ""}`.trim();
  if (cleaned) return cleaned;
  return `https://venda-imoveis.caixa.gov.br/sistema/detalhe-imovel.asp?hdnOrigem=index&hdnimovel=${numeroBem}`;
};

export async function fetchCapturados({ limit = 20, offset = 0 } = {}) {
  const { data } = await api.get("/prospeccoes/capturados", { params: { limit, offset } });
  return (data?.data || []).map((row) => ({
    codigo: row.numero_bem,
    cidade: row.cidade,
    uf: row.uf,
    situacao: row.disponivel ? "Disponível" : "Indisponível",
    modalidade: row.tipo_venda,
    valor: row.valor_venda ?? row.valor_leilao_1 ?? row.valor_avaliacao,
    link: normalizeLink(row.numero_bem, row.link_consulta),
    coletadoEm: row.coletado_em,
  }));
}

export async function fetchSelecionados() {
  const { data } = await api.get("/prospeccoes/selecionados");
  return (data?.data || []).map((item) => ({
    codigo: item.numero_bem,
    status: item.status,
    valorMaximo: item.valor_maximo,
    prioridade: item.prioridade,
    cidade: item.cidade,
    uf: item.uf,
    valor: item.valor_venda ?? item.valor_avaliacao,
    link: normalizeLink(item.numero_bem, item.link_consulta),
    modalidade: item.tipo_venda,
    disponivel: item.disponivel,
    observacoes: item.observacoes,
  }));
}
