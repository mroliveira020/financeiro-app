import React from "react";
import { NavLink, Outlet } from "react-router-dom";
import EditorBar from "../EditorBar";
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
  return (
    <div className="app-shell">
      <aside className="app-shell__sidebar">
        <div className="app-shell__brand">FI</div>
        <nav className="app-shell__nav">
          <SidebarLink to="/" icon={icons.home} label="Home" />
          <SidebarButton icon={icons.dashboard} label="Dash" />
          <SidebarButton icon={icons.settings} label="Soon" />
        </nav>
        <div className="app-shell__sidebar-foot text-muted">v1.0</div>
      </aside>
      <div className="app-shell__content">
        <header className="app-shell__topbar">
          <div>
            <h1 className="app-shell__title">Financeiro</h1>
            <p className="app-shell__subtitle mb-0">Gerencie investimentos e lançamentos com rapidez.</p>
          </div>
          <div className="d-flex align-items-center gap-3">
            <span className="badge bg-secondary-subtle text-secondary border border-secondary-subtle">Produção</span>
            <EditorBar />
          </div>
        </header>
        <main className="app-shell__main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
