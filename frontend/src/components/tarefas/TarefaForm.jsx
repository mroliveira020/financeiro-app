import React, { useEffect, useState } from "react";
import { buscarOpcoesTarefas } from "../../services/tarefas";
import styles from "./Tarefas.module.css";

export default function TarefaForm({
  initial,
  context,
  intencao,
  saving,
  error,
  onSave,
  onCancel,
  userId,
}) {
  const [draft, setDraft] = useState({
    ...initial,
    arquivada: Boolean(initial.arquivada_em),
  });
  const [search, setSearch] = useState("");
  const [options, setOptions] = useState({
    adquiridos: [],
    capturados: [],
    responsaveis: [],
  });
  const [optionsError, setOptionsError] = useState("");
  const [loading, setLoading] = useState(false);
  const code = draft.numero_bem || "";
  const propertyId = draft.imovel_id || "";
  const readonly = Boolean(initial.intencao_retirada_em);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      buscarOpcoesTarefas(
        { busca: search, numero_bem: code, imovel_id: propertyId },
        controller.signal,
      )
        .then((data) => {
          if (!controller.signal.aborted) {
            setOptions(data);
            setOptionsError("");
          }
        })
        .catch(() => {
          if (!controller.signal.aborted)
            setOptionsError(
              "Não foi possível carregar as opções de imóveis e responsáveis.",
            );
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [search, code, propertyId]);
  const set = (field, value) => setDraft((old) => ({ ...old, [field]: value }));
  const selected = code ? `p:${code}` : propertyId ? `i:${propertyId}` : "";
  const propertyOptions = [
    ...options.capturados.map((p) => ({
      value: `p:${p.numero_bem}`,
      label: [p.cidade, p.uf, p.bairro, p.numero_bem]
        .filter(Boolean)
        .join(" · "),
    })),
    ...options.adquiridos.map((p) => ({
      value: `i:${p.id}`,
      label: `${p.nome} · Adquirido`,
    })),
  ];
  if (selected && !propertyOptions.some((p) => p.value === selected))
    propertyOptions.unshift({
      value: selected,
      label:
        initial.imovel_nome || context?.nome || code || `Imóvel ${propertyId}`,
    });
  const responsibleOptions = [...options.responsaveis];
  if (
    draft.responsavel_id &&
    !responsibleOptions.some((p) => `${p.id}` === `${draft.responsavel_id}`)
  )
    responsibleOptions.push({
      id: draft.responsavel_id,
      nome:
        initial.responsavel_nome ||
        (`${draft.responsavel_id}` === `${userId}`
          ? "Você"
          : "Responsável atual"),
    });
  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        if (!saving && !readonly) onSave(draft);
      }}
    >
      <header>
        <h2>{initial.versao ? "Detalhes da tarefa" : "Nova tarefa"}</h2>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          aria-label="Fechar formulário"
        >
          ×
        </button>
      </header>
      {error ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}
      {optionsError ? (
        <p role="alert" className={styles.error}>
          {optionsError}
        </p>
      ) : null}
      {readonly ? (
        <p className={styles.notice}>
          A intenção foi retirada. Esta tarefa permanece disponível para
          consulta do histórico.
        </p>
      ) : null}
      <fieldset disabled={saving || readonly}>
        <label>
          Título
          <input
            autoFocus
            required
            maxLength={200}
            value={draft.titulo}
            onChange={(e) => set("titulo", e.target.value)}
          />
        </label>
        {!context ? (
          <label>
            Buscar imóvel
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cidade, bairro ou código"
            />
          </label>
        ) : null}
        <label>
          Imóvel
          <select
            required
            disabled={
              Boolean(context) ||
              Boolean(initial.versao && initial.origem === "preparacao")
            }
            value={selected}
            onChange={(event) => {
              const [tipo, ...id] = event.target.value.split(":");
              setDraft((old) => ({
                ...old,
                numero_bem: tipo === "p" ? id.join(":") : null,
                imovel_id: tipo === "i" ? Number(id[0]) : null,
                responsavel_id: userId,
              }));
            }}
          >
            <option value="">Selecione um imóvel</option>
            {propertyOptions.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        {loading ? <small role="status">Carregando opções…</small> : null}
        <label>
          Descrição
          <textarea
            rows={5}
            maxLength={10000}
            value={draft.descricao}
            onChange={(e) => set("descricao", e.target.value)}
          />
        </label>
        <div className={styles.formColumns}>
          <label>
            Responsável
            <select
              value={draft.responsavel_id || ""}
              onChange={(e) =>
                set(
                  "responsavel_id",
                  e.target.value ? Number(e.target.value) : null,
                )
              }
            >
              <option value="">Sem responsável</option>
              {responsibleOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </label>
          <label>
            Prazo
            <input
              type="date"
              value={draft.prazo || ""}
              onChange={(e) => set("prazo", e.target.value)}
            />
          </label>
        </div>
        <label>
          Situação
          <select
            value={draft.situacao}
            onChange={(e) => set("situacao", e.target.value)}
          >
            <option value="a_fazer">A fazer</option>
            <option value="concluida">Concluída</option>
          </select>
        </label>
        {context?.numero_bem && intencao && !initial.versao ? (
          <label>
            Origem
            <select
              value={draft.origem}
              onChange={(e) =>
                setDraft((old) => ({
                  ...old,
                  origem: e.target.value,
                  intencao_id:
                    e.target.value === "preparacao" ? intencao.id : null,
                }))
              }
            >
              <option value="manual">Tarefa manual</option>
              <option value="preparacao">Preparação para arrematação</option>
            </select>
          </label>
        ) : null}
        <footer>
          <button type="button" onClick={onCancel}>
            Cancelar
          </button>
          <button
            type="submit"
            className={styles.primary}
            disabled={loading || !selected}
          >
            {saving ? "Salvando…" : "Salvar tarefa"}
          </button>
        </footer>
      </fieldset>
    </form>
  );
}
