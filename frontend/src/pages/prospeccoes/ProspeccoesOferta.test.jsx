import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CapturaFilters, CapturaReferencias, OfertaAvisos } from "./ProspeccoesShared";
import { createAnaliseFallbackInputs } from "./ProspeccoesAnalise";

describe("Presença e revisão de prospecções", () => {
  it("permite consultar ausentes e solicitar revisão", () => {
    const presenca = vi.fn();
    const revisao = vi.fn();
    render(<CapturaFilters presenca="presentes" onPresencaChange={presenca} somenteRevisao={false} onRevisaoChange={revisao} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "ausentes" } });
    expect(presenca).toHaveBeenCalledWith("ausentes");
    fireEvent.click(screen.getByRole("checkbox"));
    expect(revisao).toHaveBeenCalledWith(true);
  });

  it("explica ausência sem afirmar que houve venda", () => {
    render(<OfertaAvisos item={{ presenteUltimaCaptura: false, precisaRevisao: true, motivosRevisao: ["Preço mudou"] }} />);
    expect(screen.getByText(/Isso não confirma venda/)).toBeInTheDocument();
    expect(screen.getByText("Avaliação precisa de revisão")).toBeInTheDocument();
    expect(screen.getByText("Preço mudou")).toBeInTheDocument();
  });

  it("sinaliza a falta de referência sem afirmar disponibilidade", () => {
    render(<CapturaReferencias referencias={[]} />);
    expect(screen.getByText(/presença ainda não confirmada/)).toBeInTheDocument();
  });

  it("rascunho usa o lance recomendado e não o preço de outra etapa", () => {
    const result = createAnaliseFallbackInputs({ lanceRecomendado: 150000, valorLeilao1: 200000, valorAvaliacao: 300000 });
    expect(result.valor_base_operacao).toBe(150000);
    expect(result.valor_maximo_lance).toBe(150000);
    expect(createAnaliseFallbackInputs({ valorLeilao1: 200000 }).valor_base_operacao).toBe("");
  });
});
