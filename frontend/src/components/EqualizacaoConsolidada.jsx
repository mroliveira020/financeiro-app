import React, { useCallback, useEffect, useRef, useState } from "react";
import { fetchEqualizacoesConsolidadas, registrarEqualizacaoConsolidada } from "../services/api";
import "./EqualizacaoConsolidada.css";

const moeda = (centavos) => (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const hoje = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

export default function EqualizacaoConsolidada({ imovelId, refreshKey, onChanged }) {
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [bloqueado, setBloqueado] = useState(false);
  const [aberto, setAberto] = useState(false);
  const [socioId, setSocioId] = useState("");
  const [selecionados, setSelecionados] = useState([]);
  const [data, setData] = useState(hoje);
  const [descricao, setDescricao] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [sucesso, setSucesso] = useState(null);
  const pedidoId = useRef(null);
  const consulta = useRef(null);
  const ativo = useRef(true);
  const fecharRef = useRef(null);
  const botaoRef = useRef(null);

  const carregar = useCallback(async () => {
    consulta.current?.abort();
    const controller = new AbortController();
    consulta.current = controller;
    setCarregando(true);
    setErro("");
    try {
      const result = await fetchEqualizacoesConsolidadas(imovelId, { signal: controller.signal });
      if (controller.signal.aborted || !ativo.current) return;
      setDados(result);
      setBloqueado(false);
      const grupo = result.socios.find((s) => s.imoveis.some((i) => !i.atual)) || result.socios[0];
      setSocioId(grupo ? String(grupo.socio_id) : "");
      setSelecionados(grupo?.imoveis.map((i) => i.id_imovel) || []);
      pedidoId.current = null;
    } catch (e) {
      if (!controller.signal.aborted && ativo.current) {
        setBloqueado(true);
        setErro(e?.response?.data?.error || "Não foi possível consultar os saldos. Tente novamente.");
      }
    } finally {
      if (!controller.signal.aborted && ativo.current) setCarregando(false);
    }
  }, [imovelId]);

  useEffect(() => {
    ativo.current = true;
    carregar();
    return () => { ativo.current = false; consulta.current?.abort(); };
  }, [carregar, refreshKey]);

  const fechar = useCallback(() => {
    if (salvando) return;
    setAberto(false);
    if (sucesso) onChanged?.();
    botaoRef.current?.focus();
  }, [salvando, sucesso, onChanged]);

  useEffect(() => {
    if (!aberto) return undefined;
    fecharRef.current?.focus();
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = anterior; };
  }, [aberto]);

  const grupo = dados?.socios.find((s) => String(s.socio_id) === socioId);
  const itens = grupo?.imoveis.filter((i) => selecionados.includes(i.id_imovel)) || [];
  const aReceber = itens.reduce((s, i) => s + Math.max(0, i.saldo_centavos), 0);
  const aPagar = itens.reduce((s, i) => s + Math.max(0, -i.saldo_centavos), 0);
  const saldo = aReceber - aPagar;
  const outros = dados?.socios.flatMap((s) => s.imoveis).filter((i) => !i.atual).length || 0;
  const mudar = (setter, value) => { setter(value); pedidoId.current = null; };

  const confirmar = async (event) => {
    event.preventDefault();
    if (salvando || itens.length < 2) return;
    setSalvando(true);
    setErro("");
    pedidoId.current ||= crypto.randomUUID();
    try {
      const recibo = await registrarEqualizacaoConsolidada(imovelId, {
        operacao_id: pedidoId.current, socio_id: Number(socioId), data, descricao,
        imoveis: itens.map((i) => ({ id_imovel: i.id_imovel, versao: i.versao })),
      });
      if (!ativo.current) return;
      setSucesso(recibo);
    } catch (e) {
      if (ativo.current) {
        setBloqueado([400, 403, 409].includes(e?.response?.status));
        setErro(e?.response?.data?.error || "Não foi possível confirmar o registro. Tente novamente com os mesmos dados.");
      }
    } finally {
      if (ativo.current) setSalvando(false);
    }
  };

  const teclado = (event) => {
    if (event.key === "Escape") { event.stopPropagation(); fechar(); }
    if (event.key !== "Tab") return;
    const focusables = [...event.currentTarget.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]')];
    if (!focusables.length) { event.preventDefault(); event.currentTarget.focus(); return; }
    const primeiro = focusables[0], ultimo = focusables.at(-1);
    if (event.shiftKey && document.activeElement === primeiro) { event.preventDefault(); ultimo?.focus(); }
    if (!event.shiftKey && document.activeElement === ultimo) { event.preventDefault(); primeiro?.focus(); }
  };

  return <>
    {outros > 0 || erro ? <button type="button" className="btn btn-outline-primary btn-sm equalizacao-consolidada__trigger" ref={botaoRef}
      aria-label="Ver saldos de equalização em outros imóveis" aria-haspopup="dialog"
      onClick={() => { setAberto(true); setSucesso(null); setData(hoje()); setDescricao(""); carregar(); }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path d="M3 7h17m-4-4 4 4-4 4M21 17H4m4-4-4 4 4 4" />
      </svg>
      {erro && !aberto ? "Consultar outros imóveis" : `Outros imóveis (${outros})`}
    </button> : null}
    {aberto ? <div className="equalizacao-consolidada__backdrop">
      <section role="dialog" tabIndex={-1} aria-modal="true" aria-labelledby="acerto-consolidado-titulo" className="equalizacao-consolidada__dialog" onKeyDown={teclado}>
        <header>
          <div><span className="text-muted small">Equalização entre sócios</span><h3 id="acerto-consolidado-titulo">Um acerto entre imóveis</h3></div>
          <button type="button" className="btn-close" aria-label="Fechar acerto consolidado" ref={fecharRef} onClick={fechar} disabled={salvando} />
        </header>
        {sucesso ? <div className="equalizacao-consolidada__body" role="status">
          <h4>Acerto registrado</h4>
          <p>{sucesso.valor_transferido > 0 ? `Uma transferência de ${moeda(Math.round(sucesso.valor_transferido * 100))} foi registrada para os ${sucesso.imoveis.length} imóveis.` : "Os saldos foram compensados integralmente, sem transferência de dinheiro."}</p>
          <p>O rateio de cada imóvel ficou vinculado ao mesmo acerto no histórico.</p>
          <small>Identificação: {sucesso.operacao_id}</small>
          <div><button type="button" className="btn btn-primary mt-3" onClick={fechar}>Concluir</button></div>
        </div> : <form onSubmit={confirmar}>
          <div className="equalizacao-consolidada__body">
            <p>Confira o que você tem a pagar e a receber com o mesmo sócio. Os saldos dos imóveis selecionados serão compensados em um único acerto.</p>
            {carregando ? <p role="status">Atualizando saldos…</p> : <>
              {(dados?.socios.length || 0) > 0 ? <label className="form-label w-100">Sócio
                <select className="form-select" value={socioId} disabled={salvando} onChange={(e) => {
                  mudar(setSocioId, e.target.value);
                  setSelecionados(dados.socios.find((s) => String(s.socio_id) === e.target.value)?.imoveis.map((i) => i.id_imovel) || []);
                }}>{dados.socios.map((s) => <option key={s.socio_id} value={s.socio_id}>{s.socio_nome}</option>)}</select>
              </label> : <p>Não há saldos elegíveis para consolidar neste momento.</p>}
              <fieldset disabled={salvando}>
                <legend className="visually-hidden">Imóveis incluídos no acerto</legend>
                {grupo?.imoveis.map((i) => <label key={i.id_imovel} className="equalizacao-consolidada__item">
                  <input type="checkbox" checked={selecionados.includes(i.id_imovel)} onChange={() => mudar(setSelecionados,
                    selecionados.includes(i.id_imovel) ? selecionados.filter((id) => id !== i.id_imovel) : [...selecionados, i.id_imovel])} />
                  <span>{i.nome}{i.atual ? <small>Imóvel atual</small> : null}</span>
                  <span className={i.saldo_centavos > 0 ? "text-success" : "text-danger"}>{i.saldo_centavos > 0 ? "A receber" : "A pagar"}<strong>{moeda(Math.abs(i.saldo_centavos))}</strong></span>
                </label>)}
              </fieldset>
              {grupo ? <div className="equalizacao-consolidada__resumo" aria-live="polite">
                <span>A receber <strong>{moeda(aReceber)}</strong></span><span>A pagar <strong>{moeda(aPagar)}</strong></span>
                <h4>{saldo > 0 ? `Você recebe ${moeda(saldo)}` : saldo < 0 ? `Você paga ${moeda(-saldo)}` : "Compensação integral: saldo zero"}</h4>
                <p>{saldo === 0 ? "O acerto liquida os saldos selecionados sem movimentação de dinheiro." : `O ${saldo > 0 ? "pagamento do sócio para você" : "seu pagamento para o sócio"} será apenas da diferença. Depois da transferência, registre o acerto abaixo.`}</p>
              </div> : null}
              {itens.length < 2 && grupo ? <p className="text-muted">Selecione pelo menos dois imóveis.</p> : null}
              {grupo ? <div className="equalizacao-consolidada__campos">
                <label className="form-label">Data do acerto<input className="form-control" type="date" required value={data} disabled={salvando} onChange={(e) => mudar(setData, e.target.value)} /></label>
                <label className="form-label">Observação (opcional)<input className="form-control" maxLength={500} value={descricao} disabled={salvando} onChange={(e) => mudar(setDescricao, e.target.value)} /></label>
              </div> : null}
              {(dados?.avisos || []).map((a) => <p className="small text-muted" key={a.id_imovel}>{a.nome}: {a.motivo}</p>)}
            </>}
            {erro ? <div className="alert alert-warning" role="alert">{erro} <button type="button" className="btn btn-link btn-sm" disabled={salvando} onClick={carregar}>Atualizar saldos</button></div> : null}
          </div>
          <footer>
            <button type="button" className="btn btn-secondary" onClick={fechar} disabled={salvando}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={salvando || carregando || !grupo || itens.length < 2 || !data || bloqueado}>
              {salvando ? "Registrando…" : saldo === 0 ? "Registrar compensação" : "Registrar acerto consolidado"}
            </button>
          </footer>
        </form>}
      </section>
    </div> : null}
  </>;
}
