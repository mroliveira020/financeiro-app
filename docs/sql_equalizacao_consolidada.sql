BEGIN;
CREATE TABLE IF NOT EXISTS equalizacao_operacoes (
    id uuid PRIMARY KEY,
    usuario_id integer NOT NULL REFERENCES users(id),
    socio_id integer NOT NULL REFERENCES users(id),
    origem_imovel_id bigint NOT NULL REFERENCES imoveis(id),
    data date NOT NULL,
    descricao text NOT NULL DEFAULT '',
    valor_transferido numeric(16,2) NOT NULL CHECK (valor_transferido >= 0),
    paid_by_user_id integer REFERENCES users(id),
    beneficiary_user_id integer REFERENCES users(id),
    itens jsonb NOT NULL CHECK (jsonb_typeof(itens)='array' AND jsonb_array_length(itens)>=2),
    pedido_hash text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (usuario_id <> socio_id),
    CHECK ((valor_transferido=0 AND paid_by_user_id IS NULL AND beneficiary_user_id IS NULL)
        OR (valor_transferido>0 AND paid_by_user_id IS NOT NULL AND beneficiary_user_id IS NOT NULL
            AND paid_by_user_id<>beneficiary_user_id
            AND paid_by_user_id IN (usuario_id,socio_id) AND beneficiary_user_id IN (usuario_id,socio_id)))
);
ALTER TABLE equalizacao_operacoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_role_all ON equalizacao_operacoes;
CREATE POLICY service_role_all ON equalizacao_operacoes TO service_role USING(true) WITH CHECK(true);
GRANT ALL ON equalizacao_operacoes TO service_role;
ALTER TABLE lancamentos ADD COLUMN IF NOT EXISTS equalizacao_operacao_id uuid REFERENCES equalizacao_operacoes(id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_equalizacao_parcela_imovel
    ON lancamentos(equalizacao_operacao_id,id_imovel) WHERE equalizacao_operacao_id IS NOT NULL;

-- Serializar a leitura/confirmação com todos os caminhos de escrita existentes.
CREATE OR REPLACE FUNCTION bloquear_financeiro_imovel(imovel bigint) RETURNS void
LANGUAGE sql VOLATILE AS $$
    SELECT pg_advisory_xact_lock(hashtextextended('financeiro_imovel:' || imovel::text,0))
$$;
CREATE OR REPLACE FUNCTION bloquear_alteracao_financeiro() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE anterior bigint; atual bigint;
BEGIN
    IF TG_OP<>'INSERT' THEN anterior:=OLD.id_imovel; END IF;
    IF TG_OP<>'DELETE' THEN atual:=NEW.id_imovel; END IF;
    -- Ordem estável inclusive quando um lançamento muda de imóvel.
    PERFORM bloquear_financeiro_imovel(v) FROM (
        SELECT DISTINCT unnest(ARRAY[anterior,atual]) AS v
    ) ids WHERE v IS NOT NULL ORDER BY v;
    IF TG_TABLE_NAME='lancamentos' AND TG_OP<>'INSERT' THEN
        IF OLD.equalizacao_operacao_id IS NOT NULL THEN
            RAISE EXCEPTION 'Parcelas de acerto consolidado não podem ser alteradas individualmente';
        END IF;
    END IF;
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS bloquear_alteracao_financeiro ON lancamentos;
CREATE TRIGGER bloquear_alteracao_financeiro BEFORE INSERT OR UPDATE OR DELETE ON lancamentos
    FOR EACH ROW EXECUTE FUNCTION bloquear_alteracao_financeiro();
DROP TRIGGER IF EXISTS bloquear_alteracao_financeiro ON imovel_socios;
CREATE TRIGGER bloquear_alteracao_financeiro BEFORE INSERT OR UPDATE OR DELETE ON imovel_socios
    FOR EACH ROW EXECUTE FUNCTION bloquear_alteracao_financeiro();
CREATE OR REPLACE FUNCTION preservar_equalizacao_operacao() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'O acerto consolidado e seu histórico não podem ser alterados';
END $$;
DROP TRIGGER IF EXISTS preservar_equalizacao_operacao ON equalizacao_operacoes;
CREATE TRIGGER preservar_equalizacao_operacao BEFORE UPDATE OR DELETE ON equalizacao_operacoes
    FOR EACH ROW EXECUTE FUNCTION preservar_equalizacao_operacao();

-- Garantir que o grupo e todas as parcelas existem juntos no commit.
CREATE OR REPLACE FUNCTION validar_equalizacao_operacao() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE operacao equalizacao_operacoes; parcelas jsonb; saldo bigint; alvo uuid;
BEGIN
    IF TG_TABLE_NAME='equalizacao_operacoes' THEN alvo:=NEW.id;
    ELSE alvo:=NEW.equalizacao_operacao_id; END IF;
    IF alvo IS NULL THEN RETURN NULL; END IF;
    SELECT * INTO operacao FROM equalizacao_operacoes WHERE id=alvo;
    SELECT jsonb_agg(jsonb_build_object('id_imovel',id_imovel,'saldo_centavos',
        CASE WHEN beneficiary_user_id=operacao.usuario_id THEN round(valor::numeric*100)::bigint
             ELSE -round(valor::numeric*100)::bigint END) ORDER BY id_imovel),
        sum(CASE WHEN beneficiary_user_id=operacao.usuario_id THEN round(valor::numeric*100)::bigint
             ELSE -round(valor::numeric*100)::bigint END)
    INTO parcelas,saldo FROM lancamentos
    WHERE equalizacao_operacao_id=alvo AND valor>0 AND ativo=true AND id_situacao=1
      AND tipo_movimentacao='equalizacao_socios'
      AND paid_by_user_id IN (operacao.usuario_id,operacao.socio_id)
      AND beneficiary_user_id IN (operacao.usuario_id,operacao.socio_id)
      AND paid_by_user_id<>beneficiary_user_id;
    IF (SELECT count(*) FROM lancamentos WHERE equalizacao_operacao_id=alvo) <> jsonb_array_length(operacao.itens)
       OR parcelas IS DISTINCT FROM operacao.itens
       OR abs(saldo) IS DISTINCT FROM round(operacao.valor_transferido*100)::bigint
       OR (saldo>0 AND operacao.beneficiary_user_id<>operacao.usuario_id)
       OR (saldo<0 AND operacao.paid_by_user_id<>operacao.usuario_id) THEN
        RAISE EXCEPTION 'As parcelas do acerto não conferem com a transferência consolidada';
    END IF;
    RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS validar_equalizacao_operacao ON equalizacao_operacoes;
CREATE CONSTRAINT TRIGGER validar_equalizacao_operacao AFTER INSERT ON equalizacao_operacoes
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validar_equalizacao_operacao();
DROP TRIGGER IF EXISTS validar_equalizacao_parcela ON lancamentos;
CREATE CONSTRAINT TRIGGER validar_equalizacao_parcela AFTER INSERT OR UPDATE ON lancamentos
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validar_equalizacao_operacao();

REVOKE ALL ON FUNCTION bloquear_financeiro_imovel(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION bloquear_financeiro_imovel(bigint) TO service_role;
COMMIT;
