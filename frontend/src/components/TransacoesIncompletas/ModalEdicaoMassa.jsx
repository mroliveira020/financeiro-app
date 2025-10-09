import React from "react";

const ModalEdicaoMassa = ({
  stats,
  formState,
  setFormState,
  onApply,
  categorias,
  imoveis,
  disabled,
}) => {
  const handleChange = (field) => (event) => {
    setFormState((prev) => ({
      ...prev,
      [field]: event.target.value,
    }));
  };

  return (
    <div
      className="modal fade"
      id="modalEdicaoMassa"
      tabIndex="-1"
      aria-labelledby="modalEdicaoMassaLabel"
      aria-hidden="true"
    >
      <div className="modal-dialog modal-dialog-centered modal-lg">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title" id="modalEdicaoMassaLabel">
              Editar transações selecionadas
            </h5>
            <button type="button" className="btn-close" data-bs-dismiss="modal" aria-label="Close" />
          </div>

          <div className="modal-body">
            <div className="alert alert-info small" role="alert">
              <strong>{stats.count}</strong> transações serão atualizadas. Valores deixados em branco permanecerão inalterados.
              {stats.totalSelecionado !== null && (
                <>
                  {' '}Total atual: <strong>{stats.totalSelecionado}</strong>
                </>
              )}
            </div>

            <div className="row g-3">
              <div className="col-md-6 col-12">
                <label className="form-label small text-uppercase text-muted">Categoria</label>
                <select
                  className="form-select form-select-sm"
                  value={formState.id_categoria}
                  onChange={handleChange('id_categoria')}
                >
                  <option value="">-- manter atual --</option>
                  <option value="0">Sem categoria (pendente)</option>
                  {categorias.map((categoria) => (
                    <option key={categoria.id} value={categoria.id}>
                      {categoria.categoria}
                    </option>
                  ))}
                </select>
              </div>

              <div className="col-md-6 col-12">
                <label className="form-label small text-uppercase text-muted">Imóvel</label>
                <select
                  className="form-select form-select-sm"
                  value={formState.id_imovel}
                  onChange={handleChange('id_imovel')}
                >
                  <option value="">-- manter atual --</option>
                  {imoveis.map((imovel) => (
                    <option key={imovel.id} value={imovel.id}>
                      {imovel.nome}
                    </option>
                  ))}
                </select>
              </div>

              <div className="col-md-4 col-12">
                <label className="form-label small text-uppercase text-muted">Situação</label>
                <select
                  className="form-select form-select-sm"
                  value={formState.id_situacao}
                  onChange={handleChange('id_situacao')}
                >
                  <option value="">-- manter atual --</option>
                  <option value="0">Pendente</option>
                  <option value="1">Confirmado</option>
                </select>
              </div>

              <div className="col-md-4 col-12">
                <label className="form-label small text-uppercase text-muted">Data</label>
                <input
                  type="text"
                  className="form-control form-control-sm"
                  placeholder="DD/MM/AAAA"
                  value={formState.data}
                  onChange={handleChange('data')}
                />
              </div>

              <div className="col-md-4 col-12">
                <label className="form-label small text-uppercase text-muted">Valor</label>
                <input
                  type="text"
                  className="form-control form-control-sm"
                  placeholder="Use ponto ou vírgula"
                  value={formState.valor}
                  onChange={handleChange('valor')}
                />
              </div>

              <div className="col-12">
                <label className="form-label small text-uppercase text-muted">Descrição</label>
                <input
                  type="text"
                  className="form-control form-control-sm"
                  placeholder="Manter vazio para não alterar"
                  value={formState.descricao}
                  onChange={handleChange('descricao')}
                />
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <button
              className="btn btn-secondary btn-sm"
              data-bs-dismiss="modal"
              type="button"
            >
              Cancelar
            </button>
            <button
              className="btn btn-primary btn-sm"
              type="button"
              onClick={onApply}
              disabled={disabled}
            >
              {disabled ? 'Aplicando...' : 'Aplicar alterações'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ModalEdicaoMassa;
