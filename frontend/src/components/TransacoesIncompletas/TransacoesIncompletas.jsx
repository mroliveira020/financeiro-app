/* global bootstrap */
// TransacoesIncompletas.jsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../../services/http";
import LancamentosTable from "./LancamentosTable";
import ModalEdicao from "./ModalEdicao";
import ModalLote from "./ModalLote";
import ModalEdicaoMassa from "./ModalEdicaoMassa";
import { useAuth } from "../../context/AuthContext";
import { atualizarLancamentosBatch } from "../../services/api";

const normalizarValor = (valorBruto, linha) => {
  const texto = `${valorBruto ?? ""}`.trim();
  if (!texto) {
    const label = typeof linha === "number" ? ` na linha ${linha}` : linha ? ` (${linha})` : "";
    throw new Error(`Valor ausente${label}`);
  }

  const somenteNumeros = texto.replace(/[^0-9,.-]/g, "");
  const usaVirgula = somenteNumeros.includes(",");
  const semMilhar = usaVirgula
    ? somenteNumeros.replace(/\./g, "")
    : somenteNumeros;
  const normalizado = semMilhar.replace(",", ".");
  const numero = Number(normalizado);

  if (!Number.isFinite(numero)) {
    const label = typeof linha === "number" ? ` na linha ${linha}` : linha ? ` (${linha})` : "";
    throw new Error(`Valor inválido${label}: "${valorBruto}"`);
  }

  return numero;
};

