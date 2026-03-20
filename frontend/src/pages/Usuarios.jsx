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
  const [editingUserId, setEditingUserId] = useState(null);
  const [editingName, setEditingName] = useState("");
  const [editingIsActive, setEditingIsActive] = useState(true);
  const [updatingUserId, setUpdatingUserId] = useState(null);

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("prospector");
  const [inviteHours, setInviteHours] = useState(72);
  const [isActive, setIsActive] = useState(true);
  const activeUsers = users.filter((user) => user.is_active);
  const inactiveUsers = users.filter((user) => !user.is_active);

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

  const startEditing = (user) => {
    setEditingUserId(user.id);
    setEditingName(user.name || "");
    setEditingIsActive(Boolean(user.is_active));
    setError("");
    setMessage("");
  };

  const cancelEditing = () => {
    setEditingUserId(null);
    setEditingName("");
    setEditingIsActive(true);
  };

  const handleUpdateUser = async (userId) => {
    setUpdatingUserId(userId);
    setError("");
    setMessage("");
    try {
      await api.patch(`/auth/users/${userId}`, {
        name: editingName.trim(),
        is_active: editingIsActive,
      });
      setMessage("Usuário atualizado com sucesso.");
      cancelEditing();
      await loadUsers();
    } catch (err) {
      setError(err?.response?.data?.error || "Erro ao atualizar usuário");
    } finally {
      setUpdatingUserId(null);
    }
  };

  const renderTable = (tableUsers, emptyMessage) => (
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
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr>
              <td colSpan={8}>Carregando...</td>
            </tr>
          )}
          {!loading && tableUsers.length === 0 && (
            <tr>
              <td colSpan={8}>{emptyMessage}</td>
            </tr>
          )}
          {!loading &&
            tableUsers.map((user) => (
              <tr key={user.id}>
                <td>
                  {editingUserId === user.id ? (
                    <input
                      type="text"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      className="users-table__input"
                    />
                  ) : (
                    user.name || "—"
                  )}
                </td>
                <td>{user.email}</td>
                <td>{user.role}</td>
                <td>
                  {editingUserId === user.id ? (
                    <label className="users-table__check">
                      <input
                        type="checkbox"
                        checked={editingIsActive}
                        onChange={(e) => setEditingIsActive(e.target.checked)}
                      />
                      <span>{editingIsActive ? "Sim" : "Não"}</span>
                    </label>
                  ) : (
                    user.is_active ? "Sim" : "Não"
                  )}
                </td>
                <td>{user.invite_pending ? "Sim" : "Não"}</td>
                <td>{formatDate(user.invite_expires_at)}</td>
                <td>{formatDate(user.created_at)}</td>
                <td>
                  <div className="users-table__actions">
                    {editingUserId === user.id ? (
                      <>
                        <button
                          type="button"
                          className="users-table__button users-table__button--primary"
                          onClick={() => handleUpdateUser(user.id)}
                          disabled={updatingUserId === user.id}
                        >
                          {updatingUserId === user.id ? "Salvando..." : "Salvar"}
                        </button>
                        <button
                          type="button"
                          className="users-table__button"
                          onClick={cancelEditing}
                          disabled={updatingUserId === user.id}
                        >
                          Cancelar
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="users-table__button"
                        onClick={() => startEditing(user)}
                      >
                        Editar
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );

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

      <section className="users-section">
        <div className="users-section__header">
          <h2>Usuários ativos</h2>
          <span>{activeUsers.length}</span>
        </div>
        {renderTable(activeUsers, "Nenhum usuário ativo encontrado.")}
      </section>

      <section className="users-section">
        <div className="users-section__header">
          <h2>Usuários inativos</h2>
          <span>{inactiveUsers.length}</span>
        </div>
        {renderTable(inactiveUsers, "Nenhum usuário inativo encontrado.")}
      </section>
    </div>
  );
}
