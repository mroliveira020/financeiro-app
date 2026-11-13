import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import {
  buscarTarefas,
  buscarOpcoesTarefas,
  salvarTarefa,
  consultarIntencao,
  registrarIntencao,
  retirarIntencao,
  avisarTarefasAlteradas,
} from "../../services/tarefas";
import TarefaForm from "./TarefaForm";
import styles from "./Tarefas.module.css";

const erroMensagem = (error) =>
  error?.response?.data?.error ||
  "Não foi possível concluir a operação. Tente novamente.";
const prazoLabel = (value) =>
  value
    ? new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR")
    : "Sem prazo";

export default function TarefasPainel({ context = null }) {
  const { user } = useAuth();
  const [filters, setFilters] = useState({
    busca: "",
    situacao: "",
    etapa: "",
    responsavel: "",
    arquivadas: "nao",
    prazo: "",
    imovel: "",
  });
  const [page, setPage] = useState(1);
  const [result, setResult] = useState({
    data: [],
    total: 0,
    a_fazer: 0,
    concluidas: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [notice, setNotice] = useState("");
  const [editor, setEditor] = useState(null);
  const [saving, setSaving] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [intent, setIntent] = useState(null);
  const [intentLoading, setIntentLoading] = useState(false);
  const [intentError, setIntentError] = useState("");
  const [propertyOptions, setPropertyOptions] = useState([]);
  const [responsibleOptions, setResponsibleOptions] = useState([]);
  const [optionsError, setOptionsError] = useState("");
  const [confirmWithdrawal, setConfirmWithdrawal] = useState(false);
  const code = context?.numero_bem || "";
  const propertyId = context?.imovel_id || "";
  const [filterType, ...filterId] = filters.imovel.split(":");
  const paramsKey = JSON.stringify({
    ...filters,
    pagina: page,
    numero_bem: code || (filterType === "p" ? filterId.join(":") : ""),
    imovel_id: propertyId || (filterType === "i" ? filterId[0] : ""),
    responsavel_id:
      filters.responsavel === "eu"
        ? user?.id
        : filters.responsavel.startsWith("user:")
          ? filters.responsavel.slice(5)
          : undefined,
  });

  useEffect(() => {
    const controller = new AbortController();
    buscarOpcoesTarefas(
      { numero_bem: code, imovel_id: propertyId },
      controller.signal,
    )
      .then((data) => {
        if (!controller.signal.aborted) {
          setPropertyOptions(data.imoveis_com_tarefas || []);
          setResponsibleOptions(data.responsaveis_filtro || []);
          setOptionsError("");
        }
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setOptionsError(
            "Não foi possível carregar os filtros de imóveis e responsáveis. Use Atualizar para tentar novamente.",
          );
      });
    return () => controller.abort();
  }, [code, propertyId, refresh]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      setError("");
      buscarTarefas(JSON.parse(paramsKey), controller.signal)
        .then((data) => {
          if (!controller.signal.aborted) {
            setResult(data);
            setPage((current) =>
              Math.min(current, Math.max(1, Math.ceil(data.total / 50))),
            );
          }
        })
        .catch((err) => {
          if (!controller.signal.aborted) setError(erroMensagem(err));
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [paramsKey, refresh]);

  useEffect(() => {
    if (!code) return;
    const controller = new AbortController();
    setIntentLoading(true);
    setIntentError("");
    consultarIntencao(code, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setIntent(data);
      })
      .catch((err) => {
        if (!controller.signal.aborted) setIntentError(erroMensagem(err));
      })
      .finally(() => {
        if (!controller.signal.aborted) setIntentLoading(false);
      });
    return () => controller.abort();
  }, [code, refresh]);

  function changeFilter(field, value) {
    setFilters((old) => ({ ...old, [field]: value }));
    setPage(1);
  }
  function openEditor(task) {
    setEditor(task);
    setSaveError("");
    setNotice("");
  }
  function create() {
    openEditor({
      id: crypto.randomUUID(),
      titulo: "",
      descricao: "",
      situacao: "a_fazer",
      prazo: "",
      responsavel_id: user?.id,
      numero_bem: code || null,
      imovel_id: propertyId || null,
      origem: "manual",
    });
  }
  async function save(task, closeEditor = true) {
    if (saving) return;
    setSaving(true);
    setSaveError("");
    setError("");
    setNotice("");
    try {
      await salvarTarefa(task);
      if (closeEditor) setEditor(null);
      setRefresh((value) => value + 1);
      avisarTarefasAlteradas();
      setNotice("Tarefa salva.");
    } catch (err) {
      if (closeEditor) setSaveError(erroMensagem(err));
      else setError(erroMensagem(err));
    } finally {
      setSaving(false);
    }
  }
  async function changeIntent() {
    if (saving || intentLoading) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const next = intent
        ? await retirarIntencao(code, intent.id)
        : await registrarIntencao(code);
      setIntent(next);
      setConfirmWithdrawal(false);
      setEditor(null);
      setRefresh((value) => value + 1);
      avisarTarefasAlteradas();
      setNotice(
        next
          ? "Intenção registrada."
          : "Intenção retirada. As tarefas de preparação a fazer foram arquivadas.",
      );
    } catch (err) {
      setError(erroMensagem(err));
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className={styles.workspace} aria-label="Tarefas do portal">
      <div className={styles.heading}>
        <div>
          {context ? <h2>Tarefas do imóvel</h2> : null}
          <p>Compartilhadas com quem tem acesso ao imóvel.</p>
        </div>
        <button
          type="button"
          className={styles.primary}
          onClick={create}
          disabled={saving}
        >
          + Nova tarefa
        </button>
      </div>
      {code ? (
        <section
          className={styles.intent}
          aria-label="Intenção de participação"
        >
          <div>
            <strong>
              {intentLoading
                ? "Consultando intenção…"
                : intent
                  ? "Sua intenção de participação está registrada"
                  : "Minha intenção de participação"}
            </strong>
            <p>
              {intent
                ? "Tarefas de preparação podem ser vinculadas a esta intenção."
                : "Registre seu interesse para organizar a preparação para arrematação."}
            </p>
          </div>
          {!confirmWithdrawal ? (
            <button
              type="button"
              onClick={() =>
                intent ? setConfirmWithdrawal(true) : changeIntent()
              }
              disabled={saving || intentLoading || Boolean(intentError)}
            >
              {intent ? "Retirar intenção" : "Registrar intenção"}
            </button>
          ) : (
            <div className={styles.confirm}>
              <p>
                As tarefas de preparação a fazer serão arquivadas. O histórico
                será preservado.
              </p>
              <button type="button" onClick={changeIntent} disabled={saving}>
                Confirmar retirada
              </button>
              <button
                type="button"
                onClick={() => setConfirmWithdrawal(false)}
                disabled={saving}
              >
                Cancelar
              </button>
            </div>
          )}
        </section>
      ) : null}
      {intentError ? (
        <p role="alert" className={styles.error}>
          {intentError}
        </p>
      ) : null}
      <div className={styles.filters} data-context={Boolean(context)}>
        <label>
          Buscar tarefa
          <input
            type="search"
            value={filters.busca}
            placeholder="Título, descrição ou imóvel"
            onChange={(e) => changeFilter("busca", e.target.value)}
          />
        </label>
        <label>
          Situação
          <select
            value={filters.situacao}
            onChange={(e) => changeFilter("situacao", e.target.value)}
          >
            <option value="">Todas</option>
            <option value="a_fazer">A fazer</option>
            <option value="concluida">Concluídas</option>
          </select>
        </label>
        {!context ? (
          <label>
            Imóvel
            <select
              value={filters.imovel}
              onChange={(e) => changeFilter("imovel", e.target.value)}
            >
              <option value="">Todos</option>
              {propertyOptions.map((property) => (
                <option
                  key={property.numero_bem || property.imovel_id}
                  value={
                    property.numero_bem
                      ? `p:${property.numero_bem}`
                      : `i:${property.imovel_id}`
                  }
                >
                  {property.nome}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {!context ? (
          <label>
            Etapa do imóvel
            <select
              value={filters.etapa}
              onChange={(e) => changeFilter("etapa", e.target.value)}
            >
              <option value="">Todas</option>
              <option value="prospeccao">Prospecção</option>
              <option value="adquirido">Adquirido</option>
            </select>
          </label>
        ) : null}
        <label>
          Responsável
          <select
            value={filters.responsavel}
            onChange={(e) => changeFilter("responsavel", e.target.value)}
          >
            <option value="">Todos</option>
            <option value="eu">Minhas tarefas</option>
            <option value="sem">Sem responsável</option>
            {responsibleOptions
              .filter((person) => `${person.id}` !== `${user?.id}`)
              .map((person) => (
                <option key={person.id} value={`user:${person.id}`}>
                  {person.nome}
                </option>
              ))}
          </select>
        </label>
        <label>
          Prazo
          <select
            value={filters.prazo}
            onChange={(e) => changeFilter("prazo", e.target.value)}
          >
            <option value="">Todos</option>
            <option value="atrasadas">Atrasadas</option>
          </select>
        </label>
        <label>
          Exibição
          <select
            value={filters.arquivadas}
            onChange={(e) => changeFilter("arquivadas", e.target.value)}
          >
            <option value="nao">Ativas</option>
            <option value="sim">Arquivadas</option>
            <option value="todas">Todas</option>
          </select>
        </label>
      </div>
      <div className={styles.toolbar}>
        <span>
          {result.total} tarefa(s) · {result.a_fazer} a fazer ·{" "}
          {result.concluidas} concluída(s)
        </span>
        <button
          type="button"
          onClick={() => setRefresh((value) => value + 1)}
          disabled={loading}
        >
          Atualizar
        </button>
      </div>
      {optionsError ? (
        <p role="alert" className={styles.error}>
          {optionsError}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className={styles.notice}>
          {notice}
        </p>
      ) : null}
      <div className={`${styles.content} ${editor ? styles.withEditor : ""}`}>
        <div className={styles.list} aria-busy={loading}>
          {loading ? (
            <p role="status" className={styles.empty}>
              Carregando tarefas…
            </p>
          ) : error && !result.data.length ? null : !result.data.length ? (
            <div className={styles.empty}>
              <h2>Nenhuma tarefa encontrada</h2>
              <p>Cadastre uma tarefa ou ajuste os filtros.</p>
            </div>
          ) : (
            result.data.map((task) => (
              <article className={styles.row} key={task.id}>
                <input
                  type="checkbox"
                  aria-label={`Concluir ou reabrir ${task.titulo}`}
                  checked={task.situacao === "concluida"}
                  disabled={
                    saving ||
                    Boolean(task.arquivada_em) ||
                    Boolean(task.intencao_retirada_em)
                  }
                  onChange={() =>
                    save(
                      {
                        ...task,
                        arquivada: Boolean(task.arquivada_em),
                        situacao:
                          task.situacao === "concluida"
                            ? "a_fazer"
                            : "concluida",
                      },
                      false,
                    )
                  }
                />
                <div className={styles.rowMain}>
                  <button
                    type="button"
                    className={styles.taskTitle}
                    onClick={() => openEditor(task)}
                    disabled={saving}
                  >
                    {task.titulo}
                  </button>
                  <div className={styles.rowMeta}>
                    <Link
                      to={
                        task.imovel_id
                          ? `/dashboard/${task.imovel_id}`
                          : `/prospeccoes?busca=${encodeURIComponent(task.numero_bem)}&imovel=${encodeURIComponent(task.numero_bem)}&presenca=todos`
                      }
                    >
                      {task.imovel_nome ||
                        task.numero_bem ||
                        `Imóvel ${task.imovel_id}`}
                    </Link>
                    <span>{task.imovel_id ? "Adquirido" : "Prospecção"}</span>
                    <span>{task.responsavel_nome || "Sem responsável"}</span>
                  </div>
                </div>
                <div className={styles.rowEnd}>
                  <span>{prazoLabel(task.prazo)}</span>
                  <small>
                    {task.arquivada_em
                      ? "Arquivada"
                      : task.situacao === "concluida"
                        ? "Concluída"
                        : "A fazer"}
                  </small>
                  {task.origem === "preparacao" ? (
                    <small>Preparação</small>
                  ) : null}
                </div>
                <button
                  type="button"
                  className={styles.archive}
                  disabled={saving || Boolean(task.intencao_retirada_em)}
                  onClick={() =>
                    save({ ...task, arquivada: !task.arquivada_em }, false)
                  }
                >
                  {task.arquivada_em ? "Restaurar" : "Arquivar"}
                </button>
              </article>
            ))
          )}
          <footer className={styles.pagination}>
            <button
              type="button"
              disabled={loading || page === 1}
              onClick={() => setPage(page - 1)}
            >
              Anterior
            </button>
            <span>
              Página {page} de {Math.max(1, Math.ceil(result.total / 50))}
            </span>
            <button
              type="button"
              disabled={loading || page * 50 >= result.total}
              onClick={() => setPage(page + 1)}
            >
              Próxima
            </button>
          </footer>
        </div>
        {editor ? (
          <TarefaForm
            key={editor.id}
            initial={editor}
            context={context}
            intencao={intent}
            saving={saving}
            error={saveError}
            userId={user?.id}
            onSave={save}
            onCancel={() => setEditor(null)}
          />
        ) : null}
      </div>
      <details className={styles.sync}>
        <summary>Lembretes do iPhone</summary>
        <p>
          A conexão com o Lembretes será configurada em uma próxima etapa. O
          fluxo previsto inclui enviar tarefas, sincronizar alterações e
          conclusões, consultar a última sincronização e repetir envios com
          falha.
        </p>
      </details>
    </section>
  );
}
