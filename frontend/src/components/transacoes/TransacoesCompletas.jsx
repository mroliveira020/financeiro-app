/* global bootstrap */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../../services/http";
import LancamentosTable from "./LancamentosTable";
import ModalEdicao from "./ModalEdicao";
import { useAuth } from "../../context/AuthContext";
import { fetchImoveisFinanceiroAcessiveis, fetchLancamentosCompletos } from "../../services/api";
import { useCatalogos } from "../../hooks/useCatalogos";

const PAGE_SIZE = 30;

function TransacoesCompletas({ refreshKey = 0, onChanged }) {
  const { id } = useParams();
  const [lancamentos, setLancamentos] = useState([]);
  const [editandoLancamento, setEditandoLancamento] = useState(null);
  const [formEdicao, setFormEdicao] = useState(null);
  const [totalRegistros, setTotalRegistros] = useState(0);
  const [summary, setSummary] = useState({ total: 0, soma: 0, categorias: 0 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [imoveisAcessiveis, setImoveisAcessiveis] = useState([]);
  const { hasRole, user } = useAuth();
  const canEdit = hasRole("editor", "admin");
  const isAdmin = user?.role === "admin";
  const { categorias, imoveis } = useCatalogos();

  const categoriasOrdenadas = useMemo(
    () => [...categorias].sort((a, b) => a.categoria.localeCompare(b.categoria, "pt-BR")),
    [categorias],
  );
  const imoveisOrdenados = useMemo(
    () => [...(isAdmin ? imoveis : imoveisAcessiveis)].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    [imoveis, imoveisAcessiveis, isAdmin],
  );

  const totais = useMemo(() => {
    return {
      quantidade: summary.total || 0,
      soma: summary.soma || 0,
      categorias: summary.categorias || 0,
    };
  }, [summary]);

  const formatarMoeda = (valor) =>
    Number(valor ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const carregarLancamentos = useCallback(
    async (paginaSolicitada = 1) => {
      setLoading(true);
      try {
        const resposta = await fetchLancamentosCompletos({
          imovelId: id,
          page: paginaSolicitada,
          pageSize: PAGE_SIZE,
        });

        const itens = resposta?.items || [];
        const total = resposta?.summary?.total ?? resposta?.total ?? itens.length;
        const soma = resposta?.summary?.soma ?? 0;
        const categoriasDistinct = resposta?.summary?.categorias ?? 0;
        const paginaRetornada = resposta?.page || paginaSolicitada;
        const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

        if (paginaRetornada > totalPages && totalPages >= 1) {
          setPage(totalPages);
          return;
        }

        setLancamentos(itens);
        setTotalRegistros(total);
        setSummary({ total, soma, categorias: categoriasDistinct });
        setPage(paginaRetornada);
      } catch (error) {
        console.error("Erro ao buscar lançamentos completos", error);
      } finally {
        setLoading(false);
      }
    },
    [id],
  );

  useEffect(() => {
    setPage(1);
  }, [id]);

  useEffect(() => {
    let ativo = true;
    fetchImoveisFinanceiroAcessiveis()
      .then((lista) => {
        if (!ativo) return;
        setImoveisAcessiveis(lista || []);
      })
      .catch((error) => {
        console.error("Erro ao buscar imóveis acessíveis", error);
        if (!ativo) return;
        setImoveisAcessiveis([]);
      });
    return () => {
      ativo = false;
    };
  }, []);

  useEffect(() => {
    carregarLancamentos(page);
  }, [carregarLancamentos, page, refreshKey]);

  const handleExcluir = async (id_lancamento) => {
    if (!window.confirm("Tem certeza que deseja excluir este lançamento?")) return;

    try {
      await api.delete(`/dashboard/lancamentos/${id_lancamento}`);
      carregarLancamentos(page);
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
      paid_by_user_id: lancamento.paid_by_user_id ?? "",
      tipo_movimentacao: lancamento.tipo_movimentacao || "despesa_imovel",
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
        paid_by_user_id: formEdicao.paid_by_user_id ? parseInt(formEdicao.paid_by_user_id, 10) : null,
        tipo_movimentacao: formEdicao.tipo_movimentacao || "despesa_imovel",
      };

      await api.patch(`/dashboard/lancamentos/${editandoLancamento}`, payload);

      carregarLancamentos(page);
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
            serverPagination={{
              page,
              pageSize: PAGE_SIZE,
              total: totalRegistros,
              onPageChange: setPage,
            }}
            loading={loading}
            enableSorting={false}
          />
        </div>
      </section>

      <ModalEdicao
        idModal="modalEdicaoCompleto"
        formEdicao={formEdicao}
        setFormEdicao={setFormEdicao}
        salvarEdicao={salvarEdicao}
        categorias={categoriasOrdenadas}
        imoveis={imoveisOrdenados}
      />
    </>
  );
}

export default TransacoesCompletas;
