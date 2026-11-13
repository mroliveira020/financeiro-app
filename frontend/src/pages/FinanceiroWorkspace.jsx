import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Home from "./Home";
import OperacaoImovel from "../components/financeiro/OperacaoImovel";
import { handleTabKeys } from "../utils/handleTabKeys";
import "./FinanceiroWorkspace.css";

export default function FinanceiroWorkspace() {
  const location = useLocation();
  const navigate = useNavigate();
  const idAtual =
    location.pathname.match(/^\/dashboard\/(\d+)\/?$/)?.[1] || "carteira";
  const [abas, setAbas] = useState(() =>
    idAtual === "carteira" ? [] : [{ id: idAtual, nome: "Carregando imóvel…" }],
  );
  const [refreshKey, setRefreshKey] = useState(0);
  const posicoes = useRef({});

  useEffect(() => {
    if (idAtual !== "carteira")
      setAbas((atuais) =>
        atuais.some((item) => item.id === idAtual)
          ? atuais
          : [...atuais, { id: idAtual, nome: "Carregando imóvel…" }],
      );
  }, [idAtual]);

  useLayoutEffect(() => {
    const salvas = posicoes.current;
    const main = document.querySelector(".app-shell__main");
    const posicao = salvas[idAtual] || { janela: 0, main: 0 };
    window.scrollTo(0, posicao.janela);
    if (main) main.scrollTop = posicao.main;
    const registrar = () => {
      salvas[idAtual] = { janela: window.scrollY, main: main?.scrollTop || 0 };
    };
    window.addEventListener("scroll", registrar);
    main?.addEventListener("scroll", registrar);
    return () => {
      window.removeEventListener("scroll", registrar);
      main?.removeEventListener("scroll", registrar);
    };
  }, [idAtual]);

  const atualizarNome = useCallback((imovel) => {
    setAbas((atuais) =>
      atuais.map((item) =>
        item.id === String(imovel.id) && item.nome !== imovel.nome
          ? { ...item, nome: imovel.nome }
          : item,
      ),
    );
  }, []);
  const abrir = (imovel) => {
    const id = String(imovel.id);
    setAbas((atuais) =>
      atuais.some((item) => item.id === id)
        ? atuais
        : [...atuais, { id, nome: imovel.nome }],
    );
    navigate(`/dashboard/${id}`);
  };
  const fechar = (id) => {
    setAbas((atuais) => atuais.filter((item) => item.id !== id));
    delete posicoes.current[id];
    if (idAtual === id) navigate("/financeiro");
  };
  const atualizar = useCallback(() => setRefreshKey((valor) => valor + 1), []);

  return (
    <div className="financeiro-workspace">
      <div
        className="financeiro-abas"
        role="tablist"
        aria-label="Carteira e imóveis abertos"
        onKeyDown={handleTabKeys}
      >
        {[{ id: "carteira", nome: "Carteira" }, ...abas].map((item) => (
          <div className="financeiro-aba" key={item.id}>
            <button
              type="button"
              role="tab"
              id={`financeiro-aba-${item.id}`}
              aria-controls={`financeiro-painel-${item.id}`}
              aria-selected={idAtual === item.id}
              tabIndex={idAtual === item.id ? 0 : -1}
              onClick={() =>
                navigate(
                  item.id === "carteira"
                    ? "/financeiro"
                    : `/dashboard/${item.id}`,
                )
              }
            >
              {item.nome}
            </button>
            {item.id !== "carteira" && (
              <button
                type="button"
                className="financeiro-fechar-aba"
                aria-label={`Fechar aba ${item.nome}`}
                onClick={() => fechar(item.id)}
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>
      <div
        id="financeiro-painel-carteira"
        role="tabpanel"
        aria-labelledby="financeiro-aba-carteira"
        hidden={idAtual !== "carteira"}
      >
        <Home desktop onOpenImovel={abrir} refreshKey={refreshKey} />
      </div>
      {abas.map((item) => (
        <div
          key={item.id}
          id={`financeiro-painel-${item.id}`}
          role="tabpanel"
          aria-labelledby={`financeiro-aba-${item.id}`}
          hidden={idAtual !== item.id}
        >
          <OperacaoImovel
            imovelId={item.id}
            refreshKey={refreshKey}
            onChanged={atualizar}
            onLoaded={atualizarNome}
          />
        </div>
      ))}
    </div>
  );
}
