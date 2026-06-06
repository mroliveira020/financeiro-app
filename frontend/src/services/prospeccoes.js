import api from "./http";

const CAIXA_BASE_URL = "https://venda-imoveis.caixa.gov.br";

const normalizeLink = (numeroBem, linkConsulta) => {
  const cleaned = `${linkConsulta || ""}`.trim();
  if (cleaned) return cleaned;
  return `https://venda-imoveis.caixa.gov.br/sistema/detalhe-imovel.asp?hdnOrigem=index&hdnimovel=${numeroBem}`;
};

const normalizeFotoUrl = (value) => {
  const cleaned = `${value || ""}`.trim();
  if (!cleaned) return "";
  if (cleaned.startsWith("http://") || cleaned.startsWith("https://") || cleaned.startsWith("data:")) {
    return cleaned;
  }
  if (cleaned.startsWith("//")) {
    return `https:${cleaned}`;
  }
  if (cleaned.startsWith("/")) {
    return `${CAIXA_BASE_URL}${cleaned}`;
  }
  return `${CAIXA_BASE_URL}/${cleaned.replace(/^\.?\//, "")}`;
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
    .map((item) => normalizeFotoUrl(item))
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
  fonte,
  cidade,
  modalidade,
  financia,
  status = ["disponivel"],
  orderBy = "ultima_disputa",
  orderDir = "desc",
  scoreMin,
  roiMin,
  somenteComAvaliacao,
} = {}) {
  const { data } = await api.get("/prospeccoes/capturados", {
    params: {
      page,
      page_size: pageSize,
      uf,
      fonte,
      cidade,
      modalidade,
      financia,
      status,
      order_by: orderBy,
      order_dir: orderDir,
      score_min: scoreMin,
      roi_min: roiMin,
      somente_com_avaliacao: somenteComAvaliacao,
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
      origem: "capturados",
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
      analiseSalva: Boolean(row.analise_salva),
      analiseIaSalva: Boolean(row.analise_ia_salva),
      avaliacaoAutomatica: row.avaliacao || null,
    };
  });
  return { data: formatted, total, page: currentPage, pageSize: currentPageSize };
}

export async function fetchSelecionados({ status, uf, userId, incluirInativos } = {}) {
  const { data } = await api.get("/prospeccoes/selecionados", {
    params: { status, uf, user_id: userId, incluir_inativos: incluirInativos },
    paramsSerializer: { serialize: serializeParams },
  });
  return (data?.data || []).map((item) => {
    const fotos = normalizeFotos(item);
    return {
      origem: "selecionados",
      fotos,
      fotoUrl: fotos[0] || null,
      codigo: item.numero_bem,
      status: item.status,
      valorMaximo: item.valor_maximo,
      prioridade: item.prioridade,
      createdBy: item.created_by,
      createdByName: item.created_by_name,
      ativo: item.ativo !== false,
      inativadoEm: item.inativado_em,
      inativadoPor: item.inativado_por,
      inativadoPorName: item.inativado_por_name,
      responsaveis: (item.responsaveis || []).map((responsavel) => ({
        id: responsavel.id,
        name: responsavel.name,
        email: responsavel.email,
        role: responsavel.role,
      })),
      cidade: item.cidade,
      uf: item.uf,
      bairro: item.bairro,
      endereco: item.endereco,
      valor: item.valor_venda ?? item.valor_avaliacao,
      valorVenda: item.valor_venda,
      valorAvaliacao: item.valor_avaliacao,
      valorLeilao1: item.valor_leilao_1,
      valorLeilao2: item.valor_leilao_2,
      link: normalizeLink(item.numero_bem, item.link_consulta),
      linkGoogleMaps: item.link_google_maps || "",
      fonte: item.fonte,
      modalidade: item.tipo_venda,
      tipoImovel: item.tipo_imovel,
      disponivel: item.disponivel,
      observacoes: item.observacoes,
      observacoesHistorico: (item.observacoes_historico || []).map((obs) => ({
        observacao: obs.observacao,
        createdBy: obs.created_by,
        createdByName: obs.created_by_name,
        createdAt: obs.created_at,
      })),
      descricao: item.detalhes,
      desconto: item.desconto,
      data_leilao_1: item.data_leilao_1,
      data_leilao_2: item.data_leilao_2,
      data_licitacao_aberta: item.data_licitacao_aberta,
      data_hora_encerramento: item.data_hora_encerramento,
      dataLeilao: item.data_leilao,
      analiseSalva: Boolean(item.analise_salva),
      analiseIaSalva: Boolean(item.analise_ia_salva),
      roiEsperadoPercentual: item.roi_esperado_percentual,
      lucroEsperadoValor: item.lucro_esperado_valor,
      avaliacaoAutomatica: item.avaliacao || null,
    };
  });
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
    fontes: data?.fontes || [],
    modalidades: data?.modalidades || [],
    financia: data?.financia || [],
    cidades_por_uf: data?.cidades_por_uf || {},
  };
}

