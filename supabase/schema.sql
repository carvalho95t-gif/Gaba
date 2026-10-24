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

-- A escola que o professor cadastra antes das turmas. O nome continua morando na
-- coluna turmas.escola (texto), então esta tabela e o cadastro: ela existe mesmo
-- com zero turmas e e o que faz um aparelho novo herdar as unidades do projeto.
create table if not exists public.escolas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.alunos (
  id uuid primary key default gen_random_uuid(),
  turma_id uuid not null references public.turmas(id) on delete cascade,
  nome text not null,
  created_at timestamptz not null default now()
);

-- Quem a chamada marcou como transferido, remanejado ou sem frequencia. Mora numa tabela a
-- parte de proposito: a lista de alunos e o que vira caderno impresso e leitura de folha, e um
-- aluno "transferido" dentro de alunos geraria folha em branco para quem nao esta mais na sala.
-- A linha guarda o numero de chamada que a pessoa tinha, o motivo que a planilha trouxe e de
-- qual arquivo veio, para o professor consultar depois de fechar o painel de importacao.
-- chave = a identidade dentro da turma: "n:<numero>" quando a chamada deu numero, senao
-- "a:<nome sem acento nem espaco>". numero pode ser nulo, por isso a unicidade e na chave.
create table if not exists public.saidas (
  id uuid primary key default gen_random_uuid(),
  turma_id uuid not null references public.turmas(id) on delete cascade,
  chave text not null,
  numero integer,
  nome text not null,
  situacao text,
  fonte text,
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

-- O catalogo oficial das matrizes de referencia (PAEBES / AMA). O mesmo conteudo ja vai
-- embutido no app em js/descritoresMatriz.js; esta tabela existe para o seletor de descritor
-- poder ser preenchido do banco quando o professor quiser uma lista fora do catalogo do app.
-- So o seed (supabase/seed-descritores.sql) escreve aqui: o caderno le.
create table if not exists public.descritores (
  id uuid primary key default gen_random_uuid(),
  chave text not null unique,
  matriz text not null,
  codigo text not null,
  disciplina text,
  componente text,
  ano text,
  banda text,
  descricao text,
  fonte text,
  pagina integer,
  duvidoso boolean not null default false,
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

alter table public.escolas add column if not exists nome text;
alter table public.escolas add column if not exists created_at timestamptz not null default now();

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

-- Tabela criada por uma versao antiga deste arquivo pode nao ter alguma dessas colunas.
alter table public.saidas add column if not exists chave text;
alter table public.saidas add column if not exists numero integer;
alter table public.saidas add column if not exists nome text;
alter table public.saidas add column if not exists situacao text;
alter table public.saidas add column if not exists fonte text;
alter table public.saidas add column if not exists created_at timestamptz not null default now();

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

-- dono = a conta que criou a linha. O banco preenche sozinho e as regras de RLS no fim deste
-- arquivo dependem disso. Sem foreign key para auth.users: apagar a conta nao apaga as provas.
-- Banco que ja tinha linhas antes desta coluna roda supabase/isolar-por-professor.sql uma
-- vez; ate la, linha sem dono fica invisivel para todo mundo.
alter table public.turmas add column if not exists dono uuid;
alter table public.escolas add column if not exists dono uuid;
alter table public.alunos add column if not exists dono uuid;
alter table public.saidas add column if not exists dono uuid;
alter table public.provas add column if not exists dono uuid;
alter table public.correcoes add column if not exists dono uuid;
alter table public.prova_versoes add column if not exists dono uuid;
alter table public.professores add column if not exists dono uuid;

alter table public.turmas alter column dono set default auth.uid();
alter table public.escolas alter column dono set default auth.uid();
alter table public.alunos alter column dono set default auth.uid();
alter table public.saidas alter column dono set default auth.uid();
alter table public.provas alter column dono set default auth.uid();
alter table public.correcoes alter column dono set default auth.uid();
alter table public.prova_versoes alter column dono set default auth.uid();
alter table public.professores alter column dono set default auth.uid();

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

-- Index comum, nao unique: quem decide que "EEFM DA SERRA" e "eefm da serra" sao a mesma
-- escola é o js/escolas.js, que compara sem caixa. Um unique aqui nao seria alvo de
-- on_conflict do PostgREST (index funcional) e estouraria a migracao se o professor ja
-- tivesse gravado duas grafias do mesmo nome.
create index if not exists escolas_nome_idx on public.escolas (lower(nome));

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
-- Reimportar a mesma chamada atualiza o motivo em vez de acumular uma linha por leitura: a chave
-- (numero de chamada, ou o nome quando a chamada nao deu numero) identifica dentro da turma.
create index if not exists saidas_turma_id_idx on public.saidas (turma_id);
create unique index if not exists saidas_turma_chave_uidx on public.saidas (turma_id, chave);
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

-- O seletor do caderno pede a lista por disciplina e ano; o codigo vem junto para a busca
-- por texto andar no mesmo index.
create index if not exists descritores_filtros_idx on public.descritores (disciplina, ano, codigo);

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
-- A anon key vai dentro do pacote publico do GitHub Pages (js/credencial.js), entao ela
-- nao pode ser a trava: sem login ninguem le nem escreve turma, aluno, prova, versao,
-- correcao, escola ou professor. descritores e o unico aberto ao anon porque e o catalogo
-- dos PDFs oficiais e nao tem dado de pessoa. O app fala com o banco depois que o
-- professor entra com e-mail e senha, e cada conta so ve e altera as linhas de que e dona.
-- supabase/isolar-por-professor.sql tem as mesmas regras e ainda entrega as linhas antigas.

-- Quem a conta logada enxerga. Hoje: so o que e dela. Uma coordenacao, no futuro, entra
-- trocando so o corpo desta funcao; gravar, alterar e apagar continuam exigindo ser o dono.
create or replace function public.gaba_ve(dono uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select dono = auth.uid()
$$;

grant execute on function public.gaba_ve(uuid) to authenticated;

-- not null so depois que nao sobrar linha sem dono (banco antigo: isolar-por-professor.sql)
do $$
declare
  t text;
  sem_dono boolean;
begin
  foreach t in array array['turmas', 'escolas', 'alunos', 'saidas', 'provas', 'correcoes', 'prova_versoes', 'professores'] loop
    execute format('create index if not exists %I on public.%I (dono)', t || '_dono_idx', t);
    execute format('select exists (select 1 from public.%I where dono is null)', t) into sem_dono;
    if not sem_dono then
      execute format('alter table public.%I alter column dono set not null', t);
    end if;
  end loop;
end $$;

alter table public.turmas enable row level security;
alter table public.escolas enable row level security;
alter table public.alunos enable row level security;
alter table public.saidas enable row level security;
alter table public.provas enable row level security;
alter table public.correcoes enable row level security;
alter table public.professores enable row level security;
alter table public.prova_versoes enable row level security;
alter table public.descritores enable row level security;

-- Apaga toda regra antiga das 8 tabelas, tenha o nome que tiver: uma "using (true)"
-- esquecida abriria tudo de novo, porque regras do mesmo comando se somam.
do $$
declare
  r record;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('turmas', 'escolas', 'alunos', 'saidas', 'provas', 'correcoes', 'professores', 'prova_versoes')
  loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

create policy "turmas_select_dono" on public.turmas for select to authenticated
  using (public.gaba_ve(dono));
create policy "turmas_insert_dono" on public.turmas for insert to authenticated
  with check (dono = (select auth.uid()));
create policy "turmas_update_dono" on public.turmas for update to authenticated
  using (dono = (select auth.uid())) with check (dono = (select auth.uid()));
create policy "turmas_delete_dono" on public.turmas for delete to authenticated
  using (dono = (select auth.uid()));

create policy "escolas_select_dono" on public.escolas for select to authenticated
  using (public.gaba_ve(dono));
create policy "escolas_insert_dono" on public.escolas for insert to authenticated
  with check (dono = (select auth.uid()));
create policy "escolas_update_dono" on public.escolas for update to authenticated
  using (dono = (select auth.uid())) with check (dono = (select auth.uid()));
create policy "escolas_delete_dono" on public.escolas for delete to authenticated
  using (dono = (select auth.uid()));

-- O numero de chamada e unico dentro da turma: aluno em turma alheia bloquearia o numero
-- do outro professor, entao a turma tambem precisa ser de quem grava.
create policy "alunos_select_dono" on public.alunos for select to authenticated
  using (public.gaba_ve(dono));
create policy "alunos_insert_dono" on public.alunos for insert to authenticated
  with check (dono = (select auth.uid())
    and exists (select 1 from public.turmas t where t.id = alunos.turma_id and t.dono = (select auth.uid())));
create policy "alunos_update_dono" on public.alunos for update to authenticated
  using (dono = (select auth.uid()))
  with check (dono = (select auth.uid())
    and exists (select 1 from public.turmas t where t.id = alunos.turma_id and t.dono = (select auth.uid())));
create policy "alunos_delete_dono" on public.alunos for delete to authenticated
  using (dono = (select auth.uid()));

-- saidas tem o mesmo pai de alunos: so entra linha numa turma de quem grava, e o motivo da saida
-- nao pode ser lido por outro professor porque traz nome de estudante.
create policy "saidas_select_dono" on public.saidas for select to authenticated
  using (public.gaba_ve(dono));
create policy "saidas_insert_dono" on public.saidas for insert to authenticated
  with check (dono = (select auth.uid())
    and exists (select 1 from public.turmas t where t.id = saidas.turma_id and t.dono = (select auth.uid())));
create policy "saidas_update_dono" on public.saidas for update to authenticated
  using (dono = (select auth.uid()))
  with check (dono = (select auth.uid())
    and exists (select 1 from public.turmas t where t.id = saidas.turma_id and t.dono = (select auth.uid())));
create policy "saidas_delete_dono" on public.saidas for delete to authenticated
  using (dono = (select auth.uid()));

-- provas.turma_id e referencia solta (a turma pode ter sido apagada): nao entra na checagem.
create policy "provas_select_dono" on public.provas for select to authenticated
  using (public.gaba_ve(dono));
create policy "provas_insert_dono" on public.provas for insert to authenticated
  with check (dono = (select auth.uid()));
create policy "provas_update_dono" on public.provas for update to authenticated
  using (dono = (select auth.uid())) with check (dono = (select auth.uid()));
create policy "provas_delete_dono" on public.provas for delete to authenticated
  using (dono = (select auth.uid()));

-- (prova_id, qr_payload) e unico e o id da prova vai impresso no QR: correcao gravada em
-- prova alheia tomaria o lugar da leitura verdadeira daquela folha.
create policy "correcoes_select_dono" on public.correcoes for select to authenticated
  using (public.gaba_ve(dono));
create policy "correcoes_insert_dono" on public.correcoes for insert to authenticated
  with check (dono = (select auth.uid())
    and exists (select 1 from public.provas p where p.id = correcoes.prova_id and p.dono = (select auth.uid())));
create policy "correcoes_update_dono" on public.correcoes for update to authenticated
  using (dono = (select auth.uid()))
  with check (dono = (select auth.uid())
    and exists (select 1 from public.provas p where p.id = correcoes.prova_id and p.dono = (select auth.uid())));
create policy "correcoes_delete_dono" on public.correcoes for delete to authenticated
  using (dono = (select auth.uid()));

create policy "prova_versoes_select_dono" on public.prova_versoes for select to authenticated
  using (public.gaba_ve(dono));
create policy "prova_versoes_insert_dono" on public.prova_versoes for insert to authenticated
  with check (dono = (select auth.uid())
    and exists (select 1 from public.provas p where p.id = prova_versoes.prova_id and p.dono = (select auth.uid())));
create policy "prova_versoes_update_dono" on public.prova_versoes for update to authenticated
  using (dono = (select auth.uid()))
  with check (dono = (select auth.uid())
    and exists (select 1 from public.provas p where p.id = prova_versoes.prova_id and p.dono = (select auth.uid())));
create policy "prova_versoes_delete_dono" on public.prova_versoes for delete to authenticated
  using (dono = (select auth.uid()));

-- Sem regra de delete: o app nunca apaga professor.
create policy "professores_select_dono" on public.professores for select to authenticated
  using (public.gaba_ve(dono));
create policy "professores_insert_dono" on public.professores for insert to authenticated
  with check (dono = (select auth.uid()));
create policy "professores_update_dono" on public.professores for update to authenticated
  using (dono = (select auth.uid())) with check (dono = (select auth.uid()));

-- So leitura: o catalogo vem dos PDFs oficiais e entra pelo seed, rodado no SQL Editor como
-- superuser (que passa por cima do RLS). Sem policy de escrita, o app nao inventa descritor.
drop policy if exists "descritores_select_anon" on public.descritores;

create policy "descritores_select_anon" on public.descritores for select to anon, authenticated using (true);

revoke all on public.turmas, public.escolas, public.alunos, public.saidas, public.provas, public.correcoes, public.professores, public.prova_versoes from anon, public;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.turmas, public.escolas, public.alunos, public.saidas, public.provas, public.correcoes, public.professores, public.prova_versoes to authenticated;
grant select on public.descritores to anon, authenticated;
