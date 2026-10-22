-- Gaba — schema idempotente (pode rodar mesmo se as tabelas já existirem)
-- Cole no SQL Editor e clique em Run.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Tabelas (só cria se ainda não existirem)
-- ---------------------------------------------------------------------------

create table if not exists public.turmas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  ano text,
  created_at timestamptz not null default now()
);

create table if not exists public.alunos (
  id uuid primary key default gen_random_uuid(),
  turma_id uuid not null references public.turmas(id) on delete cascade,
  nome text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.provas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.correcoes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create table if not exists public.professores (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  email text not null unique,
  created_at timestamptz not null default now()
);

-- Uma linha por caderno que foi para a impressora: é o que permite a qualquer
-- aparelho ler a folha e saber a ordem das questões e a chave daquele aluno.
-- turma_id e aluno_id sao uuid soltos de proposito: esta tabela e o diario do que
-- saiu na impressora. Se tivesse foreign key com on delete cascade, apagar um aluno
-- da lista (ou imprimir com uma lista local, que nao tem id no banco) apagava junto o
-- registro necessario para ler a folha que ja esta na mao do aluno.
create table if not exists public.prova_versoes (
  id uuid primary key default gen_random_uuid(),
  prova_id uuid not null references public.provas(id) on delete cascade,
  turma_id uuid,
  aluno_id uuid,
  aluno_numero integer,
  aluno_nome text,
  lote_id text not null,
  tipo integer not null default 1,
  codigo text not null,
  ordem jsonb not null default '[]'::jsonb,
  alt_map jsonb not null default '[]'::jsonb,
  gabarito jsonb not null default '[]'::jsonb,
  impresso_em timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Colunas que o app atual precisa (adiciona se faltar)
-- ---------------------------------------------------------------------------

alter table public.turmas add column if not exists nome text;
alter table public.turmas add column if not exists ano text;
-- o nome da escola da turma: e o que separa as turmas de unidades diferentes no app
alter table public.turmas add column if not exists escola text;
alter table public.turmas add column if not exists created_at timestamptz not null default now();
alter table public.turmas add column if not exists professor_id uuid;

alter table public.alunos add column if not exists turma_id uuid;
alter table public.alunos add column if not exists nome text;
alter table public.alunos add column if not exists matricula text;
alter table public.alunos add column if not exists numero integer;
alter table public.alunos add column if not exists responsavel text;
alter table public.alunos add column if not exists email_responsavel text;
alter table public.alunos add column if not exists telefone_responsavel text;
-- o "Tipo de Prova" que a planilha da escola ja traz, quando existir
alter table public.alunos add column if not exists tipo integer;
alter table public.alunos add column if not exists created_at timestamptz not null default now();

alter table public.provas add column if not exists titulo text;
alter table public.provas add column if not exists disciplina text;
alter table public.provas add column if not exists escola text;
alter table public.provas add column if not exists data date;
alter table public.provas add column if not exists turma_id uuid;
alter table public.provas add column if not exists quantidade_questoes integer;
alter table public.provas add column if not exists total_questoes integer;
alter table public.provas add column if not exists alternativas integer not null default 5;
alter table public.provas add column if not exists gabarito jsonb not null default '[]'::jsonb;
alter table public.provas add column if not exists questoes jsonb not null default '[]'::jsonb;
alter table public.provas add column if not exists pesos jsonb not null default '[]'::jsonb;
alter table public.provas add column if not exists descritores jsonb not null default '[]'::jsonb;
alter table public.provas add column if not exists tipos jsonb not null default '[]'::jsonb;
alter table public.provas add column if not exists modo text not null default 'fixa';
alter table public.provas add column if not exists num_tipos integer not null default 1;
alter table public.provas add column if not exists embaralhar_questoes boolean not null default true;
alter table public.provas add column if not exists embaralhar_alternativas boolean not null default true;
alter table public.provas add column if not exists salt text;
alter table public.provas add column if not exists professor_id uuid;
alter table public.provas add column if not exists created_at timestamptz not null default now();

alter table public.correcoes add column if not exists aluno_id uuid;
alter table public.correcoes add column if not exists turma_id uuid;
alter table public.correcoes add column if not exists prova_id uuid;
alter table public.correcoes add column if not exists aluno_nome text;
alter table public.correcoes add column if not exists aluno_numero integer;
alter table public.correcoes add column if not exists versao integer;
alter table public.correcoes add column if not exists codigo text;
alter table public.correcoes add column if not exists qr_payload text;
alter table public.correcoes add column if not exists engine text;
alter table public.correcoes add column if not exists respostas jsonb not null default '[]'::jsonb;
alter table public.correcoes add column if not exists respostas_originais jsonb not null default '[]'::jsonb;
alter table public.correcoes add column if not exists confusao jsonb not null default '[]'::jsonb;
alter table public.correcoes add column if not exists branco integer not null default 0;
alter table public.correcoes add column if not exists acertos integer not null default 0;
alter table public.correcoes add column if not exists total_questoes integer not null default 0;
alter table public.correcoes add column if not exists nota numeric(5,2) not null default 0;
alter table public.correcoes add column if not exists created_at timestamptz not null default now();

-- Tabela criada por uma versao antiga deste arquivo pode nao ter alguma dessas colunas.
alter table public.professores add column if not exists nome text;
alter table public.professores add column if not exists email text;
alter table public.professores add column if not exists created_at timestamptz not null default now();

-- Lista que nao e lista derrubaria a migracao inteira no primeiro
-- jsonb_array_length: normaliza antes de mexer no conteudo.
update public.provas set questoes = '[]'::jsonb where jsonb_typeof(questoes) is distinct from 'array';
update public.provas set gabarito = '[]'::jsonb where jsonb_typeof(gabarito) is distinct from 'array';
update public.provas set pesos = '[]'::jsonb where jsonb_typeof(pesos) is distinct from 'array';
update public.provas set descritores = '[]'::jsonb where jsonb_typeof(descritores) is distinct from 'array';
update public.provas set tipos = '[]'::jsonb where jsonb_typeof(tipos) is distinct from 'array';
update public.correcoes set respostas = '[]'::jsonb where jsonb_typeof(respostas) is distinct from 'array';
update public.correcoes set respostas_originais = '[]'::jsonb where jsonb_typeof(respostas_originais) is distinct from 'array';
update public.correcoes set confusao = '[]'::jsonb where jsonb_typeof(confusao) is distinct from 'array';

-- Se o schema antigo tinha matricula e não tinha numero, copia o número da matrícula
update public.alunos
set numero = nullif(regexp_replace(coalesce(matricula::text, ''), '[^0-9]', '', 'g'), '')::integer
where numero is null
  and coalesce(matricula::text, '') <> '';

-- Quem ainda ficou sem numero recebe 1, 2, 3... dentro da turma
with ranked as (
  select id, row_number() over (partition by turma_id order by created_at, nome) as n
  from public.alunos
  where numero is null
)
update public.alunos a
set numero = r.n
from ranked r
where a.id = r.id;

update public.provas
set quantidade_questoes = coalesce(quantidade_questoes, total_questoes, jsonb_array_length(gabarito), 10)
where quantidade_questoes is null;

-- A prova base guarda as questões como jsonb: o caderno e o leitor leem daqui.
update public.provas
set quantidade_questoes = greatest(
      coalesce(nullif(jsonb_array_length(questoes), 0), quantidade_questoes, 0),
      coalesce(nullif(jsonb_array_length(gabarito), 0), 0)
    )
where coalesce(nullif(jsonb_array_length(questoes), 0), 0) <> coalesce(quantidade_questoes, 0)
   or coalesce(nullif(jsonb_array_length(gabarito), 0), 0) > coalesce(quantidade_questoes, 0);

-- gabarito / pesos / descritores alinhados com a ordem de questoes (ordinality evita agregação fora de ordem)
update public.provas
set gabarito = (
  select coalesce(jsonb_agg(
    case when jsonb_typeof(q.item) = 'object'
          and upper(left(coalesce(q.item ->> 'gabarito', ''), 1)) in ('A', 'B', 'C', 'D', 'E')
         then upper(left(q.item ->> 'gabarito', 1)) else '' end
    order by q.ord), '[]'::jsonb)
  from jsonb_array_elements(questoes) with ordinality as q(item, ord)
)
where coalesce(nullif(jsonb_array_length(gabarito), 0), 0) = 0
  and coalesce(nullif(jsonb_array_length(questoes), 0), 0) > 0;

update public.provas
set pesos = (
  select coalesce(jsonb_agg(
    case when jsonb_typeof(q.item) = 'object'
          and coalesce(q.item ->> 'peso', '') ~ '^[0-9]+([.,][0-9]{1,4})?$'
         then replace((q.item ->> 'peso'), ',', '.')::numeric else 1 end
    order by q.ord), '[]'::jsonb)
  from jsonb_array_elements(questoes) with ordinality as q(item, ord)
)
where coalesce(nullif(jsonb_array_length(pesos), 0), 0) = 0
  and coalesce(nullif(jsonb_array_length(questoes), 0), 0) > 0;

update public.provas
set descritores = (
  select coalesce(jsonb_agg(jsonb_build_object(
    'descritor', case when jsonb_typeof(q.item) = 'object' then coalesce(q.item ->> 'descritor', '') else '' end,
    'habilidade_bncc', case when jsonb_typeof(q.item) = 'object' then coalesce(q.item ->> 'habilidade_bncc', '') else '' end
  ) order by q.ord), '[]'::jsonb)
  from jsonb_array_elements(questoes) with ordinality as q(item, ord)
)
where coalesce(nullif(jsonb_array_length(descritores), 0), 0) = 0
  and coalesce(nullif(jsonb_array_length(questoes), 0), 0) > 0;

update public.provas
set total_questoes = quantidade_questoes
where coalesce(total_questoes, 0) = 0 and coalesce(quantidade_questoes, 0) > 0;

update public.provas
set num_tipos = greatest(coalesce(nullif(jsonb_array_length(tipos), 0), 1), 1)
where modo in ('turma', 'aluno') and coalesce(num_tipos, 1) = 1;

update public.provas
set disciplina = coalesce(disciplina, 'Geral')
where disciplina is null or disciplina = '';

-- professor_id era obrigatório no schema antigo; o app simples não envia professor
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'turmas' and column_name = 'professor_id'
  ) then
    alter table public.turmas alter column professor_id drop not null;
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'provas' and column_name = 'professor_id'
  ) then
    alter table public.provas alter column professor_id drop not null;
  end if;
