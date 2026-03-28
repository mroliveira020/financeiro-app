import React, { useEffect, useMemo, useState } from "react";
import api from "../services/http";
import "./Usuarios.css";

const ROLE_OPTIONS = [
  { value: "prospector", label: "Prospecção" },
  { value: "viewer", label: "Leitor" },
  { value: "editor", label: "Editor" },
  { value: "admin", label: "Administrador" },
];

const createSocioRow = (overrides = {}) => ({
  localId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  user_id: "",
  percentual_participacao: "",
  observacao: "",
  ativo: true,
  ...overrides,
});

const formatDate = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("pt-BR");
};

const formatPercent = (value) => {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return "0,00%";
  return `${number.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
};

export default function Usuarios() {
  const [users, setUsers] = useState([]);
  const [imoveis, setImoveis] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingImoveis, setLoadingImoveis] = useState(false);
  const [loadingSocios, setLoadingSocios] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [inviteLink, setInviteLink] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingUserId, setEditingUserId] = useState(null);
  const [editingName, setEditingName] = useState("");
  const [editingPixKey, setEditingPixKey] = useState("");
  const [editingIsActive, setEditingIsActive] = useState(true);
  const [updatingUserId, setUpdatingUserId] = useState(null);
  const [selectedImovelId, setSelectedImovelId] = useState("");
  const [sociosRows, setSociosRows] = useState([]);
  const [savingSocios, setSavingSocios] = useState(false);

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [pixKey, setPixKey] = useState("");
  const [role, setRole] = useState("prospector");
  const [inviteHours, setInviteHours] = useState(72);
  const [isActive, setIsActive] = useState(true);

  const activeUsers = users.filter((user) => user.is_active);
  const inactiveUsers = users.filter((user) => !user.is_active);

  const userOptions = useMemo(() => {
    const map = new Map();
    activeUsers.forEach((user) => {
      map.set(String(user.id), user);
    });
    sociosRows.forEach((row) => {
      const match = users.find((user) => String(user.id) === String(row.user_id));
      if (match) {
        map.set(String(match.id), match);
      }
    });
    return Array.from(map.values()).sort((a, b) => {
      const left = `${a.name || ""}${a.email || ""}`.toLowerCase();
      const right = `${b.name || ""}${b.email || ""}`.toLowerCase();
      return left.localeCompare(right, "pt-BR");
    });
  }, [activeUsers, sociosRows, users]);

  const sociosTotalAtivo = useMemo(
    () =>
      sociosRows.reduce((acc, row) => {
        const percentual = Number(row.percentual_participacao || 0);
        if (!row.user_id || !row.ativo || percentual <= 0) return acc;
        return acc + percentual;
      }, 0),
    [sociosRows]
  );

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

  const loadImoveis = async () => {
    setLoadingImoveis(true);
    try {
      const { data } = await api.get("/imoveis");
      const lista = Array.isArray(data) ? data : [];
      setImoveis(lista);
      setSelectedImovelId((current) => {
        if (current && lista.some((item) => String(item.id) === String(current))) {
          return current;
        }
        return lista.length ? String(lista[0].id) : "";
      });
    } catch (err) {
      setError((current) => current || err?.response?.data?.error || "Erro ao carregar imóveis");
    } finally {
      setLoadingImoveis(false);
    }
  };

  const loadSocios = async (imovelId) => {
    if (!imovelId) {
      setSociosRows([]);
      return;
    }
    setLoadingSocios(true);
    try {
      const { data } = await api.get(`/imoveis/${imovelId}/socios?incluir_inativos=true`);
      const lista = data?.data || [];
      setSociosRows(
        lista.length
          ? lista.map((item) =>
              createSocioRow({
                localId: `persisted-${item.id}`,
                user_id: String(item.user_id),
                percentual_participacao: String(item.percentual_participacao ?? ""),
                observacao: item.observacao || "",
                ativo: Boolean(item.ativo),
              })
            )
          : [createSocioRow()]
      );
    } catch (err) {
      setError(err?.response?.data?.error || "Erro ao carregar composição do imóvel");
      setSociosRows([createSocioRow()]);
    } finally {
      setLoadingSocios(false);
    }
  };

  useEffect(() => {
    loadUsers();
    loadImoveis();
  }, []);

  useEffect(() => {
    if (selectedImovelId) {
      loadSocios(selectedImovelId);
    }
  }, [selectedImovelId]);

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
        pix_key: pixKey.trim(),
        is_active: isActive,
        invite_hours: Number(inviteHours),
      });
      setMessage(`Convite gerado para ${data?.user?.name || data?.user?.email}.`);
      setInviteLink(data?.invite_link || "");
      setName("");
      setEmail("");
      setPixKey("");
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
    setEditingPixKey(user.pix_key || "");
    setEditingIsActive(Boolean(user.is_active));
    setError("");
    setMessage("");
  };

  const cancelEditing = () => {
    setEditingUserId(null);
    setEditingName("");
    setEditingPixKey("");
    setEditingIsActive(true);
  };

  const handleUpdateUser = async (userId) => {
    setUpdatingUserId(userId);
    setError("");
    setMessage("");
    try {
      await api.patch(`/auth/users/${userId}`, {
        name: editingName.trim(),
        pix_key: editingPixKey.trim(),
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

  const handleSocioFieldChange = (localId, field, value) => {
    setSociosRows((current) =>
      current.map((row) => (row.localId === localId ? { ...row, [field]: value } : row))
    );
  };

  const handleAddSocioRow = () => {
    setSociosRows((current) => [...current, createSocioRow()]);
  };

  const handleRemoveSocioRow = (localId) => {
    setSociosRows((current) => {
      const next = current.filter((row) => row.localId !== localId);
      return next.length ? next : [createSocioRow()];
    });
  };

  const handleSaveSocios = async () => {
    if (!selectedImovelId) {
      setError("Selecione um imóvel para editar a composição.");
      return;
    }

    const payloadSocios = sociosRows
      .filter((row) => row.user_id)
      .map((row) => ({
        user_id: Number(row.user_id),
        percentual_participacao: Number(row.percentual_participacao || 0),
        observacao: row.observacao?.trim() || null,
      }));

    if (!payloadSocios.length) {
      setError("Informe ao menos um sócio para o imóvel.");
      return;
    }

    setSavingSocios(true);
    setError("");
    setMessage("");
    try {
      await api.put(`/imoveis/${selectedImovelId}/socios`, {
        socios: payloadSocios,
      });
      setMessage("Composição societária atualizada com sucesso.");
      await loadSocios(selectedImovelId);
    } catch (err) {
      setError(err?.response?.data?.error || "Erro ao salvar composição societária");
    } finally {
      setSavingSocios(false);
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
            <th>Chave Pix</th>
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
              <td colSpan={9}>Carregando...</td>
            </tr>
          )}
          {!loading && tableUsers.length === 0 && (
            <tr>
              <td colSpan={9}>{emptyMessage}</td>
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
                    <input
                      type="text"
                      value={editingPixKey}
                      onChange={(e) => setEditingPixKey(e.target.value)}
                      className="users-table__input"
                      placeholder="CPF, e-mail, telefone ou aleatória"
                    />
                  ) : (
                    user.pix_key || "—"
                  )}
                </td>
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
        <p>Crie convites, edite chave Pix e monte a composição societária dos imóveis em um único lugar.</p>
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
          <label htmlFor="invite-pix">Chave Pix</label>
          <input
            id="invite-pix"
            type="text"
            value={pixKey}
            onChange={(e) => setPixKey(e.target.value)}
            placeholder="CPF, e-mail, telefone ou aleatória"
          />
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
            <button type="button" onClick={copyInviteLink}>
              Copiar
            </button>
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

      <section className="users-section">
        <div className="users-section__header">
          <h2>Composição societária por imóvel</h2>
          <span>{selectedImovelId ? formatPercent(sociosTotalAtivo) : "—"}</span>
        </div>
        <div className="users-socios-card">
          <div className="users-socios-card__toolbar">
            <div className="users-form__row">
              <label htmlFor="socios-imovel">Imóvel</label>
              <select
                id="socios-imovel"
                value={selectedImovelId}
                onChange={(e) => setSelectedImovelId(e.target.value)}
                disabled={loadingImoveis}
              >
                {imoveis.length === 0 && <option value="">Nenhum imóvel disponível</option>}
                {imoveis.map((imovel) => (
                  <option key={imovel.id} value={imovel.id}>
                    {imovel.nome}
                  </option>
                ))}
              </select>
            </div>

            <div className="users-socios-card__summary">
              <strong>Total ativo:</strong> {formatPercent(sociosTotalAtivo)}
            </div>
          </div>

          <p className="users-socios-card__hint">
            O papel do usuário continua sendo administrativo/editorial. A condição de sócio vem do vínculo com o imóvel e da participação definida aqui.
          </p>

          <div className="users-socios-grid">
            <div className="users-socios-grid__head">Usuário</div>
            <div className="users-socios-grid__head">% participação</div>
            <div className="users-socios-grid__head">Resumo</div>
            <div className="users-socios-grid__head">Observação</div>
            <div className="users-socios-grid__head">Ações</div>

            {loadingSocios && (
              <div className="users-socios-grid__empty">Carregando composição do imóvel...</div>
            )}

            {!loadingSocios &&
              sociosRows.map((row) => {
                const selectedUser = users.find((item) => String(item.id) === String(row.user_id));
                return (
                  <React.Fragment key={row.localId}>
                    <div className="users-socios-grid__cell">
                      <select
                        value={row.user_id}
                        onChange={(e) => handleSocioFieldChange(row.localId, "user_id", e.target.value)}
                      >
                        <option value="">Selecione um usuário</option>
                        {userOptions.map((user) => (
                          <option key={user.id} value={user.id}>
                            {user.name || user.email} ({user.email})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="users-socios-grid__cell">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step="0.01"
                        value={row.percentual_participacao}
                        onChange={(e) =>
                          handleSocioFieldChange(row.localId, "percentual_participacao", e.target.value)
                        }
                        placeholder="0,00"
                      />
                    </div>
                    <div className="users-socios-grid__cell users-socios-grid__cell--muted">
                      {selectedUser ? `${selectedUser.name || selectedUser.email} (${selectedUser.email})` : "—"}
                    </div>
                    <div className="users-socios-grid__cell">
                      <input
                        type="text"
                        value={row.observacao}
                        onChange={(e) => handleSocioFieldChange(row.localId, "observacao", e.target.value)}
                        placeholder="Observação opcional"
                      />
                    </div>
                    <div className="users-socios-grid__cell users-socios-grid__cell--actions">
                      <button type="button" className="users-table__button" onClick={() => handleRemoveSocioRow(row.localId)}>
                        Remover
                      </button>
                    </div>
                  </React.Fragment>
                );
              })}
          </div>

          <div className="users-socios-card__actions">
            <button type="button" className="users-table__button" onClick={handleAddSocioRow}>
              Adicionar sócio
            </button>
            <button
              type="button"
              className="users-table__button users-table__button--primary"
              onClick={handleSaveSocios}
              disabled={savingSocios || loadingSocios || !selectedImovelId}
            >
              {savingSocios ? "Salvando..." : "Salvar composição"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
