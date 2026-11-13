import { useEffect, useMemo, useState } from "react";

import api from "../../services/http";

const moeda = (valor) =>
  Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
const normalizar = (texto) =>
  String(texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

export default function CarteiraTabela({
  imoveis,
  onOpen,
  onIncluirVendidos,
  refreshKey,
}) {
  const [visao, setVisao] = useState("total");
  const [participacoes, setParticipacoes] = useState(null);
  const [erro, setErro] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    api
      .get("/dashboard/participacoes", { signal: controller.signal })
      .then(({ data }) => {
        if (!controller.signal.aborted) {
          setParticipacoes(data);
          setErro("");
        }
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setErro("Não foi possível consultar suas participações.");
      });
    return () => controller.abort();
  }, [refreshKey]);
  const escalar = (item, campo) =>
    Number(item[campo] || 0) *
    (visao === "total"
      ? 1
      : Number(participacoes?.[String(item.id)] || 0) / 100);
  const [busca, setBusca] = useState("");
  const [situacao, setSituacao] = useState("ativos");
  const [ordenacao, setOrdenacao] = useState("nome");
  const lista = useMemo(
    () =>
      imoveis
        .filter(
          (item) =>
            (situacao === "todos" ||
              Boolean(item.vendido) === (situacao === "vendidos")) &&
            normalizar(`${item.nome} ${item.endereco || ""}`).includes(
              normalizar(busca),
            ),
        )
        .sort((a, b) =>
          ordenacao === "nome"
            ? a.nome.localeCompare(b.nome, "pt-BR")
            : Number(b[ordenacao] || 0) - Number(a[ordenacao] || 0),
        ),
    [imoveis, busca, situacao, ordenacao],
  );
  const totais = lista.reduce(
    (acc, item) => {
      acc.previsto += escalar(item, "investimentoTotal");
      acc.efetivado += escalar(item, "valorEfetivado");
      acc.aInvestir += escalar(item, "valorAInvestir");
      acc.resultado += escalar(item, "lucroProjetado");
      return acc;
    },
    { previsto: 0, efetivado: 0, aInvestir: 0, resultado: 0 },
  );

  return (
    <section className="carteira-tabela">
      <div className="financeiro-visao">
        {[
          ["total", "Total"],
          ["minha", "Minha participação"],
        ].map(([valor, titulo]) => (
          <button
            type="button"
            key={valor}
            aria-pressed={visao === valor}
            disabled={valor === "minha" && !participacoes}
            onClick={() => setVisao(valor)}
          >
            {titulo}
          </button>
        ))}
      </div>
      {erro && <p role="alert">{erro}</p>}
      <div className="financeiro-filtros">
        <label>
          Buscar imóvel
          <input
            type="search"
            value={busca}
            onChange={(event) => setBusca(event.target.value)}
            placeholder="Nome ou endereço"
          />
        </label>
        <label>
          Situação
          <select
            value={situacao}
            onChange={(event) => {
              setSituacao(event.target.value);
              onIncluirVendidos(event.target.value !== "ativos");
            }}
          >
            <option value="ativos">Ativos</option>
            <option value="vendidos">Vendidos</option>
            <option value="todos">Todos</option>
          </select>
        </label>
        <label>
          Ordenar por
          <select
            value={ordenacao}
            onChange={(event) => setOrdenacao(event.target.value)}
          >
            <option value="nome">Nome do imóvel</option>
            <option value="investimentoTotal">Investimento previsto</option>
            <option value="valorEfetivado">Efetivado</option>
            <option value="valorAInvestir">A investir</option>
            <option value="lucroProjetado">Resultado projetado</option>
          </select>
        </label>
      </div>
      <div className="financeiro-metricas">
        {[
          ["Investimento previsto", totais.previsto],
          ["Efetivado", totais.efetivado],
          ["A investir", totais.aInvestir],
          ["Resultado projetado", totais.resultado],
        ].map(([titulo, valor]) => (
          <div key={titulo}>
            <span>{titulo}</span>
            <strong>{moeda(valor)}</strong>
          </div>
        ))}
      </div>
      <div className="financeiro-tabela-scroll">
        <table className="financeiro-tabela">
          <thead>
            <tr>
              <th>Imóvel</th>
              <th>Previsto</th>
              <th>Efetivado</th>
              <th>A investir</th>
              <th>Resultado projetado</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((imovel) => (
              <tr key={imovel.id} onClick={() => onOpen(imovel)}>
                <td>
                  <button
                    type="button"
                    className="carteira-imovel"
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpen(imovel);
                    }}
                  >
                    {imovel.fotoUrl && (
                      <img src={imovel.fotoUrl} alt="" loading="lazy" />
                    )}
                    <span>
                      <strong>{imovel.nome}</strong>
                      <small>
                        {imovel.endereco ||
                          (imovel.vendido ? "Vendido" : "Ativo")}
                        {visao === "minha" &&
                          ` · ${Number(participacoes?.[String(imovel.id)] || 0)}%`}
                      </small>
                    </span>
                  </button>
                </td>
                <td>{moeda(escalar(imovel, "investimentoTotal"))}</td>
                <td>{moeda(escalar(imovel, "valorEfetivado"))}</td>
                <td>{moeda(escalar(imovel, "valorAInvestir"))}</td>
                <td>{moeda(escalar(imovel, "lucroProjetado"))}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">
                Total dos imóveis listados
                <small>
                  {lista.length} {lista.length === 1 ? "imóvel" : "imóveis"}
                </small>
              </th>
              <td>{moeda(totais.previsto)}</td>
              <td>{moeda(totais.efetivado)}</td>
              <td>{moeda(totais.aInvestir)}</td>
              <td>{moeda(totais.resultado)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      {!lista.length && <p role="status">Nenhum imóvel atende aos filtros.</p>}
    </section>
  );
}
