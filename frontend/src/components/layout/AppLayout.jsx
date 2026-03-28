import React, { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import EditorBar from "../EditorBar";
import { useAuth } from "../../context/AuthContext";
import logo from "../../assets/house-color.png";
import "./AppLayout.css";

const icons = {
  home: (
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="3.5" y="6" width="17" height="12.5" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3.5 10h17" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M7 15h4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M16.5 4.5v3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M7.5 4.5v3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
  prospects: (
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="m15.5 8.5 1.5-1.5M7 17l1.5-1.5M8.5 8.5 7 7M17 17l-1.5-1.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
  users: (
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="8" cy="9" r="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="16.5" cy="10.5" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3.5 19c.5-2.5 2.8-4 5.2-4h.6c2.4 0 4.7 1.5 5.2 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M14.5 18.5c.4-1.8 1.9-2.9 3.6-2.9h.3c1.7 0 3.2 1.1 3.6 2.9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
};

function SidebarLink({ to, icon, label }) {
  return (
    <NavLink to={to} className={({ isActive }) => `app-shell__nav-item ${isActive ? "active" : ""}`} end>
      {icon}
      <span className="app-shell__nav-label">{label}</span>
    </NavLink>
  );
}

export default function AppLayout() {
  const { user } = useAuth();
  const location = useLocation();
  const [topbarContent, setTopbarContent] = useState(null);
  const canAccessFinance = user?.finance_access ?? user?.role !== "prospector";
  const isAdmin = user?.role === "admin";
  const isProspeccoesPage = location.pathname.startsWith("/prospeccoes");
  const pageTitle = isProspeccoesPage ? "Prospecções" : "Financeiro";
  const pageSubtitle = isProspeccoesPage
    ? "Central operacional da prospecção e da fila de decisão."
    : "Controle financeiro dos imóveis já adquiridos.";

  return (
    <div className="app-shell">
      <aside className="app-shell__sidebar">
        <div className="app-shell__brand">
          <img src={logo} alt="Financeiro" />
        </div>
        <nav className="app-shell__nav">
          {canAccessFinance && <SidebarLink to="/" icon={icons.home} label="Financeiro" />}
          <SidebarLink to="/prospeccoes" icon={icons.prospects} label="Prospec." />
          {isAdmin && <SidebarLink to="/usuarios" icon={icons.users} label="Usuários" />}
        </nav>
        <div className="app-shell__sidebar-foot text-muted">v1.0</div>
      </aside>
      <div className="app-shell__content">
        <header className="app-shell__topbar">
          <div className="app-shell__headline">
            <div className="app-shell__headline-copy">
              <h1 className="app-shell__title">{pageTitle}</h1>
              <p className="app-shell__subtitle mb-0">{pageSubtitle}</p>
            </div>
            {topbarContent ? <div className="app-shell__headline-extra">{topbarContent}</div> : null}
          </div>
          <EditorBar className="app-shell__session" />
        </header>
        <main className="app-shell__main">
          <Outlet context={{ setTopbarContent }} />
        </main>
      </div>
    </div>
  );
}
