import React, { useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import "./EditorBar.css";

const initialsFromEmail = (email = "") => {
  if (!email) return "?";
  const [namePart] = email.split("@");
  if (!namePart) return email.slice(0, 2).toUpperCase();
  const pieces = namePart.split(/[._-]/).filter(Boolean);
  const chars = pieces.length >= 2 ? pieces[0][0] + pieces[1][0] : namePart.slice(0, 2);
  return chars.toUpperCase();
};

export default function EditorBar({ className = "" }) {
  const { user, logout } = useAuth();
  const roleLabel = useMemo(() => {
    if (!user) return "Desconhecido";
    if (user.role === "admin") return "Administrador";
    if (user.role === "prospector") return "Prospecção";
    return "Usuário";
  }, [user]);

  const initials = initialsFromEmail(user?.email);

  return (
    <div className={`editor-bar ${className}`}>
      <div className="editor-bar__avatar" aria-hidden="true">
        {initials}
      </div>
      <div className="editor-bar__info">
        <span className="editor-bar__email" title={user?.email || "Sessão não iniciada"}>
          {user?.email || "Sessão não iniciada"}
        </span>
        <span className="editor-bar__role">{roleLabel}</span>
      </div>
      <button type="button" className="editor-bar__logout" onClick={logout}>
        Sair
      </button>
    </div>
  );
}
