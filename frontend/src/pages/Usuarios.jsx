import React, { useEffect, useState } from "react";
import api from "../services/http";
import "./Usuarios.css";

const ROLE_OPTIONS = [
  { value: "prospector", label: "Prospecção" },
  { value: "viewer", label: "Leitor" },
  { value: "editor", label: "Editor" },
  { value: "admin", label: "Administrador" },
];

const formatDate = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("pt-BR");
};

export default function Usuarios() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [inviteLink, setInviteLink] = useState("");
  const [saving, setSaving] = useState(false);

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("prospector");
  const [inviteHours, setInviteHours] = useState(72);
  const [isActive, setIsActive] = useState(true);

  const loadUsers = async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get("/auth/users");
      setUsers(data?.data || []);
    } catch (err) {
      setError(err?.response?.data?.error || "Erro ao carregar usuários");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleCreateInvite = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    setInviteLink("");
    try {
      const { data } = await api.post("/auth/users/invite", {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        role,
        is_active: isActive,
        invite_hours: Number(inviteHours),
      });
      setMessage(`Convite gerado para ${data?.user?.name || data?.user?.email}.`);
      setInviteLink(data?.invite_link || "");
      setName("");
      setEmail("");
      await loadUsers();
    } catch (err) {
      setError(err?.response?.data?.error || "Erro ao gerar convite");
    } finally {
      setSaving(false);
    }
  };

  const copyInviteLink = async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setMessage("Link copiado para a área de transferência.");
    } catch {
      setMessage("Não foi possível copiar automaticamente. Copie manualmente.");
    }
  };

  return (
    <div className="users-page">
      <div className="users-header">
        <h1>Usuários</h1>
        <p>Crie convites para que cada usuário defina a própria senha no primeiro acesso.</p>
      </div>

      <form className="users-form" onSubmit={handleCreateInvite}>
        <div className="users-form__row">
          <label htmlFor="invite-name">Nome</label>
          <input
            id="invite-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome do usuário"
            required
          />
        </div>

        <div className="users-form__row">
          <label htmlFor="invite-email">E-mail</label>
          <input
            id="invite-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="usuario@empresa.com"
            required
          />
        </div>

        <div className="users-form__row">
          <label htmlFor="invite-role">Perfil</label>
          <select id="invite-role" value={role} onChange={(e) => setRole(e.target.value)}>
            {ROLE_OPTIONS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </div>

        <div className="users-form__row">
          <label htmlFor="invite-hours">Validade (horas)</label>
          <input
            id="invite-hours"
            type="number"
            min={1}
            value={inviteHours}
            onChange={(e) => setInviteHours(e.target.value)}
            required
          />
        </div>

        <div className="users-form__check">
          <label>
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            <span>Usuário ativo</span>
          </label>
        </div>

        <button type="submit" disabled={saving}>
          {saving ? "Gerando..." : "Gerar convite"}
        </button>
      </form>

      {error && <p className="users-alert users-alert--error">{error}</p>}
      {message && <p className="users-alert users-alert--ok">{message}</p>}

      {inviteLink && (
        <div className="users-invite">
          <p>Link de convite:</p>
          <div className="users-invite__box">
            <a href={inviteLink} target="_blank" rel="noreferrer" className="users-invite__link">
              {inviteLink}
            </a>
            <button type="button" onClick={copyInviteLink}>Copiar</button>
          </div>
        </div>
      )}

      <div className="users-table-wrap">
        <table className="users-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>E-mail</th>
              <th>Perfil</th>
              <th>Ativo</th>
              <th>Convite pendente</th>
              <th>Expira em</th>
              <th>Criado em</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={7}>Carregando...</td>
              </tr>
            )}
            {!loading && users.length === 0 && (
              <tr>
                <td colSpan={7}>Nenhum usuário encontrado.</td>
              </tr>
            )}
            {!loading &&
              users.map((user) => (
                <tr key={user.id}>
                  <td>{user.name || "—"}</td>
                  <td>{user.email}</td>
                  <td>{user.role}</td>
                  <td>{user.is_active ? "Sim" : "Não"}</td>
                  <td>{user.invite_pending ? "Sim" : "Não"}</td>
                  <td>{formatDate(user.invite_expires_at)}</td>
                  <td>{formatDate(user.created_at)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
