import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AvaliacaoDetalhadaModal } from "./ProspeccoesDetailModals";

vi.mock("./ProspeccaoDialog", () => ({
  default: ({ children }) => <div role="dialog">{children}</div>,
}));

const fixture = (extra = {}) => ({
  inline: true,
  item: {
    codigo: "TESTE-1",
    cidade: "São Paulo",
    uf: "SP",
    bairro: "Barra Funda",
    endereco: "Endereço ilustrativo",
    tipoImovel: "Apartamento",
    financia: true,
    melhorLance: 80000,
    melhorData: "2026-12-15",
    lanceRecomendado: 100000,
    valorAvaliacao: 150000,
    link: "https://example.com/imovel",
    descricao: "Descrição ilustrativa do imóvel.",
  },
  tab: "dados",
  origem: "capturados",
  canChat: true,
  getLeiloesInfo: () => [
    { label: "1º leilão", data: "2026-12-01", valor: 100000 },
    { label: "2º leilão", data: "2026-12-15", valor: 80000 },
  ],
  getMapsUrl: () => "https://maps.google.com/?q=São+Paulo",
  getComparaveisLinks: () => [],
  extrairEditalUrl: () => "https://example.com/edital.pdf",
  extrairProcessoNumero: () => "",
  getFonteLabel: () => "Caixa",
  formatarMoeda: (value) => `R$ ${value}`,
  formatarPercentual: (value) => (value == null ? "—" : `${value}%`),
  formatarDataHoraCompacta: (value) => value,
  getMensagemPrefillAnalise: () => "",
  podeAnalisarMatricula: () => true,
  normalizeComparableText: (value) => value || "",
  calcularDescontoExibicao: () => null,
  getLeilaoResumo: () => ({}),
  getAnaliseIaActionLabel: () => "Solicitar análise IA",
  sinteseDraft: "",
  mensagemDraft: "",
  onClose: vi.fn(),
  onTabChange: vi.fn(),
  onGerarAnaliseInicial: vi.fn(),
  onSolicitarMatricula: vi.fn(),
  onSolicitarEnriquecimento: vi.fn(),
  onAbrirAnalise: vi.fn(),
  onEnviarMensagem: vi.fn(),
  onMensagemDraftChange: vi.fn(),
  onSinteseDraftChange: vi.fn(),
  onSalvarSintese: vi.fn(),
  ...extra,
});
afterEach(cleanup);

