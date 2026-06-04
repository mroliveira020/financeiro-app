import React, { useEffect, useState } from "react";
import { fetchSociosImovel } from "../../services/api";

function ModalEdicao({
  idModal,
  formEdicao,
  setFormEdicao,
  salvarEdicao,
  categorias,
  imoveis
}) {
  const [socios, setSocios] = useState([]);
  const [carregandoSocios, setCarregandoSocios] = useState(false);

  useEffect(() => {
    const idImovel = formEdicao?.id_imovel;
    if (!idImovel) {
      setSocios([]);
      return;
    }

    let ativo = true;
    setCarregandoSocios(true);
    fetchSociosImovel(idImovel, { incluirInativos: false })
      .then((lista) => {
        if (!ativo) return;
        setSocios(lista);
      })
      .catch(() => {
        if (!ativo) return;
        setSocios([]);
      })
      .finally(() => {
        if (!ativo) return;
        setCarregandoSocios(false);
      });

    return () => {
      ativo = false;
    };
  }, [formEdicao?.id_imovel]);

  useEffect(() => {
    if (!formEdicao) return;
    if (socios.length === 1) {
      const socioId = String(socios[0].user_id);
      if (String(formEdicao.paid_by_user_id ?? "") !== socioId) {
        setFormEdicao({ ...formEdicao, paid_by_user_id: socioId });
      }
      return;
    }
    if (socios.length > 1) {
      const idsValidos = new Set(socios.map((socio) => String(socio.user_id)));
      if (formEdicao.paid_by_user_id && !idsValidos.has(String(formEdicao.paid_by_user_id))) {
        setFormEdicao({ ...formEdicao, paid_by_user_id: "" });
      }
      return;
    }
    if (formEdicao.paid_by_user_id) {
      setFormEdicao({ ...formEdicao, paid_by_user_id: "" });
    }
  }, [formEdicao, setFormEdicao, socios]);

  const deveMostrarPagador = socios.length > 0;

  if (!formEdicao) return null;

  return (
    <div
      className="modal fade"
      id={idModal}
      tabIndex="-1"
      aria-labelledby={`${idModal}Label`}
      aria-hidden="true"
    >
      <div className="modal-dialog modal-dialog-centered">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title" id={`${idModal}Label`}>
              Editar Lançamento
            </h5>
            <button
              type="button"
              className="btn-close"
              data-bs-dismiss="modal"
              aria-label="Fechar"
            ></button>
          </div>

          <div className="modal-body">
            <div className="mb-2">
              <label className="form-label">Data</label>
              <input
                type="text"
                className="form-control form-control-sm"
                value={formEdicao.data}
                onChange={(e) =>
                  setFormEdicao({ ...formEdicao, data: e.target.value })
                }
              />
            </div>

            <div className="mb-2">
              <label className="form-label">Descrição</label>
              <input
                type="text"
                className="form-control form-control-sm"
                value={formEdicao.descricao}
                onChange={(e) =>
                  setFormEdicao({ ...formEdicao, descricao: e.target.value })
                }
              />
            </div>

            <div className="mb-2">
              <label className="form-label">Valor</label>
              <input
                type="text"
                className="form-control form-control-sm text-end"
                value={formEdicao.valor}
                onChange={(e) =>
                  setFormEdicao({ ...formEdicao, valor: e.target.value })
                }
                onBlur={(e) => {
                  const numero = parseFloat(
                    e.target.value.replace(/\./g, "").replace(",", ".")
                  );
                  const valorFormatado = isNaN(numero)
                    ? "0,00"
                    : numero.toLocaleString("pt-BR", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      });
                  setFormEdicao({ ...formEdicao, valor: valorFormatado });
                }}
              />
            </div>

            <div className="mb-2">
              <label className="form-label">Categoria</label>
              <select
                className="form-select form-select-sm"
                value={formEdicao.id_categoria}
                onChange={(e) =>
                  setFormEdicao({
                    ...formEdicao,
                    id_categoria: e.target.value,
                  })
                }
              >
                {categorias.map((categoria) => (
                  <option key={categoria.id} value={categoria.id}>
                    {categoria.categoria}
                  </option>
                ))}
              </select>
            </div>

            <div className="mb-2">
              <label className="form-label">Imóvel</label>
              <select
                className="form-select form-select-sm"
                value={formEdicao.id_imovel}
                onChange={(e) =>
                  setFormEdicao({ ...formEdicao, id_imovel: e.target.value })
                }
              >
                {imoveis.map((imovel) => (
                  <option key={imovel.id} value={imovel.id}>
                    {imovel.nome}
                  </option>
                ))}
              </select>
            </div>

            <div className="mb-2">
              <label className="form-label">Situação</label>
              <select
                className="form-select form-select-sm"
                value={formEdicao.id_situacao}
                onChange={(e) =>
                  setFormEdicao({
                    ...formEdicao,
                    id_situacao: e.target.value,
                  })
                }
              >
                <option value={0}>Pendente</option>
                <option value={1}>Confirmado</option>
              </select>
            </div>

            {deveMostrarPagador && (
              <div className="mb-2">
                <label className="form-label">Quem pagou</label>
                <select
                  className="form-select form-select-sm"
                  value={formEdicao.paid_by_user_id ?? ""}
                  onChange={(e) =>
                    setFormEdicao({
                      ...formEdicao,
                      paid_by_user_id: e.target.value,
                    })
                  }
                  disabled={carregandoSocios || socios.length === 1}
                >
                  <option value="">Selecione um sócio</option>
                  {socios.map((socio) => (
                    <option key={socio.user_id} value={socio.user_id}>
                      {socio.user_name || socio.user_email}
                      {` (${Number(socio.percentual_participacao || 0).toLocaleString("pt-BR")}%)`}
                    </option>
                  ))}
                </select>
                {socios.length > 1 ? (
                  <small className="text-muted">Obrigatório para imóveis com múltiplos sócios.</small>
                ) : null}
              </div>
            )}
          </div>

          <div className="modal-footer">
            <button
              className="btn btn-secondary btn-sm"
              data-bs-dismiss="modal"
            >
              Cancelar
            </button>
            <button className="btn btn-success btn-sm" onClick={salvarEdicao}>
              Salvar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ModalEdicao;
