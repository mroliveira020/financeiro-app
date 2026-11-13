import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import FinanceiroWorkspace from "./FinanceiroWorkspace";

vi.mock("./Home", () => ({
  default: function CarteiraTeste({ onOpenImovel }) {
    const [busca, setBusca] = useState("");
    return (
      <div>
        <input
          aria-label="Busca da carteira"
          value={busca}
          onChange={(event) => setBusca(event.target.value)}
        />
        <button onClick={() => onOpenImovel({ id: 24, nome: "Rio Verde" })}>
          Linha Rio Verde
        </button>
        <button onClick={() => onOpenImovel({ id: 23, nome: "São Paulo" })}>
          Linha São Paulo
        </button>
      </div>
    );
  },
}));
vi.mock("../components/financeiro/OperacaoImovel", () => ({
  default: function OperacaoTeste({ imovelId }) {
    const [rascunho, setRascunho] = useState("");
    return (
      <input
        aria-label={`Rascunho ${imovelId}`}
        value={rascunho}
        onChange={(event) => setRascunho(event.target.value)}
      />
    );
  },
}));
beforeEach(() => {
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("preserva carteira e rascunho e ativa a aba existente", () => {
  render(
    <MemoryRouter initialEntries={["/financeiro"]}>
      <Routes>
        <Route element={<FinanceiroWorkspace />}>
          <Route path="/financeiro" element={<></>} />
          <Route path="/dashboard/:id" element={<></>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
  fireEvent.change(screen.getByLabelText("Busca da carteira"), {
    target: { value: "Rio" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Linha Rio Verde" }));
  fireEvent.change(screen.getByLabelText("Rascunho 24"), {
    target: { value: "Dados ainda não salvos" },
  });
  fireEvent.click(screen.getByRole("tab", { name: "Carteira" }));
  expect(screen.getByLabelText("Busca da carteira")).toHaveValue("Rio");
  fireEvent.click(screen.getByRole("button", { name: "Linha Rio Verde" }));
  expect(screen.getAllByRole("tab", { name: "Rio Verde" })).toHaveLength(1);
  expect(screen.getByLabelText("Rascunho 24")).toHaveValue(
    "Dados ainda não salvos",
  );
  fireEvent.click(screen.getByRole("button", { name: "Fechar aba Rio Verde" }));
  expect(screen.getByRole("tab", { name: "Carteira" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

it("aceita o endereço direto e permite retornar à carteira", () => {
  render(
    <MemoryRouter initialEntries={["/dashboard/24"]}>
      <Routes>
        <Route element={<FinanceiroWorkspace />}>
          <Route path="/financeiro" element={<></>} />
          <Route path="/dashboard/:id" element={<></>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
  expect(screen.getByLabelText("Rascunho 24")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("tab", { name: "Carteira" }));
  expect(
    screen.getByRole("button", { name: "Linha Rio Verde" }),
  ).toBeInTheDocument();
});
