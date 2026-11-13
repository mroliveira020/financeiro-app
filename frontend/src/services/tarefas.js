import api from "./http";

export async function buscarTarefas(params, signal) {
  return (await api.get("/tarefas", { params, signal })).data;
}
export async function buscarOpcoesTarefas(params, signal) {
  return (await api.get("/tarefas/opcoes", { params, signal })).data;
}
export async function salvarTarefa(tarefa) {
  const method = tarefa.versao ? "put" : "post";
  const url = tarefa.versao ? `/tarefas/${tarefa.id}` : "/tarefas";
  return (await api[method](url, tarefa)).data;
}
export async function buscarResumoTarefas(numeros, signal) {
  const params = new URLSearchParams();
  numeros.forEach((numero) => params.append("numero_bem", numero));
  return (await api.get("/tarefas/resumo", { params, signal })).data;
}
export async function consultarIntencao(numero, signal) {
  return (
    await api.get(`/tarefas/intencao/${encodeURIComponent(numero)}`, { signal })
  ).data.intencao;
}
export async function registrarIntencao(numero) {
  return (await api.post(`/tarefas/intencao/${encodeURIComponent(numero)}`, {}))
    .data.intencao;
}
export async function retirarIntencao(numero, id) {
  return (
    await api.delete(`/tarefas/intencao/${encodeURIComponent(numero)}`, {
      data: { id },
    })
  ).data.intencao;
}
export function avisarTarefasAlteradas() {
  window.dispatchEvent(new Event("portal-tarefas-alteradas"));
}
