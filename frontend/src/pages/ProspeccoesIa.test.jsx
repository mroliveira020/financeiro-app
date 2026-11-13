import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({ user: usuario, hasRole: () => false }),
}));
const usuario = { id: 6, role: "prospector", ai_access: true, finance_access: false };

vi.mock("../services/prospeccoes", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    fetchCapturados: vi.fn(), fetchSelecionados: vi.fn(), fetchProspecMeta: vi.fn(),
    fetchResponsaveisDisponiveis: vi.fn(), fetchAnaliseSelecionado: vi.fn(),
    fetchAiAnalise: vi.fn(), fetchEnriquecimento: vi.fn(), fetchAvaliacaoAutomatica: vi.fn(),
    enviarMensagemAiChat: vi.fn(), salvarAiAnalise: vi.fn(), solicitarMatricula: vi.fn(),
    solicitarEnriquecimento: vi.fn(), pollAiJob: vi.fn(),
  };
});
vi.mock("./prospeccoes/ProspeccoesDesktop", () => ({
  default: ({ dados, onOpen }) => <div>
    {dados.map((item) => <React.Fragment key={item.codigo}>
      <button onClick={() => onOpen(item, "ia")}>Abrir {item.codigo}</button>
      <button onClick={() => onOpen(item, "dados", "selecionados")}>Selecionado {item.codigo}</button>
    </React.Fragment>)}
  </div>,
}));
vi.mock("./prospeccoes/ProspeccoesDetailModals", () => ({
  AvaliacaoAutomaticaModal: () => null,
  AvaliacaoDetalhadaModal: (p) => p.item ? <div data-testid="hub">
    <h2>Imóvel {p.item.codigo}</h2>
    <output data-testid="texto-ia">{p.aiAnalise?.analise_texto}</output>
    <output data-testid="sintese">{p.sinteseDraft}</output>
    <output data-testid="status-ia">{p.statusMessage}</output>
    <output data-testid="loading-ia">{String(p.loading)}</output>
    <output data-testid="sending-ia">{String(p.sending)}</output>
    <output data-testid="financeiro">{p.analiseDetalhada?.numero_bem}</output>
    <output data-testid="enriquecimento">{p.enriquecimentoDetalhado?.numero_bem}</output>
    <button onClick={p.onClose}>Fechar hub</button>
    <button onClick={p.onGerarAnaliseInicial}>Gerar IA</button>
    <button onClick={p.onSolicitarMatricula}>Solicitar matrícula</button>
    <button onClick={p.onSolicitarEnriquecimento}>Enriquecer</button>
    <button onClick={() => p.onTabChange("enriquecimento")}>Aba enriquecimento</button>
    <button onClick={() => p.onTabChange("comunicacao")}>Aba comunicação</button>
    <button onClick={() => p.onTabChange("dados")}>Aba dados</button>
    <button onClick={() => p.onAbrirAnalise(p.item)}>Editar viabilidade</button>
    <input aria-label="Rascunho de mensagem" value={p.mensagemDraft} onChange={(event) => p.onMensagemDraftChange(event.target.value)} />
    {p.financialEditor}
  </div> : null,
}));

import Prospeccoes from "./Prospeccoes";
import {
  fetchCapturados, fetchSelecionados, fetchProspecMeta, fetchAnaliseSelecionado,
  fetchAiAnalise, fetchEnriquecimento, enviarMensagemAiChat, solicitarMatricula,
  solicitarEnriquecimento, pollAiJob,
} from "../services/prospeccoes";

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
const analise = (numero, texto = `Análise ${numero}`) => ({
  numero_bem: numero, analise_texto: texto,
  historico_chat: [{ role: "assistant", content: texto }],
});
const abrir = async (numero) => fireEvent.click(await screen.findByRole("button", { name: `Abrir ${numero}` }));
const montar = () => render(<MemoryRouter><Prospeccoes /></MemoryRouter>);

