import { Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import Dashboard from "./pages/Dashboard";
import AppLayout from "./components/layout/AppLayout";
import Login from "./pages/Login";
import RequireAuth from "./components/auth/RequireAuth";
import { AuthProvider } from "./context/AuthContext";
import Prospeccoes from "./pages/Prospeccoes";

function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<RequireAuth />}>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Home />} />
            <Route path="/prospeccoes" element={<Prospeccoes />} />
            <Route path="/dashboard/:id" element={<Dashboard />} />
          </Route>
        </Route>
      </Routes>
    </AuthProvider>
  );
}

export default App;