end $$;

-- Limites do produto: ate 90 questoes, 2 a 5 alternativas, 26 tipos de versao.
-- "not valid" para nao travar em linha antiga; o app sempre escreve dentro do limite.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'provas_quantidade_chk' and connamespace = 'public'::regnamespace) then
    alter table public.provas
      add constraint provas_quantidade_chk
      check (quantidade_questoes is null or (quantidade_questoes between 1 and 90)) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'provas_alternativas_chk' and connamespace = 'public'::regnamespace) then
    alter table public.provas
      add constraint provas_alternativas_chk
      check (alternativas is null or (alternativas between 2 and 5)) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'provas_modo_chk' and connamespace = 'public'::regnamespace) then
    alter table public.provas
      add constraint provas_modo_chk
      check (modo is null or modo in ('fixa', 'turma', 'aluno')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'provas_num_tipos_chk' and connamespace = 'public'::regnamespace) then
    alter table public.provas
      add constraint provas_num_tipos_chk
      check (num_tipos is null or (num_tipos between 1 and 26)) not valid;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Índices
-- ---------------------------------------------------------------------------

create index if not exists alunos_turma_id_idx on public.alunos (turma_id);
create index if not exists alunos_numero_idx on public.alunos (numero);

-- Numeros repetidos na mesma turma (dois alunos com a mesma matricula) impedem o
-- index unique abaixo: quem repete recebe o proximo numero livre da propria turma.
do $$
declare
  r record;
  livre integer;