beforeEach(() => {
  vi.resetAllMocks();
  window.innerWidth = 1280;
  fetchCapturados.mockResolvedValue({ data: [{ codigo: "A" }, { codigo: "B" }], total: 2 });
  fetchSelecionados.mockResolvedValue([]);
  fetchProspecMeta.mockResolvedValue({ ufs: [], modalidades: [], cidades_por_uf: {} });
  fetchAnaliseSelecionado.mockImplementation(async (numero) => ({ numero_bem: numero }));
  fetchAiAnalise.mockImplementation(async (numero) => analise(numero));
  fetchEnriquecimento.mockImplementation(async (numero) => ({ numero_bem: numero }));
  enviarMensagemAiChat.mockImplementation(async (numero) => ({ job_id: `job-${numero}` }));
  solicitarMatricula.mockImplementation(async (numero) => ({ job_id: `job-${numero}` }));
  solicitarEnriquecimento.mockImplementation(async (numero) => ({ job_id: `job-${numero}` }));
});
afterEach(cleanup);

describe("IA isolada por abertura do imóvel", () => {
  it("preserva a mensagem ao voltar à prospecção e reabrir o imóvel", async () => {
    montar();
    await abrir("A");
    await waitFor(() => expect(screen.getByTestId("texto-ia")).toHaveTextContent("Análise A"));
    fireEvent.change(screen.getByRole("textbox", { name: "Rascunho de mensagem" }), { target: { value: "Rever ocupação." } });
    fireEvent.click(screen.getByRole("button", { name: "Fechar hub" }));
    await abrir("A");
    expect(screen.getByRole("textbox", { name: "Rascunho de mensagem" })).toHaveValue("Rever ocupação.");
  });

  it("abre a análise financeira com a origem do imóvel capturado", async () => {
    HTMLDialogElement.prototype.showModal = vi.fn();
    HTMLDialogElement.prototype.close = vi.fn();
    montar();
    await abrir("A");
    await waitFor(() => expect(screen.getByTestId("texto-ia")).toHaveTextContent("Análise A"));
    fireEvent.click(screen.getByRole("button", { name: "Editar viabilidade" }));
    expect(fetchAnaliseSelecionado).toHaveBeenLastCalledWith("A", "capturados");
    await screen.findByLabelText("Valor estimado da venda");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("descarta a leitura antiga do editor financeiro ao editar outro imóvel", async () => {
    const oldRead = deferred();
    fetchAnaliseSelecionado.mockImplementation((numero, origem, options) => {
      if (options) return Promise.resolve({ numero_bem: numero });
      return numero === "A" ? oldRead.promise : Promise.resolve({ inputs: { valor_estimado_venda: 250000 } });
    });
    montar();
    await abrir("A");
    fireEvent.click(screen.getByRole("button", { name: "Editar viabilidade" }));
    await abrir("B");
    fireEvent.click(screen.getByRole("button", { name: "Editar viabilidade" }));
    await waitFor(() => expect(screen.getByLabelText("Valor estimado da venda")).toHaveValue("250.000,00"));
    await act(async () => oldRead.resolve({ inputs: { valor_estimado_venda: 99000 } }));
    expect(screen.getByLabelText("Valor estimado da venda")).toHaveValue("250.000,00");
  });

  it("carrega a comunicação salva sem solicitar um novo processamento", async () => {
    montar();
    fireEvent.click(await screen.findByRole("button", { name: "Selecionado A" }));
    await waitFor(() => expect(screen.getByTestId("financeiro")).toHaveTextContent("A"));
    expect(fetchAiAnalise).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Aba comunicação" }));
    await waitFor(() => expect(screen.getByTestId("texto-ia")).toHaveTextContent("Análise A"));
    expect(enviarMensagemAiChat).not.toHaveBeenCalled();
    expect(solicitarMatricula).not.toHaveBeenCalled();
    expect(solicitarEnriquecimento).not.toHaveBeenCalled();
  });

  it("mantém o aviso de processamento ao mudar de seção do imóvel", async () => {
    const job = deferred();
    pollAiJob.mockImplementation((numero, jobId, options) => {
      options.onProgress({ status: "pending" });
      return job.promise;
    });
    montar();
    await abrir("A");
    await waitFor(() => expect(screen.getByTestId("texto-ia")).toHaveTextContent("Análise A"));
    fireEvent.click(screen.getByRole("button", { name: "Gerar IA" }));
    await waitFor(() => expect(screen.getByTestId("status-ia")).toHaveTextContent(/aguardando processamento/i));
    fireEvent.click(screen.getByRole("button", { name: "Aba comunicação" }));
    expect(screen.getByTestId("status-ia")).toHaveTextContent(/aguardando processamento/i);
    await act(async () => job.resolve({ numero_bem: "A", status: "done" }));
  });

  it("descarta a leitura atrasada de A depois de abrir B", async () => {
    const antigo = deferred();
    fetchAiAnalise.mockImplementation((numero) => numero === "A" ? antigo.promise : Promise.resolve(analise("B")));
    montar();
    await abrir("A");
    const signalA = fetchAiAnalise.mock.calls[0][2].signal;
    await abrir("B");
    await waitFor(() => expect(screen.getByTestId("texto-ia")).toHaveTextContent("Análise B"));
    await act(async () => antigo.resolve(analise("A")));
    expect(signalA.aborted).toBe(true);
    expect(screen.getByTestId("texto-ia")).toHaveTextContent("Análise B");
    expect(screen.getByTestId("sintese")).toHaveTextContent("Análise B");
    expect(screen.getByTestId("financeiro")).toHaveTextContent("B");
    expect(fetchAnaliseSelecionado).toHaveBeenCalledWith("B", "capturados", expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it("uma falha antiga não aparece no painel do imóvel novo", async () => {
    const antigo = deferred();
    fetchAiAnalise.mockImplementation((numero) => numero === "A" ? antigo.promise : Promise.resolve(analise("B")));
    montar();
    await abrir("A");
    await abrir("B");
    await waitFor(() => expect(screen.getByTestId("texto-ia")).toHaveTextContent("Análise B"));
    await act(async () => antigo.reject(new Error("Falha do imóvel A")));
    expect(screen.queryByText("Falha do imóvel A")).not.toBeInTheDocument();
    expect(screen.getByTestId("status-ia")).toBeEmptyDOMElement();
  });

  it("fechar e reabrir o mesmo código invalida a abertura anterior", async () => {
    const antigo = deferred();
    fetchAiAnalise.mockReturnValueOnce(antigo.promise).mockResolvedValue(analise("A", "Pesquisa nova"));
    montar();
    await abrir("A");
    fireEvent.click(screen.getByRole("button", { name: "Fechar hub" }));
    await abrir("A");
    await waitFor(() => expect(screen.getByTestId("texto-ia")).toHaveTextContent("Pesquisa nova"));
    await act(async () => antigo.resolve(analise("A", "Pesquisa antiga")));
    expect(screen.getByTestId("texto-ia")).toHaveTextContent("Pesquisa nova");
  });

  it("ignora progresso e término do job anterior, preservando o processamento de B", async () => {
    const jobA = deferred(), jobB = deferred();
    pollAiJob.mockImplementation((numero) => numero === "A" ? jobA.promise : jobB.promise);
    montar();
    await abrir("A");
    await waitFor(() => expect(screen.getByTestId("texto-ia")).toHaveTextContent("Análise A"));
    fireEvent.click(screen.getByRole("button", { name: "Gerar IA" }));
    await waitFor(() => expect(pollAiJob).toHaveBeenCalledTimes(1));
    const optionsA = pollAiJob.mock.calls[0][2];
    await abrir("B");
    await waitFor(() => expect(screen.getByTestId("texto-ia")).toHaveTextContent("Análise B"));
    fireEvent.click(screen.getByRole("button", { name: "Gerar IA" }));
    await waitFor(() => expect(pollAiJob).toHaveBeenCalledTimes(2));
    await act(async () => {
      optionsA.onProgress({ numero_bem: "A", status: "error", erro: "Erro antigo" });
      jobA.resolve({ numero_bem: "A", status: "done" });
    });
    expect(optionsA.signal.aborted).toBe(true);
    expect(screen.getByTestId("sending-ia")).toHaveTextContent("true");
    expect(screen.getByTestId("status-ia")).toHaveTextContent("aguardando processamento");
    expect(screen.getByTestId("texto-ia")).toHaveTextContent("Análise B");
    expect(fetchAiAnalise.mock.calls.filter(([numero]) => numero === "A")).toHaveLength(1);
    await act(async () => jobB.resolve({ numero_bem: "B", status: "done" }));
    await waitFor(() => expect(screen.getByTestId("sending-ia")).toHaveTextContent("false"));
  });

  it.each(["Solicitar matrícula", "Enriquecer"])("descarta %s pendente ao trocar de imóvel", async (acao) => {
    const job = deferred();
    pollAiJob.mockReturnValue(job.promise);
    montar();
    await abrir("A");
    await waitFor(() => expect(screen.getByTestId("texto-ia")).toHaveTextContent("Análise A"));
    fireEvent.click(screen.getByRole("button", { name: acao }));
    await waitFor(() => expect(pollAiJob).toHaveBeenCalledTimes(1));
    await abrir("B");
    await waitFor(() => expect(screen.getByTestId("texto-ia")).toHaveTextContent("Análise B"));
    await act(async () => job.resolve({ numero_bem: "A", status: "done" }));
    expect(screen.getByTestId("texto-ia")).toHaveTextContent("Análise B");
    expect(screen.getByTestId("enriquecimento")).toHaveTextContent("B");
  });

  it("descarta enriquecimento carregado por uma aba anterior", async () => {
    const antigo = deferred();
    fetchEnriquecimento.mockReturnValueOnce(antigo.promise);
    montar();
    await abrir("A");
    await waitFor(() => expect(screen.getByTestId("texto-ia")).toHaveTextContent("Análise A"));
    fireEvent.click(screen.getByRole("button", { name: "Aba enriquecimento" }));
    await waitFor(() => expect(fetchEnriquecimento).toHaveBeenCalledTimes(1));
    await abrir("B");
    await act(async () => antigo.resolve({ numero_bem: "A" }));
    expect(screen.getByTestId("enriquecimento")).toHaveTextContent("B");
    expect(screen.getByRole("heading", { name: "Imóvel B" })).toBeInTheDocument();
  });

  it("a finalização da leitura de A não encerra o carregamento de B", async () => {
    const leituraA = deferred(), leituraB = deferred();
    fetchAiAnalise.mockImplementation((numero) => numero === "A" ? leituraA.promise : leituraB.promise);
    montar();
    await abrir("A");
    await abrir("B");
    await act(async () => leituraA.resolve(analise("A")));
    expect(screen.getByTestId("loading-ia")).toHaveTextContent("true");
    expect(screen.getByTestId("texto-ia")).toBeEmptyDOMElement();
    await act(async () => leituraB.resolve(analise("B")));
    expect(screen.getByTestId("texto-ia")).toHaveTextContent("Análise B");
  });

  it("não inicia polling quando a criação do job termina após a troca", async () => {
    const criacao = deferred();
    enviarMensagemAiChat.mockReturnValue(criacao.promise);
    montar();
    await abrir("A");
    await waitFor(() => expect(screen.getByTestId("texto-ia")).toHaveTextContent("Análise A"));
    fireEvent.click(screen.getByRole("button", { name: "Gerar IA" }));
    await abrir("B");
    await act(async () => criacao.resolve({ numero_bem: "A", job_id: "job-A" }));
    expect(pollAiJob).not.toHaveBeenCalled();
    expect(screen.getByTestId("texto-ia")).toHaveTextContent("Análise B");
  });

  it("isola o mesmo código ao trocar de capturados para selecionados", async () => {
    const antigo = deferred();
    fetchAiAnalise.mockReturnValueOnce(antigo.promise);
    montar();
    await abrir("A");
    fireEvent.click(screen.getByRole("button", { name: "Selecionado A" }));
    await act(async () => antigo.resolve(analise("A", "Dados da abertura anterior")));
    expect(screen.getByTestId("texto-ia")).toBeEmptyDOMElement();
    expect(fetchAnaliseSelecionado).toHaveBeenCalledWith("A", "selecionados", expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it("rejeita uma resposta cujo código não corresponde ao imóvel aberto", async () => {
    fetchAiAnalise.mockResolvedValue(analise("A"));
    montar();
    await abrir("B");
    await waitFor(() => expect(screen.getByTestId("status-ia")).toHaveTextContent("pertence a outro imóvel"));
    expect(screen.getByTestId("texto-ia")).toBeEmptyDOMElement();
    expect(enviarMensagemAiChat).not.toHaveBeenCalled();
  });

  it("cancela leituras ao sair da página", async () => {
    const antigo = deferred();
    fetchAiAnalise.mockReturnValue(antigo.promise);
    const view = montar();
    await abrir("A");
    const signal = fetchAiAnalise.mock.calls[0][2].signal;
    view.unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => antigo.resolve(analise("A")));
    expect(enviarMensagemAiChat).not.toHaveBeenCalled();
  });
});
