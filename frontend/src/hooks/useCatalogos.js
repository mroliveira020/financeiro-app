import { useEffect, useState } from "react";
import { fetchCategorias, fetchImoveis } from "../services/api";

const cache = {
  categorias: null,
  imoveis: null,
};

const pending = {
  categorias: null,
  imoveis: null,
};

async function carregarCategorias() {
  if (cache.categorias) {
    return cache.categorias;
  }
  if (!pending.categorias) {
    pending.categorias = fetchCategorias().then((lista) => {
      cache.categorias = lista;
      pending.categorias = null;
      return lista;
    }).catch((erro) => {
      pending.categorias = null;
      throw erro;
    });
  }
  return pending.categorias;
}

async function carregarImoveis() {
  if (cache.imoveis) {
    return cache.imoveis;
  }
  if (!pending.imoveis) {
    pending.imoveis = fetchImoveis().then((lista) => {
      cache.imoveis = lista;
      pending.imoveis = null;
      return lista;
    }).catch((erro) => {
      pending.imoveis = null;
      throw erro;
    });
  }
  return pending.imoveis;
}

export function invalidateCatalogo(tipo) {
  if (!tipo || tipo === "categorias") {
    cache.categorias = null;
  }
  if (!tipo || tipo === "imoveis") {
    cache.imoveis = null;
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("catalogo:invalidate", { detail: { tipo } }));
  }
}

export function useCatalogos() {
  const [estado, setEstado] = useState({
    categorias: cache.categorias,
    imoveis: cache.imoveis,
    carregando: !cache.categorias || !cache.imoveis,
    erro: null,
  });

  useEffect(() => {
    let ativo = true;

    async function carregar() {
      try {
        const [categorias, imoveis] = await Promise.all([
          carregarCategorias(),
          carregarImoveis(),
        ]);
        if (!ativo) return;
        setEstado({ categorias, imoveis, carregando: false, erro: null });
      } catch (erro) {
        if (!ativo) return;
        setEstado((prev) => ({
          ...prev,
          carregando: false,
          erro,
        }));
      }
    }

    if (!cache.categorias || !cache.imoveis) {
      carregar();
    } else {
      setEstado({ categorias: cache.categorias, imoveis: cache.imoveis, carregando: false, erro: null });
    }

    const listener = () => {
      setEstado((prev) => ({ ...prev, carregando: true }));
      carregar();
    };

    if (typeof window !== "undefined") {
      window.addEventListener("catalogo:invalidate", listener);
    }

    return () => {
      ativo = false;
      if (typeof window !== "undefined") {
        window.removeEventListener("catalogo:invalidate", listener);
      }
    };
  }, []);

  const recarregar = () => {
    invalidateCatalogo();
    setEstado((prev) => ({ ...prev, carregando: true }));
    Promise.all([carregarCategorias(), carregarImoveis()])
      .then(([categorias, imoveis]) => {
        setEstado({ categorias, imoveis, carregando: false, erro: null });
      })
      .catch((erro) => {
        setEstado((prev) => ({ ...prev, carregando: false, erro }));
      });
  };

  return {
    categorias: estado.categorias || [],
    imoveis: estado.imoveis || [],
    carregando: estado.carregando,
    erro: estado.erro,
    recarregar,
  };
}
