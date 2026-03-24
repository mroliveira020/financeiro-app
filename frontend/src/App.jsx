import { Navigate, Routes, Route } from "react-router-dom";
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
  const { user } = useAuth();
  if (user?.role === "prospector") {
    return <Navigate to="/prospeccoes" replace />;
  }
  if (isMobileDevice()) {
    return <Navigate to="/prospeccoes" replace />;
  }
  return <Home />;
}

function DashboardEntry() {
  const { user } = useAuth();
  if (user?.role === "prospector") {
    return <Navigate to="/prospeccoes" replace />;
  }
  return <Dashboard />;
}

function UsuariosEntry() {
  const { user } = useAuth();
  if (user?.role !== "admin") {
    return <Navigate to="/" replace />;
  }
  return <Usuarios />;
}

function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/primeiro-acesso" element={<PrimeiroAcesso />} />
        <Route element={<RequireAuth />}>
          <Route element={<AppLayout />}>
            <Route path="/" element={<HomeEntry />} />
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
