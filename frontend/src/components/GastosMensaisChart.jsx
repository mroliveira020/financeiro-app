import React, { useMemo } from "react";
import { Bar } from "react-chartjs-2";
import "chart.js/auto";
import palette from "../utils/chartPalette";

const formatter = new Intl.DateTimeFormat("pt-BR", {
  month: "short",
  year: "2-digit",
});

function extrairAnoMes(mesISO) {
  if (!mesISO) return null;
  const partes = String(mesISO).split("-");
  if (partes.length < 2) return null;

  const ano = Number(partes[0]);
  const mes = Number(partes[1]);

  if (!Number.isFinite(ano) || !Number.isFinite(mes)) {
    return null;
  }

  const mesNormalizado = Math.min(12, Math.max(1, mes));
  return { ano, mes: mesNormalizado };
}

function normalizarMesLabel(mesISO) {
  const parsed = extrairAnoMes(mesISO);
  if (!parsed) {
    return mesISO;
  }

  const dataLocal = new Date(parsed.ano, parsed.mes - 1, 1);
  if (Number.isNaN(dataLocal.getTime())) {
    return mesISO;
  }

  return formatter.format(dataLocal).replace(" de ", "/");
}

export default function GastosMensaisChart({ dados = [] }) {
  const chartConfig = useMemo(() => {
    if (!dados.length) {
      return null;
    }

    const mesesOrdenados = Array.from(new Set(dados.map((item) => item.mes))).sort((a, b) => {
      const parsedA = extrairAnoMes(a);
      const parsedB = extrairAnoMes(b);

      if (parsedA && parsedB) {
        if (parsedA.ano !== parsedB.ano) {
          return parsedA.ano - parsedB.ano;
        }
        return parsedA.mes - parsedB.mes;
      }

      return String(a).localeCompare(String(b));
    });

    const gruposPorImovel = new Map();

    dados.forEach((item) => {
      if (!gruposPorImovel.has(item.id_imovel)) {
        gruposPorImovel.set(item.id_imovel, {
          label: item.nome_imovel,
          data: new Array(mesesOrdenados.length).fill(0),
        });
      }
      const dataset = gruposPorImovel.get(item.id_imovel);
      const mesIndex = mesesOrdenados.indexOf(item.mes);
      if (mesIndex >= 0) {
        const valor = Number(item.total ?? 0);
        dataset.data[mesIndex] += Number.isFinite(valor) ? valor : 0;
      }
    });

    const datasets = Array.from(gruposPorImovel.values()).map((dataset, index) => ({
      ...dataset,
      backgroundColor: palette[index % palette.length],
      borderColor: palette[index % palette.length].replace("0.65", "0.9"),
      stack: "desembolsos",
      borderRadius: 4,
      borderWidth: 1,
    }));

    return {
      data: {
        labels: mesesOrdenados.map((mes) => normalizarMesLabel(mes)),
        datasets,
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "bottom",
            labels: {
              boxWidth: 12,
              boxHeight: 12,
            },
          },
          tooltip: {
            callbacks: {
              label: (context) => {
                const valor = context.parsed.y || 0;
                return `${context.dataset.label}: ${valor.toLocaleString("pt-BR", {
                  style: "currency",
                  currency: "BRL",
                  minimumFractionDigits: 2,
                })}`;
              },
            },
          },
        },
        scales: {
          x: {
            stacked: true,
          },
          y: {
            stacked: true,
            ticks: {
              callback: (value) =>
                Number(value).toLocaleString("pt-BR", {
                  style: "currency",
                  currency: "BRL",
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 0,
                }),
            },
          },
        },
      },
    };
  }, [dados]);

  if (!dados.length) {
    return (
      <div className="text-center text-muted py-4">
        <p className="mb-1">Ainda não há dados suficientes para montar o gráfico.</p>
        <small>Cadastre lançamentos confirmados para visualizar os totais mensais.</small>
      </div>
    );
  }

  if (!chartConfig) {
    return null;
  }

  return (
    <div style={{ minHeight: 320 }}>
      <Bar data={chartConfig.data} options={chartConfig.options} />
    </div>
  );
}
