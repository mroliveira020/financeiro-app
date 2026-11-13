import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import {
  AnaliseModal,
  ANALISE_PAIR_MODE_DEFAULTS,
  buildAnalisePayload,
  createAnaliseDraft,
} from "./ProspeccoesAnalise";

afterEach(cleanup);
const montar = (venda) => (
  <AnaliseModal
    inline
    item={{ codigo: "TESTE", lanceRecomendado: 100000 }}
    draft={createAnaliseDraft({
      valor_maximo_lance: 100000,
      valor_estimado_venda: venda,
    })}
    pairModes={ANALISE_PAIR_MODE_DEFAULTS}
    onClose={vi.fn()}
    onFieldChange={vi.fn()}
    onFieldFocus={vi.fn()}
    onFieldBlur={vi.fn()}
    onPairModeChange={vi.fn()}
    onSave={vi.fn()}
  />
);

it.each([undefined, null, "", 0, "0,00"])(
  "mantém venda %s pendente no formulário e no envio",
  (venda) => {
    render(montar(venda));
    expect(screen.getByRole("status")).toHaveTextContent(
      "Viabilidade pendente",
    );
    const resumo = screen
      .getByRole("heading", { name: "Resumo financeiro" })
      .closest("section");
    for (const titulo of [
      "Valor de venda",
      "Lucro líquido esperado",
      "ROI sobre capital investido",
    ]) {
      expect(
        within(resumo).getByText(titulo).nextElementSibling,
      ).toHaveTextContent("A definir");
    }
    expect(
      screen.getByRole("textbox", { name: "Valor estimado da venda" }),
    ).toHaveValue("");
    expect(
      buildAnalisePayload(
        createAnaliseDraft({ valor_estimado_venda: venda }),
        ANALISE_PAIR_MODE_DEFAULTS,
      ).valor_estimado_venda,
    ).toBeNull();
  },
);

it("atualiza a projeção ao preencher a venda e volta a pendente ao limpá-la", () => {
  const { rerender } = render(montar(""));
  rerender(montar(120000));
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  const resumo = screen
    .getByRole("heading", { name: "Resumo financeiro" })
    .closest("section");
  expect(
    within(resumo)
      .getByText("Lucro líquido esperado")
      .nextElementSibling.textContent.replace(/\s/g, " "),
  ).toBe("R$ 20.000,00");
  rerender(montar(90000));
  expect(
    within(resumo)
      .getByText("Lucro líquido esperado")
      .nextElementSibling.textContent.replace(/\s/g, " "),
  ).toBe("-R$ 10.000,00");
  rerender(montar(""));
  expect(screen.getByRole("status")).toHaveTextContent("Viabilidade pendente");
});
