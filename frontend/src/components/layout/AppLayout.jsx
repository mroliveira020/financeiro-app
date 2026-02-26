import React from "react";
import { NavLink, Outlet } from "react-router-dom";
import EditorBar from "../EditorBar";
import { useAuth } from "../../context/AuthContext";
import logo from "../../assets/house-color.png";
import "./AppLayout.css";

const icons = {
  home: (
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M3 10.25 12 3l9 7.25v9.5A1.25 1.25 0 0 1 19.75 21H4.25A1.25 1.25 0 0 1 3 19.75v-9.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9 21v-6.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1V21"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  dashboard: (
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <rect x="13.5" y="3.5" width="7" height="4.5" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <rect x="3.5" y="13" width="7" height="7.5" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <rect x="13.5" y="10.5" width="7" height="10" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
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
  settings: (
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="m12 2 1.65 3.35a1 1 0 0 0 .78.55l3.7.54-2.67 2.6a1 1 0 0 0-.29.88l.63 3.67-3.29-1.73a1 1 0 0 0-.93 0l-3.29 1.73.63-3.67a1 1 0 0 0-.29-.88L5.87 6.44l3.7-.54a1 1 0 0 0 .78-.55Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
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

function SidebarButton({ icon, label }) {
  return (
    <button type="button" className="app-shell__nav-item app-shell__nav-item--ghost">
      {icon}
      <span className="app-shell__nav-label">{label}</span>
    </button>
  );
}

export default function AppLayout() {
  const { user } = useAuth();
  const isProspector = user?.role === "prospector";
  const isAdmin = user?.role === "admin";

  return (
    <div className="app-shell">
      <aside className="app-shell__sidebar">
        <div className="app-shell__brand">
          <img src={logo} alt="Financeiro" />
        </div>
        <nav className="app-shell__nav">
          {!isProspector && <SidebarLink to="/" icon={icons.home} label="Home" />}
          <SidebarLink to="/prospeccoes" icon={icons.prospects} label="Prospec." />
          {isAdmin && <SidebarLink to="/usuarios" icon={icons.users} label="Usuários" />}
          {!isProspector && <SidebarButton icon={icons.dashboard} label="Dash" />}
          {!isProspector && <SidebarButton icon={icons.settings} label="Soon" />}
        </nav>
        <div className="app-shell__sidebar-foot text-muted">v1.0</div>
      </aside>
      <div className="app-shell__content">
        <header className="app-shell__topbar">
          <div className="app-shell__headline">
            <div>
              <h1 className="app-shell__title">{isProspector ? "Prospecções" : "Financeiro"}</h1>
              <p className="app-shell__subtitle mb-0">
                {isProspector
                  ? "Acesso focado em captação e decisão de oportunidades."
                  : "Painel executivo dos investimentos imobiliários."}
              </p>
            </div>
            <span className="app-shell__env-pill" aria-label="Ambiente atual">Produção</span>
          </div>
          <EditorBar className="app-shell__session" />
        </header>
        <main className="app-shell__main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
