import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { cleanup, render, screen, within } from "@testing-library/react";

const useAuthMock = vi.fn();

vi.mock("../../context/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("../EditorBar", () => ({
  default: () => <div data-testid="editor-bar">Sessão</div>,
}));

vi.mock("../../assets/house-color.png", () => ({
  default: "/mock-house-color.png",
}));

import AppLayout from "./AppLayout";

afterEach(() => {
  cleanup();
  window.innerWidth = 1024;
});

function renderLayout(initialPath = "/", authValue = {}) {
  useAuthMock.mockReturnValue({
    user: null,
    hasCapability: () => false,
    ...authValue,
  });

  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<div>Home content</div>} />
          <Route path="/prospeccoes" element={<div>Prospecções content</div>} />
          <Route path="/usuarios" element={<div>Usuários content</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("AppLayout", () => {
  it("mostra apenas navegação de prospecções para perfil prospector sem acesso financeiro", () => {
    renderLayout("/prospeccoes", {
      user: { finance_access: false },
      hasCapability: (...caps) => caps.includes("prospector"),
    });

    expect(screen.queryByRole("link", { name: /financeiro/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /prospec/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /usuários/i })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Gestão de imóveis" })).toBeInTheDocument();
  });

  it("mostra somente financeiro para perfil com acesso financeiro restrito", () => {
    renderLayout("/", {
      user: { finance_access: true },
      hasCapability: (...caps) => caps.includes("socio"),
    });

    expect(screen.getByRole("link", { name: /financeiro/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /prospec/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /usuários/i })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Financeiro" })).toBeInTheDocument();
  });

  it("mostra toda a navegação para administrador", () => {
    renderLayout("/usuarios", {
      user: { finance_access: true },
      hasCapability: (...caps) => caps.includes("admin"),
    });

    expect(screen.getByRole("link", { name: /financeiro/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /prospec/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /usuários/i })).toBeInTheDocument();
    expect(screen.getByTestId("editor-bar")).toBeInTheDocument();
  });

  it("renderiza navegação inferior em viewport de tablet", () => {
    window.innerWidth = 900;

    renderLayout("/prospeccoes", {
      user: { finance_access: true },
      hasCapability: (...caps) => caps.includes("admin") || caps.includes("prospector"),
    });

    const bottomNav = screen.getByRole("navigation", { name: /navegação principal/i });
    expect(within(bottomNav).getByRole("link", { name: /financeiro/i })).toBeInTheDocument();
    expect(within(bottomNav).getByRole("link", { name: /prospec/i })).toBeInTheDocument();
    expect(within(bottomNav).getByRole("link", { name: /usuários/i })).toBeInTheDocument();
  });
});
