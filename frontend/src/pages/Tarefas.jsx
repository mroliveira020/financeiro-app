import React from "react";
import { useSearchParams } from "react-router-dom";
import TarefasPainel from "../components/tarefas/TarefasPainel";

export default function Tarefas() {
  const [params] = useSearchParams();
  const numero = params.get("numero_bem");
  const imovelId = params.get("imovel_id");
  const context = numero
    ? { numero_bem: numero }
    : imovelId
      ? { imovel_id: Number(imovelId) }
      : null;
  return (
    <TarefasPainel key={numero || imovelId || "todas"} context={context} />
  );
}
