-- Ajuste de schema para alinhar ia_jobs ao backend atual.
-- O backend já cria jobs com tipo = 'enriquecimento', então o check constraint
-- precisa aceitar esse valor para não bloquear a gravação.

ALTER TABLE public.ia_jobs
DROP CONSTRAINT IF EXISTS ia_jobs_tipo_check;

ALTER TABLE public.ia_jobs
ADD CONSTRAINT ia_jobs_tipo_check
CHECK (
  tipo = ANY (
    ARRAY[
      'avaliacao_inicial'::text,
      'chat'::text,
      'matricula'::text,
      'enriquecimento'::text
    ]
  )
);
