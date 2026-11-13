import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
  cleanup,
} from "@testing-library/react";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import LancamentosImovel from "./LancamentosImovel";
import api from "../../services/http";

vi.mock("../../services/http", () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}));
vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({ hasCapability: () => true }),
}));
vi.mock("../../hooks/useCatalogos", () => ({
  useCatalogos: () => ({ categorias: [{ id: 2, categoria: "Documentação" }] }),
}));
vi.mock("../../services/api", () => ({
  fetchSociosImovel: vi
    .fn()
    .mockResolvedValue([
      { user_id: 6, user_name: "Ana", percentual_participacao: 50 },
    ]),
}));

beforeEach(() => {
  api.get.mockReset();
  api.post.mockReset();
  api.patch.mockReset();
  api.get.mockResolvedValue({
    data: {
      items: [
        {
          id_lancamento: 7,
          id_imovel: 24,
          data: "2026-11-13",
          descricao: "ITBI",
          valor: 2250,
          id_categoria: 2,
          id_situacao: 1,
          paid_by_user_id: 6,
          confirmado: true,
        },
      ],
      total: 1,
      summary: { total: 1, pendentes: 0, soma: 2250 },
    },
  });
  api.post.mockResolvedValue({ data: {} });
  api.patch.mockResolvedValue({ data: {} });
});
afterEach(cleanup);

it("envia filtros ao servidor e mantém o imóvel da aba", async () => {
  render(<LancamentosImovel imovelId="24" />);
  await screen.findByRole("button", { name: "Editar ITBI" });
  fireEvent.change(screen.getByLabelText("Buscar lançamento"), {
    target: { value: "cartório" },
  });
  await waitFor(() =>
    expect(api.get).toHaveBeenLastCalledWith(
      "/dashboard/lancamentos/imovel/24",
      expect.objectContaining({
        params: expect.objectContaining({ busca: "cartório", page: 1 }),
      }),
    ),
  );
});

it("inclui lançamento pela página e mantém dados quando falha", async () => {
  api.post.mockRejectedValueOnce({
    response: { data: { error: "Falha de teste" } },
  });
  render(<LancamentosImovel imovelId="24" />);
  fireEvent.click(screen.getByRole("button", { name: "Novo lançamento" }));
  const form = screen
    .getByRole("heading", { name: "Novo lançamento" })
    .closest("aside");
  fireEvent.change(within(form).getByLabelText("Descrição"), {
    target: { value: "Cartório" },
  });
  fireEvent.change(within(form).getByLabelText("Valor"), {
    target: { value: "1.250,00" },
  });
  fireEvent.change(within(form).getByLabelText("Categoria"), {
    target: { value: "2" },
  });
  await waitFor(() =>
    expect(
      within(form).getByRole("button", { name: "Salvar lançamento" }),
    ).toBeEnabled(),
  );
  fireEvent.click(
    within(form).getByRole("button", { name: "Salvar lançamento" }),
  );
  await screen.findByText("Falha de teste");
  expect(within(form).getByLabelText("Descrição")).toHaveValue("Cartório");
  fireEvent.click(
    within(form).getByRole("button", { name: "Salvar lançamento" }),
  );
  await screen.findByText("Lançamento salvo.");
  expect(api.post).toHaveBeenLastCalledWith("/dashboard/lancamentos/lote", [
    expect.objectContaining({
      id_imovel: 24,
      valor: 1250,
      paid_by_user_id: 6,
      id_situacao: 1,
    }),
  ]);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("edita preservando a origem do movimento e inclui lote pendente", async () => {
  render(<LancamentosImovel imovelId="24" />);
  fireEvent.click(await screen.findByRole("button", { name: "Editar ITBI" }));
  fireEvent.change(
    screen
      .getByRole("heading", { name: "Editar lançamento" })
      .closest("aside")
      .querySelector('input[inputmode="decimal"]'),
    { target: { value: "2.300,00" } },
  );
  fireEvent.click(screen.getByRole("button", { name: "Salvar lançamento" }));
  await screen.findByText("Lançamento salvo.");
  expect(api.patch).toHaveBeenCalledWith(
    "/dashboard/lancamentos/7",
    expect.objectContaining({
      valor: 2300,
      id_imovel: 24,
      tipo_movimentacao: "despesa_imovel",
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Importar lote" }));
  fireEvent.change(screen.getByLabelText("Linhas do Excel"), {
    target: { value: "13/11/2026;Condomínio;480,00" },
  });
  const form = screen
    .getByRole("heading", { name: "Importar lote" })
    .closest("aside");
  fireEvent.click(within(form).getByRole("button", { name: "Importar lote" }));
  await screen.findByText("Lote importado para revisão.");
  expect(api.post).toHaveBeenLastCalledWith("/dashboard/lancamentos/lote", [
    expect.objectContaining({
      id_imovel: 24,
      valor: 480,
      id_categoria: 0,
      id_situacao: 0,
    }),
  ]);
});
