import { useEffect } from "react";
import { Navigate, Routes, Route, useLocation } from "react-router-dom";
import Home from "./pages/Home";
import Dashboard from "./pages/Dashboard";
import AppLayout from "./components/layout/AppLayout";
import Login from "./pages/Login";
import RequireAuth from "./components/auth/RequireAuth";
import { AuthProvider } from "./context/AuthContext";
import Prospeccoes from "./pages/Prospeccoes";
import { useAuth } from "./context/AuthContext";
import Usuarios from "./pages/Usuarios";
import PrimeiroAcesso from "./pages/PrimeiroAcesso";

const MOBILE_BREAKPOINT = 900;
const APP_TITLE_BASE = "Financeiro Imóveis";

function getRouteTitle(pathname) {
  if (!pathname || pathname === "/") return `Financeiro — ${APP_TITLE_BASE}`;
  if (pathname === "/financeiro") return `Financeiro — ${APP_TITLE_BASE}`;
  if (pathname === "/prospeccoes") return `Prospecção — ${APP_TITLE_BASE}`;
  if (pathname === "/usuarios") return `Usuários — ${APP_TITLE_BASE}`;
  if (pathname === "/login") return `Entrar — ${APP_TITLE_BASE}`;
  if (pathname === "/primeiro-acesso") return `Primeiro acesso — ${APP_TITLE_BASE}`;
  if (pathname.startsWith("/dashboard/")) return `Dashboard do Imóvel — ${APP_TITLE_BASE}`;
  return `Portal — ${APP_TITLE_BASE}`;
}

function isMobileDevice() {
  if (typeof window === "undefined") return false;
  const width = window.innerWidth <= MOBILE_BREAKPOINT;
  const coarsePointer = typeof window.matchMedia === "function"
    ? window.matchMedia("(pointer: coarse)").matches
    : false;
  const touchPoints = navigator.maxTouchPoints || 0;
  const userAgent = /Android|iPhone|iPad|iPod|IEMobile|Opera Mini/i.test(navigator.userAgent || "");
  return width && (coarsePointer || touchPoints > 0 || userAgent);
}

function HomeEntry() {
  const { user, hasCapability } = useAuth();
  const canAccessFinance = Boolean(user?.finance_access || hasCapability("admin"));
  if (!canAccessFinance && hasCapability("prospector")) {
    return <Navigate to="/prospeccoes" replace />;
  }
  if (isMobileDevice()) {
    return <Navigate to="/prospeccoes" replace />;
  }
  return <Home />;
}

function FinanceiroEntry() {
  const { user, hasCapability } = useAuth();
  const canAccessFinance = Boolean(user?.finance_access || hasCapability("admin"));
  if (!canAccessFinance && hasCapability("prospector")) {
    return <Navigate to="/prospeccoes" replace />;
  }
  return <Home />;
}

function DashboardEntry() {
  const { user, hasCapability } = useAuth();
  const canAccessFinance = Boolean(user?.finance_access || hasCapability("admin"));
  if (!canAccessFinance && hasCapability("prospector")) {
    return <Navigate to="/prospeccoes" replace />;
  }
  return <Dashboard />;
}

function UsuariosEntry() {
  const { hasCapability } = useAuth();
  if (!hasCapability("admin")) {
    return <Navigate to="/" replace />;
  }
  return <Usuarios />;
}

function RouteDocumentMetadata() {
  const location = useLocation();

  useEffect(() => {
    document.documentElement.lang = "pt-BR";
    document.title = getRouteTitle(location.pathname);
  }, [location.pathname]);

  return null;
}

function App() {
  return (
    <AuthProvider>
      <RouteDocumentMetadata />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/primeiro-acesso" element={<PrimeiroAcesso />} />
        <Route element={<RequireAuth />}>
          <Route element={<AppLayout />}>
            <Route path="/" element={<HomeEntry />} />
            <Route path="/financeiro" element={<FinanceiroEntry />} />
            <Route path="/prospeccoes" element={<Prospeccoes />} />
            <Route path="/dashboard/:id" element={<DashboardEntry />} />
            <Route path="/usuarios" element={<UsuariosEntry />} />
          </Route>
        </Route>
      </Routes>
    </AuthProvider>
  );
}

export default App;
