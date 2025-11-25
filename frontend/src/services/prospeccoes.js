import api from "./http";

const normalizeLink = (numeroBem, linkConsulta) => {
  const cleaned = `${linkConsulta || ""}`.trim();
  if (cleaned) return cleaned;
  return `https://venda-imoveis.caixa.gov.br/sistema/detalhe-imovel.asp?hdnOrigem=index&hdnimovel=${numeroBem}`;
};

const serializeParams = (params) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      value.forEach((v) => {
        if (v !== undefined && v !== null && `${v}`.trim() !== "") {
          search.append(key, v);
        }
      });
    } else if (`${value}`.trim() !== "") {
      search.append(key, value);
    }
  });
  return search.toString();
};

export async function fetchCapturados({ limit = 20, offset = 0, uf, modalidade, status, financia, cidade } = {}) {
  const { data } = await api.get("/prospeccoes/capturados", {
    params: { limit, offset, uf, modalidade, status, financia, cidade },
    paramsSerializer: { serialize: serializeParams },
  });
  return (data?.data || []).map((row) => ({
    codigo: row.numero_bem,
    cidade: row.cidade,
    uf: row.uf,
    situacao: row.disponivel ? "Disponível" : "Indisponível",
    modalidade: row.tipo_venda,
    valor: Math.min(
      ...[row.valor_leilao_1, row.valor_leilao_2, row.valor_venda].filter((v) => v !== null && v !== undefined).map(Number)
    ),
    link: normalizeLink(row.numero_bem, row.link_consulta),
    coletadoEm: row.coletado_em,
    descricao: row.detalhes,
    financia: row.financia,
    endereco: row.endereco,
    bairro: row.bairro,
    data_leilao_1: row.data_leilao_1,
    data_leilao_2: row.data_leilao_2,
    data_licitacao_aberta: row.data_licitacao_aberta,
    ultima_disputa: [row.data_leilao_1, row.data_leilao_2, row.data_licitacao_aberta]
      .filter(Boolean)
      .sort()
      .slice(-1)[0] || null,
  }));
}

export async function fetchSelecionados({ status, uf } = {}) {
  const { data } = await api.get("/prospeccoes/selecionados", {
    params: { status, uf },
    paramsSerializer: { serialize: serializeParams },
  });
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
    descricao: item.detalhes,
  }));
}

export async function adicionarSelecionado(payload) {
  const body = {
    numero_bem: payload.numero_bem,
    status: payload.status,
    valor_maximo: payload.valor_maximo,
    prioridade: payload.prioridade,
    observacoes: payload.observacoes,
  };
  return api.post("/prospeccoes/selecionados", body);
}

export async function fetchProspecMeta() {
  const { data } = await api.get("/prospeccoes/meta");
  return {
    ufs: data?.ufs || [],
    modalidades: data?.modalidades || [],
    financia: data?.financia || [],
    cidades_por_uf: data?.cidades_por_uf || {},
  };
}
