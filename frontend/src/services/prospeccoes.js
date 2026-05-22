import api from "./http";

const normalizeLink = (numeroBem, linkConsulta) => {
  const cleaned = `${linkConsulta || ""}`.trim();
  if (cleaned) return cleaned;
  return `https://venda-imoveis.caixa.gov.br/sistema/detalhe-imovel.asp?hdnOrigem=index&hdnimovel=${numeroBem}`;
};

const normalizeFotos = (row) => {
  const rawFotos = Array.isArray(row?.fotos) ? row.fotos : [];
  const candidates = [
    ...rawFotos,
    row?.foto_url,
    row?.foto_principal_url,
    row?.imagem_principal_url,
    row?.thumbnail_url,
  ];

  return candidates
    .map((item) => `${item || ""}`.trim())
    .filter((item, index, lista) => item && lista.indexOf(item) === index);
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
  orderBy = "ultima_disputa",
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
  const total = data?.total ?? rows.length;
  const currentPage = data?.page ?? page;
  const currentPageSize = data?.page_size ?? pageSize;
  const formatted = rows.map((row) => {
    const fotos = normalizeFotos(row);
    return {
      fotos,
      fotoUrl: fotos[0] || null,
      codigo: row.numero_bem,
      cidade: row.cidade,
      uf: row.uf,
      situacao: row.disponivel ? "Disponível" : "Indisponível",
      modalidade: row.tipo_venda,
      valor: row.valor_minimo,
      valorMinimo: row.valor_minimo,
      valorVenda: row.valor_venda,
      valorAvaliacao: row.valor_avaliacao,
      valorLeilao1: row.valor_leilao_1,
      valorLeilao2: row.valor_leilao_2,
      lanceAtual: row.lance_atual,
      link: normalizeLink(row.numero_bem, row.link_consulta),
      coletadoEm: row.coletado_em,
      ultima_disputa: row.ultima_disputa,
      descricao: row.detalhes,
      financia: row.financia,
      endereco: row.endereco,
      bairro: row.bairro,
      data_leilao_1: row.data_leilao_1,
      data_leilao_2: row.data_leilao_2,
      data_licitacao_aberta: row.data_licitacao_aberta,
      data_hora_encerramento: row.data_hora_encerramento,
      fonte: row.fonte,
      tipoImovel: row.tipo_imovel,
      desconto: row.desconto,
    };
  });
  return { data: formatted, total, page: currentPage, pageSize: currentPageSize };
}

export async function fetchSelecionados({ status, uf, userId } = {}) {
  const { data } = await api.get("/prospeccoes/selecionados", {
    params: { status, uf, user_id: userId },
    paramsSerializer: { serialize: serializeParams },
  });
  return (data?.data || []).map((item) => ({
    codigo: item.numero_bem,
    status: item.status,
    valorMaximo: item.valor_maximo,
    prioridade: item.prioridade,
    createdBy: item.created_by,
    createdByName: item.created_by_name,
    responsaveis: (item.responsaveis || []).map((responsavel) => ({
      id: responsavel.id,
      name: responsavel.name,
      email: responsavel.email,
      role: responsavel.role,
    })),
    cidade: item.cidade,
    uf: item.uf,
    valor: item.valor_venda ?? item.valor_avaliacao,
    link: normalizeLink(item.numero_bem, item.link_consulta),
    modalidade: item.tipo_venda,
    disponivel: item.disponivel,
    observacoes: item.observacoes,
    observacoesHistorico: (item.observacoes_historico || []).map((obs) => ({
      observacao: obs.observacao,
      createdBy: obs.created_by,
      createdByName: obs.created_by_name,
      createdAt: obs.created_at,
    })),
    descricao: item.detalhes,
    dataLeilao: item.data_leilao,
    analiseSalva: Boolean(item.analise_salva),
    roiEsperadoPercentual: item.roi_esperado_percentual,
    lucroEsperadoValor: item.lucro_esperado_valor,
  }));
}

export async function fetchResponsaveisDisponiveis() {
  const { data } = await api.get("/prospeccoes/responsaveis");
  return (data?.data || []).map((item) => ({
    id: item.id,
    name: item.name,
    email: item.email,
    role: item.role,
  }));
}

export async function salvarResponsaveisSelecionado(numeroBem, userIds) {
  const { data } = await api.put(`/prospeccoes/selecionados/${numeroBem}/responsaveis`, {
    user_ids: userIds,
  });
  return data;
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

export async function excluirSelecionado(numeroBem) {
  return api.delete(`/prospeccoes/selecionados/${numeroBem}`);
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

export async function fetchAnaliseSelecionado(numeroBem) {
  const { data } = await api.get(`/prospeccoes/selecionados/${numeroBem}/analise`);
  return data;
}

export async function salvarAnaliseSelecionado(numeroBem, payload) {
  const { data } = await api.put(`/prospeccoes/selecionados/${numeroBem}/analise`, payload);
  return data;
}
