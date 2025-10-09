/* global bootstrap */
import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";

function TransacoesIncompletas() {
  const { id } = useParams();
  const [lancamentos, setLancamentos] = useState([]);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [editandoLancamento, setEditandoLancamento] = useState(null);
  const [formEdicao, setFormEdicao] = useState({
    data: '',
    descricao: '',
    valor: '',
    id_categoria: '',
    id_imovel: id,
    id_situacao: ''
  });

  const [textoLote, setTextoLote] = useState('');
  const [categorias, setCategorias] = useState([]);
  const [imoveis, setImoveis] = useState([]);

  useEffect(() => {
    fetchLancamentosIncompletos();
    fetchCategoriasEImoveis();
  }, [id]);

  const fetchLancamentosIncompletos = async () => {
    try {
      const res = await axios.get(`http://127.0.0.1:5000/dashboard/lancamentos/incompletos/${id}`);
      setLancamentos(res.data);
    } catch (error) {
      console.error("Erro ao buscar lançamentos incompletos", error);
    }
  };

  const fetchCategoriasEImoveis = async () => {
    try {
      const [resCategorias, resImoveis] = await Promise.all([
        axios.get(`http://127.0.0.1:5000/categorias`),
        axios.get(`http://127.0.0.1:5000/imoveis`)
      ]);
      setCategorias(resCategorias.data);
      setImoveis(resImoveis.data);
    } catch (error) {
      console.error("Erro ao buscar categorias/imóveis", error);
    }
  };

  const handleExcluir = async (lancamentoId) => {
    if (!window.confirm("Tem certeza que deseja excluir este lançamento?")) return;

    try {
      await axios.delete(`http://127.0.0.1:5000/dashboard/lancamentos/${lancamentoId}`);
      fetchLancamentosIncompletos();
    } catch (error) {
      console.error("Erro ao excluir lançamento", error);
    }
  };

  const iniciarEdicao = (lancamento) => {
    setEditandoLancamento(lancamento.id_lancamento);

    setFormEdicao({
      data: lancamento.data,
      descricao: lancamento.descricao,
      valor: lancamento.valor.toFixed(2).replace('.', ','),
      id_categoria: lancamento.id_categoria || 0,
      id_imovel: lancamento.id_imovel,
      id_situacao: lancamento.id_situacao
    });

    const modal = new bootstrap.Modal(document.getElementById('modalEdicao'));
    modal.show();
  };

  const salvarEdicao = async () => {
    if (!editandoLancamento) {
      alert("Nenhum lançamento selecionado para edição.");
      return;
    }

    try {
      const payload = {
        data: formEdicao.data,
        descricao: formEdicao.descricao,
        valor: tratarValor(formEdicao.valor),
        id_categoria: parseInt(formEdicao.id_categoria),
        id_imovel: parseInt(formEdicao.id_imovel),
        id_situacao: parseInt(formEdicao.id_situacao)
      };

      await axios.patch(`http://127.0.0.1:5000/dashboard/lancamentos/${editandoLancamento}`, payload);
      fetchLancamentosIncompletos();

      const modal = bootstrap.Modal.getInstance(document.getElementById('modalEdicao'));
      modal.hide();
      setEditandoLancamento(null);
    } catch (error) {
      console.error("Erro ao atualizar lançamento", error);
      alert("Erro ao salvar a edição.");
    }
  };

  const tratarValor = (valorStr) => {
    if (!valorStr) return 0;
    const valorLimpo = valorStr.trim().replace(/\./g, "").replace(",", ".");
    const valorNumerico = parseFloat(valorLimpo);
    return isNaN(valorNumerico) ? 0 : valorNumerico;
  };

  const abrirModalLote = () => {
    const modal = new bootstrap.Modal(document.getElementById('modalLote'));
    modal.show();
  };

  const enviarLote = async () => {
    try {
      if (!textoLote.trim()) {
        alert("Cole os dados do Excel antes de enviar.");
        return;
      }

      const linhas = textoLote.trim().split("\n");

      const novosLancamentos = linhas.map((linha, index) => {
        const partes = linha.split("\t");

        if (partes.length < 3) {
          throw new Error(`Linha ${index + 1} inválida: "${linha}". Formato esperado: Data[TAB]Descrição[TAB]Valor`);
        }

        const [data, descricao, valor] = partes;

        return {
          data: data.trim(),
          descricao: descricao.trim(),
          valor: parseFloat(valor.replace(",", ".").trim()),
          id_imovel: parseInt(id),
          id_categoria: 0,
          id_situacao: 1,
          ativo: 1
        };
      });

      await axios.post('http://127.0.0.1:5000/dashboard/lancamentos/lote', novosLancamentos);

      alert('Lançamentos adicionados com sucesso!');
      fetchLancamentosIncompletos();

      const modal = bootstrap.Modal.getInstance(document.getElementById('modalLote'));
      modal.hide();
      setTextoLote('');
    } catch (error) {
      console.error('Erro ao adicionar lançamentos em lote:', error);
      alert(`Erro ao adicionar lançamentos em lote: ${error.message}`);
    }
  };

  // Função de ordenação
  const ordenarLancamentos = () => {
    let lancamentosOrdenados = [...lancamentos];

    if (sortConfig.key !== null) {
      lancamentosOrdenados.sort((a, b) => {
        let valorA = a[sortConfig.key];
        let valorB = b[sortConfig.key];

        if (sortConfig.key === 'valor') {
          valorA = parseFloat(valorA);
          valorB = parseFloat(valorB);
        } else {
          valorA = valorA.toString().toLowerCase();
          valorB = valorB.toString().toLowerCase();
        }

        if (valorA < valorB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (valorA > valorB) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return lancamentosOrdenados;
  };

  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const getSortIcon = (key) => {
    if (sortConfig.key !== key) return '';
    return sortConfig.direction === 'asc' ? ' 🔼' : ' 🔽';
  };

  const lancamentosOrdenados = ordenarLancamentos();

  return (
    <div className="col-md-6">
      <div className="card p-3 shadow-sm position-relative h-100">
        <h2 className="fs-6 fw-bold d-flex justify-content-between align-items-center">
          Transações Incompletas
          <button
            className="btn btn-sm btn-outline-secondary"
            onClick={abrirModalLote}
            title="Adicionar em Lote"
          >
            📥
          </button>
        </h2>

        <div className="table-responsive small">
          <table className="table table-sm table-striped">
            <thead>
              <tr>
                <th onClick={() => handleSort('data')} style={{ cursor: 'pointer' }}>
                  Data {getSortIcon('data')}
                </th>
                <th onClick={() => handleSort('descricao')} style={{ cursor: 'pointer' }}>
                  Descrição {getSortIcon('descricao')}
                </th>
                <th onClick={() => handleSort('valor')} style={{ cursor: 'pointer' }}>
                  Valor {getSortIcon('valor')}
                </th>
                <th className="text-center">Ações</th>
              </tr>
            </thead>
            <tbody>
              {lancamentosOrdenados.length === 0 ? (
                <tr>
                  <td colSpan="4" className="text-center">Nenhum lançamento incompleto.</td>
                </tr>
              ) : (
                lancamentosOrdenados.map((lancamento) => (
                  <tr key={lancamento.id_lancamento}>
                    <td>{lancamento.data}</td>
                    <td>{lancamento.descricao}</td>
                    <td>{Number(lancamento.valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
                    <td className="text-center">
                      <button
                        className="btn btn-link btn-sm p-0 me-2"
                        onClick={() => iniciarEdicao(lancamento)}
                        title="Editar / Categorizar"
                      >
                        ✏️
                      </button>
                      <button
                        className="btn btn-link btn-sm p-0"
                        onClick={() => handleExcluir(lancamento.id_lancamento)}
                        title="Excluir"
                      >
                        🗑️
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Edição */}
      <div className="modal fade" id="modalEdicao" tabIndex="-1" aria-labelledby="modalEdicaoLabel" aria-hidden="true">
        <div className="modal-dialog modal-dialog-centered">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title" id="modalEdicaoLabel">Editar Lançamento</h5>
              <button type="button" className="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div className="modal-body">
              <div className="mb-2">
                <label className="form-label">Data</label>
                <input
                  type="text"
                  className="form-control form-control-sm"
                  placeholder="DD/MM/AAAA"
                  value={formEdicao.data}
                  onChange={(e) => setFormEdicao({ ...formEdicao, data: e.target.value })}
                />
              </div>
              <div className="mb-2">
                <label className="form-label">Descrição</label>
                <input
                  type="text"
                  className="form-control form-control-sm"
                  value={formEdicao.descricao}
                  onChange={(e) => setFormEdicao({ ...formEdicao, descricao: e.target.value })}
                />
              </div>
              <div className="mb-2">
                <label className="form-label">Valor</label>
                <input
                  type="text"
                  className="form-control form-control-sm"
                  value={formEdicao.valor}
                  onChange={(e) => setFormEdicao({ ...formEdicao, valor: e.target.value })}
                />
              </div>
              <div className="mb-2">
                <label className="form-label">Categoria</label>
                <select
                  className="form-select form-select-sm"
                  value={formEdicao.id_categoria}
                  onChange={(e) => setFormEdicao({ ...formEdicao, id_categoria: e.target.value })}
                >
                  {categorias.map((categoria) => (
                    <option key={categoria.id} value={categoria.id}>{categoria.categoria}</option>
                  ))}
                </select>
              </div>
              <div className="mb-2">
                <label className="form-label">Imóvel</label>
                <select
                  className="form-select form-select-sm"
                  value={formEdicao.id_imovel}
                  onChange={(e) => setFormEdicao({ ...formEdicao, id_imovel: e.target.value })}
                >
                  {imoveis.map((imovel) => (
                    <option key={imovel.id} value={imovel.id}>{imovel.nome}</option>
                  ))}
                </select>
              </div>
              <div className="mb-3">
                <label className="form-label">Situação</label>
                <select
                  className="form-select form-select-sm"
                  value={formEdicao.id_situacao}
                  onChange={(e) => setFormEdicao({ ...formEdicao, id_situacao: e.target.value })}
                >
                  <option value="0">Pendente</option>
                  <option value="1">Confirmado</option>
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary btn-sm" data-bs-dismiss="modal">Cancelar</button>
              <button className="btn btn-success btn-sm" onClick={salvarEdicao}>Salvar</button>
            </div>
          </div>
        </div>
      </div>

      {/* Modal Adicionar em Lote */}
      <div className="modal fade" id="modalLote" tabIndex="-1" aria-labelledby="modalLoteLabel" aria-hidden="true">
        <div className="modal-dialog modal-dialog-centered">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title" id="modalLoteLabel">Adicionar Transações em Lote</h5>
              <button type="button" className="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div className="modal-body">
              <textarea
                className="form-control"
                rows="10"
                placeholder={
                  'Cole aqui os dados no formato:\n' +
                  'Data[TAB]Descrição[TAB]Valor\n' +
                  'Exemplo:\n' +
                  '20/03/2025\tConta de Luz\t150,75'
                }
                value={textoLote}
                onChange={(e) => setTextoLote(e.target.value)}
              ></textarea>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary btn-sm" data-bs-dismiss="modal">Cancelar</button>
              <button className="btn btn-success btn-sm" onClick={enviarLote}>Enviar</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default TransacoesIncompletas;
