export function safeErrorMessage(error) {
  return error?.response?.data?.error || error?.message || "Falha ao autenticar";
}
