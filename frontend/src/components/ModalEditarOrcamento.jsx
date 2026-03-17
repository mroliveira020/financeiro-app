import React, { useState, useEffect, useCallback } from "react";
import api from "../services/http";

function ModalEditarOrcamento({ id_imovel, onClose, onSave }) {
  const [orcamentos, setOrcamentos] = useState([]);

  const fetchOrcamentos = useCallback(async () => {
    try {
      const { data } = await api.get(`/orcamentos/${id_imovel}`);
      const orcamentosFormatados = data.map((item) => ({
        ...item,
        orcamento: formatarMoeda(item.orcamento)
      }));
      setOrcamentos(orcamentosFormatados);
    } catch (error) {
      console.error("Erro ao buscar orçamentos:", error);
    }
  }, [id_imovel]);

  useEffect(() => {
    fetchOrcamentos();
  }, [fetchOrcamentos]);

  // Formata valor float para string no formato BR (duas casas e vírgula)
  const formatarMoeda = (valor) => {
    if (valor === null || valor === undefined) return "";
    return parseFloat(valor).toFixed(2).replace(".", ",");
  };

  // Remove formatação para enviar ao backend (como float)
  const desformatarMoeda = (valor) => {
    if (!valor) return 0;
    const valorLimpo = valor.replace(/\./g, "").replace(",", ".");
    return parseFloat(valorLimpo);
  };

  const handleChange = (index, value) => {
    const updatedOrcamentos = [...orcamentos];
    updatedOrcamentos[index].orcamento = value;
    setOrcamentos(updatedOrcamentos);
  };

  const handleSubmit = async () => {
    try {
      const payload = orcamentos.map((item) => ({
        id_grupo: item.id_grupo,
        orcamento: desformatarMoeda(item.orcamento)
      }));

      await api.post(`/orcamentos/${id_imovel}`, payload);

      alert("Orçamentos atualizados com sucesso!");
      onSave(); // fecha o modal e atualiza o card de resumo
    } catch (error) {
      console.error("Erro ao atualizar orçamentos:", error);
      alert("Erro ao salvar orçamentos.");
    }
  };

  return (
    <div className="modal fade show" style={{ display: "block" }} tabIndex="-1">
      <div className="modal-dialog modal-lg">
        <div className="modal-content">

          <div className="modal-header">
            <h5 className="modal-title">Editar Orçamentos</h5>
            <button type="button" className="btn-close" onClick={onClose}></button>
          </div>

          <div className="modal-body">
            {orcamentos.length === 0 ? (
              <p>Nenhum orçamento encontrado.</p>
            ) : (
              <table className="table table-sm table-bordered align-middle small">
                <thead>
                  <tr>
                    <th>Grupo</th>
                    <th>Orçamento (R$)</th>
                  </tr>
                </thead>
                <tbody>
                  {orcamentos.map((item, index) => (
                    <tr key={item.id_grupo}>
                      <td>{item.descricao}</td>
                      <td>
                        <input
                          type="text"
                          className="form-control form-control-sm text-end"
                          value={item.orcamento}
                          onChange={(e) => handleChange(index, e.target.value)}
                          placeholder="0,00"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="modal-footer">
            <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancelar</button>
            <button className="btn btn-success btn-sm" onClick={handleSubmit}>Salvar</button>
          </div>

        </div>
      </div>
    </div>
  );
}

export default ModalEditarOrcamento;
