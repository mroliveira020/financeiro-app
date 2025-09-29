-- Índices para acelerar agregações no carregamento inicial da Home.
-- Executar com usuário que possua permissão para criar índices.

-- Otimiza filtros por imóvel, situação e data.
CREATE INDEX IF NOT EXISTS idx_lancamentos_imovel_situacao_data
  ON lancamentos (id_imovel, id_situacao, data DESC)
  WHERE (ativo IS DISTINCT FROM FALSE);

-- Ajuda nas agregações por grupo via categoria.
CREATE INDEX IF NOT EXISTS idx_lancamentos_categoria_situacao
  ON lancamentos (id_categoria)
  WHERE id_situacao = 1 AND (ativo IS DISTINCT FROM FALSE);
