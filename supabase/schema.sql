-- Gaba — schema para o PWA (cole no SQL Editor do Supabase)
-- Tabelas: turmas, alunos, provas, correcoes
-- RLS: o app usa a chave anon no navegador, sem login.
-- Estas políticas liberam CRUD para anon/authenticated.
-- Troque por políticas por professor quando adicionar autenticação.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------

create table if not exists public.turmas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  ano text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.alunos (
  id uuid primary key default gen_random_uuid(),
  turma_id uuid not null references public.turmas(id) on delete cascade,
  nome text not null,
  numero integer not null,
  created_at timestamptz not null default now(),
  unique (turma_id, numero)
);

create table if not exists public.provas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  disciplina text not null,
  quantidade_questoes integer not null check (quantidade_questoes between 1 and 50),
  gabarito jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.correcoes (
  id uuid primary key default gen_random_uuid(),
  aluno_id uuid not null references public.alunos(id) on delete cascade,
  turma_id uuid not null references public.turmas(id) on delete cascade,
  prova_id uuid not null references public.provas(id) on delete cascade,
  respostas jsonb not null default '[]'::jsonb,
  acertos integer not null default 0,
  total_questoes integer not null default 0,
  nota numeric(5,2) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists alunos_turma_id_idx on public.alunos (turma_id);
create index if not exists alunos_numero_idx on public.alunos (numero);
create index if not exists correcoes_prova_id_idx on public.correcoes (prova_id);
create index if not exists correcoes_aluno_id_idx on public.correcoes (aluno_id);
create index if not exists correcoes_created_at_idx on public.correcoes (created_at desc);

-- Relacionamentos explícitos para o embed do supabase-js:
-- .select('*, alunos(nome), turmas(nome), provas(titulo)')
comment on constraint correcoes_aluno_id_fkey on public.correcoes is 'FK alunos';
comment on constraint correcoes_turma_id_fkey on public.correcoes is 'FK turmas';
comment on constraint correcoes_prova_id_fkey on public.correcoes is 'FK provas';

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.turmas enable row level security;
alter table public.alunos enable row level security;
alter table public.provas enable row level security;
alter table public.correcoes enable row level security;

drop policy if exists "turmas_select_anon" on public.turmas;
drop policy if exists "turmas_insert_anon" on public.turmas;
drop policy if exists "turmas_update_anon" on public.turmas;
drop policy if exists "turmas_delete_anon" on public.turmas;

create policy "turmas_select_anon" on public.turmas for select to anon, authenticated using (true);
create policy "turmas_insert_anon" on public.turmas for insert to anon, authenticated with check (true);
create policy "turmas_update_anon" on public.turmas for update to anon, authenticated using (true) with check (true);
create policy "turmas_delete_anon" on public.turmas for delete to anon, authenticated using (true);

drop policy if exists "alunos_select_anon" on public.alunos;
drop policy if exists "alunos_insert_anon" on public.alunos;
drop policy if exists "alunos_update_anon" on public.alunos;
drop policy if exists "alunos_delete_anon" on public.alunos;

create policy "alunos_select_anon" on public.alunos for select to anon, authenticated using (true);
create policy "alunos_insert_anon" on public.alunos for insert to anon, authenticated with check (true);
create policy "alunos_update_anon" on public.alunos for update to anon, authenticated using (true) with check (true);
create policy "alunos_delete_anon" on public.alunos for delete to anon, authenticated using (true);

drop policy if exists "provas_select_anon" on public.provas;
drop policy if exists "provas_insert_anon" on public.provas;
drop policy if exists "provas_update_anon" on public.provas;
drop policy if exists "provas_delete_anon" on public.provas;

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
