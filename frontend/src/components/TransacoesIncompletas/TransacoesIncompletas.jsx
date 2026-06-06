/* global bootstrap */
// TransacoesIncompletas.jsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../../services/http";
import {
  atualizarLancamentosBatch,
  fetchImoveisFinanceiroAcessiveis,
  fetchLancamentosIncompletos,
  fetchSociosImovel,
} from "../../services/api";
import LancamentosTable from "./LancamentosTable";
import ModalEdicao from "./ModalEdicao";
import ModalLote from "./ModalLote";
import ModalNovaTransacao from "./ModalNovaTransacao";
import { useAuth } from "../../context/AuthContext";
import { useCatalogos } from "../../hooks/useCatalogos";

const CAMPOS_INLINE = ["id_categoria", "id_imovel", "id_situacao"];
const PAGE_SIZE = 50;

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

const buildLotePreview = (textoLote) => {
  const linhas = `${textoLote || ""}`
    .split("\n")
    .map((linha) => linha.trim())
    .filter(Boolean);

  return linhas.map((linha, index) => {
    const partes = linha.includes("\t") ? linha.split("\t") : linha.split(";");
    const [data = "", descricao = "", valorBruto = ""] = partes;
    const preview = {
      numero: index + 1,
      raw: linha,
      data: data.trim(),
      descricao: descricao.trim(),
      valor: valorBruto.trim(),
      erro: "",
    };

    if (partes.length < 3) {
      preview.erro = "Formato inválido. Use Data, Descrição e Valor.";
      return preview;
    }

    if (!preview.data || !preview.descricao || !preview.valor) {
      preview.erro = "Preencha data, descrição e valor.";
      return preview;
    }

    try {
      normalizarValor(preview.valor, preview.numero);
    } catch (error) {
      preview.erro = error.message;
    }

    return preview;
  });
};

