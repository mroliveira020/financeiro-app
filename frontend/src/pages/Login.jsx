import React, { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "./Login.css";

export default function Login() {
  const { login, isAuthenticated, error, clearError } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState("");
  const navigate = useNavigate();
  const location = useLocation();

  const from = location.state?.from?.pathname || "/";

  useEffect(() => {
    if (isAuthenticated) {
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, from, navigate]);

  useEffect(() => {
    if (error) {
      setLocalError(error);
    }
  }, [error]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setLocalError("");
    try {
      await login(email.trim(), password);
      navigate(from, { replace: true });
    } catch (loginError) {
      setLocalError(loginError.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleFieldChange = (setter) => (event) => {
    if (localError) {
      setLocalError("");
      clearError();
    }
    setter(event.target.value);
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-card__header">
          <h1>Financeiro</h1>
          <p className="text-muted mb-0">Acesse para visualizar os dados do portfólio.</p>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="mb-3">
            <label htmlFor="email" className="form-label">
              E-mail
            </label>
            <input
              id="email"
              type="email"
              className="form-control"
              value={email}
              onChange={handleFieldChange(setEmail)}
              placeholder="voce@empresa.com"
              autoComplete="email"
              required
            />
          </div>

          <div className="mb-3">
            <label htmlFor="password" className="form-label">
              Senha
            </label>
            <input
              id="password"
              type="password"
              className="form-control"
              value={password}
              onChange={handleFieldChange(setPassword)}
              placeholder="********"
              autoComplete="current-password"
              required
            />
          </div>

          {localError && (
            <div className="alert alert-danger py-2" role="alert">
              {localError}
            </div>
          )}

          <button type="submit" className="btn btn-primary w-100" disabled={submitting}>
            {submitting ? "Entrando..." : "Entrar"}
          </button>
        </form>

        <footer className="login-card__footer">
          <span className="text-muted small">
            Problemas de acesso? Fale com o administrador para provisionar seu usuário.
          </span>
          <Link to="/" className="small">
            Voltar ao site
          </Link>
        </footer>
      </div>
    </div>
  );
}
