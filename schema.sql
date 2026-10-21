-- Gaba / App OMR — schema PostgreSQL para Supabase
-- Execute no SQL Editor do Supabase (uma vez por projeto).

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------

create table if not exists public.professores (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  email text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.turmas (
  id uuid primary key default gen_random_uuid(),
  professor_id uuid not null references public.professores(id) on delete cascade,
  nome text not null,
  ano integer,
  created_at timestamptz not null default now()
);

create table if not exists public.alunos (
  id uuid primary key default gen_random_uuid(),
  turma_id uuid not null references public.turmas(id) on delete cascade,
  matricula text not null,
  nome text not null,
  created_at timestamptz not null default now(),
  unique (turma_id, matricula)
);

create table if not exists public.provas (
  id uuid primary key default gen_random_uuid(),
  professor_id uuid not null references public.professores(id) on delete cascade,
  titulo text not null,
  data date,
  total_questoes integer not null default 20,
  alternativas integer not null default 5,
  gabarito jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.questoes (
  id uuid primary key default gen_random_uuid(),
  prova_id uuid not null references public.provas(id) on delete cascade,
  numero integer not null,
  enunciado text,
  gabarito char(1) not null,
  peso numeric(6, 2) not null default 1,
  unique (prova_id, numero),
  constraint questoes_gabarito_chk check (upper(gabarito) in ('A', 'B', 'C', 'D', 'E'))
);

create table if not exists public.correcoes_omr (
  id uuid primary key default gen_random_uuid(),
  prova_id uuid references public.provas(id) on delete cascade,
  aluno_id uuid references public.alunos(id) on delete set null,
  professor_id uuid references public.professores(id) on delete set null,
  matricula text,
  aluno_nome text,
  respostas jsonb not null default '[]'::jsonb,
  acertos integer not null default 0,
  total_questoes integer not null default 0,
  nota numeric(6, 2) not null default 0,
  confianca numeric(5, 4),
  qr_payload text,
  raw_payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_turmas_professor on public.turmas (professor_id);
create index if not exists idx_alunos_turma on public.alunos (turma_id);
create index if not exists idx_provas_professor on public.provas (professor_id);
create index if not exists idx_questoes_prova on public.questoes (prova_id, numero);
create index if not exists idx_correcoes_prova on public.correcoes_omr (prova_id, created_at desc);
create index if not exists idx_correcoes_aluno on public.correcoes_omr (aluno_id);

-- ---------------------------------------------------------------------------
-- RLS — políticas permissivas para o cliente anon (PWA no GitHub Pages).
-- Ajuste depois com auth.uid() se ligar o Supabase Auth.
-- ---------------------------------------------------------------------------

alter table public.professores enable row level security;
alter table public.turmas enable row level security;
alter table public.alunos enable row level security;
alter table public.provas enable row level security;
alter table public.questoes enable row level security;
alter table public.correcoes_omr enable row level security;

drop policy if exists professores_all on public.professores;
create policy professores_all on public.professores for all using (true) with check (true);

drop policy if exists turmas_all on public.turmas;
create policy turmas_all on public.turmas for all using (true) with check (true);

drop policy if exists alunos_all on public.alunos;
create policy alunos_all on public.alunos for all using (true) with check (true);

drop policy if exists provas_all on public.provas;
create policy provas_all on public.provas for all using (true) with check (true);

drop policy if exists questoes_all on public.questoes;
create policy questoes_all on public.questoes for all using (true) with check (true);

drop policy if exists correcoes_all on public.correcoes_omr;
create policy correcoes_all on public.correcoes_omr for all using (true) with check (true);
