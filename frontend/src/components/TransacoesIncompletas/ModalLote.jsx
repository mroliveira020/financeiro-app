import React from "react";

const ModalLote = ({
  textoLote,
  setTextoLote,
  enviarLote,
  socios = [],
  paidByUserId = "",
  setPaidByUserId,
  carregandoSocios = false,
  erro = "",
  linhasComErro = [],
  preview = [],
}) => {
  return (
    <div
      className="modal fade"
      id="modalLote"
      tabIndex="-1"
      aria-labelledby="modalLoteLabel"
      aria-hidden="true"
    >
      <div className="modal-dialog modal-dialog-centered">
        <div className="modal-content">
          <div className="modal-header small">
            <h5 className="modal-title" id="modalLoteLabel">
              Adicionar Transações em Lote
            </h5>
            <button
              type="button"
              className="btn-close"
              data-bs-dismiss="modal"
              aria-label="Close"
            ></button>
          </div>

          <div className="modal-body small">
            <div className="mb-3">
              <label className="form-label">Quem pagou</label>
              <select
                className="form-select form-select-sm"
                value={paidByUserId}
                onChange={(e) => setPaidByUserId?.(e.target.value)}
                disabled={carregandoSocios}
              >
                <option value="">Selecione um sócio</option>
                {socios.map((socio) => (
                  <option key={socio.user_id} value={socio.user_id}>
                    {socio.user_name || socio.user_email}
                    {` (${Number(socio.percentual_participacao || 0).toLocaleString("pt-BR")}%)`}
                  </option>
                ))}
              </select>
            </div>

            <textarea
              className="form-control form-control-sm"
              rows="10"
              placeholder={
                'Cole aqui os dados no formato:\n' +
                'Data[TAB]Descrição[TAB]Valor\n' +
                'Exemplo:\n' +
                '20/03/2025\tConta de Luz\t150,75'
              }
              value={textoLote}
              onChange={(e) => setTextoLote(e.target.value)}
            ></textarea>

            {erro ? (
              <div className="alert alert-danger mt-3 mb-0" role="alert">
                <strong>Importação com pendências.</strong>
                <div>{erro}</div>
              </div>
            ) : null}

            {preview.length ? (
              <div className="mt-3">
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <span className="form-label mb-0">Pré-visualização do lote</span>
                  <small className="text-muted">
                    {linhasComErro.length ? `${linhasComErro.length} linha(s) com erro` : "Sem erros detectados"}
                  </small>
                </div>
                <div className="table-responsive">
                  <table className="table table-sm align-middle mb-0">
                    <thead>
                      <tr>
                        <th>Linha</th>
                        <th>Data</th>
                        <th>Descrição</th>
                        <th>Valor</th>
                        <th>Validação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.map((linha) => (
                        <tr
                          key={`${linha.numero}-${linha.raw}`}
                          className={linha.erro ? "table-danger" : undefined}
                        >
                          <td>{linha.numero}</td>
                          <td>{linha.data || "—"}</td>
                          <td title={linha.descricao || linha.raw}>{linha.descricao || "—"}</td>
                          <td>{linha.valor || "—"}</td>
                          <td>{linha.erro || "OK"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </div>

          <div className="modal-footer small">
            <button
              className="btn btn-secondary btn-sm"
              data-bs-dismiss="modal"
              type="button"
            >
              Cancelar
            </button>
            <button
              className="btn btn-success btn-sm"
              onClick={enviarLote}
              type="button"
            >
              Enviar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ModalLote;
