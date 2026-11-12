import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

const defaults = {
  aba: "",
  fonte: "todas",
  busca: "",
  busca_campo: "",
  lance_min: "",
  lance_max: "",
  avaliados: "",
  uf: [],
  cidade: [],
  modalidade: [],
  financia: [],
  score: "",
  roi: "",
  pre_analise: false,
  presenca: "presentes",
  revisao: false,
  por_pagina: 20,
  pagina: 1,
  ordenar: "ultima_disputa",
  direcao: "desc",
  fila_ordenar: "dataLeilao",
  fila_direcao: "asc",
  fila_busca: "",
  fila_uf: "todos",
  fila_prioridade: "todas",
  fila_atividade: "ativos",
  fila_responsavel: "todos",
  fila_autor: "todos",
};

const options = {
  aba: ["capturados", "selecionados"],
  fonte: ["todas", "caixa", "tjdft"],
  avaliados: ["", "sim", "nao"],
  busca_campo: ["", "cidade", "bairro", "tipo"],
  presenca: ["presentes", "ausentes", "todos"],
  ordenar: ["ultima_disputa", "codigo", "cidade", "uf", "modalidade", "valor_minimo", "score_total", "retorno_pct"],
  direcao: ["asc", "desc"],
  fila_ordenar: ["dataLeilao", "prioridade", "cidade", "valorMaximo", "roi"],
  fila_direcao: ["asc", "desc"],
  fila_atividade: ["ativos", "inativos", "todos"],
};

function readParam(params, key, desktop = false) {
  const desktopDefaults = { por_pagina: 100, ordenar: "valor_minimo", direcao: "asc" };
  const fallback = desktop && key in desktopDefaults ? desktopDefaults[key] : defaults[key];
  if (Array.isArray(fallback)) return [...new Set(params.getAll(key).filter(Boolean))];
  const value = params.get(key);
  if (value === null) return fallback;
  if (typeof fallback === "boolean") return value === "1";
  if (key === "por_pagina") return [20, 50, 100].includes(Number(value)) ? Number(value) : fallback;
  if (key === "pagina") {
    const number = Number(value);
    return Number.isSafeInteger(number) && number > 0 ? number : fallback;
  }
  if (options[key] && !options[key].includes(value)) return fallback;
  if (["score", "roi"].includes(key) && !Number.isFinite(Number(value))) return fallback;
  if (["lance_min", "lance_max"].includes(key) && (!Number.isFinite(Number(value)) || Number(value) < 0)) return fallback;
  return value;
}

export default function useProspeccaoQuery({ desktop = false } = {}) {
  const [params, setParams] = useSearchParams();
  const latest = useRef({ params, setParams });
  const pending = useRef(null);
  const [searchDraft, setSearchDraft] = useState(null);

  useLayoutEffect(() => {
    latest.current = { params, setParams };
    return () => { pending.current = null; };
  }, [params, setParams]);

  const uf = JSON.stringify(params.getAll("uf"));
  const cidade = JSON.stringify(params.getAll("cidade"));
  const modalidade = JSON.stringify(params.getAll("modalidade"));
  const financia = JSON.stringify(params.getAll("financia"));
  const listFilters = useMemo(() => ({
    uf: JSON.parse(uf).filter(Boolean),
    cidade: JSON.parse(cidade).filter(Boolean),
    modalidade: JSON.parse(modalidade).filter(Boolean),
    financia: JSON.parse(financia).filter(Boolean),
  }), [uf, cidade, modalidade, financia]);

  const values = useMemo(() => ({
    ...Object.fromEntries(Object.keys(defaults).map((key) => [key, readParam(params, key, desktop)])),
    ...listFilters,
  }), [params, listFilters, desktop]);

  // Vários controles atualizam filtros e paginação no mesmo evento.
  const update = useCallback((key, nextValue) => {
    if (!pending.current) {
      const batch = new URLSearchParams(latest.current.params);
      pending.current = batch;
      queueMicrotask(() => {
        if (pending.current !== batch) return;
        pending.current = null;
        if (batch.toString() !== latest.current.params.toString()) {
          latest.current.setParams(batch, { replace: true, preventScrollReset: true });
        }
      });
    }
    const batch = pending.current;
    const value = typeof nextValue === "function" ? nextValue(readParam(batch, key, desktop)) : nextValue;
    batch.delete(key);
    if (Array.isArray(value)) {
      value.forEach((item) => batch.append(key, item));
    } else if (value !== readParam(new URLSearchParams(), key, desktop)) {
      batch.set(key, value === true ? "1" : String(value));
    }
    // Atualiza o input no próprio evento para preservar a posição do cursor.
    if (["fila_busca", "busca"].includes(key)) {
      setSearchDraft({ source: latest.current.params, value, key });
    }
  }, [desktop]);

  const setters = useMemo(() => Object.fromEntries(
    Object.keys(defaults).map((key) => [key, (value) => update(key, value)])
  ), [update]);

  return [
    searchDraft?.source === params ? { ...values, [searchDraft.key]: searchDraft.value } : values,
    setters,
  ];
}