function getAnaliseBasePath(origem = "selecionados", numeroBem) {
  return `/prospeccoes/${origem}/${numeroBem}/analise`;
}

export async function fetchAnaliseSelecionado(numeroBem, origem = "selecionados") {
  const { data } = await api.get(getAnaliseBasePath(origem, numeroBem));
  return data;
}

export async function salvarAnaliseSelecionado(numeroBem, payload, origem = "selecionados") {
  const { data } = await api.put(getAnaliseBasePath(origem, numeroBem), payload);
  return data;
}

export async function fetchAvaliacaoAutomatica(numeroBem) {
  const { data } = await api.get(`/prospeccoes/capturados/${numeroBem}/avaliacao`);
  return data;
}

export async function salvarScoreRegiao(numeroBem, scoreRegiao) {
  const { data } = await api.patch(`/prospeccoes/capturados/${numeroBem}/score-regiao`, {
    score_regiao: scoreRegiao,
  });
  return data;
}

function getAiBasePath(origem = "selecionados", numeroBem) {
  return `/prospeccoes/${origem}/${numeroBem}`;
}

export async function fetchAiAnalise(numeroBem, origem = "selecionados") {
  const { data } = await api.get(`${getAiBasePath(origem, numeroBem)}/ai-analise`);
  return data;
}

export async function salvarAiAnalise(numeroBem, payload, origem = "selecionados") {
  const { data } = await api.put(`${getAiBasePath(origem, numeroBem)}/ai-analise`, payload);
  return data;
}

export async function enviarMensagemAiChat(numeroBem, mensagem, origem = "selecionados") {
  const { data } = await api.post(`${getAiBasePath(origem, numeroBem)}/ai-analise/chat`, { mensagem });
  return data;
}

export async function solicitarMatricula(numeroBem, origem = "selecionados") {
  const { data } = await api.post(`${getAiBasePath(origem, numeroBem)}/matricula`);
  return data;
}

export async function solicitarEnriquecimento(numeroBem, origem = "selecionados") {
  const { data } = await api.post(`${getAiBasePath(origem, numeroBem)}/enriquecimento`);
  return data;
}

export async function fetchAiJob(numeroBem, jobId, origem = "selecionados") {
  const { data } = await api.get(`${getAiBasePath(origem, numeroBem)}/ai-analise/job/${jobId}`);
  return data;
}

export async function pollAiJob(
  numeroBem,
  jobId,
  {
    intervalMs = 3000,
    timeoutMs = 120000,
    origem = "selecionados",
    onProgress,
  } = {}
) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const job = await fetchAiJob(numeroBem, jobId, origem);
    if (typeof onProgress === "function") {
      onProgress(job);
    }
    if (job?.status === "done" || job?.status === "error" || job?.status === "failed") {
      return job;
    }
    await new Promise((resolve) => window.setTimeout(resolve, intervalMs));
  }
  throw new Error("Tempo limite excedido ao aguardar processamento da IA.");
}
