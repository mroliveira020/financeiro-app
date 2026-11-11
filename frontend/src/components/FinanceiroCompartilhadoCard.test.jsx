import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FinanceiroCompartilhadoCard from "./FinanceiroCompartilhadoCard";
import { fetchFinanceiroCompartilhado, fetchEqualizacoesConsolidadas, registrarEqualizacaoConsolidada } from "../services/api";
vi.mock("../services/api", () => ({
  fetchFinanceiroCompartilhado: vi.fn(), registrarEqualizacao: vi.fn(),
  fetchEqualizacoesConsolidadas: vi.fn(), registrarEqualizacaoConsolidada: vi.fn(),
}));
vi.mock("../hooks/useCompactLayout", () => ({ useCompactLayout: () => false }));
vi.mock("../context/AuthContext", () => ({ useAuth: () => ({ user: { id: 2, finance_access: true }, hasCapability: () => true }) }));
const montar = () => render(<MemoryRouter initialEntries={["/dashboard/23"]}><Routes>
  <Route path="/dashboard/:id" element={<FinanceiroCompartilhadoCard />} />
</Routes></MemoryRouter>);
beforeEach(() => {
  vi.resetAllMocks();
  fetchFinanceiroCompartilhado.mockResolvedValue({ socios: [
    { user_id: 2, user_name: "Ana", saldo_liquido: 1000 },
    { user_id: 6, user_name: "Marco", saldo_liquido: -1000 },
  ], totais: {}, equalizacoes: [] });
  fetchEqualizacoesConsolidadas.mockResolvedValue({ socios: [{ socio_id: 6, socio_nome: "Marco", imoveis: [
    { id_imovel: 23, nome: "Araruna PR", atual: true, saldo_centavos: 100000, versao: "a".repeat(64) },
    { id_imovel: 24, nome: "Rio Verde GO", atual: false, saldo_centavos: -60000, versao: "b".repeat(64) },
  ] }], avisos: [] });
});
afterEach(cleanup);
describe("Acesso à consolidação no financeiro do imóvel", () => {
  it("abre o modal pela seção de equalizações e atualiza o card ao concluir", async () => {
    registrarEqualizacaoConsolidada.mockResolvedValue({ operacao_id: "op-1", valor_transferido: 400, imoveis: [{}, {}] });
    montar();
    fireEvent.click(await screen.findByRole("button", { name: "Ver saldos de equalização em outros imóveis" }));
    await screen.findByText("Rio Verde GO");
    fireEvent.click(await screen.findByRole("button", { name: "Registrar acerto consolidado" }));
    await screen.findByRole("heading", { name: "Acerto registrado" });
    fireEvent.click(screen.getByRole("button", { name: "Concluir" }));
    await waitFor(() => expect(fetchFinanceiroCompartilhado).toHaveBeenCalledTimes(2));
    expect(registrarEqualizacaoConsolidada).toHaveBeenCalledOnce();
  });
  it("mostra outros imóveis mesmo quando o imóvel atual está equalizado", async () => {
    fetchFinanceiroCompartilhado.mockResolvedValue({ socios: [{ user_id: 2, saldo_liquido: 0 }], totais: {}, equalizacoes: [] });
    montar();
    expect(await screen.findByRole("button", { name: "Ver saldos de equalização em outros imóveis" })).toBeInTheDocument();
    expect(screen.queryByText("Equalização sugerida")).not.toBeInTheDocument();
  });
});
