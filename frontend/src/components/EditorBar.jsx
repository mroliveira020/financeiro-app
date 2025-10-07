import React, { useMemo } from "react";
import { useAuth } from "../context/AuthContext";

export default function EditorBar({ className = "" }) {
  const { user, logout } = useAuth();
  const roleLabel = useMemo(() => {
    if (!user) return "Desconhecido";
    if (user.role === "admin") return "Administrador";
    if (user.role === "editor") return "Editor";
    return "Leitor";
  }, [user]);

  return (
    <div className={`d-flex align-items-center gap-2 ${className}`}>
      <span className="text-muted small text-uppercase fw-semibold">Sessão</span>
      <div className="d-flex flex-column">
        <strong className="small">{user?.email}</strong>
        <span className="badge bg-secondary-subtle text-secondary border border-secondary-subtle align-self-start">
          {roleLabel}
        </span>
      </div>
      <button className="btn btn-sm btn-outline-secondary" onClick={logout}>
        Sair
      </button>
    </div>
  );
}
