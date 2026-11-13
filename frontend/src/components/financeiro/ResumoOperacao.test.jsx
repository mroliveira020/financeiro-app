import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import ResumoFinanceiro from "../ResumoFinanceiro";
import {
  fetchFinanceiroCompartilhado,
  fetchSociosImovel,
} from "../../services/api";
import api from "../../services/http";

vi.mock("../../services/http", () => ({ default: { get: vi.fn() } }));
vi.mock("../../services/api", () => ({
  fetchFinanceiroCompartilhado: vi.fn(),
  fetchSociosImovel: vi.fn(),
}));
vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({ user: { id: 1 }, hasCapability: () => true }),
}));
vi.mock("./EditorOrcamento", () => ({
  default: () => <input aria-label="Rascunho de orçamento" />,
}));

const socios = [
  {
    user_id: 1,
    user_name: "Ana",
    percentual_participacao: 50,
    saldo_liquido: 1447.5,
  },
  {
    user_id: 2,
    user_name: "Bruno",
    percentual_participacao: 50,
    saldo_liquido: -1447.5,
  },
];
const resposta = (lista = socios) => ({ socios: lista, totais: {} });
const itens = [
  { id_grupo: 1, grupo: "Compra", orcamento: 180000, valor_efetivado: 180000 },
  {
    id_grupo: 2,
    grupo: "Documentação",
    orcamento: 15000,
    valor_efetivado: 10000,
  },
  { id_grupo: 3, grupo: "Desocupação", orcamento: 10000, valor_efetivado: 0 },
  {
    id_grupo: 4,
    grupo: "Manutenção",
    orcamento: 30000,
    valor_efetivado: 13000,
  },
  {
    id_grupo: 5,
    grupo: "Reforma",
    orcamento: 60000,
    valor_efetivado: 30000,
    valor_em_contratacao: 10000,
  },
  { id_grupo: 6, grupo: "Financiamento", orcamento: 0 },
  { id_grupo: 7, grupo: "Corretagem", orcamento: 24000 },
  { id_grupo: 8, grupo: "Venda", orcamento: 400000 },
];
const montar = (props = {}) => (
  <MemoryRouter>
    <ResumoFinanceiro imovelId="1" desktop onNavigate={vi.fn()} {...props} />
  </MemoryRouter>
);
const valor = (regiao, titulo) =>
  within(regiao)
    .getByText(titulo)
    .nextElementSibling.textContent.replace(/\s/g, " ");