describe("Ficha desktop do imóvel", () => {
  it.each([true, false])("sinaliza venda pendente na ficha inline=%s mesmo com cálculo legado negativo", (inline) => {
    render(<AvaliacaoDetalhadaModal {...fixture({
      inline,
      tab: "viabilidade",
      analiseDetalhada: {
        inputs: { valor_estimado_venda: 0 },
        calculos: {
          capital_investido_estimado: 100000,
          custo_total_imovel: 100000,
          lucro_esperado_valor: -100000,
          roi_esperado_percentual: -100,
        },
      },
    })} />);
    expect(screen.getByRole("status")).toHaveTextContent("Viabilidade pendente");
    expect(screen.getAllByText("A definir")).toHaveLength(2);
    expect(screen.queryByText("R$ -100000")).not.toBeInTheDocument();
    expect(screen.queryByText("-100%")).not.toBeInTheDocument();
  });

  it("abre na página com a cidade em destaque e o menor lance junto à data correspondente", () => {
    const props = fixture();
    render(<AvaliacaoDetalhadaModal {...props} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: "São Paulo · SP" }),
    ).toBeInTheDocument();
    const opportunity = screen.getByText("Menor lance informado").parentElement;
    expect(within(opportunity).getByText("R$ 80000")).toBeInTheDocument();
    expect(within(opportunity).getByText("2026-12-15")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Google Maps" })).toHaveAttribute(
      "href",
      "https://maps.google.com/?q=São+Paulo",
    );
    expect(screen.getByRole("link", { name: "Site original" })).toHaveAttribute(
      "href",
      props.item.link,
    );
    expect(props.onGerarAnaliseInicial).not.toHaveBeenCalled();
    expect(props.onSolicitarMatricula).not.toHaveBeenCalled();
    expect(props.onSolicitarEnriquecimento).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: /Voltar à prospecção/ }),
    );
    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it("permite percorrer as seções pelo teclado", () => {
    const props = fixture();
    render(<AvaliacaoDetalhadaModal {...props} />);
    fireEvent.keyDown(screen.getByRole("tab", { name: "Visão geral" }), {
      key: "ArrowRight",
    });
    expect(props.onTabChange).toHaveBeenCalledWith("ia");
  });

  it("organiza títulos explícitos e preserva texto antigo sem títulos", () => {
    const props = fixture({
      tab: "ia",
      aiAnalise: {
        analise_texto:
          "Introdução preservada.\n\n## Riscos\nVerificar ocupação.\n\n## Conclusão\nRevisar custos.",
      },
    });
    const view = render(<AvaliacaoDetalhadaModal {...props} />);
    expect(screen.getByText("Introdução preservada.")).toBeInTheDocument();
    const riskSection = screen.getByText("Riscos").closest("details");
    expect(riskSection).not.toHaveAttribute("open");
    expect(
      within(riskSection).getByText("Verificar ocupação."),
    ).toBeInTheDocument();
    expect(screen.getByText("Revisar custos.")).toBeInTheDocument();
    view.rerender(
      <AvaliacaoDetalhadaModal
        {...props}
        aiAnalise={{ analise_texto: "Texto legado integral, sem cabeçalhos." }}
      />,
    );
    expect(
      screen.getByText("Texto legado integral, sem cabeçalhos."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Análise disponível").closest("details"),
    ).toHaveAttribute("open");
  });

  it("só solicita processamento mediante uma ação explícita", () => {
    const props = fixture({ tab: "ia" });
    render(<AvaliacaoDetalhadaModal {...props} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Solicitar análise IA" }),
    );
    expect(props.onGerarAnaliseInicial).toHaveBeenCalledOnce();
    expect(props.onSolicitarMatricula).not.toHaveBeenCalled();
  });

  it("oferece comunicação, preserva mensagens e esconde o comando interno de inicialização", () => {
    const props = fixture({
      tab: "comunicacao",
      mensagemDraft: "Rever custo da reforma.",
      aiAnalise: {
        historico_chat: [
          { role: "user", content: "__init__" },
          { role: "assistant", content: "Não consegui baixar a matrícula." },
          { role: "user", content: "Vou providenciar o documento." },
        ],
      },
    });
    render(<AvaliacaoDetalhadaModal {...props} />);
    expect(screen.queryByText("__init__")).not.toBeInTheDocument();
    expect(
      screen.getByText("Não consegui baixar a matrícula."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Vou providenciar o documento."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Enviar para a IA" }));
    expect(props.onEnviarMensagem).toHaveBeenCalledOnce();
  });

  it("desabilita envio durante processamento e permite leitura sem acesso à IA", () => {
    const props = fixture({
      tab: "comunicacao",
      sending: true,
      mensagemDraft: "Mensagem",
    });
    const view = render(<AvaliacaoDetalhadaModal {...props} />);
    expect(screen.getByRole("button", { name: "Enviando…" })).toBeDisabled();
    view.rerender(
      <AvaliacaoDetalhadaModal
        {...props}
        sending={false}
        canChat={false}
        aiAnalise={{
          historico_chat: [{ role: "assistant", content: "Análise salva." }],
        }}
      />,
    );
    expect(screen.getByText("Análise salva.")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("mantém matrícula, comparáveis e premissas financeiras disponíveis na avaliação", () => {
    const props = fixture({
      tab: "matricula",
      aiAnalise: { matricula_texto: "Leitura jurídica registrada." },
      analiseDetalhada: {
        calculos: {
          capital_investido_estimado: 90000,
          roi_esperado_percentual: 20,
        },
      },
      enriquecimentoDetalhado: {
        comparaveis: [
          {
            id: 1,
            titulo: "Comparável ilustrativo",
            preco: 160000,
            url: "https://example.com/comparavel",
          },
        ],
      },
    });
    render(<AvaliacaoDetalhadaModal {...props} />);
    expect(
      screen.getByText("Leitura jurídica registrada.").closest("details"),
    ).toHaveAttribute("open");
    expect(
      screen.getByRole("link", { name: "Comparável ilustrativo" }),
    ).toHaveAttribute("href", "https://example.com/comparavel");
    fireEvent.click(
      screen.getByRole("button", { name: "Editar premissas financeiras" }),
    );
    expect(props.onAbrirAnalise).toHaveBeenCalledWith(props.item);
  });

  it("mantém o conteúdo e as abas anteriores no celular", () => {
    HTMLDialogElement.prototype.showModal = vi.fn(function () {
      this.setAttribute("open", "");
    });
    HTMLDialogElement.prototype.close = vi.fn(function () {
      this.removeAttribute("open");
    });
    render(<AvaliacaoDetalhadaModal {...fixture({ inline: false })} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Dados" })).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "Enriquecimento" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("tab", { name: "Comunicação" }),
    ).not.toBeInTheDocument();
  });
});
