import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const usuario = { id: 1, role: "prospector", ai_access: true };
vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({ user: usuario, hasRole: () => false }),
}));
vi.mock("../../services/prospeccoes", async (load) => ({
  ...(await load()),
  fetchCapturados: vi.fn(),
  fetchSelecionados: vi.fn(),
  fetchProspecMeta: vi.fn(),
  fetchAnaliseSelecionado: vi.fn(),
  fetchAiAnalise: vi.fn(),
  fetchEnriquecimento: vi.fn(),
  enviarMensagemAiChat: vi.fn(),
  pollAiJob: vi.fn(),
}));
vi.mock("./ProspeccoesDetailModals", () => ({
  AvaliacaoAutomaticaModal: () => null,
  AvaliacaoDetalhadaModal: ({ item, onClose }) =>
    item ? (
      <section role="tabpanel" aria-label="Ficha do imóvel">
        <h2>Ficha {item.codigo}</h2>
        <button onClick={onClose}>Voltar à pesquisa</button>
      </section>
    ) : null,
}));
import Prospeccoes from "../Prospeccoes";
import {
  fetchCapturados,
  fetchSelecionados,
  fetchProspecMeta,
  fetchAnaliseSelecionado,
  fetchAiAnalise,
  enviarMensagemAiChat,
  pollAiJob,
} from "../../services/prospeccoes";

const imoveis = [
  {
    codigo: "A",
    bairro: "Barra Funda",
    cidade: "São Paulo",
    uf: "SP",
    fonte: "caixa_extrajudicial",
    melhorLance: 80000,
    melhorData: "2026-11-25T12:00:00-03:00",
    valorAvaliacao: 120000,
    financia: true,
    link: "https://venda-imoveis.caixa.gov.br/A",
    avaliado: true,
  },
  {
    codigo: "B",
    bairro: "Mooca",
    cidade: "São Paulo",
    uf: "SP",
    fonte: "tjdft_judicial",
    melhorLance: 100000,
    melhorData: "2026-11-18T12:00:00-03:00",
    financia: false,
    link: "https://www.tjdft.jus.br/B",
  },
];
function mount(query = "") {
  return render(
    <MemoryRouter initialEntries={[`/prospeccoes${query}`]}>
      <Prospeccoes />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  window.innerWidth = 1487;
  Object.defineProperty(navigator, "maxTouchPoints", { configurable: true, value: 0 });
  HTMLElement.prototype.scrollTo = vi.fn();
  fetchCapturados.mockResolvedValue({ data: imoveis, total: 120, page: 1 });
  fetchSelecionados.mockResolvedValue([]);
  fetchProspecMeta.mockResolvedValue({
    ufs: ["SP", "GO"],
    modalidades: ["Leilão SFI"],
    lance_maximo: 5000000,
  });
  fetchAnaliseSelecionado.mockImplementation(async (numero_bem) => ({
    numero_bem,
  }));
  fetchAiAnalise.mockImplementation(async (numero_bem) => ({
    numero_bem,
    analise_texto: "Análise salva",
    historico_chat: [],
  }));
  enviarMensagemAiChat.mockResolvedValue({ job_id: "job-1" });
  pollAiJob.mockResolvedValue({ status: "done" });
});
afterEach(cleanup);

