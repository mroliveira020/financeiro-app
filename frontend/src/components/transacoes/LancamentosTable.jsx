import React, { useEffect, useMemo, useState } from "react";
import { useCompactLayout } from "../../hooks/useCompactLayout";

function LancamentosTable({
  lancamentos,
  onEdit,
  onDelete,
  tipo = "completo",
  editable = false,
  serverPagination = null,
  loading = false,
  enableSorting = true,
}) {
  const [sortConfig, setSortConfig] = useState({ key: "data", direction: "desc" });
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 30;
  const compactLayout = useCompactLayout();

  const isServerMode = Boolean(serverPagination);
  const effectivePage = isServerMode ? (serverPagination.page || 1) : currentPage;
  const pageSize = isServerMode ? (serverPagination.pageSize || itemsPerPage) : itemsPerPage;

  const getSituacaoIcone = (id_situacao) => {
    return id_situacao === 1 ? "✅" : "🕒";
  };

  const formatarMoeda = (valor) =>
    Number(valor).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });

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
    if (!enableSorting) {
      return lancamentos;
    }
    return [...lancamentos].sort((a, b) => {
      const aVal = getSortableValue(a, sortConfig.key);
      const bVal = getSortableValue(b, sortConfig.key);

      if (aVal < bVal) return sortConfig.direction === "asc" ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });
  }, [lancamentos, sortConfig, enableSorting]);

  const paginatedLancamentos = useMemo(() => {
    if (isServerMode) {
      return sortedLancamentos;
    }
    return sortedLancamentos.slice(
      (currentPage - 1) * itemsPerPage,
      currentPage * itemsPerPage,
    );
  }, [sortedLancamentos, currentPage, isServerMode]);

  const totalRegistros = isServerMode
    ? serverPagination.total ?? 0
    : sortedLancamentos.length;

  const totalPages = Math.max(1, Math.ceil(totalRegistros / pageSize));

  const handleSort = (key) => {
    if (!enableSorting) {
      return;
    }
    let direction = "asc";
    if (sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    }
    setSortConfig({ key, direction });
    if (!isServerMode) {
      setCurrentPage(1);
    }
  };

  const handlePrevPage = () => {
    if (isServerMode) {
      if (effectivePage > 1) {
        serverPagination.onPageChange?.(effectivePage - 1);
      }
      return;
    }
    if (currentPage > 1) setCurrentPage(currentPage - 1);
  };

  const handleNextPage = () => {
    if (isServerMode) {
      if (effectivePage < totalPages) {
        serverPagination.onPageChange?.(effectivePage + 1);
      }
      return;
    }
    if (currentPage < totalPages) setCurrentPage(currentPage + 1);
  };

  useEffect(() => {
    if (!isServerMode) {
      setCurrentPage(1);
    }
  }, [lancamentos, isServerMode]);

  useEffect(() => {
    if (!isServerMode && currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages, isServerMode]);

  return (
    <>
      {compactLayout ? (
        <div className="transacoes-mobile-list">
          {loading ? (
            <div className="transacoes-mobile-empty">Carregando...</div>
          ) : !loading && paginatedLancamentos.length === 0 ? (
            <div className="transacoes-mobile-empty">Nenhuma transação encontrada.</div>
          ) : (
            paginatedLancamentos.map((lancamento) => (
              <article
                key={lancamento.id_lancamento}
                className={`transacoes-mobile-card ${editable ? "is-clickable" : ""} ${tipo === "completo" ? "is-compact" : ""}`.trim()}
                onClick={() => {
                  if (editable && typeof onEdit === "function") {
                    onEdit(lancamento);
                  }
                }}
              >
                {tipo === "completo" ? (
                  <>
                    <div className="transacoes-mobile-card__compact-top">
                      <div className="transacoes-mobile-card__compact-main">
                        <strong>{lancamento.descricao}</strong>
                        <small>{lancamento.data}</small>
                      </div>
                      <div className="transacoes-mobile-card__compact-value">
                        <strong>{formatarMoeda(lancamento.valor)}</strong>
                        <span>{getSituacaoIcone(lancamento.id_situacao)} {lancamento.nome_situacao || "—"}</span>
                      </div>
                    </div>
                    <div className="transacoes-mobile-card__compact-meta">
                      <span className="transacoes-mobile-card__chip">
                        {lancamento.nome_categoria || "Sem categoria"}
                      </span>
                      <span className="transacoes-mobile-card__meta-text">
                        Pago por {lancamento.paid_by_user_name || lancamento.paid_by_user_email || "—"}
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="transacoes-mobile-card__head">
                      <strong>{lancamento.descricao}</strong>
                      <span>{lancamento.data}</span>
                    </div>
                    <div className="transacoes-mobile-card__body">
                      <div>
                        <span>Valor</span>
                        <strong>{formatarMoeda(lancamento.valor)}</strong>
                      </div>
                      <div>
                        <span>Situação</span>
                        <strong>
                          {getSituacaoIcone(lancamento.id_situacao)} {lancamento.nome_situacao || "—"}
                        </strong>
                      </div>
                    </div>
                  </>
                )}
                <div className="transacoes-mobile-card__actions">
                  {editable && (
                    <>
                      <button
                        className="btn btn-outline-secondary btn-sm"
                        onClick={(event) => {
                          event.stopPropagation();
                          onEdit(lancamento);
                        }}
                        title="Editar"
                      >
                        Editar
                      </button>
                      <button
                        className="btn btn-outline-danger btn-sm"
                        onClick={(event) => {
                          event.stopPropagation();
                          onDelete(lancamento.id_lancamento);
                        }}
                        title="Excluir"
                      >
                        Excluir
                      </button>
                    </>
                  )}
                </div>
              </article>
            ))
          )}
        </div>
      ) : (
        <table className="transacoes-table table table-sm align-middle small">
          <thead>
            <tr>
              <th
                className={enableSorting ? "cursor-pointer" : undefined}
                onClick={enableSorting ? () => handleSort("data") : undefined}
              >
                Data {sortConfig.key === "data" && (sortConfig.direction === "asc" ? "▲" : "▼")}
              </th>
              <th
                className={enableSorting ? "cursor-pointer" : undefined}
                onClick={enableSorting ? () => handleSort("descricao") : undefined}
              >
                Descrição {sortConfig.key === "descricao" && (sortConfig.direction === "asc" ? "▲" : "▼")}
              </th>
              {tipo === "completo" && (
                <th
                  className={enableSorting ? "cursor-pointer" : undefined}
                  onClick={enableSorting ? () => handleSort("nome_categoria") : undefined}
                >
                  Categoria {sortConfig.key === "nome_categoria" && (sortConfig.direction === "asc" ? "▲" : "▼")}
                </th>
              )}
              {tipo === "completo" && (
                <th
                  className={enableSorting ? "cursor-pointer" : undefined}
                  onClick={enableSorting ? () => handleSort("paid_by_user_name") : undefined}
                >
                  Quem pagou {sortConfig.key === "paid_by_user_name" && (sortConfig.direction === "asc" ? "▲" : "▼")}
                </th>
              )}
              {tipo === "completo" && (
                <th
                  className={enableSorting ? "cursor-pointer text-end" : "text-end"}
                  onClick={enableSorting ? () => handleSort("valor") : undefined}
                >
                  Valor {sortConfig.key === "valor" && (sortConfig.direction === "asc" ? "▲" : "▼")}
                </th>
              )}
              <th className="text-end" style={{ width: "120px" }}></th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan={tipo === "completo" ? 6 : 4} className="text-center">
                  Carregando...
                </td>
              </tr>
            ) : !loading && paginatedLancamentos.length === 0 ? (
              <tr>
                <td colSpan={tipo === "completo" ? 6 : 4} className="text-center">
                  Nenhuma transação encontrada.
                </td>
              </tr>
            ) : (
              paginatedLancamentos.map((lancamento) => (
                <tr
                  key={lancamento.id_lancamento}
                  className={editable ? "transacoes-table__row--clickable" : undefined}
                  onClick={() => {
                    if (editable && typeof onEdit === "function") {
                      onEdit(lancamento);
                    }
                  }}
                >
                  <td className="transacoes-table__cell transacoes-table__cell--date">{lancamento.data}</td>
                  <td
                    className="transacoes-table__cell transacoes-table__cell--description"
                    title={lancamento.descricao}
                  >
                    {lancamento.descricao}
                  </td>

                  {tipo === "completo" && (
                    <td className="transacoes-table__cell transacoes-table__cell--categoria">
                      <span className="transacoes-table__chip" title={lancamento.nome_categoria}>
                        {lancamento.nome_categoria}
                      </span>
                    </td>
                  )}

                  {tipo === "completo" && (
                    <td className="transacoes-table__cell">
                      {lancamento.paid_by_user_name || lancamento.paid_by_user_email || "—"}
                    </td>
                  )}

                  {tipo === "completo" && (
                    <td className="transacoes-table__cell text-end">
                      {Number(lancamento.valor).toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      })}
                    </td>
                  )}

                  <td className="text-end">
                    <span
                      className="me-2"
                      title={lancamento.nome_situacao}
                      style={{ cursor: "default" }}
                    >
                      {getSituacaoIcone(lancamento.id_situacao)}
                    </span>
                    {editable && (
                      <>
                        <button
                          className="btn btn-link btn-sm p-0 me-2"
                          onClick={(event) => {
                            event.stopPropagation();
                            onEdit(lancamento);
                          }}
                          title="Editar"
                        >
                          ✏️
                        </button>

                        <button
                          className="btn btn-link btn-sm p-0"
                          onClick={(event) => {
                            event.stopPropagation();
                            onDelete(lancamento.id_lancamento);
                          }}
                          title="Excluir"
                        >
                          🗑️
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      )}

      {/* Paginação */}
      <div className="transacoes-table__pagination d-flex justify-content-between align-items-center mt-2">
        <small className="text-muted">
          Página {totalPages === 0 ? 0 : effectivePage} de {totalPages}
        </small>

        <div className="transacoes-table__pagination-actions">
          <button
            className="btn btn-outline-secondary btn-sm me-2"
            onClick={handlePrevPage}
            disabled={loading || effectivePage === 1}
          >
            ◀ Anterior
          </button>
          <button
            className="btn btn-outline-secondary btn-sm"
            onClick={handleNextPage}
            disabled={loading || effectivePage === totalPages || totalPages === 0}
          >
            Próxima ▶
          </button>
        </div>
      </div>
    </>
  );
}

export default LancamentosTable;
