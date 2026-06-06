import React, { useMemo, useState } from "react";
import { useCompactLayout } from "../../hooks/useCompactLayout";

function LancamentosTable({
  lancamentos,
  onEdit,
  onDelete,
  editable = false,
  categorias = [],
  imoveis = [],
  draftValues = {},
  originalValues = {},
  dirtyMap = {},
  onFieldChange,
  onApplyRow,
  rowSaving = {},
  serverPagination = null,
  loading = false,
}) {
  const [sortConfig, setSortConfig] = useState({ key: "data", direction: "desc" });
  const compactLayout = useCompactLayout();
  const isServerMode = Boolean(serverPagination);
  const totalRegistros = isServerMode ? serverPagination.total ?? 0 : lancamentos.length;
  const pageSize = isServerMode ? serverPagination.pageSize || 50 : totalRegistros || 1;
  const totalPages = Math.max(1, Math.ceil(totalRegistros / pageSize));
  const currentPage = isServerMode ? serverPagination.page || 1 : 1;

  const getSituacaoIcone = (id_situacao) => (id_situacao === 1 ? "✅" : "🕒");

  const getSortableValue = (item, key) => {
    if (key === "data") {
      const [dia, mes, ano] = item.data.split("/");
      return new Date(`${ano}-${mes}-${dia}`);
    }
    if (key === "valor") {
      return Number(item.valor) || 0;
    }
    const raw = item[key];
    if (raw === null || raw === undefined) {
      return "";
    }
    return raw.toString().toLowerCase();
  };

  const sortedLancamentos = useMemo(() => {
    return [...lancamentos].sort((a, b) => {
      const aVal = getSortableValue(a, sortConfig.key);
      const bVal = getSortableValue(b, sortConfig.key);

      if (aVal < bVal) return sortConfig.direction === "asc" ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });
  }, [lancamentos, sortConfig]);

  const handleSort = (key) => {
    let direction = "asc";
    if (sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    }
    setSortConfig({ key, direction });
  };

  const getValorCampo = (lancamentoId, campo, fallback) => {
    const draft = draftValues[lancamentoId];
    if (draft && draft[campo] !== undefined) {
      return draft[campo];
    }
    const original = originalValues[lancamentoId];
    if (original && original[campo] !== undefined) {
      return original[campo];
    }
    if (fallback === null || fallback === undefined) {
      return "";
    }
    return String(fallback);
  };

  const renderCategoriaSelect = (lancamento) => {
    if (!editable) {
      return lancamento.nome_categoria || "—";
    }
    const valor = getValorCampo(lancamento.id_lancamento, "id_categoria", lancamento.id_categoria);
    const disabled = !!rowSaving[lancamento.id_lancamento];
    return (
      <select
        className="form-select form-select-sm"
        value={valor}
        onChange={(event) => onFieldChange?.(lancamento.id_lancamento, "id_categoria", event.target.value)}
        disabled={disabled}
      >
        <option value="">-- manter atual --</option>
        <option value="0">Sem categoria (pendente)</option>
        {categorias.map((categoria) => (
          <option key={categoria.id} value={String(categoria.id)}>
            {categoria.categoria}
          </option>
        ))}
      </select>
    );
  };

  const renderImovelSelect = (lancamento) => {
    if (!editable) {
      return lancamento.nome_imovel || "—";
    }
    const valor = getValorCampo(lancamento.id_lancamento, "id_imovel", lancamento.id_imovel);
    const disabled = !!rowSaving[lancamento.id_lancamento];
    return (
      <select
        className="form-select form-select-sm"
        value={valor}
        onChange={(event) => onFieldChange?.(lancamento.id_lancamento, "id_imovel", event.target.value)}
        disabled={disabled}
      >
        <option value="">-- manter atual --</option>
        {imoveis.map((imovel) => (
          <option key={imovel.id} value={String(imovel.id)}>
            {imovel.nome}
          </option>
        ))}
      </select>
    );
  };

  const renderSituacaoSelect = (lancamento) => {
    if (!editable) {
      return lancamento.nome_situacao || "—";
    }
    const valor = getValorCampo(lancamento.id_lancamento, "id_situacao", lancamento.id_situacao ?? 0);
    const disabled = !!rowSaving[lancamento.id_lancamento];
    return (
      <select
        className="form-select form-select-sm"
        value={valor}
        onChange={(event) => onFieldChange?.(lancamento.id_lancamento, "id_situacao", event.target.value)}
        disabled={disabled}
      >
        <option value="">-- manter atual --</option>
        <option value="0">Pendente</option>
        <option value="1">Confirmado</option>
      </select>
    );
  };

  if (compactLayout) {
    return (
      <div className="transacoes-mobile-list">
        {loading ? (
          <div className="transacoes-mobile-empty">Carregando...</div>
        ) : !loading && sortedLancamentos.length === 0 ? (
          <div className="transacoes-mobile-empty">Nenhum lançamento incompleto.</div>
        ) : (
          sortedLancamentos.map((lancamento) => {
            const rowDirty = !!dirtyMap[lancamento.id_lancamento];
            const saving = !!rowSaving[lancamento.id_lancamento];
            const podeAplicar = rowDirty && !saving;
            return (
              <article
                key={lancamento.id_lancamento}
                className={`transacoes-mobile-card ${rowDirty ? "is-dirty" : ""}`.trim()}
              >
                <div className="transacoes-mobile-card__head">
                  <strong>{lancamento.descricao}</strong>
                  <span>{lancamento.data}</span>
                </div>
                <div className="transacoes-mobile-card__body">
                  <div>
                    <span>Categoria</span>
                    <div className="transacoes-mobile-card__field">{renderCategoriaSelect(lancamento)}</div>
                  </div>
                  <div>
                    <span>Imóvel</span>
                    <div className="transacoes-mobile-card__field">{renderImovelSelect(lancamento)}</div>
                  </div>
                  <div>
                    <span>Situação</span>
                    <div className="transacoes-mobile-card__field">{renderSituacaoSelect(lancamento)}</div>
                  </div>
                  <div>
                    <span>Valor</span>
                    <strong>
                      {Number(lancamento.valor).toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      })}
                    </strong>
                  </div>
                </div>
                <div className="transacoes-mobile-card__actions">
                  {editable && (
                    <button
                      type="button"
                      className="btn btn-outline-secondary btn-sm"
                      onClick={() => onApplyRow?.(lancamento.id_lancamento)}
                      disabled={!podeAplicar}
                    >
                      {saving ? "Salvando..." : "Aplicar"}
                    </button>
                  )}
                  {editable && (
                    <button
                      type="button"
                      className="btn btn-outline-secondary btn-sm"
                      onClick={() => onEdit?.(lancamento)}
                    >
                      Editar
                    </button>
                  )}
                  {editable && (
                    <button
                      type="button"
                      className="btn btn-outline-danger btn-sm"
                      onClick={() => onDelete?.(lancamento.id_lancamento)}
                    >
                      Excluir
                    </button>
                  )}
                </div>
              </article>
            );
          })
        )}
        <div className="transacoes-table__pagination d-flex justify-content-between align-items-center mt-2">
          <small className="text-muted">
            Página {totalPages === 0 ? 0 : currentPage} de {totalPages}
          </small>
          {isServerMode && (
            <div className="transacoes-table__pagination-actions">
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm me-2"
                onClick={() => serverPagination.onPageChange?.(Math.max(1, currentPage - 1))}
                disabled={loading || currentPage <= 1}
              >
                ◀ Anterior
              </button>
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm"
                onClick={() => serverPagination.onPageChange?.(Math.min(totalPages, currentPage + 1))}
                disabled={loading || currentPage >= totalPages}
              >
                Próxima ▶
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="table-responsive small">
      <table className="table table-sm table-striped">
        <thead>
          <tr>
            <th onClick={() => handleSort('data')} style={{ cursor: 'pointer' }}>
              Data {sortConfig.key === "data" && (sortConfig.direction === "asc" ? "▲" : "▼")}
            </th>
            <th onClick={() => handleSort('descricao')} style={{ cursor: 'pointer' }}>
              Descrição {sortConfig.key === "descricao" && (sortConfig.direction === "asc" ? "▲" : "▼")}
            </th>
            <th>Categoria</th>
            <th>Imóvel</th>
            <th>Situação</th>
            <th className="text-end">Valor</th>
            <th className="text-end" style={{ width: "160px" }}>Ações</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={7} className="text-center">Carregando...</td>
            </tr>
          ) : !loading && sortedLancamentos.length === 0 ? (
            <tr>
              <td colSpan={7} className="text-center">Nenhum lançamento incompleto.</td>
            </tr>
          ) : (
            sortedLancamentos.map((lancamento) => {
              const rowDirty = !!dirtyMap[lancamento.id_lancamento];
              const saving = !!rowSaving[lancamento.id_lancamento];
              const podeAplicar = rowDirty && !saving;
              return (
                <tr
                  key={lancamento.id_lancamento}
                  className={rowDirty ? "table-warning" : undefined}
                >
                  <td>{lancamento.data}</td>
                  <td className="transacoes-table__cell transacoes-table__cell--description" title={lancamento.descricao}>
                    {lancamento.descricao}
                  </td>
                  <td>{renderCategoriaSelect(lancamento)}</td>
                  <td>{renderImovelSelect(lancamento)}</td>
                  <td className="text-center">
                    <div className="d-flex align-items-center justify-content-center gap-2">
                      {renderSituacaoSelect(lancamento)}
                      <span title={lancamento.nome_situacao || ''}>
                        {getSituacaoIcone(Number(getValorCampo(lancamento.id_lancamento, "id_situacao", lancamento.id_situacao ?? 0)))}
                      </span>
                    </div>
                  </td>
                  <td className="text-end">
                    {Number(lancamento.valor).toLocaleString("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    })}
                  </td>
                  <td className="text-end">
                    <div className="d-inline-flex align-items-center justify-content-end gap-2">
                      {editable && (
                        <button
                          type="button"
                          className="btn btn-link btn-sm p-0"
                          onClick={() => onApplyRow?.(lancamento.id_lancamento)}
                          disabled={!podeAplicar}
                          title={rowDirty ? 'Aplicar alterações desta linha' : 'Nenhuma alteração nesta linha'}
                        >
                          {saving ? '⏳' : '💾'}
                        </button>
                      )}
                      {editable && (
                        <button
                          type="button"
                          className="btn btn-link btn-sm p-0"
                          onClick={() => onEdit?.(lancamento)}
                          title="Editar"
                        >
                          ✏️
                        </button>
                      )}
                      {editable && (
                        <button
                          type="button"
                          className="btn btn-link btn-sm p-0"
                          onClick={() => onDelete?.(lancamento.id_lancamento)}
                          title="Excluir"
                        >
                          🗑️
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
      <div className="d-flex justify-content-between align-items-center small mt-2">
        <span className="text-muted">
          Página {totalPages === 0 ? 0 : currentPage} de {totalPages}
        </span>
        {isServerMode && (
          <div className="d-inline-flex gap-2">
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm"
              onClick={() => serverPagination.onPageChange?.(Math.max(1, currentPage - 1))}
              disabled={loading || currentPage <= 1}
            >
              ◀ Anterior
            </button>
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm"
              onClick={() => serverPagination.onPageChange?.(Math.min(totalPages, currentPage + 1))}
              disabled={loading || currentPage >= totalPages}
            >
              Próxima ▶
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default LancamentosTable;
