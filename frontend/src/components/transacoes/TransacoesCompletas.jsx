/* global bootstrap */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../../services/http";
import LancamentosTable from "./LancamentosTable";
import ModalEdicao from "./ModalEdicao";
import { useAuth } from "../../context/AuthContext";

function TransacoesCompletas({ refreshKey = 0, onChanged }) {
  const { id } = useParams();
  const [lancamentos, setLancamentos] = useState([]);
  const [editandoLancamento, setEditandoLancamento] = useState(null);
  const [formEdicao, setFormEdicao] = useState(null);
  const [categorias, setCategorias] = useState([]);
  const [imoveis, setImoveis] = useState([]);
  const { hasRole } = useAuth();
  const canEdit = hasRole("editor", "admin");

  const totais = useMemo(() => {
    if (!lancamentos.length) {
      return {
        quantidade: 0,
        soma: 0,
        categorias: 0,
      };
    }
    const soma = lancamentos.reduce((acc, item) => acc + Number(item.valor || 0), 0);
    const categorias = new Set(
      lancamentos
        .map((item) => item.nome_categoria)
        .filter((categoria) => categoria && categoria.trim() !== "")
    ).size;
    return {
      quantidade: lancamentos.length,
      soma,
      categorias,
    };
  }, [lancamentos]);

  const formatarMoeda = (valor) =>
    Number(valor ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const fetchLancamentos = useCallback(async () => {
    try {
      const { data } = await api.get(`/dashboard/lancamentos/completos/${id}`);
      setLancamentos(data);
    } catch (error) {
      console.error("Erro ao buscar lançamentos completos", error);
    }
  }, [id]);

  const fetchCategoriasEImoveis = useCallback(async () => {
    try {
      const resCategorias = await api.get(`/categorias`);
      const resImoveis = await api.get(`/imoveis`);
      setCategorias(resCategorias.data);
      setImoveis(resImoveis.data);
    } catch (error) {
      console.error("Erro ao buscar categorias e imóveis", error);
    }
  }, []);

  useEffect(() => {
    fetchLancamentos();
    fetchCategoriasEImoveis();
  }, [fetchLancamentos, fetchCategoriasEImoveis, refreshKey]);

  const handleExcluir = async (id_lancamento) => {
    if (!window.confirm("Tem certeza que deseja excluir este lançamento?")) return;

    try {
      await api.delete(`/dashboard/lancamentos/${id_lancamento}`);
      fetchLancamentos();
      onChanged?.();
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
      onChanged?.();
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
        <header className="transacoes-card__header">
          <div className="transacoes-card__title">
            <h2>Transações Completas</h2>
            <span className="text-muted small">
              {canEdit ? "Clique em uma linha para editar" : "Lista de lançamentos confirmados"}
            </span>
          </div>
          <div className="transacoes-card__stats">
            <div className="transacoes-card__stat">
              <span>Registros</span>
              <strong>{totais.quantidade}</strong>
            </div>
            <div className="transacoes-card__stat">
              <span>Categoria(s)</span>
              <strong>{totais.categorias}</strong>
            </div>
            <div className="transacoes-card__stat">
              <span>Total confirmado</span>
              <strong>{formatarMoeda(totais.soma)}</strong>
            </div>
          </div>
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
