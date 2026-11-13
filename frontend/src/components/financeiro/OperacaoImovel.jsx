import { useEffect, useState } from "react";
import api from "../../services/http";
import ResumoFinanceiro from "../ResumoFinanceiro";
import FinanceiroCompartilhadoCard from "../FinanceiroCompartilhadoCard";
import DadosCadastrais from "../dadosCadastrais/DadosCadastrais";
import TarefasPainel from "../tarefas/TarefasPainel";
import LancamentosImovel from "./LancamentosImovel";
import { handleTabKeys } from "../../utils/handleTabKeys";

const secoes = [
  ["resumo", "Resumo"],
  ["orcamento", "Orçamento"],
  ["lancamentos", "Lançamentos"],
  ["socios", "Sócios e acertos"],
  ["tarefas", "Tarefas"],
  ["dados", "Dados"],
];

export default function OperacaoImovel({
  imovelId,
  refreshKey,
  onChanged,
  onLoaded,
}) {
  const [imovel, setImovel] = useState(null);
  const [erro, setErro] = useState("");
  const [secao, setSecao] = useState("resumo");
  const [visitadas, setVisitadas] = useState(["resumo"]);
  const [compensando, setCompensando] = useState(false);
  const [visao, setVisao] = useState("total");
  useEffect(() => {
    const controller = new AbortController();
    api
      .get(`/imoveis/${imovelId}`, { signal: controller.signal })
      .then(({ data }) => {
        if (controller.signal.aborted) return;
        setImovel(data);
        setErro("");
        onLoaded({ ...data, id: imovelId });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setErro(
            error?.response?.data?.error ||
              "Não foi possível carregar este imóvel.",
          );
      });
    return () => controller.abort();
  }, [imovelId, refreshKey, onLoaded]);

  if (erro) return <p role="alert">{erro}</p>;
  if (!imovel) return <p role="status">Carregando imóvel…</p>;
  const mapa =
    imovel.latitude && imovel.longitude
      ? `${imovel.latitude},${imovel.longitude}`
      : imovel.endereco || imovel.nome;
  const selecionar = (valor) => {
    setSecao(valor);
    setVisitadas((atuais) =>
      atuais.includes(valor) ? atuais : [...atuais, valor],
    );
  };
  const financeiro = secao === "resumo" || secao === "orcamento";

  return (
    <div className="operacao-imovel">
      <header className="operacao-cabecalho">
        {imovel.foto_url && (
          <img src={imovel.foto_url} alt={`Foto de ${imovel.nome}`} />
        )}
        <div>
          <h1>{imovel.nome}</h1>
          <span className="financeiro-status">
            {imovel.vendido ? "Vendido" : "Ativo"}
          </span>
          <p>{imovel.endereco || "Endereço não informado"}</p>
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapa)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Google Maps ↗
          </a>
        </div>
      </header>
      <div
        className="operacao-secoes"
        role="tablist"
        aria-label={`Seções de ${imovel.nome}`}
        onKeyDown={handleTabKeys}
      >
        {secoes.map(([valor, titulo]) => (
          <button
            type="button"
            key={valor}
            role="tab"
            id={`secao-${imovelId}-${valor}`}
            aria-controls={`conteudo-${imovelId}-${valor}`}
            aria-selected={secao === valor}
            tabIndex={secao === valor ? 0 : -1}
            onClick={() => selecionar(valor)}
          >
            {titulo}
          </button>
        ))}
      </div>
      {(financeiro || (secao === "socios" && !compensando)) && (
        <div className="financeiro-visao" aria-label="Visão financeira">
          {[
            ["total", "Total"],
            ["minha_participacao", "Minha participação"],
          ].map(([valor, titulo]) => (
            <button
              type="button"
              key={valor}
              aria-pressed={visao === valor}
              onClick={() => setVisao(valor)}
            >
              {titulo}
            </button>
          ))}
        </div>
      )}
      <div
        hidden={!financeiro}
        role="tabpanel"
        id={`conteudo-${imovelId}-${financeiro ? secao : "resumo"}`}
        aria-labelledby={`secao-${imovelId}-${financeiro ? secao : "resumo"}`}
      >
        <ResumoFinanceiro
          imovelId={imovelId}
          desktop
          painel={secao}
          refreshKey={refreshKey}
          onChanged={onChanged}
          viewMode={visao}
          onNavigate={selecionar}
        />
      </div>
      {visitadas.includes("lancamentos") && (
        <div
          hidden={secao !== "lancamentos"}
          role="tabpanel"
          id={`conteudo-${imovelId}-lancamentos`}
          aria-labelledby={`secao-${imovelId}-lancamentos`}
        >
          <LancamentosImovel
            imovelId={imovelId}
            refreshKey={refreshKey}
            onChanged={onChanged}
          />
        </div>
      )}
      {visitadas.includes("socios") && (
        <div
          hidden={secao !== "socios"}
          role="tabpanel"
          id={`conteudo-${imovelId}-socios`}
          aria-labelledby={`secao-${imovelId}-socios`}
        >
          <FinanceiroCompartilhadoCard
            onCompensacaoChange={setCompensando}
            imovelId={imovelId}
            desktop
            refreshKey={refreshKey}
            onChanged={onChanged}
            viewMode={visao}
          />
        </div>
      )}
      {visitadas.includes("tarefas") && (
        <div
          hidden={secao !== "tarefas"}
          role="tabpanel"
          id={`conteudo-${imovelId}-tarefas`}
          aria-labelledby={`secao-${imovelId}-tarefas`}
        >
          <TarefasPainel context={{ imovel_id: Number(imovelId) }} />
        </div>
      )}
      {visitadas.includes("dados") && (
        <div
          hidden={secao !== "dados"}
          role="tabpanel"
          id={`conteudo-${imovelId}-dados`}
          aria-labelledby={`secao-${imovelId}-dados`}
        >
          <DadosCadastrais
            imovelId={imovelId}
            desktop
            refreshKey={refreshKey}
            onChanged={onChanged}
          />
        </div>
      )}
    </div>
  );
}
