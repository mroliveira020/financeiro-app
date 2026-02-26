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

function HomeEntry() {
  const { user } = useAuth();
  if (user?.role === "prospector") {
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
