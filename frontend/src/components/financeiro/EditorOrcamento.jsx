import { useState, useEffect } from "react";
import api from "../../services/http";
import { normalizarValor } from "../../utils/lancamentos";

function EditorOrcamento({ id_imovel, onClose, onSave }) {
  const [orcamentos, setOrcamentos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    api
      .get(`/orcamentos/${id_imovel}`, { signal: controller.signal })
      .then(({ data }) => {
        if (controller.signal.aborted) return;
        setOrcamentos(
          data.map((item) => ({
            ...item,
            orcamento: Number(item.orcamento || 0)
              .toFixed(2)
              .replace(".", ","),
          })),
        );
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setErro("Não foi possível carregar os orçamentos.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [id_imovel]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (salvando) return;
    setErro("");
    try {
      const payload = orcamentos.map((item) => ({
        id_grupo: item.id_grupo,
        orcamento: normalizarValor(item.orcamento || "0"),
      }));
      setSalvando(true);
      await api.post(`/orcamentos/${id_imovel}`, payload);
      onSave();
    } catch (error) {
      setErro(
        error?.response?.data?.error ||
          error.message ||
          "Não foi possível salvar o orçamento.",
      );
    } finally {
      setSalvando(false);
    }
  };

  const conteudo = (
    <form onSubmit={handleSubmit}>
      <div className="modal-header">
        <h3>Editar orçamento</h3>
      </div>
      <div className="modal-body">
        {loading ? (
          <p role="status">Carregando orçamento…</p>
        ) : (
          <div className="financeiro-tabela-scroll">
            <table className="table table-sm align-middle">
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
                        aria-label={`Orçamento de ${item.descricao}`}
                        type="text"
                        inputMode="decimal"
                        className="form-control form-control-sm text-end"
                        value={item.orcamento}
                        disabled={salvando}
                        onChange={(event) =>
                          setOrcamentos((atuais) =>
                            atuais.map((atual, posicao) =>
                              posicao === index
                                ? { ...atual, orcamento: event.target.value }
                                : atual,
                            ),
                          )
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {erro && (
          <p className="text-danger" role="alert">
            {erro}
          </p>
        )}
      </div>
      <div className="modal-footer gap-2">
        <button
          type="button"
          className="btn btn-outline-secondary btn-sm"
          onClick={onClose}
          disabled={salvando}
        >
          Cancelar
        </button>
        <button
          type="submit"
          className="btn btn-primary btn-sm"
          disabled={loading || salvando || !orcamentos.length}
        >
          {salvando ? "Salvando…" : "Salvar orçamento"}
        </button>
      </div>
    </form>
  );

  return <section className="financeiro-editor-orcamento">{conteudo}</section>;
}

export default EditorOrcamento;
