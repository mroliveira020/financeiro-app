/* global bootstrap */
// TransacoesIncompletas.jsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../../services/http";
import { atualizarLancamentosBatch } from "../../services/api";
import LancamentosTable from "./LancamentosTable";
import ModalEdicao from "./ModalEdicao";
import ModalLote from "./ModalLote";
import { useAuth } from "../../context/AuthContext";

const CAMPOS_INLINE = ["id_categoria", "id_imovel", "id_situacao"];

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

const snapshotFromLancamento = (lancamento) => ({
  id_categoria:
    lancamento.id_categoria === null || lancamento.id_categoria === undefined
      ? ""
      : String(lancamento.id_categoria),
  id_imovel:
    lancamento.id_imovel === null || lancamento.id_imovel === undefined
      ? ""
      : String(lancamento.id_imovel),
  id_situacao:
    lancamento.id_situacao === null || lancamento.id_situacao === undefined
      ? ""
      : String(lancamento.id_situacao),
});

function TransacoesIncompletas({ refreshKey = 0, onChanged }) {
  const { id } = useParams();
  const [lancamentos, setLancamentos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [imoveis, setImoveis] = useState([]);
  const [editandoLancamento, setEditandoLancamento] = useState(null);
  const [formEdicao, setFormEdicao] = useState({});
  const [textoLote, setTextoLote] = useState('');

  const [originals, setOriginals] = useState({});
  const [drafts, setDrafts] = useState({});
  const [dirtyMap, setDirtyMap] = useState({});
  const [rowSaving, setRowSaving] = useState({});
  const [savingAll, setSavingAll] = useState(false);

  const { hasRole } = useAuth();
  const canEdit = hasRole("editor", "admin");

  const totais = useMemo(() => {
    if (!lancamentos.length) {
      return { quantidade: 0, soma: 0 };
    }
    const soma = lancamentos.reduce((acc, item) => acc + Number(item.valor || 0), 0);
    return { quantidade: lancamentos.length, soma };
  }, [lancamentos]);

  const categoriasOrdenadas = useMemo(() => {
    return [...categorias].sort((a, b) => a.categoria.localeCompare(b.categoria, 'pt-BR'));
  }, [categorias]);

  const imoveisOrdenados = useMemo(() => {
    return [...imoveis].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [imoveis]);

  const formatarMoeda = (valor) =>
    Number(valor ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

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
  }, [fetchLancamentosIncompletos, fetchCategoriasEImoveis, refreshKey]);

  useEffect(() => {
    const baseOriginals = {};
    const baseDrafts = {};

    lancamentos.forEach((item) => {
      const snapshot = snapshotFromLancamento(item);
      baseOriginals[item.id_lancamento] = snapshot;
      baseDrafts[item.id_lancamento] = { ...snapshot };
    });

    setOriginals(baseOriginals);
    setDrafts(baseDrafts);
    setDirtyMap({});
    setRowSaving({});
  }, [lancamentos]);

  const dirtyIds = useMemo(
    () => Object.keys(dirtyMap).map((key) => Number(key)),
    [dirtyMap]
  );

  const handleFieldChange = useCallback(
    (idLancamento, campo, valor) => {
      setDrafts((prev) => {
        const proximo = { ...prev };
        const base = prev[idLancamento]
          ? { ...prev[idLancamento] }
          : { ...(originals[idLancamento] || { id_categoria: "", id_imovel: "", id_situacao: "" }) };
        base[campo] = valor;
        proximo[idLancamento] = base;

        const original = originals[idLancamento] || { id_categoria: "", id_imovel: "", id_situacao: "" };
        const sujo = CAMPOS_INLINE.some((campoChave) => (base[campoChave] ?? '') !== (original[campoChave] ?? ''));

        setDirtyMap((prevDirty) => {
          const proximoDirty = { ...prevDirty };
          if (sujo) {
            proximoDirty[idLancamento] = true;
          } else {
            delete proximoDirty[idLancamento];
          }
          return proximoDirty;
        });

        return proximo;
      });
    },
    [originals]
  );

  const buildUpdates = useCallback(
    (idLancamento) => {
      const draft = drafts[idLancamento] || { id_categoria: "", id_imovel: "", id_situacao: "" };
      const original = originals[idLancamento] || { id_categoria: "", id_imovel: "", id_situacao: "" };
      const updates = {};

      CAMPOS_INLINE.forEach((campo) => {
        const novo = draft[campo] ?? '';
        const antigo = original[campo] ?? '';
        if (novo !== '' && novo !== antigo) {
          updates[campo] = novo;
        }
      });

      return updates;
    },
    [drafts, originals]
  );

  const salvarLinha = useCallback(
    async (idLancamento, { silencioso = false } = {}) => {
      const updates = buildUpdates(idLancamento);
      if (!Object.keys(updates).length) {
        setDirtyMap((prev) => {
          const proximo = { ...prev };
          delete proximo[idLancamento];
          return proximo;
        });
        return true;
      }

      setRowSaving((prev) => ({ ...prev, [idLancamento]: true }));

      try {
        const updatesNormalizados = {};
        if (updates.id_categoria !== undefined) {
          updatesNormalizados.id_categoria = Number(updates.id_categoria);
        }
        if (updates.id_imovel !== undefined) {
          updatesNormalizados.id_imovel = Number(updates.id_imovel);
        }
        if (updates.id_situacao !== undefined) {
          updatesNormalizados.id_situacao = Number(updates.id_situacao);
        }

        await atualizarLancamentosBatch([idLancamento], updatesNormalizados);

        setDirtyMap((prev) => {
          const proximo = { ...prev };
          delete proximo[idLancamento];
          return proximo;
        });

        if (!silencioso) {
          await fetchLancamentosIncompletos();
          onChanged?.();
        }

        return true;
      } catch (error) {
        const mensagem = error?.response?.data?.error || error.message || "Falha ao atualizar lançamentos";
        alert(mensagem);
        return false;
      } finally {
        setRowSaving((prev) => {
          const proximo = { ...prev };
          delete proximo[idLancamento];
          return proximo;
        });
      }
    },
    [buildUpdates, fetchLancamentosIncompletos, onChanged]
  );

  const aplicarLinha = useCallback(
    async (idLancamento) => {
      await salvarLinha(idLancamento);
    },
    [salvarLinha]
  );

  const aplicarTodos = useCallback(async () => {
    if (!dirtyIds.length) return;

    setSavingAll(true);
    try {
      for (const idLancamento of dirtyIds) {
        const ok = await salvarLinha(idLancamento, { silencioso: true });
        if (!ok) {
          return;
        }
      }

      await fetchLancamentosIncompletos();
      onChanged?.();
    } finally {
      setSavingAll(false);
    }
  }, [dirtyIds, salvarLinha, fetchLancamentosIncompletos, onChanged]);

  const handleExcluir = async (lancamentoId) => {
    if (!window.confirm("Tem certeza que deseja excluir este lançamento?")) return;

    try {
      await api.delete(`/dashboard/lancamentos/${lancamentoId}`);
      await fetchLancamentosIncompletos();
      onChanged?.();
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
      id_situacao: lancamento.id_situacao,
    });
    const modal = new bootstrap.Modal(document.getElementById('modalEdicao'));
    modal.show();
  };

  const tratarValor = (valorStr) => {
    if (!valorStr) return 0;
    return normalizarValor(valorStr, "de edição");
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
        id_categoria: parseInt(formEdicao.id_categoria, 10),
        id_imovel: parseInt(formEdicao.id_imovel, 10),
        id_situacao: parseInt(formEdicao.id_situacao, 10),
      };

      await api.patch(`/dashboard/lancamentos/${editandoLancamento}`, payload);
      await fetchLancamentosIncompletos();
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
          id_imovel: parseInt(id, 10),
          id_categoria: 0,
          id_situacao: 0,
          ativo: 1,
        };
      });

      await api.post('/dashboard/lancamentos/lote', novosLancamentos);

      alert('Lançamentos adicionados com sucesso!');
      await fetchLancamentosIncompletos();
      onChanged?.();
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
            {canEdit && (
              <button
                type="button"
                className="btn btn-success btn-sm"
                onClick={aplicarTodos}
                disabled={!dirtyIds.length || savingAll}
              >
                {savingAll ? 'Aplicando...' : `Aplicar todos (${dirtyIds.length})`}
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
            categorias={categoriasOrdenadas}
            imoveis={imoveisOrdenados}
            draftValues={drafts}
            originalValues={originals}
            dirtyMap={dirtyMap}
            onFieldChange={handleFieldChange}
            onApplyRow={aplicarLinha}
            rowSaving={rowSaving}
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