begin
  for r in
    select a.id, a.turma_id
    from public.alunos a
    join public.alunos b
      on b.turma_id = a.turma_id and b.numero = a.numero and b.id < a.id
  loop
    select coalesce(max(c.numero), 0) + 1 into livre
    from public.alunos c
    where c.turma_id = r.turma_id;
    update public.alunos set numero = livre where id = r.id;
  end loop;
end $$;

create unique index if not exists alunos_turma_numero_uidx on public.alunos (turma_id, numero);
create index if not exists correcoes_prova_id_idx on public.correcoes (prova_id);
create index if not exists correcoes_aluno_id_idx on public.correcoes (aluno_id);
create index if not exists correcoes_created_at_idx on public.correcoes (created_at desc);
create index if not exists correcoes_prova_codigo_idx on public.correcoes (prova_id, codigo);

-- A mesma folha lida duas vezes (dois aparelhos) vira update, nao linha repetida.
-- Index comum, nao parcial: o PostgREST so reconhece um unique index completo quando
-- o app manda upsert com on_conflict=prova_id,qr_payload. Leitura sem QR grava
-- qr_payload nulo e null nunca colide; string vazia colidiria, entao some antes.
do $$
begin
  if exists (
    select 1 from pg_class c
    join pg_index i on i.indexrelid = c.oid
    where c.relname = 'correcoes_qr_uidx' and i.indpred is not null
  ) then
    drop index public.correcoes_qr_uidx;
  end if;
end $$;

update public.correcoes set qr_payload = null where qr_payload = '';

create unique index if not exists correcoes_qr_uidx on public.correcoes (prova_id, qr_payload);

create index if not exists prova_versoes_prova_idx on public.prova_versoes (prova_id, codigo);
create index if not exists prova_versoes_lote_idx on public.prova_versoes (prova_id, lote_id);
create unique index if not exists prova_versoes_uidx on public.prova_versoes (prova_id, codigo, coalesce(aluno_numero, -1));

