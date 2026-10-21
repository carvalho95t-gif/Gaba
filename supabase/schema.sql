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

-- ---------------------------------------------------------------------------
-- Colunas que o app atual precisa (adiciona se faltar)
-- ---------------------------------------------------------------------------

alter table public.turmas add column if not exists nome text;
alter table public.turmas add column if not exists ano text;
alter table public.turmas add column if not exists created_at timestamptz not null default now();
alter table public.turmas add column if not exists professor_id uuid;

alter table public.alunos add column if not exists turma_id uuid;
alter table public.alunos add column if not exists nome text;
alter table public.alunos add column if not exists matricula text;
alter table public.alunos add column if not exists numero integer;
alter table public.alunos add column if not exists created_at timestamptz not null default now();

alter table public.provas add column if not exists titulo text;
alter table public.provas add column if not exists disciplina text;
alter table public.provas add column if not exists quantidade_questoes integer;
alter table public.provas add column if not exists total_questoes integer;
alter table public.provas add column if not exists gabarito jsonb not null default '[]'::jsonb;
alter table public.provas add column if not exists professor_id uuid;
alter table public.provas add column if not exists created_at timestamptz not null default now();

alter table public.correcoes add column if not exists aluno_id uuid;
alter table public.correcoes add column if not exists turma_id uuid;
alter table public.correcoes add column if not exists prova_id uuid;
alter table public.correcoes add column if not exists respostas jsonb not null default '[]'::jsonb;
alter table public.correcoes add column if not exists acertos integer not null default 0;
alter table public.correcoes add column if not exists total_questoes integer not null default 0;
alter table public.correcoes add column if not exists nota numeric(5,2) not null default 0;
alter table public.correcoes add column if not exists created_at timestamptz not null default now();

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

-- ---------------------------------------------------------------------------
-- Índices
-- ---------------------------------------------------------------------------

create index if not exists alunos_turma_id_idx on public.alunos (turma_id);
create index if not exists alunos_numero_idx on public.alunos (numero);
create unique index if not exists alunos_turma_numero_uidx on public.alunos (turma_id, numero);
create index if not exists correcoes_prova_id_idx on public.correcoes (prova_id);
create index if not exists correcoes_aluno_id_idx on public.correcoes (aluno_id);
create index if not exists correcoes_created_at_idx on public.correcoes (created_at desc);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.turmas enable row level security;
alter table public.alunos enable row level security;
alter table public.provas enable row level security;
alter table public.correcoes enable row level security;

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

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.turmas, public.alunos, public.provas, public.correcoes to anon, authenticated;
