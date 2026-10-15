-- Contrato aditivo. Não deduzir capturas completas a partir de coletado_em.
BEGIN;
CREATE TABLE IF NOT EXISTS prospeccao_capturas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    fonte text NOT NULL,
    uf text NOT NULL CHECK (uf ~ '^[A-Z]{2}$'),
    iniciada_em timestamptz NOT NULL DEFAULT now(),
    concluida_em timestamptz,
    completa boolean NOT NULL DEFAULT false,
    status text NOT NULL DEFAULT 'em_andamento'
        CHECK (status IN ('em_andamento', 'concluida', 'falhou')),
    total_listados integer CHECK (total_listados >= 0),
    CHECK (status <> 'concluida' OR (concluida_em IS NOT NULL AND total_listados IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS prospeccao_captura_itens (
    captura_id uuid NOT NULL REFERENCES prospeccao_capturas(id),
    numero_bem text NOT NULL,
    PRIMARY KEY (captura_id, numero_bem)
);
CREATE INDEX IF NOT EXISTS idx_prospeccao_capturas_referencia
    ON prospeccao_capturas(fonte, uf, concluida_em DESC)
    WHERE completa AND status = 'concluida';
ALTER TABLE prospeccao_capturas ENABLE ROW LEVEL SECURITY;
ALTER TABLE prospeccao_captura_itens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_role_all ON prospeccao_capturas;
CREATE POLICY service_role_all ON prospeccao_capturas TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS service_role_all ON prospeccao_captura_itens;
CREATE POLICY service_role_all ON prospeccao_captura_itens TO service_role USING (true) WITH CHECK (true);
GRANT ALL ON prospeccao_capturas, prospeccao_captura_itens TO service_role;

-- Uma captura publicada é imutável; o total deve conferir com a lista completa.
CREATE OR REPLACE FUNCTION validar_prospeccao_captura() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.status = 'concluida' THEN
        RAISE EXCEPTION 'Captura concluída não pode ser alterada';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    IF NEW.status = 'concluida' AND NEW.total_listados <> (
        SELECT count(*) FROM prospeccao_captura_itens WHERE captura_id = NEW.id
    ) THEN
        RAISE EXCEPTION 'Total de imóveis não confere com a captura';
    END IF;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS validar_captura ON prospeccao_capturas;
CREATE TRIGGER validar_captura BEFORE INSERT OR UPDATE OR DELETE ON prospeccao_capturas
    FOR EACH ROW EXECUTE FUNCTION validar_prospeccao_captura();
CREATE OR REPLACE FUNCTION validar_prospeccao_captura_item() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE estado text;
BEGIN
    SELECT status INTO estado FROM prospeccao_capturas
        WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.captura_id ELSE NEW.captura_id END FOR UPDATE;
    IF estado <> 'em_andamento' THEN
        RAISE EXCEPTION 'Itens só podem mudar durante a captura';
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.captura_id <> OLD.captura_id THEN
        RAISE EXCEPTION 'Não é permitido mover itens entre capturas';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS validar_captura_item ON prospeccao_captura_itens;
CREATE TRIGGER validar_captura_item BEFORE INSERT OR UPDATE OR DELETE ON prospeccao_captura_itens
    FOR EACH ROW EXECUTE FUNCTION validar_prospeccao_captura_item();

CREATE OR REPLACE FUNCTION prospeccao_melhor_etapa(oferta jsonb, referencia timestamptz DEFAULT now())
RETURNS TABLE(etapa text, valor numeric, data timestamptz)
LANGUAGE sql STABLE AS $$
    SELECT nome, preco, quando FROM (
        VALUES
          ('1º Leilão', (oferta->>'valor_leilao_1')::numeric, (oferta->>'data_leilao_1')::timestamptz),
          ('2º Leilão', (oferta->>'valor_leilao_2')::numeric, (oferta->>'data_leilao_2')::timestamptz),
          (CASE WHEN oferta->>'data_licitacao_aberta' IS NOT NULL THEN 'Licitação' ELSE 'Venda' END,
           CASE WHEN COALESCE((oferta->>'valor_leilao_1')::numeric,0) <= 0
                     AND COALESCE((oferta->>'valor_leilao_2')::numeric,0) <= 0
                THEN (oferta->>'valor_venda')::numeric END,
           COALESCE((oferta->>'data_hora_encerramento')::timestamptz, (oferta->>'data_licitacao_aberta')::timestamptz))
    ) AS etapas(nome, preco, quando)
    WHERE preco > 0 AND (
        quando IS NULL OR quando >= referencia
        OR ((quando AT TIME ZONE 'America/Sao_Paulo')::time = time '00:00'
            AND (quando AT TIME ZONE 'America/Sao_Paulo')::date = (referencia AT TIME ZONE 'America/Sao_Paulo')::date)
    )
    ORDER BY preco, quando ASC NULLS LAST, nome LIMIT 1
$$;

-- Snapshot das condições; custos estimados não equivalem ao lance mínimo.
CREATE OR REPLACE FUNCTION prospeccao_oferta_referencia(oferta jsonb)
RETURNS jsonb LANGUAGE sql STABLE AS $$
    SELECT jsonb_build_object(
        'valor_venda', (oferta->>'valor_venda')::numeric, 'valor_leilao_1', (oferta->>'valor_leilao_1')::numeric,
        'valor_leilao_2', (oferta->>'valor_leilao_2')::numeric, 'tipo_venda', oferta->'tipo_venda',
        'financia', oferta->'financia', 'data_leilao_1', to_char((oferta->>'data_leilao_1')::timestamptz AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
        'data_leilao_2', to_char((oferta->>'data_leilao_2')::timestamptz AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'), 'data_licitacao_aberta', to_char((oferta->>'data_licitacao_aberta')::timestamptz AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
        'data_hora_encerramento', to_char((oferta->>'data_hora_encerramento')::timestamptz AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'), 'disponivel', oferta->'disponivel'
    ) WHERE oferta IS NOT NULL
$$;
ALTER TABLE avaliacoes ADD COLUMN IF NOT EXISTS oferta_referencia jsonb;
ALTER TABLE imoveis_selecionados_analise ADD COLUMN IF NOT EXISTS oferta_referencia jsonb;

-- O pipeline pode enviar a referência exata. Sem ela, usar a coleta disponível
-- no instante da pesquisa; nunca usar uma oferta coletada depois da avaliação.
CREATE OR REPLACE FUNCTION referenciar_prospeccao_avaliacao() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.oferta_referencia IS NOT NULL THEN RETURN NEW; END IF;
    ELSE
        IF NEW.pesquisado_em IS NOT DISTINCT FROM OLD.pesquisado_em
           OR NEW.oferta_referencia IS DISTINCT FROM OLD.oferta_referencia THEN
            RETURN NEW;
        END IF;
    END IF;
    SELECT prospeccao_oferta_referencia(to_jsonb(h)) INTO NEW.oferta_referencia
        FROM imoveis_prospeccao h
        WHERE h.numero_bem=NEW.numero_bem AND h.coletado_em<=NEW.pesquisado_em
        ORDER BY h.coletado_em DESC LIMIT 1;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS referenciar_avaliacao ON avaliacoes;
CREATE TRIGGER referenciar_avaliacao BEFORE INSERT OR UPDATE ON avaliacoes
    FOR EACH ROW EXECUTE FUNCTION referenciar_prospeccao_avaliacao();

-- Histórico automático antes de substituir avaliações ou fichas manuais.
CREATE TABLE IF NOT EXISTS prospeccao_analise_historico (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    numero_bem text NOT NULL,
    tipo text NOT NULL CHECK (tipo IN ('avaliacao', 'viabilidade')),
    arquivado_em timestamptz NOT NULL DEFAULT now(),
    dados jsonb NOT NULL
);
ALTER TABLE prospeccao_analise_historico ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_role_all ON prospeccao_analise_historico;
CREATE POLICY service_role_all ON prospeccao_analise_historico TO service_role USING (true) WITH CHECK (true);
GRANT ALL ON prospeccao_analise_historico TO service_role;
GRANT USAGE, SELECT ON SEQUENCE prospeccao_analise_historico_id_seq TO service_role;
CREATE INDEX IF NOT EXISTS idx_prospeccao_analise_historico_bem
    ON prospeccao_analise_historico(numero_bem, arquivado_em DESC);
CREATE OR REPLACE FUNCTION arquivar_prospeccao_analise() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF to_jsonb(OLD) IS DISTINCT FROM to_jsonb(NEW) THEN
        INSERT INTO prospeccao_analise_historico(numero_bem, tipo, dados)
            VALUES (OLD.numero_bem, TG_ARGV[0], to_jsonb(OLD));
    END IF;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS arquivar_avaliacao ON avaliacoes;
CREATE TRIGGER arquivar_avaliacao BEFORE UPDATE ON avaliacoes
    FOR EACH ROW EXECUTE FUNCTION arquivar_prospeccao_analise('avaliacao');
DROP TRIGGER IF EXISTS arquivar_viabilidade ON imoveis_selecionados_analise;
CREATE TRIGGER arquivar_viabilidade BEFORE UPDATE ON imoveis_selecionados_analise
    FOR EACH ROW EXECUTE FUNCTION arquivar_prospeccao_analise('viabilidade');

CREATE OR REPLACE VIEW vw_prospeccoes_contexto WITH (security_invoker = true) AS
SELECT p.*,
    e.etapa AS etapa_recomendada, e.valor AS lance_recomendado, e.data AS data_recomendada,
    c.id AS captura_id, c.concluida_em AS captura_concluida_em,
    CASE WHEN c.id IS NULL THEN NULL ELSE EXISTS (
        SELECT 1 FROM prospeccao_captura_itens i WHERE i.captura_id = c.id AND i.numero_bem = p.numero_bem
    ) END AS presente_ultima_captura,
    CASE WHEN c.id IS NOT NULL AND anterior.id IS NOT NULL THEN
        EXISTS (SELECT 1 FROM prospeccao_captura_itens i WHERE i.captura_id=c.id AND i.numero_bem=p.numero_bem)
        AND NOT EXISTS (SELECT 1 FROM prospeccao_captura_itens i WHERE i.captura_id=anterior.id AND i.numero_bem=p.numero_bem)
        ELSE false END AS retornou_oferta,
    av.pesquisado_em AS avaliado_em, a.updated_at AS analise_atualizada_em,
    av.numero_bem IS NOT NULL AS tem_avaliacao, a.numero_bem IS NOT NULL AS tem_analise,
    prospeccao_oferta_referencia(to_jsonb(p)) AS oferta_atual,
    COALESCE(prospeccao_oferta_referencia(av.oferta_referencia), prospeccao_oferta_referencia(hist_av.oferta)) AS referencia_avaliacao,
    COALESCE(prospeccao_oferta_referencia(a.oferta_referencia), prospeccao_oferta_referencia(hist_a.oferta)) AS referencia_analise
FROM vw_imoveis_prospeccao_latest p
LEFT JOIN LATERAL prospeccao_melhor_etapa(to_jsonb(p)) e ON true
LEFT JOIN LATERAL (
    SELECT r.* FROM prospeccao_capturas r
    WHERE r.fonte=p.fonte AND r.uf=trim(p.uf) AND r.completa AND r.status='concluida'
    ORDER BY r.concluida_em DESC, r.iniciada_em DESC, r.id DESC LIMIT 1
) c ON true
LEFT JOIN LATERAL (
    SELECT r.id FROM prospeccao_capturas r
    WHERE r.fonte=p.fonte AND r.uf=trim(p.uf) AND r.completa AND r.status='concluida'
      AND (r.concluida_em,r.iniciada_em,r.id) < (c.concluida_em,c.iniciada_em,c.id)
    ORDER BY r.concluida_em DESC, r.iniciada_em DESC, r.id DESC LIMIT 1
) anterior ON true
LEFT JOIN avaliacoes av ON av.numero_bem=p.numero_bem
LEFT JOIN imoveis_selecionados_analise a ON a.numero_bem=p.numero_bem
LEFT JOIN LATERAL (
    SELECT to_jsonb(h) AS oferta FROM imoveis_prospeccao h
    WHERE av.oferta_referencia IS NULL AND h.numero_bem=p.numero_bem AND h.fonte=p.fonte AND h.coletado_em<=av.pesquisado_em
    ORDER BY h.coletado_em DESC LIMIT 1
) hist_av ON true
LEFT JOIN LATERAL (
    SELECT to_jsonb(h) AS oferta FROM imoveis_prospeccao h
    WHERE a.oferta_referencia IS NULL AND h.numero_bem=p.numero_bem AND h.fonte=p.fonte AND h.coletado_em<=a.updated_at
    ORDER BY h.coletado_em DESC LIMIT 1
) hist_a ON true;

CREATE OR REPLACE FUNCTION prospeccao_motivos_revisao(contexto jsonb, validade_dias integer DEFAULT 90)
RETURNS text[] LANGUAGE sql STABLE AS $$
    SELECT array_remove(ARRAY[
        CASE WHEN (contexto->>'tem_avaliacao')::boolean AND (
            contexto->'referencia_avaliacao' = 'null'::jsonb OR contexto->'referencia_avaliacao' IS NULL)
            THEN 'Avaliação sem referência das condições da oferta' END,
        CASE WHEN (contexto->>'tem_avaliacao')::boolean AND contexto->'referencia_avaliacao' <> 'null'::jsonb
            AND contexto->'referencia_avaliacao' IS DISTINCT FROM contexto->'oferta_atual'
            THEN 'Condições da oferta mudaram após a avaliação automática' END,
        CASE WHEN (contexto->>'tem_analise')::boolean AND (
            contexto->'referencia_analise' = 'null'::jsonb OR contexto->'referencia_analise' IS NULL)
            THEN 'Viabilidade salva sem referência das condições da oferta' END,
        CASE WHEN (contexto->>'tem_analise')::boolean AND contexto->'referencia_analise' <> 'null'::jsonb
            AND contexto->'referencia_analise' IS DISTINCT FROM contexto->'oferta_atual'
            THEN 'Condições da oferta mudaram após a viabilidade salva' END,
        CASE WHEN (contexto->>'tem_avaliacao')::boolean AND (
            contexto->>'avaliado_em' IS NULL OR (contexto->>'avaliado_em')::timestamptz < now() - make_interval(days => validade_dias))
            THEN 'Pesquisa de mercado precisa de atualização' END,
        CASE WHEN ((contexto->>'tem_avaliacao')::boolean OR (contexto->>'tem_analise')::boolean)
            AND contexto->>'etapa_recomendada' IS NULL
            AND (COALESCE((contexto->'oferta_atual'->>'valor_leilao_1')::numeric,0)>0
                 OR COALESCE((contexto->'oferta_atual'->>'valor_leilao_2')::numeric,0)>0
                 OR COALESCE((contexto->'oferta_atual'->>'valor_venda')::numeric,0)>0)
            THEN 'Etapas da oferta encerradas; aguardar condições atuais' END,
        CASE WHEN (contexto->>'retornou_oferta')::boolean AND (
            (contexto->>'avaliado_em')::timestamptz < (contexto->>'captura_concluida_em')::timestamptz
            OR (contexto->>'analise_atualizada_em')::timestamptz < (contexto->>'captura_concluida_em')::timestamptz)
            THEN 'Imóvel voltou a aparecer na oferta' END
    ], NULL)
$$;
COMMIT;