beforeEach(() => {
  api.get.mockResolvedValue({ data: { items: itens, ganho_capital: 0.15 } });
  fetchSociosImovel.mockResolvedValue(socios);
  fetchFinanceiroCompartilhado.mockResolvedValue(resposta());
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

it("reutiliza o fechamento e mantém a posição pessoal ao alternar a visão", async () => {
  const { rerender } = render(montar());
  const posicao = await screen.findByRole("region", {
    name: "Sua posição entre sócios",
  });
  await within(posicao).findByText("Ana · 50% de participação");
  const projecao = screen.getByRole("region", {
    name: "Projeção de fechamento",
  });
  expect(valor(projecao, "Resultado líquido projetado")).toBe("R$ 68.850,00");
  expect(valor(projecao, "IR estimado sobre ganho de capital")).toBe(
    "R$ 12.150,00",
  );
  expect(valor(projecao, "ROI projetado")).toBe("23,34%");
  expect(valor(posicao, "Sua parte a investir")).toBe("R$ 31.000,00");
  rerender(montar({ viewMode: "minha_participacao" }));
  expect(valor(projecao, "Resultado líquido projetado")).toBe("R$ 34.425,00");
  expect(valor(projecao, "ROI projetado")).toBe("23,34%");
  expect(valor(posicao, "Sua parte no investimento")).toBe("R$ 147.500,00");
  expect(within(posicao).getByText(/1\.447,50 a receber/)).toBeInTheDocument();
});

it.each([
  [
    -1447.5,
    /1\.447,50 a pagar/,
    "Para Bruno, considerando os acertos registrados.",
  ],
  [0, "Acertos equalizados", "Considerando os acertos registrados."],
])(
  "apresenta corretamente a posição com saldo %s",
  async (saldo, texto, observacao) => {
    fetchFinanceiroCompartilhado.mockResolvedValue(
      resposta([
        { ...socios[0], saldo_liquido: saldo },
        { ...socios[1], saldo_liquido: -saldo },
      ]),
    );
    render(montar());
    expect(await screen.findByText(texto)).toBeInTheDocument();
    expect(screen.getByText(observacao)).toBeInTheDocument();
  },
);

it("permite repetir a consulta da posição sem bloquear a projeção", async () => {
  fetchFinanceiroCompartilhado.mockRejectedValueOnce(
    new Error("Falha simulada"),
  );
  render(montar());
  await screen.findByText(
    "Não foi possível carregar sua posição entre sócios.",
  );
  expect(
    screen.getByRole("region", { name: "Projeção de fechamento" }),
  ).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
  expect(await screen.findByText(/1\.447,50 a receber/)).toBeInTheDocument();
});

it("evita indicar saldo equalizado para informação ausente ou participação inativa", async () => {
  fetchFinanceiroCompartilhado.mockResolvedValueOnce(
    resposta([{ ...socios[0], saldo_liquido: null }]),
  );
  const { rerender } = render(montar());
  expect(await screen.findByText("Saldo indisponível.")).toBeInTheDocument();
  expect(screen.queryByText("Acertos equalizados")).not.toBeInTheDocument();
  fetchFinanceiroCompartilhado.mockResolvedValue(
    resposta([{ ...socios[0], ativo: false }]),
  );
  rerender(montar({ refreshKey: 1 }));
  expect(
    await screen.findByText("Você não possui participação ativa neste imóvel."),
  ).toBeInTheDocument();
});

it("descarta uma resposta antiga ao trocar de imóvel", async () => {
  let resolverAntiga;
  fetchFinanceiroCompartilhado.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolverAntiga = resolve;
      }),
  );
  const { rerender } = render(montar());
  await screen.findByText("Carregando sua posição…");
  fetchFinanceiroCompartilhado.mockResolvedValue(resposta([]));
  rerender(montar({ imovelId: "2" }));
  await screen.findByText("Você não possui participação ativa neste imóvel.");
  resolverAntiga(resposta());
  expect(screen.queryByText(/1\.447,50 a receber/)).not.toBeInTheDocument();
});

it("aciona as abas e preserva o rascunho do orçamento ao retornar ao Resumo", async () => {
  const navegar = vi.fn();
  const { rerender } = render(montar({ onNavigate: navegar }));
  fireEvent.click(await screen.findByRole("button", { name: "Ver orçamento" }));
  expect(navegar).toHaveBeenCalledWith("orcamento");
  fireEvent.click(screen.getByRole("button", { name: "Ver sócios e acertos" }));
  expect(navegar).toHaveBeenCalledWith("socios");
  rerender(montar({ painel: "orcamento" }));
  fireEvent.click(screen.getByRole("button", { name: "Editar orçamento" }));
  fireEvent.change(screen.getByLabelText("Rascunho de orçamento"), {
    target: { value: "Rascunho preservado" },
  });
  rerender(montar());
  expect(screen.getByLabelText("Rascunho de orçamento")).not.toBeVisible();
  rerender(montar({ painel: "orcamento" }));
  expect(screen.getByLabelText("Rascunho de orçamento")).toHaveValue(
    "Rascunho preservado",
  );
});

it("mantém a apresentação móvel sem consultar a posição do novo Resumo", async () => {
  render(montar({ desktop: false }));
  expect(
    await screen.findByRole("heading", { name: "Resumo Financeiro" }),
  ).toBeInTheDocument();
  expect(fetchFinanceiroCompartilhado).not.toHaveBeenCalled();
});
