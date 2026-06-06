import React, { useEffect, useMemo, useState } from "react";
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

function ShellNavLink({ to, icon, label, compact = false }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) => `app-shell__nav-item ${compact ? "app-shell__nav-item--compact" : ""} ${isActive ? "active" : ""}`.trim()}
      end
    >
      {icon}
      <span className="app-shell__nav-label">{label}</span>
    </NavLink>
  );
}

export default function AppLayout() {
  const { user, hasCapability, logout } = useAuth();
  const location = useLocation();
  const [topbarContent, setTopbarContent] = useState(null);
  const canAccessFinance = Boolean(user?.finance_access || hasCapability("admin"));
  const canAccessProspeccoes = hasCapability("admin", "prospector");
  const isAdmin = hasCapability("admin");
  const [compactNavigation, setCompactNavigation] = useState(() => (
    typeof window !== "undefined" ? window.innerWidth <= 991 : false
  ));
  const isProspeccoesPage = location.pathname.startsWith("/prospeccoes");
  const isUsuariosPage = location.pathname.startsWith("/usuarios");
  const pageTitle = isUsuariosPage
    ? "Usuários"
    : isProspeccoesPage
      ? "Prospecção"
      : "Financeiro";
  const pageSubtitle = isUsuariosPage
    ? "Gestão de acessos, permissões e composição societária do portal."
    : isProspeccoesPage
      ? "Central operacional para seleção, prospecção e acompanhamento dos imóveis."
      : "Controle financeiro dos imóveis já adquiridos.";
  const sidebarUserLabel = user?.name || user?.email || "Sessão ativa";
  const navItems = useMemo(() => {
    const items = [];
    if (canAccessFinance) items.push({ to: "/", icon: icons.home, label: "Financeiro" });
    if (canAccessProspeccoes) items.push({ to: "/prospeccoes", icon: icons.prospects, label: "Prospecção" });
    if (isAdmin) items.push({ to: "/usuarios", icon: icons.users, label: "Usuários" });
    return items;
  }, [canAccessFinance, canAccessProspeccoes, isAdmin]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handleResize = () => setCompactNavigation(window.innerWidth <= 991);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <div className="app-shell">
      <aside className="app-shell__sidebar">
        <div className="app-shell__brand">
          <img src={logo} alt="Financeiro Imóveis" />
          <div className="app-shell__brand-copy">
            <span className="app-shell__brand-title">Financeiro</span>
            <span className="app-shell__brand-subtitle">Imóveis</span>
          </div>
        </div>
        <nav className="app-shell__nav">
          {navItems.map((item) => (
            <ShellNavLink key={item.to} to={item.to} icon={item.icon} label={item.label} />
          ))}
        </nav>
        <div className="app-shell__sidebar-foot">
          <span className="app-shell__sidebar-version">v1.0</span>
          <span className="app-shell__sidebar-user" title={user?.email || ""}>{sidebarUserLabel}</span>
          <button type="button" className="app-shell__sidebar-logout" onClick={logout}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M14 6V4.75A1.75 1.75 0 0 0 12.25 3h-5.5A1.75 1.75 0 0 0 5 4.75v14.5C5 20.216 5.784 21 6.75 21h5.5A1.75 1.75 0 0 0 14 19.25V18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M10 12h9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              <path d="m16 8 4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>Sair</span>
          </button>
        </div>
      </aside>
      <div className="app-shell__content">
        <header className="app-shell__topbar">
          <div className="app-shell__topbar-main">
            <div className="app-shell__headline-copy">
              <h1 className="app-shell__topbar-title">{pageTitle}</h1>
              <p className="app-shell__subtitle mb-0">{pageSubtitle}</p>
            </div>
            {topbarContent ? <div className="app-shell__headline-extra">{topbarContent}</div> : null}
          </div>
          <EditorBar className="app-shell__session" />
        </header>
        <main className="app-shell__main">
          <Outlet context={{ setTopbarContent }} />
        </main>
        {compactNavigation ? (
          <nav className="app-shell__bottom-nav" aria-label="Navegação principal">
            {navItems.map((item) => (
              <ShellNavLink key={`compact-${item.to}`} to={item.to} icon={item.icon} label={item.label} compact />
            ))}
          </nav>
        ) : null}
      </div>
    </div>
  );
}
