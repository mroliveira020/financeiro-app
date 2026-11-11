-- Executar após importações que informem o ID de lançamentos explicitamente.
-- Apenas avança o contador; não altera nem remove lançamentos existentes.
BEGIN;
SET LOCAL lock_timeout = '5s';
LOCK TABLE public.lancamentos IN SHARE ROW EXCLUSIVE MODE;

DO $$
DECLARE
    sequencia REGCLASS;
    maior_id BIGINT;
    ultimo_id BIGINT;
BEGIN
    sequencia := pg_get_serial_sequence('public.lancamentos', 'id')::REGCLASS;
    IF sequencia IS NULL THEN
        RAISE EXCEPTION 'A coluna lancamentos.id não possui sequência associada';
    END IF;

    SELECT MAX(id) INTO maior_id FROM public.lancamentos;
    EXECUTE format('SELECT last_value FROM %s', sequencia) INTO ultimo_id;

    IF maior_id IS NOT NULL AND ultimo_id <= maior_id THEN
        PERFORM setval(sequencia, maior_id, TRUE);
        RAISE NOTICE 'Contador de lançamentos sincronizado em %', maior_id;
    ELSE
        RAISE NOTICE 'Contador de lançamentos já está atualizado';
    END IF;
END;
$$;

COMMIT;