function TransacoesIncompletas({ refreshKey = 0, onChanged }) {
  const { id } = useParams();
  const [lancamentos, setLancamentos] = useState([]);
  const [totalRegistros, setTotalRegistros] = useState(0);
  const [summary, setSummary] = useState({ total: 0, soma: 0 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [editandoLancamento, setEditandoLancamento] = useState(null);
  const [formEdicao, setFormEdicao] = useState({});
  const [textoLote, setTextoLote] = useState('');
  const [paidByUserIdLote, setPaidByUserIdLote] = useState("");
  const [loteErro, setLoteErro] = useState("");
  const [novaTransacao, setNovaTransacao] = useState(null);
  const [sociosImovel, setSociosImovel] = useState([]);
  const [carregandoSociosImovel, setCarregandoSociosImovel] = useState(false);
  const [imoveisAcessiveis, setImoveisAcessiveis] = useState([]);

  const [originals, setOriginals] = useState({});
  const [drafts, setDrafts] = useState({});
  const [dirtyMap, setDirtyMap] = useState({});
  const [rowSaving, setRowSaving] = useState({});
  const [savingAll, setSavingAll] = useState(false);

  const { hasCapability } = useAuth();
  const canEdit = hasCapability("admin", "editor");
  const isAdmin = hasCapability("admin");
  const { categorias, imoveis } = useCatalogos({ includeImoveis: isAdmin });

  const totais = useMemo(() => ({
    quantidade: summary.total || 0,
    soma: summary.soma || 0,
  }), [summary]);

  const categoriasOrdenadas = useMemo(() => (
    [...categorias].sort((a, b) => a.categoria.localeCompare(b.categoria, "pt-BR"))
  ), [categorias]);

  const imoveisOrdenados = useMemo(() => (
    [...(isAdmin ? imoveis : imoveisAcessiveis)].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
  ), [isAdmin, imoveis, imoveisAcessiveis]);
  const lotePreview = useMemo(() => buildLotePreview(textoLote), [textoLote]);
  const loteLinhasComErro = useMemo(
    () => lotePreview.filter((linha) => linha.erro).map((linha) => linha.numero),
    [lotePreview]
  );

  const formatarMoeda = (valor) =>
    Number(valor ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const carregarLancamentos = useCallback(
    async (paginaSolicitada = 1) => {
      setLoading(true);
      try {
        const resposta = await fetchLancamentosIncompletos({
          imovelId: id,
          page: paginaSolicitada,
          pageSize: PAGE_SIZE,
        });

        const itens = resposta?.items || [];
        const total = resposta?.summary?.total ?? resposta?.total ?? itens.length;
        const soma = resposta?.summary?.soma ?? 0;
        const paginaRetornada = resposta?.page || paginaSolicitada;
        const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

        if (paginaRetornada > totalPages && totalPages >= 1) {
          setPage(totalPages);
          return;
        }

        setLancamentos(itens);
        setTotalRegistros(total);
        setSummary({ total, soma });
        setPage(paginaRetornada);
      } catch (error) {
        console.error("Erro ao buscar lançamentos incompletos", error);
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
    let ativo = true;
    if (!id) {
      setSociosImovel([]);
      setPaidByUserIdLote("");
      return;
    }
    setCarregandoSociosImovel(true);
    fetchSociosImovel(id, { incluirInativos: false })
      .then((lista) => {
        if (!ativo) return;
        const socios = lista || [];
        setSociosImovel(socios);
        if (socios.length === 1) {
          setPaidByUserIdLote(String(socios[0].user_id));
        } else {
          setPaidByUserIdLote("");
        }
      })
      .catch((error) => {
        console.error("Erro ao buscar sócios do imóvel", error);
        if (!ativo) return;
        setSociosImovel([]);
        setPaidByUserIdLote("");
      })
      .finally(() => {
        if (!ativo) return;
        setCarregandoSociosImovel(false);
      });
    return () => {
      ativo = false;
    };
  }, [id, refreshKey]);

  useEffect(() => {
    carregarLancamentos(page);
  }, [carregarLancamentos, page, refreshKey]);

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
          await carregarLancamentos(page);
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
    [buildUpdates, carregarLancamentos, onChanged, page]
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

      await carregarLancamentos(page);
      onChanged?.();
    } finally {
      setSavingAll(false);
    }
  }, [dirtyIds, salvarLinha, carregarLancamentos, onChanged, page]);

  const handleExcluir = async (lancamentoId) => {
    if (!window.confirm("Tem certeza que deseja excluir este lançamento?")) return;

    try {
      await api.delete(`/dashboard/lancamentos/${lancamentoId}`);
      await carregarLancamentos(page);
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
      paid_by_user_id: lancamento.paid_by_user_id ?? "",
      tipo_movimentacao: lancamento.tipo_movimentacao || "despesa_imovel",
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
        paid_by_user_id: formEdicao.paid_by_user_id ? parseInt(formEdicao.paid_by_user_id, 10) : null,
        tipo_movimentacao: formEdicao.tipo_movimentacao || "despesa_imovel",
      };

      await api.patch(`/dashboard/lancamentos/${editandoLancamento}`, payload);
      await carregarLancamentos(page);
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
    setLoteErro("");
    const modal = new bootstrap.Modal(document.getElementById('modalLote'));
    modal.show();
  };

  const abrirModalNovaTransacao = () => {
    setNovaTransacao({
      data: new Date().toLocaleDateString("pt-BR"),
      descricao: "",
      valor: "",
      id_categoria: "",
      id_imovel: String(id || ""),
      paid_by_user_id: sociosImovel.length === 1 ? String(sociosImovel[0].user_id) : "",
    });
    const modal = new bootstrap.Modal(document.getElementById("modalNovaTransacao"));
    modal.show();
  };

  const enviarLote = async () => {
    try {
      setLoteErro("");
      if (!paidByUserIdLote) {
        setLoteErro("Selecione quem pagou antes de importar o lote.");
        return;
      }
      if (!textoLote.trim()) {
        setLoteErro("Cole os dados do Excel antes de enviar.");
        return;
      }

      const linhasInvalidas = lotePreview.filter((linha) => linha.erro);
      if (linhasInvalidas.length) {
        const resumo = linhasInvalidas
          .slice(0, 3)
          .map((linha) => `Linha ${linha.numero}: ${linha.erro}`)
          .join(" | ");
        setLoteErro(`Corrija as linhas destacadas antes de enviar. ${resumo}`);
        return;
      }

      const novosLancamentos = lotePreview.map((linha) => {
        const valorNormalizado = normalizarValor(linha.valor, linha.numero);
        return {
          data: linha.data,
          descricao: linha.descricao,
          valor: valorNormalizado,
          id_imovel: parseInt(id, 10),
          id_categoria: 0,
          id_situacao: 0,
          ativo: 1,
          paid_by_user_id: parseInt(paidByUserIdLote, 10),
          tipo_movimentacao: "despesa_imovel",
        };
      });

      await api.post('/dashboard/lancamentos/lote', novosLancamentos);

      alert('Lançamentos adicionados com sucesso!');
      await carregarLancamentos(page);
      onChanged?.();
      const modal = bootstrap.Modal.getInstance(document.getElementById('modalLote'));
      modal.hide();
      setTextoLote('');
      setLoteErro("");
      if (sociosImovel.length !== 1) {
        setPaidByUserIdLote("");
      }
    } catch (error) {
      console.error('Erro ao adicionar lançamentos em lote:', error);
      setLoteErro(error?.message || "Erro ao adicionar lançamentos em lote.");
    }
  };

  const salvarNovaTransacao = async () => {
    try {
      if (!novaTransacao?.data || !novaTransacao?.descricao?.trim() || !novaTransacao?.valor) {
        alert("Preencha data, descrição e valor.");
        return;
      }
      if (!novaTransacao?.id_categoria || !novaTransacao?.id_imovel) {
        alert("Selecione categoria e imóvel.");
        return;
      }

      await api.post("/dashboard/lancamentos/lote", [
        {
          data: novaTransacao.data.trim(),
          descricao: novaTransacao.descricao.trim(),
          valor: normalizarValor(novaTransacao.valor, "nova transação"),
          id_imovel: parseInt(novaTransacao.id_imovel, 10),
          id_categoria: parseInt(novaTransacao.id_categoria, 10),
          id_situacao: 1,
          ativo: 1,
          paid_by_user_id: novaTransacao.paid_by_user_id
            ? parseInt(novaTransacao.paid_by_user_id, 10)
            : null,
          tipo_movimentacao: "despesa_imovel",
        },
      ]);

      await carregarLancamentos(page);
      onChanged?.();
      const modal = bootstrap.Modal.getInstance(document.getElementById("modalNovaTransacao"));
      modal.hide();
      setNovaTransacao(null);
    } catch (error) {
      console.error("Erro ao incluir transação", error);
      alert(error?.response?.data?.error || error.message || "Erro ao incluir transação.");
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
                className="btn btn-primary btn-sm"
                onClick={abrirModalNovaTransacao}
                title="Adicionar transação já confirmada"
              >
                + Incluir transação
              </button>
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
            serverPagination={{
              page,
              pageSize: PAGE_SIZE,
              total: totalRegistros,
              onPageChange: setPage,
            }}
            loading={loading}
          />
        </div>
      </section>

      <ModalEdicao
        formEdicao={formEdicao}
        setFormEdicao={setFormEdicao}
        salvarEdicao={salvarEdicao}
        categorias={categoriasOrdenadas}
        imoveis={imoveisOrdenados}
      />

      <ModalLote
        textoLote={textoLote}
        setTextoLote={setTextoLote}
        enviarLote={enviarLote}
        socios={sociosImovel}
        paidByUserId={paidByUserIdLote}
        setPaidByUserId={setPaidByUserIdLote}
        carregandoSocios={carregandoSociosImovel}
        erro={loteErro}
        linhasComErro={loteLinhasComErro}
        preview={lotePreview}
      />

      <ModalNovaTransacao
        form={novaTransacao}
        setForm={setNovaTransacao}
        onSave={salvarNovaTransacao}
        categorias={categoriasOrdenadas}
        imoveis={imoveisOrdenados}
      />
    </>
  );
}

export default TransacoesIncompletas;
