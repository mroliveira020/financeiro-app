import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { useCatalogos } from "../../hooks/useCatalogos";
import { fetchSociosImovel } from "../../services/api";
import api from "../../services/http";
import { buildLotePreview, normalizarValor } from "../../utils/lancamentos";

const moeda = (valor) =>
  Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
const hoje = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const dataIso = (valor) => {
  const texto = String(valor || "");
  const partes = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return partes ? `${partes[3]}-${partes[2]}-${partes[1]}` : texto.slice(0, 10);
};
const dataBr = (valor) => dataIso(valor).split("-").reverse().join("/");
const novoForm = () => ({
  data: hoje(),
  descricao: "",
  valor: "",
  id_categoria: "",
  id_situacao: "1",
  paid_by_user_id: "",
  tipo_movimentacao: "despesa_imovel",
});
const filtrosIniciais = {
  busca: "",
  inicio: "",
  fim: "",
  categoria: "",
  pagador: "",
  situacao: "",
};

export default function LancamentosImovel({ imovelId, refreshKey, onChanged }) {
  const { hasCapability } = useAuth();
  const canEdit = hasCapability("admin", "editor");
  const { categorias } = useCatalogos({ includeImoveis: false });
  const [socios, setSocios] = useState([]);
  const [erroSocios, setErroSocios] = useState("");
  const [sociosLoading, setSociosLoading] = useState(true);
  const [filtros, setFiltros] = useState(filtrosIniciais);
  const [pagina, setPagina] = useState(1);
  const [lista, setLista] = useState({ items: [], total: 0, summary: {} });
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [erroForm, setErroForm] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [form, setForm] = useState(null);
  const [editando, setEditando] = useState(null);
  const [importando, setImportando] = useState(false);
  const [textoLote, setTextoLote] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [recarregar, setRecarregar] = useState(0);
  const salvandoRef = useRef(false);
  const preview = useMemo(() => buildLotePreview(textoLote), [textoLote]);
  const categoriasOrdenadas = useMemo(
    () =>
      [...categorias].sort((a, b) =>
        a.categoria.localeCompare(b.categoria, "pt-BR"),
      ),
    [categorias],
  );

  useEffect(() => {
    let ativo = true;
    setSociosLoading(true);
    fetchSociosImovel(imovelId)
      .then((dados) => {
        if (ativo) {
          setSocios(dados || []);
          setErroSocios("");
        }
      })
      .catch(() => {
        if (ativo)
          setErroSocios(
            "Não foi possível consultar os sócios. Atualize a página antes de salvar.",
          );
      })
      .finally(() => {
        if (ativo) setSociosLoading(false);
      });
    return () => {
      ativo = false;
    };
  }, [imovelId, refreshKey]);

  const pagadorSelecionado = form?.paid_by_user_id || (socios.length === 1 ? String(socios[0].user_id) : "");

  useEffect(() => {
    const controller = new AbortController();
    setCarregando(true);
    setErro("");
    const timeout = setTimeout(() => {
      api
        .get(`/dashboard/lancamentos/imovel/${imovelId}`, {
          params: { ...filtros, page: pagina, pageSize: 30 },
          signal: controller.signal,
        })
        .then(({ data }) => {
          if (controller.signal.aborted) return;
          const ultimaPagina = Math.max(1, Math.ceil(Number(data.total) / 30));
          if (pagina > ultimaPagina) {
            setPagina(ultimaPagina);
            return;
          }
          setLista(data);
        })
        .catch((error) => {
          if (!controller.signal.aborted)
            setErro(
              error?.response?.data?.error ||
                "Não foi possível carregar os lançamentos.",
            );
        })
        .finally(() => {
          if (!controller.signal.aborted) setCarregando(false);
        });
    }, 250);
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [imovelId, filtros, pagina, refreshKey, recarregar]);

  const filtrar = (campo, valor) => {
    setFiltros((atuais) => ({ ...atuais, [campo]: valor }));
    setPagina(1);
  };
  const abrir = (item = null, lote = false) => {
    setEditando(item?.id_lancamento || null);
    setImportando(lote);
    setErroForm("");
    setSucesso("");
    setForm(
      item
        ? {
            ...item,
            data: dataIso(item.data),
            valor: Number(item.valor).toLocaleString("pt-BR", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }),
            id_categoria: String(item.id_categoria ?? ""),
            id_situacao: String(item.id_situacao ?? 0),
            paid_by_user_id: String(item.paid_by_user_id ?? ""),
          }
        : {
            ...novoForm(),
            paid_by_user_id:
              socios.length === 1 ? String(socios[0].user_id) : "",
          },
    );
  };
  const alterar = (campo, valor) =>
    setForm((atual) => ({ ...atual, [campo]: valor }));
  const salvar = async (event) => {
    event.preventDefault();
    if (salvandoRef.current) return;
    setErroForm("");
    setSucesso("");
    try {
      if (erroSocios || sociosLoading)
        throw new Error("Aguarde a consulta dos sócios antes de salvar.");
      if (
        socios.length &&
        !socios.some(
          (item) => String(item.user_id) === String(pagadorSelecionado),
        )
      )
        throw new Error("Selecione quem pagou.");
      const base = {
        id_imovel: Number(imovelId),
        paid_by_user_id: pagadorSelecionado
          ? Number(pagadorSelecionado)
          : null,
        tipo_movimentacao: form.tipo_movimentacao || "despesa_imovel",
        beneficiary_user_id: form.beneficiary_user_id ?? null,
      };
      let payload;
      if (importando) {
        if (!preview.length)
          throw new Error("Cole as linhas do lote antes de importar.");
        const invalida = preview.find((item) => item.erro);
        if (invalida)
          throw new Error(`Linha ${invalida.numero}. ${invalida.erro}`);
        payload = preview.map((item) => ({
          ...base,
          data: item.data,
          descricao: item.descricao,
          valor: normalizarValor(item.valor, item.numero),
          id_categoria: 0,
          id_situacao: 0,
          ativo: 1,
        }));
      } else {
        if (!form.data || !form.descricao.trim())
          throw new Error("Preencha a data e a descrição.");
        if (form.id_situacao === "1" && !Number(form.id_categoria))
          throw new Error(
            "Selecione uma categoria para confirmar o lançamento.",
          );
        payload = {
          ...base,
          data: form.data,
          descricao: form.descricao.trim(),
          valor: normalizarValor(form.valor),
          id_categoria: Number(form.id_categoria || 0),
          id_situacao: Number(form.id_situacao),
          ativo: 1,
        };
      }
      salvandoRef.current = true;
      setSalvando(true);
      if (editando)
        await api.patch(`/dashboard/lancamentos/${editando}`, payload);
      else
        await api.post(
          "/dashboard/lancamentos/lote",
          importando ? payload : [payload],
        );
      setForm(null);
      setTextoLote("");
      setSucesso(
        importando ? "Lote importado para revisão." : "Lançamento salvo.",
      );
      setRecarregar((atual) => atual + 1);
      onChanged?.();
    } catch (error) {
      setErroForm(
        error?.response?.data?.error ||
          error.message ||
          "Não foi possível salvar. Confira os dados.",
      );
    } finally {
      salvandoRef.current = false;
      setSalvando(false);
    }
  };

  return (
    <section className="lancamentos-desktop">
      <div className="financeiro-cabecalho-secao">
        <h2>Lançamentos</h2>
        {canEdit && (
          <div className="d-flex gap-2">
            <button
              className="fin-button"
              onClick={() => abrir(null, true)}
              disabled={salvando}
            >
              Importar lote
            </button>
            <button
              className="fin-button fin-button-primary"
              onClick={() => abrir()}
              disabled={salvando}
            >
              Novo lançamento
            </button>
          </div>
        )}
      </div>
      <div className="financeiro-filtros">
        <label>
          Buscar lançamento
          <input
            type="search"
            value={filtros.busca}
            onChange={(event) => filtrar("busca", event.target.value)}
            placeholder="Descrição"
          />
        </label>
        <label>
          Data inicial
          <input
            type="date"
            value={filtros.inicio}
            onChange={(event) => filtrar("inicio", event.target.value)}
          />
        </label>
        <label>
          Data final
          <input
            type="date"
            value={filtros.fim}
            onChange={(event) => filtrar("fim", event.target.value)}
          />
        </label>
        <label>
          Categoria
          <select
            value={filtros.categoria}
            onChange={(event) => filtrar("categoria", event.target.value)}
          >
            <option value="">Todas</option>
            <option value="0">A definir</option>
            {categoriasOrdenadas
              .filter((item) => Number(item.id) !== 0)
              .map((item) => (
                <option value={item.id} key={item.id}>
                  {item.categoria}
                </option>
              ))}
          </select>
        </label>
        <label>
          Quem pagou
          <select
            value={filtros.pagador}
            onChange={(event) => filtrar("pagador", event.target.value)}
          >
            <option value="">Todos</option>
            {socios.map((item) => (
              <option value={item.user_id} key={item.user_id}>
                {item.user_name || item.user_email}
              </option>
            ))}
          </select>
        </label>
        <label>
          Situação
          <select
            value={filtros.situacao}
            onChange={(event) => filtrar("situacao", event.target.value)}
          >
            <option value="">Todas</option>
            <option value="confirmado">Confirmado</option>
            <option value="pendente">Pendente</option>
          </select>
        </label>
      </div>
      {sucesso && (
        <p role="status" className="financeiro-sucesso">
          {sucesso}
        </p>
      )}
      {erroSocios && (
        <p role="alert" className="financeiro-erro">
          {erroSocios}
        </p>
      )}
      {erro && (
        <div role="alert" className="financeiro-erro">
          {erro}{" "}
          <button
            className="fin-button"
            onClick={() => setRecarregar((atual) => atual + 1)}
          >
            Tentar novamente
          </button>
        </div>
      )}
      <div
        className="financeiro-resumo-linha"
        aria-live="polite"
        hidden={carregando || Boolean(erro)}
      >
        <span>{lista.summary.total || 0} lançamentos</span>
        <span className="financeiro-pendente">
          {lista.summary.pendentes || 0}{" "}
          {Number(lista.summary.pendentes) === 1 ? "pendente" : "pendentes"}
        </span>
        <span>
          Total confirmado <strong>{moeda(lista.summary.soma)}</strong>
        </span>
      </div>
      <div className={form ? "financeiro-duas-colunas" : ""}>
        <div>
          {carregando ? (
            <p role="status">Carregando lançamentos…</p>
          ) : (
            !erro && (
              <div className="financeiro-tabela-scroll">
                <table className="financeiro-tabela">
                  <thead>
                    <tr>
                      {[
                        "Data",
                        "Descrição",
                        "Categoria",
                        "Quem pagou",
                        "Valor",
                        "Situação",
                        "",
                      ].map((titulo, index) => (
                        <th key={index}>{titulo}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {lista.items.map((item) => (
                      <tr
                        key={item.id_lancamento}
                        className={item.confirmado ? "" : "financeiro-pendente"}
                      >
                        <td>{dataBr(item.data)}</td>
                        <td>{item.descricao}</td>
                        <td>{item.nome_categoria || "A definir"}</td>
                        <td>{item.paid_by_user_name || "—"}</td>
                        <td>{moeda(item.valor)}</td>
                        <td>{item.confirmado ? "Confirmado" : "Pendente"}</td>
                        <td>
                          {canEdit && (
                            <button
                              className="btn btn-link btn-sm"
                              aria-label={`${item.confirmado ? "Editar" : "Revisar"} ${item.descricao}`}
                              onClick={() => abrir(item)}
                              disabled={salvando}
                            >
                              {item.confirmado ? "Editar" : "Revisar"}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!lista.items.length && (
                  <p role="status">Nenhum lançamento encontrado.</p>
                )}
              </div>
            )
          )}
          <div className="financeiro-acoes">
            <span>
              Página {pagina} de {Math.max(1, Math.ceil(lista.total / 30))}
            </span>
            <button
              className="fin-button"
              disabled={pagina <= 1 || carregando}
              onClick={() => setPagina((atual) => atual - 1)}
            >
              Anterior
            </button>
            <button
              className="fin-button"
              disabled={pagina * 30 >= lista.total || carregando}
              onClick={() => setPagina((atual) => atual + 1)}
            >
              Próxima
            </button>
          </div>
        </div>
        {canEdit && form && (
          <aside className="financeiro-formulario">
            <h3>
              {importando
                ? "Importar lote"
                : editando
                  ? "Editar lançamento"
                  : "Novo lançamento"}
            </h3>
            <form onSubmit={salvar}>
              <fieldset disabled={salvando}>
                {importando ? (
                  <>
                    <label>
                      Linhas do Excel
                      <textarea
                        rows={8}
                        value={textoLote}
                        onChange={(event) => setTextoLote(event.target.value)}
                      />
                    </label>
                    <p>
                      Data, descrição e valor, separados por tabulação ou ponto
                      e vírgula. Os lançamentos entram como pendentes.
                    </p>
                    <p>
                      {preview.length} linhas ·{" "}
                      {preview.filter((item) => item.erro).length} com erro
                    </p>
                  </>
                ) : (
                  <>
                    <label>
                      Data
                      <input
                        type="date"
                        required
                        value={form.data}
                        onChange={(event) =>
                          alterar("data", event.target.value)
                        }
                      />
                    </label>
                    <label>
                      Descrição
                      <input
                        required
                        value={form.descricao}
                        onChange={(event) =>
                          alterar("descricao", event.target.value)
                        }
                      />
                    </label>
                    <label>
                      Valor
                      <input
                        inputMode="decimal"
                        required
                        value={form.valor}
                        onChange={(event) =>
                          alterar("valor", event.target.value)
                        }
                      />
                    </label>
                    <label>
                      Categoria
                      <select
                        value={form.id_categoria}
                        onChange={(event) =>
                          alterar("id_categoria", event.target.value)
                        }
                      >
                        <option value="">Selecione</option>
                        <option value="0">A definir</option>
                        {categoriasOrdenadas
                          .filter((item) => Number(item.id) !== 0)
                          .map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.categoria}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label>
                      Situação
                      <select
                        value={form.id_situacao}
                        onChange={(event) =>
                          alterar("id_situacao", event.target.value)
                        }
                      >
                        <option value="0">Pendente</option>
                        <option value="1">Confirmado</option>
                      </select>
                    </label>
                  </>
                )}
                <label>
                  Quem pagou
                  <select
                    value={pagadorSelecionado}
                    onChange={(event) =>
                      alterar("paid_by_user_id", event.target.value)
                    }
                    disabled={sociosLoading}
                  >
                    <option value="">Selecione</option>
                    {socios.map((item) => (
                      <option value={item.user_id} key={item.user_id}>
                        {item.user_name || item.user_email} (
                        {Number(item.percentual_participacao)}%)
                      </option>
                    ))}
                  </select>
                </label>
                {erroForm && (
                  <p className="financeiro-erro" role="alert">
                    {erroForm}
                  </p>
                )}
                <footer>
                  <button
                    type="button"
                    className="fin-button"
                    onClick={() => {
                      setForm(null);
                      setErroForm("");
                    }}
                  >
                    Cancelar
                  </button>
                  <button
                    className="fin-button fin-button-primary"
                    type="submit"
                    disabled={sociosLoading || Boolean(erroSocios)}
                  >
                    {salvando
                      ? "Salvando…"
                      : importando
                        ? "Importar lote"
                        : "Salvar lançamento"}
                  </button>
                </footer>
              </fieldset>
            </form>
          </aside>
        )}
      </div>
    </section>
  );
}