-- upsertProfessor manda on_conflict=email, que so funciona com um index unique sobre a
-- coluna. O "unique" da create table abaixo cobre o banco novo; isto cobre o antigo.
do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.conrelid = 'public.professores'::regclass
      and c.contype = 'u' and cardinality(c.conkey) = 1 and a.attname = 'email'
  ) then
    create unique index if not exists professores_email_uidx on public.professores (email);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.turmas enable row level security;
alter table public.alunos enable row level security;
alter table public.provas enable row level security;
alter table public.correcoes enable row level security;
alter table public.professores enable row level security;
alter table public.prova_versoes enable row level security;

drop policy if exists "turmas_select_anon" on public.turmas;
drop policy if exists "turmas_insert_anon" on public.turmas;
drop policy if exists "turmas_update_anon" on public.turmas;
drop policy if exists "turmas_delete_anon" on public.turmas;
drop policy if exists turmas_all on public.turmas;

create policy "turmas_select_anon" on public.turmas for select to anon, authenticated using (true);
create policy "turmas_insert_anon" on public.turmas for insert to anon, authenticated with check (true);
create policy "turmas_update_anon" on public.turmas for update to anon, authenticated using (true) with check (true);
create policy "turmas_delete_anon" on public.turmas for delete to anon, authenticated using (true);

drop policy if exists "alunos_select_anon" on public.alunos;
drop policy if exists "alunos_insert_anon" on public.alunos;
drop policy if exists "alunos_update_anon" on public.alunos;
drop policy if exists "alunos_delete_anon" on public.alunos;
drop policy if exists alunos_all on public.alunos;

create policy "alunos_select_anon" on public.alunos for select to anon, authenticated using (true);
create policy "alunos_insert_anon" on public.alunos for insert to anon, authenticated with check (true);
create policy "alunos_update_anon" on public.alunos for update to anon, authenticated using (true) with check (true);
create policy "alunos_delete_anon" on public.alunos for delete to anon, authenticated using (true);

drop policy if exists "provas_select_anon" on public.provas;
drop policy if exists "provas_insert_anon" on public.provas;
drop policy if exists "provas_update_anon" on public.provas;
drop policy if exists "provas_delete_anon" on public.provas;
drop policy if exists provas_all on public.provas;

create policy "provas_select_anon" on public.provas for select to anon, authenticated using (true);
create policy "provas_insert_anon" on public.provas for insert to anon, authenticated with check (true);
create policy "provas_update_anon" on public.provas for update to anon, authenticated using (true) with check (true);
create policy "provas_delete_anon" on public.provas for delete to anon, authenticated using (true);

drop policy if exists "correcoes_select_anon" on public.correcoes;
drop policy if exists "correcoes_insert_anon" on public.correcoes;
drop policy if exists "correcoes_update_anon" on public.correcoes;
drop policy if exists "correcoes_delete_anon" on public.correcoes;

create policy "correcoes_select_anon" on public.correcoes for select to anon, authenticated using (true);
create policy "correcoes_insert_anon" on public.correcoes for insert to anon, authenticated with check (true);
create policy "correcoes_update_anon" on public.correcoes for update to anon, authenticated using (true) with check (true);
create policy "correcoes_delete_anon" on public.correcoes for delete to anon, authenticated using (true);

drop policy if exists "professores_select_anon" on public.professores;
drop policy if exists "professores_insert_anon" on public.professores;
drop policy if exists "professores_update_anon" on public.professores;

create policy "professores_select_anon" on public.professores for select to anon, authenticated using (true);
create policy "professores_insert_anon" on public.professores for insert to anon, authenticated with check (true);
create policy "professores_update_anon" on public.professores for update to anon, authenticated using (true) with check (true);

drop policy if exists "prova_versoes_select_anon" on public.prova_versoes;
drop policy if exists "prova_versoes_insert_anon" on public.prova_versoes;
drop policy if exists "prova_versoes_update_anon" on public.prova_versoes;
drop policy if exists "prova_versoes_delete_anon" on public.prova_versoes;

create policy "prova_versoes_select_anon" on public.prova_versoes for select to anon, authenticated using (true);
create policy "prova_versoes_insert_anon" on public.prova_versoes for insert to anon, authenticated with check (true);
create policy "prova_versoes_update_anon" on public.prova_versoes for update to anon, authenticated using (true) with check (true);
create policy "prova_versoes_delete_anon" on public.prova_versoes for delete to anon, authenticated using (true);

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.turmas, public.alunos, public.provas, public.correcoes, public.professores, public.prova_versoes to anon, authenticated;
