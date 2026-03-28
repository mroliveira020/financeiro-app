import React, { useCallback, useEffect, useState } from "react";
import api from "../../services/http";
import { useAuth } from "../../context/AuthContext";

function ModalSelecionarImovel({ onClose, onSelectImovel }) {
  const [imoveis, setImoveis] = useState([]);
  const { hasRole } = useAuth();
  const canAccessAllFinance = hasRole("viewer", "editor", "admin");

  const fetchImoveis = useCallback(async () => {
    try {
      const endpoint = canAccessAllFinance ? "/imoveis" : "/imoveis-financeiro-acessiveis";
      const { data } = await api.get(endpoint);
      setImoveis(data);
    } catch (error) {
      console.error("Erro ao buscar imóveis", error);
    }
  }, [canAccessAllFinance]);

  useEffect(() => {
    fetchImoveis();
  }, [fetchImoveis]);

  return (
    <>
      <div className="modal fade show d-block" tabIndex="-1" role="dialog" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
        <div className="modal-dialog modal-dialog-centered" role="document">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title">Selecionar Imóvel</h5>
              <button
                type="button"
                className="btn-close"
                onClick={onClose}
              ></button>
            </div>
            <div className="modal-body">
              <ul className="list-group">
                {imoveis.length === 0 && (
                  <li className="list-group-item text-muted">Nenhum imóvel disponível para este usuário.</li>
                )}
                {imoveis.map((imovel) => (
                  <li
                    key={imovel.id}
                    className="list-group-item list-group-item-action"
                    onClick={() => onSelectImovel(imovel.id)}
                    style={{ cursor: "pointer" }}
                  >
                    {imovel.nome}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default ModalSelecionarImovel;
