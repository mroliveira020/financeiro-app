import { useEffect, useId, useState } from "react";
import { fetchSugestoesProspec } from "../../services/prospeccoes";
import styles from "./ProspeccoesDesktop.module.css";

const categories = {
  cidade: "Cidade",
  bairro: "Bairro",
  tipo: "Tipo de imóvel",
};

export default function ProspeccaoSearch({
  value,
  ufs,
  onChange,
  onSelect,
  category,
  multiple = false,
  selectedValues = [],
  label = "Buscar imóveis",
  placeholder = "Ex.: casa, cidade ou código",
}) {
  const listId = useId();
  const [options, setOptions] = useState([]);
  const [expanded, setExpanded] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [status, setStatus] = useState("");
  const ufKey = JSON.stringify(ufs);

  useEffect(() => {
    const controller = new AbortController();
    setOptions([]);
    setActiveIndex(-1);
    if (value.trim().length < 2 && category !== "cidade") {
      setStatus("");
      return () => controller.abort();
    }
    setStatus("loading");
    const timer = window.setTimeout(async () => {
      try {
        const result = await fetchSugestoesProspec(
          value.trim(),
          JSON.parse(ufKey),
          controller.signal,
          category,
        );
        if (controller.signal.aborted) return;
        setOptions(
          category
            ? result.filter((option) => option.categoria === category)
            : result,
        );
        setStatus("ready");
      } catch {
        if (!controller.signal.aborted) setStatus("error");
      }
    }, 250);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [value, ufKey, category]);

  const showMenu =
    expanded && (value.trim().length >= 2 || category === "cidade");

  function select(option) {
    onSelect(option);
    setExpanded(multiple);
    setActiveIndex(-1);
  }

  function handleKeys(event) {
    if (event.key === "Escape") setExpanded(false);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setExpanded(true);
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((current) =>
        options.length
          ? current < 0
            ? direction > 0
              ? 0
              : options.length - 1
            : (current + direction + options.length) % options.length
          : -1,
      );
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (showMenu && options[activeIndex]) select(options[activeIndex]);
      else setExpanded(false);
    }
  }

  return (
    <div className={styles.searchContainer}>
      <label className={styles.field}>
        <span>{label}</span>
        <input
          type="search"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showMenu}
          aria-controls={listId}
          aria-activedescendant={
            showMenu && activeIndex >= 0
              ? `${listId}-${activeIndex}`
              : undefined
          }
          value={value}
          placeholder={placeholder}
          title={
            category === "cidade"
              ? "Pesquise e selecione uma ou mais cidades"
              : "Busca em cidade, bairro, código, tipo e descrição do imóvel"
          }
          onChange={(event) => {
            onChange(event.target.value);
            setExpanded(true);
          }}
          onFocus={() => setExpanded(true)}
          onBlur={() => setExpanded(false)}
          onKeyDown={handleKeys}
          autoComplete="off"
        />
      </label>
      {showMenu && (
        <div className={styles.suggestions}>
          {status === "loading" && <p role="status">Buscando sugestões…</p>}
          {status === "error" && (
            <p role="status">
              Sugestões indisponíveis. Você pode continuar a busca pelo texto.
            </p>
          )}
          {status === "ready" && options.length === 0 && (
            <p role="status">
              {category === "cidade"
                ? "Nenhuma cidade encontrada"
                : `Buscar “${value}” no texto dos imóveis`}
            </p>
          )}
          <ul
            id={listId}
            role="listbox"
            aria-label={
              category === "cidade"
                ? "Selecionar cidades"
                : "Sugestões de busca"
            }
            aria-multiselectable={multiple || undefined}
          >
            {options.map((option, index) => (
              <li
                key={`${option.categoria}:${option.valor}`}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={
                  multiple
                    ? selectedValues.includes(option.valor)
                    : index === activeIndex
                }
                data-active={index === activeIndex}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => select(option)}
              >
                <strong>{option.valor}</strong>
                <span>
                  {multiple && selectedValues.includes(option.valor)
                    ? "Selecionada"
                    : categories[option.categoria]}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
