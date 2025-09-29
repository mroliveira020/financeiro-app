import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../../services/http";
import LancamentosTable from "./LancamentosTable";
import ModalEdicao from "./ModalEdicao";
import useEditorToken from "../../hooks/useEditorToken";

function TransacoesCompletas() {
  const { id } = useParams();
  const [lancamentos, setLancamentos] = useState([]);
  const [editandoLancamento, setEditandoLancamento] = useState(null);
  const [formEdicao, setFormEdicao] = useState(null);
  const [categorias, setCategorias] = useState([]);
  const [imoveis, setImoveis] = useState([]);
  const editorToken = useEditorToken();
  const canEdit = !!editorToken;

  useEffect(() => {
    fetchLancamentos();
    fetchCategoriasEImoveis();
  }, [id]);

  const fetchLancamentos = async () => {
    try {
      const { data } = await api.get(`/dashboard/lancamentos/completos/${id}`);
      setLancamentos(data);
    } catch (error) {
      console.error("Erro ao buscar lançamentos completos", error);
    }
  };

  const fetchCategoriasEImoveis = async () => {
    try {
      const resCategorias = await api.get(`/categorias`);
      const resImoveis = await api.get(`/imoveis`);
      setCategorias(resCategorias.data);
      setImoveis(resImoveis.data);
    } catch (error) {
      console.error("Erro ao buscar categorias e imóveis", error);
    }
  };

  const handleExcluir = async (id_lancamento) => {
    if (!window.confirm("Tem certeza que deseja excluir este lançamento?")) return;

    try {
      await api.delete(`/dashboard/lancamentos/${id_lancamento}`);
      fetchLancamentos();
      alert("Lançamento excluído com sucesso!");
    } catch (error) {
      console.error("Erro ao excluir lançamento", error);
      alert("Erro ao excluir lançamento!");
    }
  };

  const iniciarEdicao = (lancamento) => {
    setEditandoLancamento(lancamento.id_lancamento);
    setFormEdicao({
      data: lancamento.data,
      descricao: lancamento.descricao,
      valor: lancamento.valor.toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
      id_categoria: lancamento.id_categoria,
      id_imovel: lancamento.id_imovel,
      id_situacao: lancamento.id_situacao,
    });

    const modal = new bootstrap.Modal(document.getElementById("modalEdicaoCompleto"));
    modal.show();
  };

  const salvarEdicao = async () => {
    try {
      const payload = {
        data: formEdicao.data,
        descricao: formEdicao.descricao,
        valor: parseFloat(
          formEdicao.valor.replace(/\./g, "").replace(",", ".")
        ),
        id_categoria: parseInt(formEdicao.id_categoria),
        id_imovel: parseInt(formEdicao.id_imovel),
        id_situacao: parseInt(formEdicao.id_situacao),
      };

      await api.patch(`/dashboard/lancamentos/${editandoLancamento}`, payload);

      fetchLancamentos();
      const modal = bootstrap.Modal.getInstance(document.getElementById("modalEdicaoCompleto"));
      modal.hide();
      setEditandoLancamento(null);
      alert("Lançamento atualizado com sucesso!");
    } catch (error) {
      console.error("Erro ao atualizar lançamento", error);
      alert("Erro ao atualizar lançamento!");
    }
  };

  return (
    <>
      <section className="dashboard-card transacoes-card">
        <header>
          <h2>Transações Completas</h2>
          {canEdit && (
            <span className="text-muted small">Clique em uma linha para editar</span>
          )}
        </header>

        <div className="transacoes-card__table-wrapper table-responsive">
          <LancamentosTable
            lancamentos={lancamentos}
            onEdit={iniciarEdicao}
            onDelete={handleExcluir}
            tipo="completo"
            editable={canEdit}
          />
        </div>
      </section>

      <ModalEdicao
        idModal="modalEdicaoCompleto"
        formEdicao={formEdicao}
        setFormEdicao={setFormEdicao}
        salvarEdicao={salvarEdicao}
        categorias={categorias}
        imoveis={imoveis}
      />
    </>
  );
}

export default TransacoesCompletas;
