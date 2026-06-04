import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./http", () => ({
  default: {
    get: vi.fn(),
    put: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

import api from "./http";
import {
  adicionarSelecionado,
  excluirSelecionado,
  fetchAnaliseSelecionado,
  fetchCapturados,
  fetchSelecionados,
  pollAiJob,
  salvarResponsaveisSelecionado,
  salvarAnaliseSelecionado,
} from "./prospeccoes";

describe("services/prospeccoes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.window = {
      setTimeout,
    };
  });

  it("mapeia capturados com origem, foto principal e flags de análise", async () => {
    api.get.mockResolvedValueOnce({
      data: {
        data: [
          {
            numero_bem: "123",
            cidade: "Curitiba",
            uf: "PR",
            disponivel: true,
            tipo_venda: "Leilão",
            valor_minimo: 100000,
            valor_venda: 110000,
            valor_avaliacao: 150000,
            detalhes: "Apartamento",
            financia: true,
            endereco: "Rua A",
            bairro: "Centro",
            fonte: "caixa",
            tipo_imovel: "Apartamento",
            desconto: 25,
            analise_salva: true,
            analise_ia_salva: false,
            foto_url: "/foto.jpg",
            avaliacao: { score_total: 8 },
          },
        ],
        total: 1,
        page: 3,
        page_size: 20,
      },
    });

    const result = await fetchCapturados({ page: 3, pageSize: 20 });

    expect(api.get).toHaveBeenCalledWith(
      "/prospeccoes/capturados",
      expect.objectContaining({
        params: expect.objectContaining({ page: 3, page_size: 20 }),
      }),
    );
    expect(result.total).toBe(1);
    expect(result.page).toBe(3);
    expect(result.pageSize).toBe(20);
    expect(result.data[0]).toEqual(
      expect.objectContaining({
        origem: "capturados",
        codigo: "123",
        fotoUrl: "https://venda-imoveis.caixa.gov.br/foto.jpg",
        analiseSalva: true,
        analiseIaSalva: false,
      }),
    );
  });

  it("busca análise pelo endpoint de capturados quando a origem for capturados", async () => {
    api.get.mockResolvedValueOnce({ data: { ok: true } });

    const result = await fetchAnaliseSelecionado("1555520929360", "capturados");

    expect(api.get).toHaveBeenCalledWith("/prospeccoes/capturados/1555520929360/analise");
    expect(result).toEqual({ ok: true });
  });

  it("salva análise pelo endpoint correto para capturados", async () => {
    api.put.mockResolvedValueOnce({ data: { saved: true } });

    const payload = { valor_base_operacao: 123456 };
    const result = await salvarAnaliseSelecionado("1555520929360", payload, "capturados");

    expect(api.put).toHaveBeenCalledWith("/prospeccoes/capturados/1555520929360/analise", payload);
    expect(result).toEqual({ saved: true });
  });

  it("mapeia selecionados com responsáveis, atividade e histórico de observações", async () => {
    api.get.mockResolvedValueOnce({
      data: {
        data: [
          {
            numero_bem: "321",
            status: "selecionado",
            valor_maximo: 98000,
            prioridade: "alta",
            created_by: 1,
            created_by_name: "Ana",
            ativo: false,
            inativado_em: "2026-06-03T10:00:00Z",
            inativado_por: 9,
            inativado_por_name: "Marcos",
            responsaveis: [{ id: 8, name: "Julia", email: "julia@test.com", role: "prospector" }],
            cidade: "Londrina",
            uf: "PR",
            bairro: "Centro",
            endereco: "Rua B",
            valor_venda: 125000,
            valor_avaliacao: 160000,
            link_consulta: "",
            fonte: "caixa",
            tipo_venda: "Leilão",
            tipo_imovel: "Casa",
            disponivel: true,
            observacoes: "Revisar matrícula",
            observacoes_historico: [
              { observacao: "Primeira nota", created_by: 1, created_by_name: "Ana", created_at: "2026-06-01T10:00:00Z" },
            ],
            detalhes: "Casa térrea",
            desconto: 18,
            data_leilao: "2026-06-20",
            analise_salva: true,
            analise_ia_salva: true,
          },
        ],
      },
    });

    const result = await fetchSelecionados({ status: "selecionado", incluirInativos: true });

    expect(api.get).toHaveBeenCalledWith(
      "/prospeccoes/selecionados",
      expect.objectContaining({
        params: { status: "selecionado", uf: undefined, user_id: undefined, incluir_inativos: true },
      }),
    );
    expect(result[0]).toEqual(
      expect.objectContaining({
        origem: "selecionados",
        codigo: "321",
        ativo: false,
        observacoes: "Revisar matrícula",
        analiseSalva: true,
        analiseIaSalva: true,
        responsaveis: [{ id: 8, name: "Julia", email: "julia@test.com", role: "prospector" }],
      }),
    );
    expect(result[0].observacoesHistorico).toEqual([
      {
        observacao: "Primeira nota",
        createdBy: 1,
        createdByName: "Ana",
        createdAt: "2026-06-01T10:00:00Z",
      },
    ]);
  });

  it("envia inclusão manual de selecionado com payload enxuto", async () => {
    api.post.mockResolvedValueOnce({ data: { ok: true } });

    await adicionarSelecionado({
      numero_bem: "999",
      status: "candidato",
      valor_maximo: 88000,
      prioridade: "media",
      observacoes: "Entrada manual",
      campo_ignorado: "nao vai",
    });

    expect(api.post).toHaveBeenCalledWith("/prospeccoes/selecionados", {
      numero_bem: "999",
      status: "candidato",
      valor_maximo: 88000,
      prioridade: "media",
      observacoes: "Entrada manual",
    });
  });

  it("salva responsáveis e exclui selecionado usando os endpoints corretos", async () => {
    api.put.mockResolvedValueOnce({ data: { ok: true } });
    api.delete.mockResolvedValueOnce({ data: { ok: true } });

    await salvarResponsaveisSelecionado("123", [6, 7]);
    await excluirSelecionado("123");

    expect(api.put).toHaveBeenCalledWith("/prospeccoes/selecionados/123/responsaveis", {
      user_ids: [6, 7],
    });
    expect(api.delete).toHaveBeenCalledWith("/prospeccoes/selecionados/123");
  });

  it("faz polling do job de IA até encontrar status final e reporta progresso", async () => {
    api.get
      .mockResolvedValueOnce({ data: { status: "pending", job_id: "job-1" } })
      .mockResolvedValueOnce({ data: { status: "processing", job_id: "job-1" } })
      .mockResolvedValueOnce({ data: { status: "done", job_id: "job-1", resultado: { resumo: "ok" } } });

    const onProgress = vi.fn();
    const result = await pollAiJob("123", "job-1", {
      origem: "capturados",
      intervalMs: 0,
      timeoutMs: 5000,
      onProgress,
    });

    expect(api.get).toHaveBeenNthCalledWith(1, "/prospeccoes/capturados/123/ai-analise/job/job-1");
    expect(api.get).toHaveBeenNthCalledWith(2, "/prospeccoes/capturados/123/ai-analise/job/job-1");
    expect(api.get).toHaveBeenNthCalledWith(3, "/prospeccoes/capturados/123/ai-analise/job/job-1");
    expect(onProgress).toHaveBeenCalledTimes(3);
    expect(result).toEqual({
      status: "done",
      job_id: "job-1",
      resultado: { resumo: "ok" },
    });
  });
});
