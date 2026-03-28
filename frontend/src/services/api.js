import api from './http';

const DEFAULT_RETRY_DELAY_MS = 1500;
const IMOVEIS_ACESSIVEIS_CACHE_TTL_MS = 30 * 1000;

let imoveisFinanceiroAcessiveisCache = {
  data: null,
  expiresAt: 0,
  pending: null,
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const shouldRetry = (error) => {
  if (!error) return false;

  if (!error.response) {
    return true;
  }

  const status = error.response.status;
  return status >= 500 || status === 429;
};

async function getWithRetry(requestFn, options = {}) {
  const {
    retries = 0,
    baseDelayMs = DEFAULT_RETRY_DELAY_MS,
    onRetry,
  } = options;

  let attempt = 0;
  let lastError;

  while (attempt <= retries) {
    try {
      return await requestFn();
    } catch (error) {
      lastError = error;

      if (!shouldRetry(error) || attempt === retries) {
        throw error;
      }

      const nextAttempt = attempt + 1;
      const delayMs = baseDelayMs * (2 ** (nextAttempt - 1));

      if (typeof onRetry === 'function') {
        try {
          onRetry({ attempt: nextAttempt, delayMs, error });
        } catch (callbackError) {
          console.error('[api] Erro no callback onRetry:', callbackError);
        }
      }

      await sleep(delayMs);
      attempt = nextAttempt;
    }
  }

  throw lastError;
}

// ✅ Buscar lista de imóveis
export async function fetchImoveis(options = {}) {
  const response = await getWithRetry(() => api.get('/imoveis'), options);
  return response.data;
}

export async function fetchImoveisFinanceiroAcessiveis(options = {}) {
  const forceRefresh = options?.forceRefresh === true;
  const agora = Date.now();

  if (!forceRefresh && imoveisFinanceiroAcessiveisCache.data && imoveisFinanceiroAcessiveisCache.expiresAt > agora) {
    return imoveisFinanceiroAcessiveisCache.data;
  }

  if (!forceRefresh && imoveisFinanceiroAcessiveisCache.pending) {
    return imoveisFinanceiroAcessiveisCache.pending;
  }

  const requisicao = getWithRetry(() => api.get('/imoveis-financeiro-acessiveis'), options)
    .then((response) => {
      imoveisFinanceiroAcessiveisCache = {
        data: response.data,
        expiresAt: Date.now() + IMOVEIS_ACESSIVEIS_CACHE_TTL_MS,
        pending: null,
      };
      return response.data;
    })
    .catch((error) => {
      imoveisFinanceiroAcessiveisCache = {
        ...imoveisFinanceiroAcessiveisCache,
        pending: null,
      };
      throw error;
    });

  imoveisFinanceiroAcessiveisCache = {
    ...imoveisFinanceiroAcessiveisCache,
    pending: requisicao,
  };

  return requisicao;
}

// ✅ Excluir um imóvel
export async function deleteImovel(id) {
  const { data } = await api.delete(`/imoveis/${id}`);
  return data;
}

// ✅ Atualizar um imóvel (NÃO EXISTIA, ENTÃO ADICIONAMOS)
export async function updateImovel(id, payload) {
  const { data } = await api.patch(`/imoveis/${id}`, payload);
  return data;
}

export const addImovel = async (novoImovel) => {
  const { data } = await api.post('/imoveis', novoImovel);
  return data;
};

export async function fetchCategorias() {
  const { data } = await api.get('/categorias');
  return data;
}

// Rodapé: Data de atualização (último confirmado <= hoje)
export async function fetchUltimaAtualizacao() {
  const { data } = await api.get('/dashboard/ultima_atualizacao');
  return data; // { data: 'DD/MM/AAAA' | null }
}

// Rodapé: Últimos lançamentos confirmados (globais)
export async function fetchUltimosLancamentos(limit = 10) {
  const { data } = await api.get(`/dashboard/ultimos_lancamentos?limit=${limit}`);
  return data; // [{ data, descricao, valor, imovel, categoria }]
}

// Dashboard geral: gastos mensais por imóvel (para gráficos)
export async function fetchGastosMensais(meses = 6, categoriasExcluidas = [], options = {}) {
  const { retries, baseDelayMs, onRetry, includeVendidos } = options;
  const params = new URLSearchParams();
  if (meses) params.append('meses', meses);
  if (categoriasExcluidas.length) {
    params.append('excluir', categoriasExcluidas.join(','));
  }
  if (includeVendidos !== undefined) {
    params.append('includeVendidos', includeVendidos ? 'true' : 'false');
  }
  const query = params.toString();
  const response = await getWithRetry(
    () => api.get(`/dashboard/gastos-mensais${query ? `?${query}` : ''}`),
    { retries, baseDelayMs, onRetry },
  );
  return response.data;
}

export async function fetchResumoImoveis(includeVendidos = true) {
  const params = new URLSearchParams();
  if (!includeVendidos) {
    params.append('includeVendidos', 'false');
  }
  const query = params.toString();
  const { data } = await api.get(`/dashboard/resumo-imoveis${query ? `?${query}` : ''}`);
  return data;
}

export async function atualizarLancamentosBatch(ids, updates) {
  const payload = {
    ids,
    updates,
  };
  const { data } = await api.patch('/dashboard/lancamentos/batch', payload);
  return data;
}

export async function fetchLancamentosCompletos({ imovelId, page = 1, pageSize = 30 } = {}) {
  if (!imovelId) {
    throw new Error('fetchLancamentosCompletos requer o id do imóvel.');
  }
  const params = new URLSearchParams();
  params.append('page', page);
  params.append('pageSize', pageSize);
  const { data } = await api.get(`/dashboard/lancamentos/completos/${imovelId}?${params.toString()}`);
  return data;
}

export async function fetchLancamentosIncompletos({ imovelId = 0, page = 1, pageSize = 50 } = {}) {
  const params = new URLSearchParams();
  params.append('page', page);
  params.append('pageSize', pageSize);
  const caminho = `/dashboard/lancamentos/incompletos/${imovelId}?${params.toString()}`;
  const { data } = await api.get(caminho);
  return data;
}

export async function fetchSociosImovel(imovelId, { incluirInativos = false } = {}) {
  if (!imovelId) {
    throw new Error('fetchSociosImovel requer o id do imóvel.');
  }
  const params = new URLSearchParams();
  if (incluirInativos) {
    params.append('incluir_inativos', 'true');
  }
  const { data } = await api.get(`/imoveis/${imovelId}/socios${params.toString() ? `?${params.toString()}` : ''}`);
  return data?.data || [];
}

export async function fetchFinanceiroCompartilhado(imovelId) {
  if (!imovelId) {
    throw new Error('fetchFinanceiroCompartilhado requer o id do imóvel.');
  }
  const { data } = await api.get(`/imoveis/${imovelId}/financeiro-compartilhado`);
  return data;
}

export async function fetchDetalhesGastosMensais({
  imovelId,
  mes,
  categoriasExcluidas = [],
} = {}) {
  if (!imovelId || !mes) {
    throw new Error('Parâmetros imovelId e mes são obrigatórios.');
  }

  const params = new URLSearchParams();
  params.append('imovelId', imovelId);
  params.append('mes', mes);
  if (categoriasExcluidas.length) {
    params.append('excluir', categoriasExcluidas.join(','));
  }

  const { data } = await api.get(`/dashboard/gastos-mensais/detalhes?${params.toString()}`);
  return data;
}

export async function fetchTransacoesMensais({ imovelId, mes, categoriaId } = {}) {
  if (!imovelId || !mes) {
    throw new Error('Parâmetros imovelId e mes são obrigatórios.');
  }

  const params = new URLSearchParams();
  params.append('imovelId', imovelId);
  params.append('mes', mes);
  if (categoriaId !== undefined && categoriaId !== null) {
    params.append('categoriaId', categoriaId);
  }

  const { data } = await api.get(`/dashboard/gastos-mensais/transacoes?${params.toString()}`);
  return data;
}
