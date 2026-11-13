import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import CarteiraTabela from "./CarteiraTabela";
import api from "../../services/http";

vi.mock("../../services/http", () => ({ default: { get: vi.fn() } }));

const imoveis = [
  { id: 1, nome: "São Paulo", investimentoTotal: 1000, valorEfetivado: 800, valorAInvestir: 200, lucroProjetado: 300 },
  { id: 2, nome: "Rio Verde", investimentoTotal: 2000, valorEfetivado: 1500, valorAInvestir: 500, lucroProjetado: -100 },
  { id: 3, nome: "Campinas", vendido: true, investimentoTotal: 4000, valorEfetivado: 3500, valorAInvestir: 500, lucroProjetado: 800 },
];

beforeEach(() => api.get.mockResolvedValue({ data: { 1: 50, 2: 25, 3: 50 } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

const rodape = () => screen.getByRole("rowheader", { name: /Total dos imóveis listados/ }).closest("tr");
const valores = () => within(rodape()).getAllByRole("cell").map((celula) => celula.textContent.replace(/\s/g, " "));
const montar = () => render(<CarteiraTabela imoveis={imoveis} onOpen={vi.fn()} onIncluirVendidos={vi.fn()} />);

it("totaliza as quatro colunas apenas dos imóveis listados", () => {
  montar();
  expect(rodape()).toHaveTextContent("2 imóveis");
  expect(valores()).toEqual(["R$ 3.000,00", "R$ 2.300,00", "R$ 700,00", "R$ 200,00"]);
  fireEvent.change(screen.getByLabelText("Buscar imóvel"), { target: { value: "Sao" } });
  expect(rodape()).toHaveTextContent("1 imóvel");
  expect(valores()).toEqual(["R$ 1.000,00", "R$ 800,00", "R$ 200,00", "R$ 300,00"]);
  fireEvent.change(screen.getByLabelText("Buscar imóvel"), { target: { value: "inexistente" } });
  expect(rodape()).toHaveTextContent("0 imóveis");
  expect(valores()).toEqual(Array(4).fill("R$ 0,00"));
});

it("recalcula pelos imóveis vendidos e pela participação de cada imóvel", async () => {
  montar();
  await waitFor(() => expect(screen.getByRole("button", { name: "Minha participação" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Minha participação" }));
  expect(valores()).toEqual(["R$ 1.000,00", "R$ 775,00", "R$ 225,00", "R$ 125,00"]);
  fireEvent.change(screen.getByLabelText("Situação"), { target: { value: "vendidos" } });
  expect(rodape()).toHaveTextContent("1 imóvel");
  expect(valores()).toEqual(["R$ 2.000,00", "R$ 1.750,00", "R$ 250,00", "R$ 400,00"]);
  fireEvent.change(screen.getByLabelText("Situação"), { target: { value: "todos" } });
  expect(rodape()).toHaveTextContent("3 imóveis");
  expect(valores()).toEqual(["R$ 3.000,00", "R$ 2.525,00", "R$ 475,00", "R$ 525,00"]);
});
