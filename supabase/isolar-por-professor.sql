-- Gaba: cada professor ve e altera so o que e dele.
--
-- ANTES DE RODAR: troque SEU-EMAIL-AQUI (na linha "set gaba.email_principal" abaixo) pelo
-- e-mail da conta com que voce entra no app. Tudo o que ja esta no banco passa a ser dessa
-- conta. Depois cole o arquivo inteiro no SQL Editor do Supabase e clique em Run.
-- Pode rodar de novo sem estragar nada.
--
-- O que muda:
--   * turmas, escolas, alunos, provas, correcoes, prova_versoes e professores ganham a
--     coluna dono. O proprio banco preenche com a conta logada; o app nao manda nada.
--   * Cada conta so le, altera e apaga as linhas que tem o seu dono.
--   * Uma conta nao grava aluno em turma alheia, nem correcao ou versao em prova alheia
--     (o id da prova vai impresso no QR da folha, entao ele nao e segredo).
--   * A linha de professores vai para a conta de mesmo e-mail; o resto, para a sua.
--   * O catalogo de descritores continua aberto para leitura. A chave publica (anon)
--     continua sem acesso as 7 tabelas.
-- Se o e-mail nao bater com nenhuma conta, o erro diz o motivo e nada e alterado.

set gaba.email_principal = 'SEU-EMAIL-AQUI';

-- Conferencia antes de abrir a transacao: se falhar aqui, nao sobra nada pela metade.
do $$
declare
  email_principal text := current_setting('gaba.email_principal');
begin
  if position('@' in email_principal) = 0 then
    raise exception 'Troque SEU-EMAIL-AQUI pelo e-mail da sua conta do Gaba (linha set gaba.email_principal) e rode de novo. Nada foi alterado.';
  end if;
  if not exists (select 1 from auth.users where lower(email) = lower(trim(email_principal))) then
    raise exception 'Nenhuma conta do Supabase tem o e-mail %. Confira em Authentication > Users e rode de novo. Nada foi alterado.', email_principal;
  end if;
end $$;

begin;

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

-- Sem foreign key para auth.users de proposito: apagar uma conta nao apaga as provas.
alter table public.turmas add column if not exists dono uuid;
alter table public.escolas add column if not exists dono uuid;
alter table public.alunos add column if not exists dono uuid;
alter table public.provas add column if not exists dono uuid;
alter table public.correcoes add column if not exists dono uuid;
alter table public.prova_versoes add column if not exists dono uuid;
alter table public.professores add column if not exists dono uuid;

alter table public.turmas alter column dono set default auth.uid();
alter table public.escolas alter column dono set default auth.uid();
alter table public.alunos alter column dono set default auth.uid();
alter table public.provas alter column dono set default auth.uid();
alter table public.correcoes alter column dono set default auth.uid();
alter table public.prova_versoes alter column dono set default auth.uid();
alter table public.professores alter column dono set default auth.uid();

do $$
declare
  email_principal text := current_setting('gaba.email_principal');
  principal uuid;
begin
  select id into principal from auth.users where lower(email) = lower(trim(email_principal));
  if principal is null then
    raise exception 'Nenhuma conta do Supabase tem o e-mail %. Nada foi alterado.', email_principal;
  end if;

  update public.professores p set dono = u.id
  from auth.users u
  where p.dono is null and lower(u.email) = lower(p.email);

  update public.professores set dono = principal where dono is null;
  update public.turmas set dono = principal where dono is null;
  update public.escolas set dono = principal where dono is null;
  update public.alunos set dono = principal where dono is null;
  update public.provas set dono = principal where dono is null;
  update public.correcoes set dono = principal where dono is null;
  update public.prova_versoes set dono = principal where dono is null;
end $$;

alter table public.turmas alter column dono set not null;
alter table public.escolas alter column dono set not null;
alter table public.alunos alter column dono set not null;
alter table public.provas alter column dono set not null;
alter table public.correcoes alter column dono set not null;
alter table public.prova_versoes alter column dono set not null;
alter table public.professores alter column dono set not null;

