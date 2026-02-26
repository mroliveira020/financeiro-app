import React, { useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import api from "../services/http";
import "./PrimeiroAcesso.css";

export default function PrimeiroAcesso() {
  const location = useLocation();
  const navigate = useNavigate();
  const query = useMemo(() => new URLSearchParams(location.search), [location.search]);

  const [email, setEmail] = useState(query.get("email") || "");
  const [token, setToken] = useState(query.get("token") || "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (password.length < 8) {
      setError("A senha deve ter pelo menos 8 caracteres.");
      return;
    }
    if (password !== confirmPassword) {
      setError("As senhas não conferem.");
      return;
    }

    setLoading(true);
    try {
      const { data } = await api.post("/auth/setup-password", {
        email: email.trim().toLowerCase(),
        token: token.trim(),
        password,
      });
      setSuccess(data?.message || "Senha definida com sucesso.");
      setTimeout(() => navigate("/login", { replace: true }), 1200);
    } catch (err) {
      setError(err?.response?.data?.error || "Não foi possível definir a senha.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="first-access-page">
      <div className="first-access-card">
        <h1>Primeiro acesso</h1>
        <p>Defina sua senha para acessar o sistema.</p>

        <form onSubmit={handleSubmit} className="first-access-form">
          <label htmlFor="email">E-mail</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <label htmlFor="token">Token do convite</label>
          <input
            id="token"
            type="text"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            required
          />

          <label htmlFor="password">Senha</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          <label htmlFor="confirm-password">Confirmar senha</label>
          <input
            id="confirm-password"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />

          {error && <div className="first-access-alert first-access-alert--error">{error}</div>}
          {success && <div className="first-access-alert first-access-alert--ok">{success}</div>}

          <button type="submit" disabled={loading}>
            {loading ? "Salvando..." : "Definir senha"}
          </button>
        </form>

        <Link to="/login" className="first-access-link">Voltar ao login</Link>
      </div>
    </div>
  );
}
