-- Cole SOMENTE este bloco no SQL Editor e clique em Run.
-- Ele cria a coluna numero em alunos (se ainda não existir)
-- e mostra as colunas da tabela no resultado.

alter table public.alunos
  add column if not exists numero integer;

select column_name as coluna, data_type as tipo
from information_schema.columns
where table_schema = 'public'
  and table_name = 'alunos'
order by ordinal_position;
