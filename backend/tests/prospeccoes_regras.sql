-- Executar após a migração, dentro de transação com ROLLBACK.
DO $$
DECLARE oferta jsonb; r record; motivos text[]; captura uuid; captura_parcial uuid; captura_ausente uuid; captura_retorno uuid;
BEGIN
    oferta := '{"valor_leilao_1":200000,"valor_leilao_2":150000,"valor_venda":100000,"data_leilao_1":"2026-11-10T13:00:00-03:00","data_leilao_2":"2026-11-17T13:00:00-03:00"}';
    SELECT * INTO r FROM prospeccao_melhor_etapa(oferta, '2026-10-15T12:00:00-03:00');
    ASSERT r.etapa='2º Leilão' AND r.valor=150000 AND r.data='2026-11-17T13:00:00-03:00'::timestamptz, 'Preço e data devem ser da mesma etapa';
    ASSERT NOT EXISTS (SELECT 1 FROM prospeccao_melhor_etapa(oferta, '2026-11-18T12:00:00-03:00')), 'Excluir etapas encerradas';
    oferta := jsonb_set(oferta,'{valor_leilao_1}','150000');
    SELECT * INTO r FROM prospeccao_melhor_etapa(oferta,'2026-10-15T12:00:00-03:00');
    ASSERT r.etapa='1º Leilão', 'Empate escolhe data mais próxima';
    oferta := jsonb_set(jsonb_set(oferta,'{valor_leilao_2}','100000'),'{data_leilao_2}','null');
    SELECT * INTO r FROM prospeccao_melhor_etapa(oferta,'2026-10-15T12:00:00-03:00');
    ASSERT r.valor=100000 AND r.data IS NULL, 'Etapa sem data não herda data alheia';
    SELECT * INTO r FROM prospeccao_melhor_etapa('{"valor_venda":120000}', '2026-10-15');
    ASSERT r.etapa='Venda' AND r.valor=120000 AND r.data IS NULL, 'Venda direta sem prazo';
    SELECT * INTO r FROM prospeccao_melhor_etapa('{"valor_venda":120000,"data_licitacao_aberta":"2026-10-01","data_hora_encerramento":"2026-12-01"}', '2026-10-15');
    ASSERT r.valor=120000 AND r.data='2026-12-01'::timestamptz, 'Licitação ainda aberta usa encerramento';
    ASSERT NOT EXISTS (SELECT 1 FROM prospeccao_melhor_etapa('{"valor_leilao_1":0,"valor_leilao_2":-10,"valor_venda":null}')), 'Valores inválidos não são oportunidades';
    motivos := prospeccao_motivos_revisao(jsonb_build_object('etapa_recomendada','Venda','tem_avaliacao',true,'avaliado_em',now(),'referencia_avaliacao',jsonb_build_object('valor_venda',200000),'oferta_atual',jsonb_build_object('valor_venda',150000)));
    ASSERT cardinality(motivos)=1, 'Queda de preço exige revisão';
    motivos := prospeccao_motivos_revisao(jsonb_build_object('tem_avaliacao',true,'avaliado_em',now()-interval '91 days','referencia_avaliacao','{}'::jsonb,'oferta_atual','{}'::jsonb));
    ASSERT motivos=ARRAY['Pesquisa de mercado precisa de atualização'], 'Pesquisa antiga deve ser sinalizada';
    motivos := prospeccao_motivos_revisao(jsonb_build_object('tem_avaliacao',false,'tem_analise',false));
    ASSERT cardinality(motivos)=0, 'Imóvel sem análise não tem avaliação defasada';
    motivos := prospeccao_motivos_revisao('{"tem_analise":true,"referencia_analise":null}');
    ASSERT motivos=ARRAY['Viabilidade salva sem referência das condições da oferta'], 'Legado sem referência não presume atualidade';

    INSERT INTO imoveis_prospeccao(numero_bem,coletado_em,fonte,uf,valor_venda,disponivel)
        VALUES ('__teste_bem__',now()-interval '2 days','__teste_contrato__','PR',200000,true);
    ASSERT (SELECT presente_ultima_captura IS NULL FROM vw_prospeccoes_contexto WHERE numero_bem='__teste_bem__'), 'Sem captura não se presume presença';
    INSERT INTO avaliacoes(numero_bem,pesquisado_em) VALUES ('__teste_bem__',now()-interval '1 day');
    INSERT INTO imoveis_prospeccao(numero_bem,coletado_em,fonte,uf,valor_venda,disponivel)
        VALUES ('__teste_bem__',now()-interval '12 hours','__teste_contrato__','PR',150000,true);
    ASSERT EXISTS (SELECT 1 FROM vw_prospeccoes_contexto c WHERE numero_bem='__teste_bem__' AND cardinality(prospeccao_motivos_revisao(to_jsonb(c)))>0), 'Preço novo sinaliza avaliação antiga';
    INSERT INTO prospeccao_capturas(fonte,uf) VALUES ('__teste_contrato__','PR') RETURNING id INTO captura;
    INSERT INTO prospeccao_captura_itens VALUES (captura,'__teste_bem__');
    BEGIN
        UPDATE prospeccao_capturas SET status='concluida', completa=true, concluida_em=now(),total_listados=2 WHERE id=captura;
        RAISE EXCEPTION 'Deveria rejeitar total incorreto';
    EXCEPTION WHEN raise_exception THEN
        IF SQLERRM = 'Deveria rejeitar total incorreto' THEN RAISE; END IF;
    END;
    UPDATE prospeccao_capturas SET status='concluida', completa=true, concluida_em=now()-interval '3 hours',total_listados=1 WHERE id=captura;
    BEGIN
        DELETE FROM prospeccao_captura_itens WHERE captura_id=captura;
        RAISE EXCEPTION 'Deveria rejeitar alteração da captura publicada';
    EXCEPTION WHEN raise_exception THEN
        IF SQLERRM = 'Deveria rejeitar alteração da captura publicada' THEN RAISE; END IF;
    END;
    INSERT INTO prospeccao_capturas(fonte,uf) VALUES ('__teste_contrato__','PR') RETURNING id INTO captura_parcial;
    UPDATE prospeccao_capturas SET status='concluida',completa=false,concluida_em=now()-interval '2 hours',total_listados=0 WHERE id=captura_parcial;
    ASSERT (SELECT id FROM prospeccao_capturas WHERE fonte='__teste_contrato__' AND uf='PR' AND completa AND status='concluida' ORDER BY concluida_em DESC LIMIT 1)=captura, 'Captura parcial não substitui completa';
    ASSERT (SELECT presente_ultima_captura FROM vw_prospeccoes_contexto WHERE numero_bem='__teste_bem__'), 'Imóvel encontrado permanece presente após captura parcial';
    INSERT INTO prospeccao_capturas(fonte,uf) VALUES ('__teste_contrato__','PR') RETURNING id INTO captura_ausente;
    UPDATE prospeccao_capturas SET status='concluida',completa=true,concluida_em=now()-interval '1 hour',total_listados=0 WHERE id=captura_ausente;
    ASSERT (SELECT presente_ultima_captura=false FROM vw_prospeccoes_contexto WHERE numero_bem='__teste_bem__'), 'Ausência na nova captura completa';
    ASSERT (SELECT disponivel FROM imoveis_prospeccao WHERE numero_bem='__teste_bem__' ORDER BY coletado_em DESC LIMIT 1), 'Ausência não sobrescreve disponibilidade da fonte';
    INSERT INTO imoveis_prospeccao(numero_bem,coletado_em,fonte,uf,valor_venda)
        VALUES ('__teste_bem_sc__',now(),'__teste_contrato__','SC',100000);
    ASSERT (SELECT presente_ultima_captura IS NULL FROM vw_prospeccoes_contexto WHERE numero_bem='__teste_bem_sc__'), 'Referência isolada por UF';
    INSERT INTO prospeccao_capturas(fonte,uf) VALUES ('__teste_contrato__','PR') RETURNING id INTO captura_retorno;
    INSERT INTO prospeccao_captura_itens VALUES (captura_retorno,'__teste_bem__');
    UPDATE prospeccao_capturas SET status='concluida',completa=true,concluida_em=now()-interval '30 minutes',total_listados=1 WHERE id=captura_retorno;
    ASSERT (SELECT retornou_oferta FROM vw_prospeccoes_contexto WHERE numero_bem='__teste_bem__'), 'Retorno após ausência';
    UPDATE avaliacoes SET pesquisado_em=now() WHERE numero_bem='__teste_bem__';
    ASSERT EXISTS (SELECT 1 FROM prospeccao_analise_historico WHERE numero_bem='__teste_bem__' AND tipo='avaliacao'), 'Avaliação anterior preservada';
    ASSERT EXISTS (SELECT 1 FROM vw_prospeccoes_contexto c WHERE numero_bem='__teste_bem__' AND cardinality(prospeccao_motivos_revisao(to_jsonb(c)))=0), 'Nova pesquisa usa referência atual e encerra revisão';
END $$;
