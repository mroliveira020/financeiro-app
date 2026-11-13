import { useEffect, useState } from "react";
import { buscarResumoTarefas } from "../services/tarefas";

export default function useResumoTarefas(codigos) {
  const key = JSON.stringify(codigos);
  const [resumos, setResumos] = useState({});
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const atualizar = () => setRefresh((value) => value + 1);
    window.addEventListener("portal-tarefas-alteradas", atualizar);
    return () =>
      window.removeEventListener("portal-tarefas-alteradas", atualizar);
  }, []);
  useEffect(() => {
    const numeros = JSON.parse(key);
    if (!numeros.length) return;
    const controller = new AbortController();
    buscarResumoTarefas(numeros, controller.signal)
      .then((rows) => {
        if (!controller.signal.aborted)
          setResumos({
            ...Object.fromEntries(
              numeros.map((numero) => [numero, { total: 0, a_fazer: 0 }]),
            ),
            ...Object.fromEntries(rows.map((row) => [row.numero_bem, row])),
          });
      })
      .catch(() => {
        if (!controller.signal.aborted) setResumos({});
      });
    return () => controller.abort();
  }, [key, refresh]);
  return resumos;
}
