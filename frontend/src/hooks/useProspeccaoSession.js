import { useCallback, useEffect, useMemo, useRef } from "react";

// A identidade da abertura evita reutilizar respostas ao reabrir o mesmo imóvel.
export default function useProspeccaoSession() {
  const currentRef = useRef(null);

  const cancel = useCallback(() => {
    currentRef.current?.controller.abort();
    currentRef.current = null;
  }, []);

  const begin = useCallback((numeroBem, origem) => {
    cancel();
    const controller = new AbortController();
    const session = {
      numeroBem: String(numeroBem),
      origem,
      controller,
      signal: controller.signal,
      isCurrent: () => currentRef.current === session && !controller.signal.aborted,
      async wait(promise) {
        const data = await promise;
        if (!session.isCurrent()) throw new DOMException("Consulta cancelada", "AbortError");
        if (data?.numero_bem != null && String(data.numero_bem) !== session.numeroBem) {
          throw new Error("A resposta recebida pertence a outro imóvel.");
        }
        return data;
      },
    };
    currentRef.current = session;
    return session;
  }, [cancel]);

  const get = useCallback((numeroBem, origem) => {
    const session = currentRef.current;
    return session?.isCurrent() && session.numeroBem === String(numeroBem) && session.origem === origem
      ? session : null;
  }, []);

  useEffect(() => cancel, [cancel]);
  return useMemo(() => ({ begin, get, cancel }), [begin, get, cancel]);
}
