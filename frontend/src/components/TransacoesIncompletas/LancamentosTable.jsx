import React, { useState } from "react";

const LancamentosTable = ({
  lancamentos,
  onEdit,
  onDelete,
  editable = false,
  selectedIds = [],
  onToggle,
  onToggleAll,
  allSelected = false,
}) => {
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

  const ordenarLancamentos = () => {
    let ordenados = [...lancamentos];

    if (sortConfig.key !== null) {
      ordenados.sort((a, b) => {
        let valorA = a[sortConfig.key];
        let valorB = b[sortConfig.key];

        if (sortConfig.key === 'valor') {
          valorA = parseFloat(valorA);
          valorB = parseFloat(valorB);
        } else if (sortConfig.key === 'data') {
          const [diaA, mesA, anoA] = valorA.split('/');
          const [diaB, mesB, anoB] = valorB.split('/');
          valorA = new Date(`${anoA}-${mesA}-${diaA}`);
          valorB = new Date(`${anoB}-${mesB}-${diaB}`);
        } else {
          valorA = valorA.toString().toLowerCase();
          valorB = valorB.toString().toLowerCase();
        }

        if (valorA < valorB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (valorA > valorB) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return ordenados;
  };

  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const getSortIcon = (key) => {
    if (sortConfig.key !== key) return '';
    return sortConfig.direction === 'asc' ? ' ▲' : ' ▼';
  };

  const lancamentosOrdenados = ordenarLancamentos();

  return (
    <div className="table-responsive small">
      <table className="table table-sm table-striped">
        <thead>
          <tr>
            {editable && (
              <th className="text-center" style={{ width: '36px' }}>
                <input
                  type="checkbox"
                  className="form-check-input"
                  checked={allSelected}
                  onChange={(event) => onToggleAll?.(event.target.checked)}
                />
              </th>
            )}
            <th onClick={() => handleSort('data')} style={{ cursor: 'pointer' }}>
              Data{getSortIcon('data')}
            </th>
            <th onClick={() => handleSort('descricao')} style={{ cursor: 'pointer' }}>
              Descrição{getSortIcon('descricao')}
            </th>
            <th
              onClick={() => handleSort('valor')}
              style={{ cursor: 'pointer' }}
              className="text-end"
            >
              Valor{getSortIcon('valor')}
            </th>
            {editable && <th className="text-center">Ações</th>}
          </tr>
        </thead>
        <tbody>
          {lancamentosOrdenados.length === 0 ? (
            <tr>
              <td colSpan={editable ? 5 : 3} className="text-center">Nenhum lançamento incompleto.</td>
            </tr>
          ) : (
            lancamentosOrdenados.map((lancamento) => (
              <tr key={lancamento.id_lancamento}>
                {editable && (
                  <td className="text-center">
                    <input
                      type="checkbox"
                      className="form-check-input"
                      checked={selectedIds.includes(lancamento.id_lancamento)}
                      onChange={(event) => {
                        event.stopPropagation();
                        onToggle?.(lancamento.id_lancamento, event.target.checked);
                      }}
                    />
                  </td>
                )}
                <td>{lancamento.data}</td>
                <td>{lancamento.descricao}</td>
                <td className="text-end">
                  {Number(lancamento.valor).toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL"
                  })}
                </td>
                {editable && (
                  <td className="text-center">
                    <button
                      className="btn btn-link btn-sm p-0 me-2"
                      onClick={(event) => {
                        event.stopPropagation();
                        onEdit(lancamento);
                      }}
                      title="Editar / Categorizar"
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
                  </td>
                )}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
};

export default LancamentosTable;
