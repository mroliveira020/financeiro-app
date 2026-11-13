import React from "react";
import { MemoryRouter } from "react-router-dom";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({ user: { id: 2, role: "prospector" } }),
}));
vi.mock("../../services/tarefas", () => ({
  buscarTarefas: vi.fn(),
  buscarOpcoesTarefas: vi.fn(),
  salvarTarefa: vi.fn(),
  consultarIntencao: vi.fn(),
  registrarIntencao: vi.fn(),
  retirarIntencao: vi.fn(),
  avisarTarefasAlteradas: vi.fn(),
}));
import TarefasPainel from "./TarefasPainel";
import {
  buscarTarefas,
  buscarOpcoesTarefas,
  salvarTarefa,
  consultarIntencao,
  registrarIntencao,
  retirarIntencao,
} from "../../services/tarefas";
const task = {
  id: "11111111-1111-4111-8111-111111111111",
  versao: 1,
  titulo: "Obter matrícula",
  descricao: "Certidão atualizada",
  numero_bem: "DEMO",
  imovel_id: null,
  origem: "manual",
  situacao: "a_fazer",
  prazo: "2026-12-01",
  responsavel_id: 2,
  responsavel_nome: "Pessoa de teste",
  imovel_nome: "São Paulo · SP",
};
const mount = (context) =>
  render(
    <MemoryRouter>
      <TarefasPainel context={context} />
    </MemoryRouter>,
  );
