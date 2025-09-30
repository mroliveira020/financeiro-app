import React, { useMemo, useState } from "react";

function LancamentosTable({ lancamentos, onEdit, onDelete, tipo = "completo", editable = false }) {
  const [sortConfig, setSortConfig] = useState({ key: "data", direction: "asc" });
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 30;

  const getSituacaoIcone = (id_situacao) => {
    return id_situacao === 1 ? "✅" : "🕒";
  };

  const getSortableValue = (item, key) => {
    if (key === "data") {
      const [dia, mes, ano] = item.data.split("/");
      return new Date(`${ano}-${mes}-${dia}`);
    }
    if (key === "valor") {
      return parseFloat(item.valor) || 0;
    }
    return item[key]?.toString().toLowerCase();
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

  const totalPages = Math.ceil(sortedLancamentos.length / itemsPerPage);
  const paginatedLancamentos = sortedLancamentos.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleSort = (key) => {
    let direction = "asc";
    if (sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    }
    setSortConfig({ key, direction });
  };

  const handlePrevPage = () => {
    if (currentPage > 1) setCurrentPage(currentPage - 1);
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) setCurrentPage(currentPage + 1);
  };

  return (
    <>
      <table className="transacoes-table table table-sm align-middle small">
        <thead>
          <tr>
            <th
              className="cursor-pointer"
              onClick={() => handleSort("data")}
            >
              Data {sortConfig.key === "data" && (sortConfig.direction === "asc" ? "▲" : "▼")}
            </th>
            <th
              className="cursor-pointer"
              onClick={() => handleSort("descricao")}
            >
              Descrição {sortConfig.key === "descricao" && (sortConfig.direction === "asc" ? "▲" : "▼")}
            </th>
            {tipo === "completo" && (
              <th
                className="cursor-pointer"
                onClick={() => handleSort("nome_categoria")}
              >
                Categoria {sortConfig.key === "nome_categoria" && (sortConfig.direction === "asc" ? "▲" : "▼")}
              </th>
            )}
            {tipo === "completo" && (
              <th
                className="cursor-pointer text-end"
                onClick={() => handleSort("valor")}
              >
                Valor {sortConfig.key === "valor" && (sortConfig.direction === "asc" ? "▲" : "▼")}
              </th>
            )}
            <th className="text-end" style={{ width: "120px" }}></th>
          </tr>
        </thead>

        <tbody>
          {paginatedLancamentos.length === 0 ? (
            <tr>
              <td colSpan={tipo === "completo" ? 5 : 4} className="text-center">
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

      {/* Paginação */}
      <div className="transacoes-table__pagination d-flex justify-content-between align-items-center mt-2">
        <small className="text-muted">
          Página {currentPage} de {totalPages || 1}
        </small>

        <div className="transacoes-table__pagination-actions">
          <button
            className="btn btn-outline-secondary btn-sm me-2"
            onClick={handlePrevPage}
            disabled={currentPage === 1}
          >
            ◀ Anterior
          </button>
          <button
            className="btn btn-outline-secondary btn-sm"
            onClick={handleNextPage}
            disabled={currentPage === totalPages || totalPages === 0}
          >
            Próxima ▶
          </button>
        </div>
      </div>
    </>
  );
}

export default LancamentosTable;
