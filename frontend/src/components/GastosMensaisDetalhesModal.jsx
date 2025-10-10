import React, { useEffect, useState } from "react";

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
});

export default function GastosMensaisDetalhesModal({
  show,
  onClose,
  carregando,
  erro,
  detalhes,
  mesLabel,
  nomeImovel,
  valorSegmento,
  mesISO,
  onCarregarTransacoes,
  transacoesPorCategoria = {},
}) {
  const [expandedCategorias, setExpandedCategorias] = useState([]);

  useEffect(() => {
    if (show) {
      setExpandedCategorias([]);
    }
  }, [show, mesISO, detalhes?.imovel?.id]);

  if (!show) {
    return null;
  }

  const total = detalhes?.total ?? valorSegmento ?? 0;
  const grupos = detalhes?.grupos || [];

  const toggleCategoria = (categoria) => {
    const chave = String(categoria.id_categoria ?? "sem");
    const info = transacoesPorCategoria[chave];
    const precisaCarregar = !info || info.erro || info.itens === undefined;
    setExpandedCategorias((prev) => {
      const possui = prev.includes(chave);
      if (possui) {
        return prev.filter((item) => item !== chave);
      }
      if (precisaCarregar && !info?.carregando) {
        onCarregarTransacoes?.({ categoriaId: categoria.id_categoria });
      }
      return [...prev, chave];
    });
  };

  const renderTransacoes = (categoria) => {
    const chave = String(categoria.id_categoria ?? "sem");
    const info = transacoesPorCategoria[chave];
    if (!info) {
      return null;
    }
    if (info.carregando) {
      return (
        <div className="text-center text-muted py-3">
          <div className="spinner-border spinner-border-sm text-primary me-2" role="status" aria-hidden="true" />
          Carregando transações...
        </div>
      );
    }
    if (info.erro) {
      return <div className="alert alert-warning mb-0 py-2" role="alert">{info.erro}</div>;
    }
    if (!info.itens || !info.itens.length) {
      return <p className="text-muted mb-0">Nenhuma transação encontrada para esta categoria.</p>;
    }
    return (
      <div className="table-responsive mt-2">
        <table className="table table-sm align-middle mb-0">
          <thead>
            <tr>
              <th style={{ width: "100px" }}>Data</th>
              <th>Descrição</th>
              <th className="text-end" style={{ width: "140px" }}>Valor</th>
            </tr>
          </thead>
          <tbody>
            {info.itens.map((transacao) => (
              <tr key={transacao.id}>
                <td>{transacao.data}</td>
                <td>{transacao.descricao}</td>
                <td className="text-end">{currencyFormatter.format(transacao.valor || 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const isCategoriaExpandida = (categoria) => expandedCategorias.includes(String(categoria.id_categoria ?? "sem"));

  return (
    <>
      <div className="modal fade show d-block gastos-detalhes-modal" tabIndex={-1} role="dialog" aria-modal="true">
        <div className="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
          <div className="modal-content">
            <div className="modal-header">
              <div>
                <h5 className="modal-title">{nomeImovel}</h5>
                <p className="modal-subtitle mb-0 text-muted">{mesLabel}</p>
              </div>
              <button type="button" className="btn-close" aria-label="Fechar" onClick={onClose} />
            </div>
            <div className="modal-body">
              {carregando ? (
                <div className="text-center py-4">
                  <div className="spinner-border text-primary mb-3" role="status" aria-hidden="true" />
                  <p className="mb-0 text-muted">Carregando detalhes...</p>
                </div>
              ) : erro ? (
                <div className="alert alert-warning" role="alert">
                  {erro}
                </div>
              ) : grupos.length === 0 ? (
                <p className="text-muted mb-0">Não há lançamentos confirmados para este mês.</p>
              ) : (
                <div className="gastos-detalhes__content">
                  <div className="gastos-detalhes__total shadow-sm">
                    <span>Total do mês</span>
                    <strong>{currencyFormatter.format(total)}</strong>
                  </div>
                  {grupos.map((grupo) => (
                    <section key={grupo.id_grupo ?? `g-${grupo.grupo}`} className="gastos-detalhes__group">
                      <header className="gastos-detalhes__group-header">
                        <h6 className="mb-0">{grupo.grupo}</h6>
                        <span>{currencyFormatter.format(grupo.total_grupo || 0)}</span>
                      </header>
                      <div className="table-responsive">
                        <table className="table table-sm align-middle mb-0">
                          <tbody>
                            {grupo.categorias.map((categoria) => (
                              <React.Fragment key={categoria.id_categoria ?? `c-${categoria.categoria}`}>
                                <tr>
                                  <td>
                                    <div className="d-flex justify-content-between align-items-center gap-2">
                                      <span>{categoria.categoria}</span>
                                      <button
                                        type="button"
                                        className="btn btn-link btn-sm p-0"
                                        onClick={() => toggleCategoria(categoria)}
                                      >
                                        {isCategoriaExpandida(categoria) ? "Ocultar" : "Ver transações"}
                                      </button>
                                    </div>
                                  </td>
                                  <td className="text-end">{currencyFormatter.format(categoria.total || 0)}</td>
                                </tr>
                                {isCategoriaExpandida(categoria) && (
                                  <tr className="bg-light">
                                    <td colSpan={2}>{renderTransacoes(categoria)}</td>
                                  </tr>
                                )}
                              </React.Fragment>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="modal-backdrop fade show" />
    </>
  );
}
