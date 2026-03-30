import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../../services/http";
import ModalSelecionarImovel from "./ModalSelecionarImovel";
import ModalEditarImovel from "./ModalEditarImovel";
import { useAuth } from "../../context/AuthContext";
import { useCompactLayout } from "../../hooks/useCompactLayout";

function DadosCadastrais() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [imovel, setImovel] = useState(null);
  const [expandir, setExpandir] = useState(false);
  const [mostrarModalImoveis, setMostrarModalImoveis] = useState(false);
  const [mostrarModalEditar, setMostrarModalEditar] = useState(false);
  const [mostrarMapa, setMostrarMapa] = useState(false);
  const { hasRole } = useAuth();
  const canEdit = hasRole("editor", "admin");
  const compactLayout = useCompactLayout();

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
              {compactLayout && !mostrarMapa ? renderMapa() : null}
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

        {expandir && (
          <dl className="dados-card__details">
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
    </>
  );
}

export default DadosCadastrais;
