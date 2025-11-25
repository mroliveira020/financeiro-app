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

export async function fetchCapturados({
  page = 1,
  pageSize = 50,
  uf,
  cidade,
  modalidade,
  financia,
  status = ["disponivel"],
  orderBy = "coletado_em",
  orderDir = "desc",
} = {}) {
  const { data } = await api.get("/prospeccoes/capturados", {
    params: {
      page,
      page_size: pageSize,
      uf,
      cidade,
      modalidade,
      financia,
      status,
      order_by: orderBy,
      order_dir: orderDir,
    },
    paramsSerializer: { serialize: serializeParams },
  });
  const rows = data?.data || [];
  const total = data?.total || rows.length;
  const formatted = rows.map((row) => {
    const valores = [row.valor_leilao_1, row.valor_leilao_2, row.valor_venda].filter(
      (v) => v !== null && v !== undefined && !Number.isNaN(Number(v))
    );
    const valorMinimo = valores.length ? Math.min(...valores.map(Number)) : null;
    const ultimaData = [row.data_leilao_1, row.data_leilao_2, row.data_licitacao_aberta, row.data_hora_encerramento, row.coletado_em]
      .filter(Boolean)
      .map((d) => new Date(d))
      .sort((a, b) => a - b)
      .slice(-1)[0];
    return {
      codigo: row.numero_bem,
      cidade: row.cidade,
      uf: row.uf,
      situacao: row.disponivel ? "Disponível" : "Indisponível",
      modalidade: row.tipo_venda,
      valor: valorMinimo,
      link: normalizeLink(row.numero_bem, row.link_consulta),
      coletadoEm: row.coletado_em,
      descricao: row.detalhes,
      financia: row.financia,
      endereco: row.endereco,
      bairro: row.bairro,
      data_leilao_1: row.data_leilao_1,
      data_leilao_2: row.data_leilao_2,
      data_licitacao_aberta: row.data_licitacao_aberta,
      data_hora_encerramento: row.data_hora_encerramento,
      valor_leilao_1: row.valor_leilao_1,
      valor_leilao_2: row.valor_leilao_2,
      valor_venda: row.valor_venda,
      ultima_disputa: ultimaData ? ultimaData.toISOString() : null,
      fonte: row.fonte,
    };
  });
  return { data: formatted, total };
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