beforeEach(() => {
  vi.resetAllMocks();
  buscarTarefas.mockResolvedValue({
    data: [task],
    total: 1,
    a_fazer: 1,
    concluidas: 0,
  });
  buscarOpcoesTarefas.mockResolvedValue({
    capturados: [{ numero_bem: "DEMO", cidade: "São Paulo", uf: "SP" }],
    adquiridos: [{ id: 23, nome: "Imóvel comprado" }],
    responsaveis: [{ id: 2, nome: "Pessoa de teste" }],
  });
  consultarIntencao.mockResolvedValue(null);
  salvarTarefa.mockResolvedValue(task);
});
afterEach(cleanup);
describe("Área de tarefas", () => {
  it("lista tarefas compartilhadas e oferece contexto do imóvel", async () => {
    mount();
    expect(
      await screen.findByRole("button", { name: task.titulo }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: task.imovel_nome }),
    ).toHaveAttribute(
      "href",
      "/prospeccoes?busca=DEMO&imovel=DEMO&presenca=todos",
    );
    expect(screen.getByText("01/12/2026")).toBeInTheDocument();
    expect(screen.queryByText("Em andamento")).not.toBeInTheDocument();
  });
  it("conclui e reabre com a versão atual, sem alteração otimista após falha", async () => {
    mount();
    const checkbox = await screen.findByRole("checkbox");
    fireEvent.click(checkbox);
    await waitFor(() =>
      expect(salvarTarefa).toHaveBeenCalledWith(
        expect.objectContaining({ situacao: "concluida", versao: 1 }),
      ),
    );
    buscarTarefas.mockResolvedValue({
      data: [{ ...task, situacao: "concluida", versao: 2 }],
      total: 1,
      a_fazer: 0,
      concluidas: 1,
    });
    await waitFor(() => expect(screen.getByRole("checkbox")).toBeChecked());
    salvarTarefa.mockRejectedValue({
      response: { data: { error: "A tarefa foi alterada em outra sessão." } },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    expect(await screen.findByRole("alert")).toHaveTextContent("outra sessão");
    expect(screen.getByRole("checkbox")).toBeChecked();
  });
  it("cria manualmente e conserva o identificador em uma nova tentativa", async () => {
    mount({ numero_bem: "DEMO", nome: "São Paulo" });
    await screen.findByRole("button", { name: task.titulo });
    fireEvent.click(screen.getByRole("button", { name: "+ Nova tarefa" }));
    fireEvent.change(screen.getByLabelText("Título"), {
      target: { value: "Revisar edital" },
    });
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Salvar tarefa" }),
      ).toBeEnabled(),
    );
    salvarTarefa.mockRejectedValueOnce({
      response: { data: { error: "Tente novamente." } },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar tarefa" }));
    await screen.findByText("Tente novamente.");
    const id = salvarTarefa.mock.calls[0][0].id;
    fireEvent.click(screen.getByRole("button", { name: "Salvar tarefa" }));
    await waitFor(() => expect(salvarTarefa).toHaveBeenCalledTimes(2));
    expect(salvarTarefa.mock.calls[1][0]).toMatchObject({
      id,
      titulo: "Revisar edital",
      numero_bem: "DEMO",
      origem: "manual",
    });
  });
  it("retira intenção mediante confirmação local e atualiza a lista", async () => {
    consultarIntencao.mockResolvedValue({ id: "INT-DEMO" });
    retirarIntencao.mockResolvedValue(null);
    mount({ numero_bem: "DEMO" });
    fireEvent.click(
      await screen.findByRole("button", { name: "Retirar intenção" }),
    );
    expect(retirarIntencao).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar retirada" }));
    await waitFor(() =>
      expect(retirarIntencao).toHaveBeenCalledWith("DEMO", "INT-DEMO"),
    );
    expect(await screen.findByRole("status")).toHaveTextContent("arquivadas");
  });
  it("registra intenção por ação explícita", async () => {
    registrarIntencao.mockResolvedValue({ id: "INT-DEMO" });
    mount({ numero_bem: "DEMO" });
    const button = await screen.findByRole("button", {
      name: "Registrar intenção",
    });
    await waitFor(() => expect(button).toBeEnabled());
    expect(registrarIntencao).not.toHaveBeenCalled();
    fireEvent.click(button);
    await waitFor(() => expect(registrarIntencao).toHaveBeenCalledWith("DEMO"));
  });
  it("permite buscar e filtrar sem inventar estados adicionais", async () => {
    mount();
    await screen.findByRole("button", { name: task.titulo });
    fireEvent.change(screen.getByLabelText("Situação"), {
      target: { value: "concluida" },
    });
    fireEvent.change(screen.getByLabelText("Etapa do imóvel"), {
      target: { value: "adquirido" },
    });
    fireEvent.change(screen.getByLabelText("Responsável"), {
      target: { value: "eu" },
    });
    await waitFor(() =>
      expect(buscarTarefas).toHaveBeenLastCalledWith(
        expect.objectContaining({
          situacao: "concluida",
          etapa: "adquirido",
          responsavel_id: 2,
        }),
        expect.anything(),
      ),
    );
  });
  it("preserva arquivamento ao editar uma tarefa arquivada", async () => {
    buscarTarefas.mockResolvedValue({
      data: [{ ...task, arquivada_em: "2026-11-13" }],
      total: 1,
      a_fazer: 1,
      concluidas: 0,
    });
    mount();
    fireEvent.click(await screen.findByRole("button", { name: task.titulo }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Salvar tarefa" }),
      ).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Salvar tarefa" }));
    await waitFor(() =>
      expect(salvarTarefa).toHaveBeenCalledWith(
        expect.objectContaining({ arquivada: true }),
      ),
    );
  });
});

it("consulta arquivadas e mantém tarefas de intenção retirada para leitura", async () => {
  const archived = {
    ...task,
    origem: "preparacao",
    intencao_id: "INT-DEMO",
    arquivada_em: "2026-11-13",
    intencao_retirada_em: "2026-11-13",
  };
  buscarTarefas.mockResolvedValue({
    data: [archived],
    total: 1,
    a_fazer: 1,
    concluidas: 0,
  });
  mount();
  await screen.findByRole("button", { name: task.titulo });
  fireEvent.change(screen.getByLabelText("Exibição"), {
    target: { value: "sim" },
  });
  await waitFor(() =>
    expect(buscarTarefas).toHaveBeenLastCalledWith(
      expect.objectContaining({ arquivadas: "sim" }),
      expect.anything(),
    ),
  );
  await waitFor(() => expect(screen.getByRole("checkbox")).toBeDisabled());
  expect(screen.getByRole("button", { name: "Restaurar" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: task.titulo }));
  expect(
    await screen.findByText(/A intenção foi retirada/),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Salvar tarefa" })).toBeDisabled();
});
