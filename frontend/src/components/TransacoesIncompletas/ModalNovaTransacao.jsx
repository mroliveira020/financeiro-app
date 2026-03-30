import React, { useEffect, useState } from "react";
import { fetchSociosImovel } from "../../services/api";

function ModalNovaTransacao({
  form,
  setForm,
  onSave,
  categorias,
  imoveis,
  idModal = "modalNovaTransacao",
}) {
  const [socios, setSocios] = useState([]);
  const [carregandoSocios, setCarregandoSocios] = useState(false);

  useEffect(() => {
    const idImovel = form?.id_imovel;
    if (!idImovel) {
      setSocios([]);
      return;
    }

    let ativo = true;
    setCarregandoSocios(true);
    fetchSociosImovel(idImovel, { incluirInativos: false })
      .then((lista) => {
        if (!ativo) return;
        setSocios(lista || []);
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
  }, [form?.id_imovel]);

  if (!form) return null;

  return (
    <div className="modal fade" id={idModal} tabIndex="-1" aria-labelledby={`${idModal}Label`} aria-hidden="true">
      <div className="modal-dialog modal-dialog-centered">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title" id={`${idModal}Label`}>Incluir transação</h5>
            <button type="button" className="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
          </div>

          <div className="modal-body">
            <div className="mb-2">
              <label className="form-label">Data</label>
              <input
                type="text"
                className="form-control form-control-sm"
                placeholder="DD/MM/AAAA"
                value={form.data}
                onChange={(e) => setForm({ ...form, data: e.target.value })}
              />
            </div>

            <div className="mb-2">
              <label className="form-label">Descrição</label>
              <input
                type="text"
                className="form-control form-control-sm"
                value={form.descricao}
                onChange={(e) => setForm({ ...form, descricao: e.target.value })}
              />
            </div>

            <div className="mb-2">
              <label className="form-label">Valor</label>
              <input
                type="text"
                className="form-control form-control-sm text-end"
                placeholder="0,00"
                value={form.valor}
                onChange={(e) => setForm({ ...form, valor: e.target.value })}
              />
            </div>

            <div className="mb-2">
              <label className="form-label">Categoria</label>
              <select
                className="form-select form-select-sm"
                value={form.id_categoria}
                onChange={(e) => setForm({ ...form, id_categoria: e.target.value })}
              >
                <option value="">Selecione</option>
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
                value={form.id_imovel}
                onChange={(e) => setForm({ ...form, id_imovel: e.target.value, paid_by_user_id: "" })}
              >
                <option value="">Selecione</option>
                {imoveis.map((imovel) => (
                  <option key={imovel.id} value={imovel.id}>
                    {imovel.nome}
                  </option>
                ))}
              </select>
            </div>

            <div className="mb-2">
              <label className="form-label">Quem pagou</label>
              <select
                className="form-select form-select-sm"
                value={form.paid_by_user_id ?? ""}
                onChange={(e) => setForm({ ...form, paid_by_user_id: e.target.value })}
                disabled={carregandoSocios || !form.id_imovel}
              >
                <option value="">Selecione</option>
                {socios.map((socio) => (
                  <option key={socio.user_id} value={socio.user_id}>
                    {socio.user_name || socio.user_email}
                    {` (${Number(socio.percentual_participacao || 0).toLocaleString("pt-BR")}%)`}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary btn-sm" data-bs-dismiss="modal">
              Cancelar
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={onSave}>
              Incluir transação
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ModalNovaTransacao;