describe("Prospecção desktop integrada", () => {
  it("carrega 100 por página e mostra preço, data e acessos externos reais", async () => {
    mount();
    await screen.findByRole("button", { name: "Abrir imóvel A" });
    expect(fetchCapturados).toHaveBeenLastCalledWith(
      expect.objectContaining({
        pageSize: 100,
        orderBy: "valor_minimo",
        orderDir: "asc",
        oportunidade: true,
      }),
    );
    expect(screen.getByText("R$ 80.000")).toBeInTheDocument();
    expect(screen.getByText(/25\/11\/2026/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Anúncio original do imóvel A" }),
    ).toHaveAttribute("href", imoveis[0].link);
    expect(
      screen.getByRole("link", { name: "Anúncio original do imóvel B" }),
    ).toHaveAttribute("href", imoveis[1].link);
    expect(
      screen.getByRole("link", { name: "Mapa do imóvel A" }),
    ).toHaveAttribute(
      "href",
      expect.stringContaining("google.com/maps/search"),
    );
    expect(
      screen.queryByRole("tab", { name: /Selecionados/ }),
    ).not.toBeInTheDocument();
  });

  it("envia busca, faixa inclusiva e avaliados ao servidor antes da paginação", async () => {
    mount();
    await screen.findByRole("button", { name: "Abrir imóvel A" });
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "Barra" },
    });
    fireEvent.change(
      screen.getByRole("slider", { name: "Valor máximo do lance" }),
      { target: { value: "480000" } },
    );
    fireEvent.change(
      screen.getByRole("slider", { name: "Valor mínimo do lance" }),
      { target: { value: "80000" } },
    );
    fireEvent.change(screen.getByLabelText("Avaliados", { exact: true }), {
      target: { value: "sim" },
    });
    await waitFor(() =>
      expect(fetchCapturados).toHaveBeenLastCalledWith(
        expect.objectContaining({
          busca: "Barra",
          lanceMin: 80000,
          lanceMax: 480000,
          avaliados: "sim",
          page: 1,
        }),
      ),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Remover faixa de lance" }),
    );
    await waitFor(() =>
      expect(fetchCapturados).toHaveBeenLastCalledWith(
        expect.objectContaining({
          lanceMin: undefined,
          lanceMax: undefined,
          busca: "Barra",
        }),
      ),
    );
  });

  it("mantém a pesquisa e evita duplicar a aba do mesmo imóvel", async () => {
    mount("?busca=Barra&lance_max=480000");
    fireEvent.click(
      await screen.findByRole("button", { name: "Abrir imóvel A" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Ficha A" }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("tab", { name: "Prospecção", exact: true }),
    );
    expect(screen.getByRole("searchbox")).toHaveValue("Barra");
    expect(
      screen.getByRole("slider", { name: "Valor máximo do lance" }),
    ).toHaveValue("480000");
    fireEvent.click(screen.getByRole("button", { name: "Abrir imóvel A" }));
    expect(screen.getAllByRole("tab", { name: /Barra Funda/ })).toHaveLength(1);
    fireEvent.click(
      screen.getByRole("button", { name: "Fechar aba do imóvel A" }),
    );
    expect(
      screen.queryByRole("tab", { name: /Barra Funda/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("searchbox")).toHaveValue("Barra");
  });

  it("consultar análise concluída só carrega os resultados existentes", async () => {
    mount();
    fireEvent.click(
      await screen.findByRole("button", { name: "Concluída análise IA" }),
    );
    await waitFor(() =>
      expect(fetchAiAnalise).toHaveBeenCalledWith(
        "A",
        "capturados",
        expect.any(Object),
      ),
    );
    expect(enviarMensagemAiChat).not.toHaveBeenCalled();
  });

  it("preserva a apresentação e os parâmetros do celular", async () => {
    window.innerWidth = 390;
    Object.defineProperty(navigator, "maxTouchPoints", { configurable: true, value: 1 });
    mount();
    await waitFor(() => expect(fetchCapturados).toHaveBeenCalled());
    expect(fetchCapturados).toHaveBeenLastCalledWith(expect.objectContaining({ pageSize: 20, orderBy: "ultima_disputa", oportunidade: false }));
    expect(screen.queryByRole("tablist", { name: "Abas de prospecção" })).not.toBeInTheDocument();
    expect(screen.queryByRole("slider", { name: "Valor mínimo do lance" })).not.toBeInTheDocument();
  });

  it("a solicitação explícita usa a integração atual da IA", async () => {
    mount();
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Solicitar análise IA",
        exact: true,
      }),
    );
    await waitFor(() =>
      expect(enviarMensagemAiChat).toHaveBeenCalledWith(
        "B",
        "__init__",
        "capturados",
      ),
    );
  });
});
