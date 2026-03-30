import React, { useCallback, useEffect, useMemo, useState } from "react";
/* global bootstrap */
import { useParams, useNavigate } from "react-router-dom";
import api from "../../services/http";
import ModalSelecionarImovel from "./ModalSelecionarImovel";
import ModalEditarImovel from "./ModalEditarImovel";
import { useAuth } from "../../context/AuthContext";
import { useCompactLayout } from "../../hooks/useCompactLayout";
import {
  fetchFinanceiroCompartilhado,
  fetchImoveisFinanceiroAcessiveis,
  fetchLancamentosCompletos,
  fetchLancamentosIncompletos,
} from "../../services/api";
import { useCatalogos } from "../../hooks/useCatalogos";
import ModalNovaTransacao from "../TransacoesIncompletas/ModalNovaTransacao";

function DadosCadastrais({ refreshKey = 0, onChanged }) {
  const { id } = useParams();
  const navigate = useNavigate();

  const [imovel, setImovel] = useState(null);
  const [expandir, setExpandir] = useState(false);
  const [mostrarModalImoveis, setMostrarModalImoveis] = useState(false);
  const [mostrarModalEditar, setMostrarModalEditar] = useState(false);
  const [mostrarMapa, setMostrarMapa] = useState(false);
  const [novaTransacao, setNovaTransacao] = useState(null);
  const [imoveisAcessiveis, setImoveisAcessiveis] = useState([]);
  const [quickStats, setQuickStats] = useState({
    pendencias: 0,
    historico: 0,
    saldo: null,
  });
  const { hasRole, user } = useAuth();
  const canEdit = hasRole("editor", "admin");
  const compactLayout = useCompactLayout();
  const isAdmin = user?.role === "admin";
  const { categorias, imoveis } = useCatalogos({ includeImoveis: isAdmin });

  const irParaSecao = useCallback((sectionId) => {
    if (!sectionId) return;
    window.requestAnimationFrame(() => {
      const element = document.getElementById(sectionId);
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  }, []);

  const fetchImovel = useCallback(async () => {
    try {
      const { data } = await api.get(`/imoveis/${id}`);
      setImovel(data);
    } catch (error) {
      console.error("Erro ao buscar dados do imóvel", error);
      if (error?.response?.status === 403) {
        navigate("/", { replace: true });
      }
    }
  }, [id, navigate]);

  useEffect(() => {
    fetchImovel();
  }, [fetchImovel]);

  useEffect(() => {
    setMostrarMapa(false);
  }, [id]);

  useEffect(() => {
    let ativo = true;
    if (!compactLayout || isAdmin) return undefined;
    fetchImoveisFinanceiroAcessiveis()
      .then((lista) => {
        if (!ativo) return;
        setImoveisAcessiveis(lista || []);
      })
      .catch((error) => {
        console.error("Erro ao buscar imóveis acessíveis para nova transação", error);
        if (!ativo) return;
        setImoveisAcessiveis([]);
      });
    return () => {
      ativo = false;
    };
  }, [compactLayout, isAdmin]);

  useEffect(() => {
    let ativo = true;
    if (!compactLayout || !id) return undefined;

    Promise.all([
      fetchLancamentosIncompletos({ imovelId: id, page: 1, pageSize: 1 }),
      fetchLancamentosCompletos({ imovelId: id, page: 1, pageSize: 1 }),
      fetchFinanceiroCompartilhado(id),
    ])
      .then(([incompletas, completas, compartilhado]) => {
        if (!ativo) return;
        const socios = compartilhado?.socios || [];
        const socioAtual = socios.find((socio) => Number(socio.user_id) === Number(user?.id));
        const saldo = Number(socioAtual?.saldo_liquido || 0);
        setQuickStats({
          pendencias: Number(incompletas?.summary?.total || incompletas?.total || 0),
          historico: Number(completas?.summary?.total || completas?.total || 0),
          saldo:
            saldo > 0
              ? { tipo: "receber", valor: saldo }
              : saldo < 0
                ? { tipo: "pagar", valor: Math.abs(saldo) }
                : null,
        });
      })
      .catch((error) => {
        console.error("Erro ao carregar indicadores rápidos do imóvel", error);
        if (!ativo) return;
        setQuickStats({ pendencias: 0, historico: 0, saldo: null });
      });

    return () => {
      ativo = false;
    };
  }, [compactLayout, id, refreshKey, user?.id]);

  const trocarImovel = (novoId) => {
    setMostrarModalImoveis(false);
    navigate(`/dashboard/${novoId}`);
  };

  const mapaDisponivel = Boolean(imovel?.latitude && imovel?.longitude);
  const mapaEmbedUrl = mapaDisponivel
    ? `https://maps.google.com/maps?q=${imovel.latitude},${imovel.longitude}&z=15&output=embed`
    : null;
  const mapaLink = mapaDisponivel
    ? `https://www.google.com/maps/search/?api=1&query=${imovel.latitude},${imovel.longitude}`
    : null;

  const renderMapa = () => {
    if (!mapaDisponivel) return null;
    if (compactLayout && !mostrarMapa) {
      return (
        <div className="dados-card__map-mobile-actions">
          <button
            type="button"
            className="dados-card__map-inline-button"
            onClick={() => setMostrarMapa(true)}
          >
            Carregar mapa
          </button>
          {mapaLink && (
            <button
              type="button"
              className="dados-card__map-button"
              onClick={() => window.open(mapaLink, "_blank", "noopener")}
            >
              Abrir no Google Maps
            </button>
          )}
        </div>
      );
    }
    if (!mostrarMapa) {
      return (
        <div className="dados-card__map--placeholder dados-card__map--placeholder-action">
          <div className="dados-card__map-copy">
            <strong>Mapa do imóvel</strong>
            <span>Carregue o mapa apenas quando precisar consultar a localização.</span>
          </div>
          <button
            type="button"
            className="dados-card__map-inline-button"
            onClick={() => setMostrarMapa(true)}
          >
            Carregar mapa
          </button>
        </div>
      );
    }
    return (
      <iframe
        title="Mapa do Imóvel"
        src={mapaEmbedUrl}
        allowFullScreen
        loading="lazy"
      />
    );
  };

  const detalhes = useMemo(() => {
    if (!imovel) {
      return [];
    }
    return [
      { label: "Endereço", value: imovel.endereco || "Não informado" },
      { label: "Ocupante", value: imovel.nome_ocupante || "Não informado" },
      { label: "CPF do Ocupante", value: imovel.cpf_ocupante || "Não informado" },
      { label: "Latitude", value: imovel.latitude || "Não informado" },
      { label: "Longitude", value: imovel.longitude || "Não informado" },
      { label: "Status", value: imovel.vendido ? "Vendido" : "Disponível" },
    ];
  }, [imovel]);

  const abrirDetalhes = useCallback(() => {
    setExpandir(true);
    window.setTimeout(() => {
      const element = document.getElementById("dados-detalhes-imovel");
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 80);
  }, []);

  const abrirNovaTransacao = useCallback(() => {
    setNovaTransacao({
      data: new Date().toLocaleDateString("pt-BR"),
      descricao: "",
      valor: "",
      id_categoria: "",
      id_imovel: String(id || ""),
      paid_by_user_id: "",
    });
    const modal = new bootstrap.Modal(document.getElementById("modalNovaTransacaoDashboard"));
    modal.show();
  }, [id]);

  const normalizarValor = useCallback((valorBruto) => {
    const texto = `${valorBruto ?? ""}`.trim();
    if (!texto) throw new Error("Preencha um valor válido.");
    const somenteNumeros = texto.replace(/[^0-9,.-]/g, "");
    const usaVirgula = somenteNumeros.includes(",");
    const semMilhar = usaVirgula ? somenteNumeros.replace(/\./g, "") : somenteNumeros;
    const numero = Number(semMilhar.replace(",", "."));
    if (!Number.isFinite(numero)) throw new Error("Preencha um valor válido.");
    return numero;
  }, []);

  const salvarNovaTransacao = useCallback(async () => {
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
          valor: normalizarValor(novaTransacao.valor),
          id_imovel: parseInt(novaTransacao.id_imovel, 10),
          id_categoria: parseInt(novaTransacao.id_categoria, 10),
          id_situacao: 1,
          ativo: 1,
          paid_by_user_id: novaTransacao.paid_by_user_id ? parseInt(novaTransacao.paid_by_user_id, 10) : null,
          tipo_movimentacao: "despesa_imovel",
        },
      ]);

      const modal = bootstrap.Modal.getInstance(document.getElementById("modalNovaTransacaoDashboard"));
      modal?.hide();
      setNovaTransacao(null);
      onChanged?.();
    } catch (error) {
      console.error("Erro ao incluir transação pelo menu mobile", error);
      alert(error?.response?.data?.error || error.message || "Erro ao incluir transação.");
    }
  }, [normalizarValor, novaTransacao, onChanged]);

  const formatarBadgeMoeda = useCallback(
    (valor) =>
      Number(valor || 0).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }),
    []
  );

  if (!imovel) {
    return (
      <section className="dashboard-card dados-card">
        <span className="text-muted">Carregando dados do imóvel...</span>
      </section>
    );
  }

  return (
    <>
      <section className="dashboard-card dados-card">
        {compactLayout ? (
          <div className={`dados-card__mobile-shell ${mapaDisponivel ? "has-map" : "no-map"}`}>
            {mapaDisponivel ? (
              <div className="dados-card__mobile-hero">
                <div className="dados-card__mobile-hero-map">
                  {mostrarMapa ? (
                    <div className="dados-card__map dados-card__map--hero">{renderMapa()}</div>
                  ) : (
                    <button
                      type="button"
                      className="dados-card__hero-map-trigger"
                      onClick={() => setMostrarMapa(true)}
                    >
                      <span className="dados-card__hero-map-label">Mapa do imóvel</span>
                      <strong>Toque para abrir</strong>
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="dados-card__mobile-hero dados-card__mobile-hero--fallback" />
            )}

            <div className="dados-card__mobile-panel">
              <div className="dados-card__name dados-card__name--mobile">
                <span className="dados-card__status" data-status={imovel.vendido ? "vendido" : "disponivel"}>
                  {imovel.vendido ? "Imóvel vendido" : "Imóvel em andamento"}
                </span>
                <h2>{imovel.nome}</h2>
                <div className="dados-card__mobile-summary">
                  <strong>{imovel.endereco || "Endereço não informado"}</strong>
                  <span>{mapaDisponivel ? "Localização pronta para consulta" : "Sem geolocalização salva"}</span>
                </div>
              </div>

              <div className="dados-card__quick-menu">
                <button type="button" className="dados-card__quick-button" onClick={() => setMostrarModalImoveis(true)}>
                  <span className="dados-card__quick-icon-wrap">
                    <span className="dados-card__quick-icon" aria-hidden="true">🔁</span>
                  </span>
                  <span className="dados-card__quick-label">Trocar</span>
                </button>
                <button type="button" className="dados-card__quick-button" onClick={() => irParaSecao("resumo-financeiro")}>
                  <span className="dados-card__quick-icon-wrap">
                    <span className="dados-card__quick-icon" aria-hidden="true">📊</span>
                  </span>
                  <span className="dados-card__quick-label">Orçamento</span>
                </button>
                <button type="button" className="dados-card__quick-button" onClick={() => irParaSecao("financeiro-compartilhado")}>
                  <span className="dados-card__quick-icon-wrap">
                    <span className="dados-card__quick-icon" aria-hidden="true">🤝</span>
                  </span>
                  <span className="dados-card__quick-label">Sócios</span>
                  {quickStats.saldo ? (
                    <small className={`dados-card__quick-badge ${quickStats.saldo.tipo === "receber" ? "is-positive" : "is-warning"}`}>
                      {quickStats.saldo.tipo === "receber" ? "Receber" : "Pagar"} {formatarBadgeMoeda(quickStats.saldo.valor)}
                    </small>
                  ) : null}
                </button>
                {canEdit && (
                  <button
                    type="button"
                    className="dados-card__quick-button"
                    onClick={abrirNovaTransacao}
                  >
                    <span className="dados-card__quick-icon-wrap">
                      <span className="dados-card__quick-icon" aria-hidden="true">➕</span>
                    </span>
                    <span className="dados-card__quick-label">Incluir</span>
                    {quickStats.pendencias > 0 ? (
                      <small className="dados-card__quick-badge is-warning">{quickStats.pendencias}</small>
                    ) : null}
                  </button>
                )}
                <button type="button" className="dados-card__quick-button" onClick={() => irParaSecao("transacoes-completas")}>
                  <span className="dados-card__quick-icon-wrap">
                    <span className="dados-card__quick-icon" aria-hidden="true">✅</span>
                  </span>
                  <span className="dados-card__quick-label">Histórico</span>
                  {quickStats.historico > 0 ? (
                    <small className="dados-card__quick-badge">{quickStats.historico}</small>
                  ) : null}
                </button>
                <button type="button" className="dados-card__quick-button" onClick={abrirDetalhes}>
                  <span className="dados-card__quick-icon-wrap">
                    <span className="dados-card__quick-icon" aria-hidden="true">📋</span>
                  </span>
                  <span className="dados-card__quick-label">Detalhes</span>
                </button>
                {canEdit && (
                  <button type="button" className="dados-card__quick-button" onClick={() => setMostrarModalEditar(true)}>
                    <span className="dados-card__quick-icon-wrap">
                      <span className="dados-card__quick-icon" aria-hidden="true">✏️</span>
                    </span>
                    <span className="dados-card__quick-label">Editar</span>
                  </button>
                )}
                {mapaLink && (
                  <button
                    type="button"
                    className="dados-card__quick-button"
                    onClick={() => window.open(mapaLink, "_blank", "noopener")}
                  >
                    <span className="dados-card__quick-icon-wrap">
                      <span className="dados-card__quick-icon" aria-hidden="true">📍</span>
                    </span>
                    <span className="dados-card__quick-label">Mapa</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="dados-card__layout">
            {mapaDisponivel ? (
              <div className="dados-card__media">
                {(!compactLayout || mostrarMapa) && (
                  <div
                    className="dados-card__map dados-card__map--full"
                  >
                    {renderMapa()}
                  </div>
                )}
                {mapaLink && !compactLayout && (
                  <button
                    type="button"
                    className="dados-card__map-button"
                    onClick={() => window.open(mapaLink, "_blank", "noopener")}
                  >
                    🌐 Abrir mapa ampliado
                  </button>
                )}
              </div>
            ) : null}
            <div className="dados-card__name">
              <span className="dados-card__status" data-status={imovel.vendido ? "vendido" : "disponivel"}>
                {imovel.vendido ? "Imóvel vendido" : "Imóvel em andamento"}
              </span>
              <h2>{imovel.nome}</h2>
              <div className={`dados-card__summary ${!mapaDisponivel ? "dados-card__summary--wide" : ""}`.trim()}>
                <div>
                  <span>Endereço</span>
                  <strong>{imovel.endereco || "Não informado"}</strong>
                </div>
              </div>
            </div>
          </div>
        )}

        {!compactLayout && (
          <div className="dados-card__actions">
            <button type="button" onClick={() => setMostrarModalImoveis(true)}>
              Trocar imóvel
            </button>
            {canEdit && (
              <button type="button" onClick={() => setMostrarModalEditar(true)}>
                Editar dados
              </button>
            )}
            <button type="button" onClick={() => setExpandir((prev) => !prev)}>
              {expandir ? "Ocultar detalhes" : "Mostrar detalhes"}
            </button>
          </div>
        )}

        {expandir && (
          <dl id="dados-detalhes-imovel" className="dados-card__details">
            {detalhes.map((item) => (
              <div key={item.label}>
                <dt>{item.label}</dt>
                <dd>{item.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      {mostrarModalImoveis && (
        <ModalSelecionarImovel
          onClose={() => setMostrarModalImoveis(false)}
          onSelectImovel={trocarImovel}
        />
      )}

      {mostrarModalEditar && (
        <ModalEditarImovel
          imovel={imovel}
          onClose={() => setMostrarModalEditar(false)}
          onSave={() => {
            setMostrarModalEditar(false);
            fetchImovel();
          }}
        />
      )}

      <ModalNovaTransacao
        form={novaTransacao}
        setForm={setNovaTransacao}
        onSave={salvarNovaTransacao}
        categorias={categorias}
        imoveis={isAdmin ? imoveis : imoveisAcessiveis}
        idModal="modalNovaTransacaoDashboard"
      />
    </>
  );
}

export default DadosCadastrais;
