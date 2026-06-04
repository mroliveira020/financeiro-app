import React from "react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { render, screen } from "@testing-library/react";

const useAuthMock = vi.fn();

vi.mock("../../context/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));

import RequireAuth from "./RequireAuth";

function renderRequireAuth(initialPath = "/prospeccoes") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route element={<RequireAuth />}>
          <Route path="/prospeccoes" element={<div>Área protegida</div>} />
        </Route>
        <Route path="/login" element={<div>Tela de login</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("RequireAuth", () => {
  it("mostra estado de carregamento enquanto a sessão é resolvida", () => {
    useAuthMock.mockReturnValue({
      isAuthenticated: false,
      isLoading: true,
    });

    renderRequireAuth();

    expect(screen.getByText("Carregando sessão...")).toBeInTheDocument();
  });

  it("redireciona para login quando o usuário não está autenticado", () => {
    useAuthMock.mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
    });

    renderRequireAuth();

    expect(screen.getByText("Tela de login")).toBeInTheDocument();
    expect(screen.queryByText("Área protegida")).not.toBeInTheDocument();
  });

  it("renderiza a rota protegida quando o usuário está autenticado", () => {
    useAuthMock.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
    });

    renderRequireAuth();

    expect(screen.getByText("Área protegida")).toBeInTheDocument();
  });
});
