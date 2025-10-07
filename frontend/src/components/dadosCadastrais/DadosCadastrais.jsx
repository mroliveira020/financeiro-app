import React, { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../../services/http";
import ModalSelecionarImovel from "./ModalSelecionarImovel";
import ModalEditarImovel from "./ModalEditarImovel";
import { useAuth } from "../../context/AuthContext";

function DadosCadastrais() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [imovel, setImovel] = useState(null);
  const [expandir, setExpandir] = useState(false);
  const [mostrarModalImoveis, setMostrarModalImoveis] = useState(false);
  const [mostrarModalEditar, setMostrarModalEditar] = useState(false);
  const { hasRole } = useAuth();
  const canEdit = hasRole("editor", "admin");

  useEffect(() => {
    fetchImovel();
  }, [id]);

  const fetchImovel = async () => {
    try {
      const { data } = await api.get(`/imoveis/${id}`);
      setImovel(data);
    } catch (error) {
      console.error("Erro ao buscar dados do imóvel", error);
    }
  };

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
    if (!mapaDisponivel) {
      return <div className="dados-card__map--placeholder">Localização não informada</div>;
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

  const formatarPorcentagem = (valor) => {
    if (valor === null || valor === undefined || Number.isNaN(Number(valor))) {
      return "0,00%";
    }
    return `${(parseFloat(valor) * 100).toFixed(2).replace(".", ",")}%`;
  };

  const formatarMoeda = (valor) => {
    if (valor === null || valor === undefined || Number.isNaN(parseFloat(valor))) {
      return "R$ 0,00";
    }
    return Number(valor).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
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
      { label: "Corretagem", value: formatarPorcentagem(imovel.corretagem) },
      { label: "Ganho de Capital", value: formatarPorcentagem(imovel.ganho_capital) },
      { label: "Valor de Venda", value: formatarMoeda(imovel.valor_venda) },
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
        <div className="dados-card__actions">
          <button type="button" onClick={() => setMostrarModalImoveis(true)}>
            🏠 Trocar imóvel
          </button>
          {canEdit && (
            <button type="button" onClick={() => setMostrarModalEditar(true)}>
              ✏️ Editar dados
            </button>
          )}
          <button type="button" onClick={() => setExpandir((prev) => !prev)}>
            {expandir ? "Ocultar detalhes" : "Mostrar detalhes"}
          </button>
        </div>

        <div className="dados-card__layout">
          <div className="dados-card__media">
            {imovel.foto_url ? (
              <figure className="dados-card__photo">
                <img src={imovel.foto_url} alt={`Foto do imóvel ${imovel.nome}`} />
              </figure>
            ) : null}
            <div
              className={`dados-card__map ${imovel.foto_url ? "dados-card__map--compact" : "dados-card__map--full"}`}
            >
              {renderMapa()}
            </div>
            {mapaLink && (
              <button
                type="button"
                className="dados-card__map-button"
                onClick={() => window.open(mapaLink, "_blank", "noopener")}
              >
                🌐 Abrir mapa ampliado
              </button>
            )}
          </div>
          <div className="dados-card__name">
            <span className="dados-card__status" data-status={imovel.vendido ? "vendido" : "disponivel"}>
              {imovel.vendido ? "Imóvel vendido" : "Imóvel em andamento"}
            </span>
            <h2>{imovel.nome}</h2>
          </div>
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
