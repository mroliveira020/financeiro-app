import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import EqualizacaoConsolidada from "./EqualizacaoConsolidada";
import { fetchEqualizacoesConsolidadas, registrarEqualizacaoConsolidada } from "../services/api";
vi.mock("../services/api", () => ({ fetchEqualizacoesConsolidadas: vi.fn(), registrarEqualizacaoConsolidada: vi.fn() }));

const dados = (saldoSegundo = -60000) => ({ socios: [{ socio_id: 6, socio_nome: "Marco", imoveis: [
  { id_imovel: 23, nome: "Araruna PR", atual: true, saldo_centavos: 100000, versao: "a".repeat(64) },
  { id_imovel: 24, nome: "Rio Verde GO", atual: false, saldo_centavos: saldoSegundo, versao: "b".repeat(64) },
] }], avisos: [] });
const abrir = async () => {
  fireEvent.click(await screen.findByRole("button", { name: "Ver saldos de equalização em outros imóveis" }));
  await waitFor(() => expect(screen.queryByText("Atualizando saldos…")).not.toBeInTheDocument());
  return screen.getByRole("dialog");
};

beforeEach(() => {
  vi.resetAllMocks();
  fetchEqualizacoesConsolidadas.mockResolvedValue(dados());
  registrarEqualizacaoConsolidada.mockResolvedValue({ operacao_id: "operacao-1", valor_transferido: 400, imoveis: [{}, {}] });
});

afterEach(cleanup);

describe("Equalização entre imóveis", () => {
  it("não exibe ícone sem pendência em outro imóvel", async () => {
    fetchEqualizacoesConsolidadas.mockResolvedValue({ socios: [], avisos: [] });
    render(<EqualizacaoConsolidada imovelId="23" />);
    await waitFor(() => expect(fetchEqualizacoesConsolidadas).toHaveBeenCalledOnce());
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("mostra os dois imóveis e calcula a diferença a receber", async () => {
    render(<EqualizacaoConsolidada imovelId="23" />);
    const dialog = await abrir();
    expect(within(dialog).getByText("Araruna PR")).toBeInTheDocument();
    expect(within(dialog).getByText("Rio Verde GO")).toBeInTheDocument();
    expect(within(dialog).getByRole("heading", { name: /Você recebe.*400/ })).toBeInTheDocument();
    expect(fetchEqualizacoesConsolidadas).toHaveBeenCalledTimes(2);
    fireEvent.click(within(dialog).getAllByRole("checkbox")[1]);
    expect(within(dialog).getByRole("button", { name: "Registrar acerto consolidado" })).toBeDisabled();
  });

  it("registra uma única operação com versões, preservando recibo até concluir", async () => {
    const onChanged = vi.fn();
    render(<EqualizacaoConsolidada imovelId="23" onChanged={onChanged} />);
    const dialog = await abrir();
    fireEvent.click(within(dialog).getByRole("button", { name: "Registrar acerto consolidado" }));
    await screen.findByRole("heading", { name: "Acerto registrado" });
    expect(registrarEqualizacaoConsolidada).toHaveBeenCalledOnce();
    expect(registrarEqualizacaoConsolidada).toHaveBeenCalledWith("23", expect.objectContaining({
      operacao_id: expect.any(String), socio_id: 6,
      imoveis: [{ id_imovel: 23, versao: "a".repeat(64) }, { id_imovel: 24, versao: "b".repeat(64) }],
    }));
    expect(onChanged).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Concluir" }));
    expect(onChanged).toHaveBeenCalledOnce();
  });

  it("saldo zero permite compensar sem transferência", async () => {
    fetchEqualizacoesConsolidadas.mockResolvedValue(dados(-100000));
    render(<EqualizacaoConsolidada imovelId="23" />);
    const dialog = await abrir();
    expect(within(dialog).getByText("Compensação integral: saldo zero")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Registrar compensação" })).toBeEnabled();
  });

  it("mostra saldo líquido a pagar quando o outro imóvel tem débito maior", async () => {
    fetchEqualizacoesConsolidadas.mockResolvedValue(dados(-160000));
    render(<EqualizacaoConsolidada imovelId="23" />);
    const dialog = await abrir();
    expect(within(dialog).getByRole("heading", { name: /Você paga.*600/ })).toBeInTheDocument();
  });

  it("retry após falha de rede usa a mesma identificação", async () => {
    registrarEqualizacaoConsolidada.mockRejectedValueOnce(new Error("Rede indisponível"));
    render(<EqualizacaoConsolidada imovelId="23" />);
    const dialog = await abrir();
    fireEvent.click(within(dialog).getByRole("button", { name: "Registrar acerto consolidado" }));
    await screen.findByRole("alert");
    fireEvent.click(within(dialog).getByRole("button", { name: "Registrar acerto consolidado" }));
    await screen.findByRole("heading", { name: "Acerto registrado" });
    expect(registrarEqualizacaoConsolidada.mock.calls[0][1].operacao_id).toBe(registrarEqualizacaoConsolidada.mock.calls[1][1].operacao_id);
  });

  it("saldo alterado bloqueia confirmação até atualizar e não grava automaticamente", async () => {
    registrarEqualizacaoConsolidada.mockRejectedValueOnce({ response: { status: 409, data: { error: "Os saldos mudaram." } } });
    render(<EqualizacaoConsolidada imovelId="23" />);
    const dialog = await abrir();
    fireEvent.click(within(dialog).getByRole("button", { name: "Registrar acerto consolidado" }));
    await screen.findByRole("alert");
    expect(within(dialog).getByRole("button", { name: "Registrar acerto consolidado" })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Atualizar saldos" }));
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Registrar acerto consolidado" })).toBeEnabled());
    expect(registrarEqualizacaoConsolidada).toHaveBeenCalledOnce();
  });

  it("bloqueia duplo envio e fechamento durante a gravação", async () => {
    let resolver;
    registrarEqualizacaoConsolidada.mockReturnValue(new Promise((resolve) => { resolver = resolve; }));
    render(<EqualizacaoConsolidada imovelId="23" />);
    const dialog = await abrir();
    fireEvent.click(within(dialog).getByRole("button", { name: "Registrar acerto consolidado" }));
    expect(within(dialog).getByRole("button", { name: "Registrando…" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Cancelar" })).toBeDisabled();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await act(async () => resolver({ operacao_id: "op-1", valor_transferido: 400, imoveis: [{}, {}] }));
    expect(registrarEqualizacaoConsolidada).toHaveBeenCalledOnce();
  });
});
