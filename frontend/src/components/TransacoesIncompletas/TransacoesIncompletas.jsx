// TransacoesIncompletas.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../../services/http";
import LancamentosTable from "./LancamentosTable";
import ModalEdicao from "./ModalEdicao";
import ModalLote from "./ModalLote";
import useEditorToken from "../../hooks/useEditorToken";

function TransacoesIncompletas() {
  const { id } = useParams();
  const [lancamentos, setLancamentos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [imoveis, setImoveis] = useState([]);
  const [editandoLancamento, setEditandoLancamento] = useState(null);
  const [formEdicao, setFormEdicao] = useState({});
  const [textoLote, setTextoLote] = useState('');
  const editorToken = useEditorToken();
  const canEdit = !!editorToken;

  const totais = useMemo(() => {
    if (!lancamentos.length) {
      return { quantidade: 0, soma: 0 };
    }
    const soma = lancamentos.reduce((acc, item) => acc + Number(item.valor || 0), 0);
    return { quantidade: lancamentos.length, soma };
  }, [lancamentos]);

  const formatarMoeda = (valor) =>
    Number(valor ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  useEffect(() => {
    fetchLancamentosIncompletos();
    fetchCategoriasEImoveis();
  }, [id]);

  const fetchLancamentosIncompletos = async () => {
    try {
      const { data } = await api.get(`/dashboard/lancamentos/incompletos/${id}`);
      setLancamentos(data);
    } catch (error) {
      console.error("Erro ao buscar lançamentos incompletos", error);
    }
  };

  const fetchCategoriasEImoveis = async () => {
    try {
      const [resCategorias, resImoveis] = await Promise.all([
        api.get(`/categorias`),
        api.get(`/imoveis`),
      ]);
      setCategorias(resCategorias.data);
      setImoveis(resImoveis.data);
    } catch (error) {
      console.error("Erro ao buscar categorias/imóveis", error);
    }
  };

  const handleExcluir = async (lancamentoId) => {
    if (!window.confirm("Tem certeza que deseja excluir este lançamento?")) return;

    try {
      await api.delete(`/dashboard/lancamentos/${lancamentoId}`);
      fetchLancamentosIncompletos();
    } catch (error) {
      console.error("Erro ao excluir lançamento", error);
    }
  };

  const iniciarEdicao = (lancamento) => {
    setEditandoLancamento(lancamento.id_lancamento);
    setFormEdicao({
      data: lancamento.data,
      descricao: lancamento.descricao,
      valor: lancamento.valor.toFixed(2).replace('.', ','),
      id_categoria: lancamento.id_categoria || 0,
      id_imovel: lancamento.id_imovel,
      id_situacao: lancamento.id_situacao
    });
    const modal = new bootstrap.Modal(document.getElementById('modalEdicao'));
    modal.show();
  };

  const salvarEdicao = async () => {
    if (!editandoLancamento) {
      alert("Nenhum lançamento selecionado para edição.");
      return;
    }

    try {
      const payload = {
        data: formEdicao.data,
        descricao: formEdicao.descricao,
        valor: tratarValor(formEdicao.valor),
        id_categoria: parseInt(formEdicao.id_categoria),
        id_imovel: parseInt(formEdicao.id_imovel),
        id_situacao: parseInt(formEdicao.id_situacao)
      };

      await api.patch(`/dashboard/lancamentos/${editandoLancamento}`, payload);
      fetchLancamentosIncompletos();
      const modal = bootstrap.Modal.getInstance(document.getElementById('modalEdicao'));
      modal.hide();
      setEditandoLancamento(null);
    } catch (error) {
      console.error("Erro ao atualizar lançamento", error);
      alert("Erro ao salvar a edição.");
    }
  };

  const tratarValor = (valorStr) => {
    if (!valorStr) return 0;
    const valorLimpo = valorStr.trim().replace(/\./g, "").replace(",", ".");
    const valorNumerico = parseFloat(valorLimpo);
    return isNaN(valorNumerico) ? 0 : valorNumerico;
  };

  const abrirModalLote = () => {
    const modal = new bootstrap.Modal(document.getElementById('modalLote'));
    modal.show();
  };

  const enviarLote = async () => {
    try {
      if (!textoLote.trim()) {
        alert("Cole os dados do Excel antes de enviar.");
        return;
      }

      const linhas = textoLote.trim().split("\n");

      const novosLancamentos = linhas.map((linha, index) => {
        const partes = linha.includes("\t") ? linha.split("\t") : linha.split(";");

        if (partes.length < 3) {
          throw new Error(`Linha ${index + 1} inválida: "${linha}".`);
        }

        const [data, descricao, valor] = partes;

        return {
          data: data.trim(),
          descricao: descricao.trim(),
          valor: parseFloat(valor.replace(",", ".").trim()),
          id_imovel: parseInt(id),
          id_categoria: 0,
          id_situacao: 1,
          ativo: 1
        };
      });

      await api.post('/dashboard/lancamentos/lote', novosLancamentos);

      alert('Lançamentos adicionados com sucesso!');
      fetchLancamentosIncompletos();
      const modal = bootstrap.Modal.getInstance(document.getElementById('modalLote'));
      modal.hide();
      setTextoLote('');
    } catch (error) {
      console.error('Erro ao adicionar lançamentos em lote:', error);
      alert(`Erro: ${error.message}`);
    }
  };

  return (
    <>
      <section className="dashboard-card transacoes-card">
        <header className="transacoes-card__header">
          <div className="transacoes-card__title">
            <h2>Transações Incompletas</h2>
            <span className="text-muted small">Revise e complete os lançamentos pendentes</span>
          </div>
          <div className="transacoes-card__header-actions">
            <div className="transacoes-card__stat">
              <span>Pendentes</span>
              <strong>{totais.quantidade}</strong>
            </div>
            <div className="transacoes-card__stat">
              <span>Valor total</span>
              <strong>{formatarMoeda(totais.soma)}</strong>
            </div>
            {canEdit && (
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm"
                onClick={abrirModalLote}
                title="Adicionar lançamentos em lote"
              >
                📥 Importar lote
              </button>
            )}
          </div>
        </header>

        <div className="transacoes-card__table-wrapper">
          <LancamentosTable
            lancamentos={lancamentos}
            onEdit={iniciarEdicao}
            onDelete={handleExcluir}
            editable={canEdit}
          />
        </div>
      </section>

      <ModalEdicao
        formEdicao={formEdicao}
        setFormEdicao={setFormEdicao}
        salvarEdicao={salvarEdicao}
        categorias={categorias}
        imoveis={imoveis}
      />

      <ModalLote
        textoLote={textoLote}
        setTextoLote={setTextoLote}
        enviarLote={enviarLote}
      />
    </>
  );
}

export default TransacoesIncompletas;