create index if not exists turmas_dono_idx on public.turmas (dono);
create index if not exists escolas_dono_idx on public.escolas (dono);
create index if not exists alunos_dono_idx on public.alunos (dono);
create index if not exists provas_dono_idx on public.provas (dono);
create index if not exists correcoes_dono_idx on public.correcoes (dono);
create index if not exists prova_versoes_dono_idx on public.prova_versoes (dono);
create index if not exists professores_dono_idx on public.professores (dono);

alter table public.turmas enable row level security;
alter table public.escolas enable row level security;
alter table public.alunos enable row level security;
alter table public.provas enable row level security;
alter table public.correcoes enable row level security;
alter table public.professores enable row level security;
alter table public.prova_versoes enable row level security;

-- Apaga toda regra antiga das 7 tabelas, tenha o nome que tiver: uma "using (true)"
-- esquecida abriria tudo de novo, porque regras do mesmo comando se somam.
do $$
declare
  r record;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('turmas', 'escolas', 'alunos', 'provas', 'correcoes', 'professores', 'prova_versoes')
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

-- provas.turma_id e referencia solta (a turma pode ter sido apagada): nao entra na checagem.
create policy "provas_select_dono" on public.provas for select to authenticated
  using (public.gaba_ve(dono));
create policy "provas_insert_dono" on public.provas for insert to authenticated
  with check (dono = (select auth.uid()));
create policy "provas_update_dono" on public.provas for update to authenticated
  using (dono = (select auth.uid())) with check (dono = (select auth.uid()));
create policy "provas_delete_dono" on public.provas for delete to authenticated
  using (dono = (select auth.uid()));

-- (prova_id, qr_payload) e unico: correcao gravada em prova alheia tomaria o lugar da
-- leitura verdadeira daquela folha.
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

-- Sem regra de delete, como antes: o app nunca apaga professor.
create policy "professores_select_dono" on public.professores for select to authenticated
  using (public.gaba_ve(dono));
create policy "professores_insert_dono" on public.professores for insert to authenticated
  with check (dono = (select auth.uid()));
create policy "professores_update_dono" on public.professores for update to authenticated
  using (dono = (select auth.uid())) with check (dono = (select auth.uid()));

revoke all on public.turmas, public.escolas, public.alunos, public.provas, public.correcoes, public.professores, public.prova_versoes from anon, public;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.turmas, public.escolas, public.alunos, public.provas, public.correcoes, public.professores, public.prova_versoes to authenticated;

commit;

-- Conferencia. Esperado, nas 7 tabelas: sem_dono = 0, regras = 4 (professores: 3),
-- regras_abertas = 0 e anon_le = false. "contas" diz quantas contas diferentes tem linha
-- naquela tabela. A linha "(contas em Authentication)" diz quantas contas existem no projeto.
-- Se aparecer alguma linha "visao: ...", copie o resultado inteiro de volta: visao passa
-- por cima destas regras.
with t (tabela, linhas, contas, sem_dono) as (
  select 'turmas', count(*), count(distinct dono), count(*) filter (where dono is null) from public.turmas
  union all
  select 'escolas', count(*), count(distinct dono), count(*) filter (where dono is null) from public.escolas
  union all
  select 'alunos', count(*), count(distinct dono), count(*) filter (where dono is null) from public.alunos
  union all
  select 'provas', count(*), count(distinct dono), count(*) filter (where dono is null) from public.provas
  union all
  select 'correcoes', count(*), count(distinct dono), count(*) filter (where dono is null) from public.correcoes
  union all
  select 'prova_versoes', count(*), count(distinct dono), count(*) filter (where dono is null) from public.prova_versoes
  union all
  select 'professores', count(*), count(distinct dono), count(*) filter (where dono is null) from public.professores
)
select t.tabela,
       t.linhas,
       t.contas,
       t.sem_dono,
       (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = t.tabela) as regras,
       (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = t.tabela
          and (p.qual = 'true' or p.with_check = 'true')) as regras_abertas,
       has_table_privilege('anon', 'public.' || t.tabela, 'select') as anon_le
from t
union all
select '(contas em Authentication)', (select count(*) from auth.users), null, null, null, null, null
union all
select 'visao: ' || c.relname, null, null, null, null, null, has_table_privilege('anon', c.oid, 'select')
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('v', 'm')
order by 1;