function TransacoesIncompletas({ refreshKey = 0, onChanged }) {
  const { id } = useParams();
  const [lancamentos, setLancamentos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [imoveis, setImoveis] = useState([]);
  const [editandoLancamento, setEditandoLancamento] = useState(null);
  const [formEdicao, setFormEdicao] = useState({});
  const [textoLote, setTextoLote] = useState('');
  const [formEdicaoMassa, setFormEdicaoMassa] = useState({
    id_categoria: "",
    id_imovel: "",
    id_situacao: "",
    data: "",
    valor: "",
    descricao: "",
  });
  const [submetendoMassa, setSubmetendoMassa] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const { hasRole } = useAuth();
  const canEdit = hasRole("editor", "admin");

  const totais = useMemo(() => {
    if (!lancamentos.length) {
      return { quantidade: 0, soma: 0 };
    }
    const soma = lancamentos.reduce((acc, item) => acc + Number(item.valor || 0), 0);
    return { quantidade: lancamentos.length, soma };
  }, [lancamentos]);

  const formatarMoeda = (valor) =>
    Number(valor ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const selecionados = useMemo(() => {
    if (!selectedIds.length) return [];
    const mapa = new Set(selectedIds);
    return lancamentos.filter((item) => mapa.has(item.id_lancamento));
  }, [selectedIds, lancamentos]);

  const totalSelecionado = useMemo(() => {
    if (!selecionados.length) return null;
    const soma = selecionados.reduce((acc, item) => acc + Number(item.valor || 0), 0);
    return Number(soma).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }, [selecionados]);

  const fetchLancamentosIncompletos = useCallback(async () => {
    try {
      const { data } = await api.get(`/dashboard/lancamentos/incompletos/${id}`);
      setLancamentos(data);
    } catch (error) {
      console.error("Erro ao buscar lançamentos incompletos", error);
    }
  }, [id]);

  const fetchCategoriasEImoveis = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    fetchLancamentosIncompletos();
    fetchCategoriasEImoveis();
    setSelectedIds([]);
  }, [fetchLancamentosIncompletos, fetchCategoriasEImoveis, refreshKey]);

  const handleExcluir = async (lancamentoId) => {
    if (!window.confirm("Tem certeza que deseja excluir este lançamento?")) return;

    try {
      await api.delete(`/dashboard/lancamentos/${lancamentoId}`);
      fetchLancamentosIncompletos();
      onChanged?.();
      setSelectedIds((prev) => prev.filter((idSelecionado) => idSelecionado !== lancamentoId));
    } catch (error) {
      console.error("Erro ao excluir lançamento", error);
    }
  };

  const iniciarEdicao = (lancamento) => {
    setEditandoLancamento(lancamento.id_lancamento);
    const valorNumerico = Number(lancamento.valor || 0);
    setFormEdicao({
      data: lancamento.data,
      descricao: lancamento.descricao,
      valor: valorNumerico.toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
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
      onChanged?.();
      const modal = bootstrap.Modal.getInstance(document.getElementById('modalEdicao'));
      modal.hide();
      setEditandoLancamento(null);
    } catch (error) {
      console.error("Erro ao atualizar lançamento", error);
      const mensagem = error?.response?.data?.error || error.message || "Erro ao salvar a edição.";
      alert(mensagem);
    }
  };

  const tratarValor = (valorStr) => {
    if (!valorStr) return 0;
    return normalizarValor(valorStr, "de edição");
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
        const valorNormalizado = normalizarValor(valor, index + 1);

        return {
          data: data.trim(),
          descricao: descricao.trim(),
          valor: valorNormalizado,
          id_imovel: parseInt(id),
          id_categoria: 0,
          id_situacao: 0,
          ativo: 1
        };
      });

      await api.post('/dashboard/lancamentos/lote', novosLancamentos);

      alert('Lançamentos adicionados com sucesso!');
      fetchLancamentosIncompletos();
      onChanged?.();
      const modal = bootstrap.Modal.getInstance(document.getElementById('modalLote'));
      modal.hide();
      setTextoLote('');
    } catch (error) {
      console.error('Erro ao adicionar lançamentos em lote:', error);
      alert(`Erro: ${error.message}`);
    }
  };

  const toggleSelecao = (idLancamento, marcado) => {
    setSelectedIds((prev) => {
      if (marcado) {
        if (prev.includes(idLancamento)) {
          return prev;
        }
        return [...prev, idLancamento];
      }
      return prev.filter((item) => item !== idLancamento);
    });
  };

  const toggleSelecionarTodos = (marcado) => {
    if (!marcado) {
      setSelectedIds([]);
      return;
    }
    setSelectedIds(lancamentos.map((item) => item.id_lancamento));
  };

  const abrirModalEdicaoMassa = () => {
    if (!selectedIds.length) return;
    setFormEdicaoMassa({
      id_categoria: "",
      id_imovel: "",
      id_situacao: "",
      data: "",
      valor: "",
      descricao: "",
    });
    const modal = new bootstrap.Modal(document.getElementById('modalEdicaoMassa'));
    modal.show();
  };

  const fecharModalEdicaoMassa = () => {
    const modal = bootstrap.Modal.getInstance(document.getElementById('modalEdicaoMassa'));
    modal?.hide();
  };

  const aplicarEdicaoMassa = async () => {
    const updates = {};

    if (formEdicaoMassa.id_categoria !== "") {
      updates.id_categoria = Number(formEdicaoMassa.id_categoria);
    }
    if (formEdicaoMassa.id_imovel !== "") {
      updates.id_imovel = Number(formEdicaoMassa.id_imovel);
    }
    if (formEdicaoMassa.id_situacao !== "") {
      updates.id_situacao = Number(formEdicaoMassa.id_situacao);
    }
    if (formEdicaoMassa.data.trim()) {
      updates.data = formEdicaoMassa.data.trim();
    }
    if (formEdicaoMassa.valor.trim()) {
      try {
        const valorNormalizado = normalizarValor(formEdicaoMassa.valor, "de edição em massa");
        updates.valor = valorNormalizado;
      } catch (error) {
        alert(error.message);
        return;
      }
    }
    if (formEdicaoMassa.descricao.trim()) {
      updates.descricao = formEdicaoMassa.descricao.trim();
    }

    if (Object.keys(updates).length === 0) {
      alert("Preencha pelo menos um campo para aplicar em lote.");
      return;
    }

    try {
      setSubmetendoMassa(true);
      await atualizarLancamentosBatch(selectedIds, updates);
      fecharModalEdicaoMassa();
      setSelectedIds([]);
      fetchLancamentosIncompletos();
      onChanged?.();
      alert("Atualização aplicada nas transações selecionadas.");
    } catch (error) {
      const mensagem = error?.response?.data?.error || error.message || "Falha ao atualizar lançamentos";
      alert(mensagem);
    } finally {
      setSubmetendoMassa(false);
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
            {selecionados.length > 0 && (
              <div className="transacoes-card__stat">
                <span>Selecionadas</span>
                <strong>{selecionados.length}</strong>
              </div>
            )}
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
            {canEdit && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={abrirModalEdicaoMassa}
                disabled={selecionados.length === 0}
              >
                ✨ Editar selecionadas
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
            selectedIds={selectedIds}
            onToggle={toggleSelecao}
            onToggleAll={toggleSelecionarTodos}
            allSelected={canEdit && lancamentos.length > 0 && selectedIds.length === lancamentos.length}
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

      <ModalEdicaoMassa
        stats={{
          count: selecionados.length,
          totalSelecionado,
        }}
        formState={formEdicaoMassa}
        setFormState={setFormEdicaoMassa}
        onApply={aplicarEdicaoMassa}
        categorias={categorias}
        imoveis={imoveis}
        disabled={submetendoMassa}
      />
    </>
  );
}

export default TransacoesIncompletas;
