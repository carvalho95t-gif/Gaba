-- ============================================================================
-- Gaba - Ajuda: duvidas, sugestoes e problemas relatados
--
-- Cria (ou completa) tres tabelas:
--   * public.ajuda_duvidas    - perguntas que o professor fez na busca do guia
--   * public.ajuda_sugestoes  - ideias de melhoria enviadas pelo professor
--   * public.ajuda_erros      - problemas que o professor relatou, com a mensagem
--                               tecnica e a pilha de execucao que o app capturou
--
-- Como rodar: Supabase > SQL Editor > New query > cole este arquivo inteiro > Run.
-- Pode rodar de novo: as tabelas usam "if not exists", as colunas novas usam
-- "add column if not exists" e as regras sao recriadas. Nao apaga dado nenhum e
-- nao altera as tabelas que o app ja usa (turmas, alunos, provas, correcoes...).
--
-- Quem le e quem grava:
--   * o professor logado so GRAVA. Nao le, nao altera e nao apaga pelo app: a
--     lista que ele ve na tela de Ajuda fica no proprio aparelho;
--   * a chave publica (anon) nao grava nem le nada;
--   * voce le tudo pelo painel do Supabase (Table Editor / SQL Editor). O painel
--     usa a chave de servico, que passa por cima do RLS.
--
-- O que o app garante antes de gravar (js/ajuda.js):
--   * nada sobe sem o professor clicar em "Relatar este problema" - captura
--     automatica fica no aparelho e so viaja se ele mandar;
--   * todo texto passa por um filtro que troca nome de aluno, de responsavel,
--     matricula, telefone, e-mail e nome de escola/turma por marcadores;
--   * o conteudo e tecnico: tela, versao, navegador, mensagem de erro e pilha.
--   O banco nao faz essa limpeza sozinho, entao o texto precisa chegar limpo.
--
-- Detalhes que o app precisa respeitar ao gravar:
--   * inserir sem pedir a linha de volta (insert sem .select(), ou seja,
--     Prefer: return=minimal), porque o professor nao tem permissao de leitura;
--   * mandar o id uuid criado no aparelho e reenviar a fila com on_conflict=id:
--     tentar de novo nao cria linha repetida (codigo 23505 e tratado como ok);
--   * "situacao" e da sua triagem no painel. O "status" fila/enviado do aparelho
--     e so transporte e nao entra no banco;
--   * respeitar os limites das colunas (texto ate 4000, mensagem tecnica ate
--     8000, pilha incluida nessa mesma coluna).
--
-- A coluna assinatura ja e preenchida pelo app em todo relato que anexa a mensagem
-- tecnica: hash fnv1 de (mensagem ja filtrada + tela + versao), com os digitos e o
-- "arquivo.js:88" colapsados antes, para a mesma build e a proxima cairem no mesmo
-- grupo. Relato digitado sem anexar nada fica NULL, e linha antiga fica NULL mesmo.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------

create table if not exists public.ajuda_duvidas (
  id uuid primary key default gen_random_uuid(),
  -- conta que enviou; o banco preenche e o app nao manda
  dono uuid not null default auth.uid(),
  -- quando o professor escreveu (pode ser dias antes de sincronizar)
  criado_em timestamptz not null default now(),
  -- quando o banco recebeu de verdade; serve para separar atraso de fila
  recebido_em timestamptz not null default now(),
  professor_nome text,
  professor_email text,
  -- id interno da tela: dashboard, scanner, relatorios, turmas, provas, caderno, config, ajuda
  tela text not null,
  texto text not null,
  -- primeiro artigo que a busca mostrou; null quando nada foi encontrado
  artigo_id text,
  -- triagem feita por voce no painel
  situacao text not null default 'novo',
  constraint ajuda_duvidas_texto_chk
    check (char_length(btrim(texto)) between 1 and 4000),
  constraint ajuda_duvidas_tela_chk
    check (char_length(tela) between 1 and 40),
  constraint ajuda_duvidas_artigo_chk
    check (artigo_id is null or char_length(artigo_id) <= 80),
  constraint ajuda_duvidas_nome_chk
    check (professor_nome is null or char_length(professor_nome) <= 120),
  constraint ajuda_duvidas_email_chk
    check (professor_email is null or char_length(professor_email) between 3 and 320),
  constraint ajuda_duvidas_situacao_chk
    check (situacao in ('novo', 'em_analise', 'resolvido', 'descartado'))
);

create table if not exists public.ajuda_sugestoes (
  id uuid primary key default gen_random_uuid(),
  dono uuid not null default auth.uid(),
  criado_em timestamptz not null default now(),
  recebido_em timestamptz not null default now(),
  professor_nome text,
  professor_email text,
  tela text not null,
  texto text not null,
  -- os mesmos textos que o professor ve na tela de Ajuda
  importancia text not null,
  situacao text not null default 'novo',
  constraint ajuda_sugestoes_texto_chk
    check (char_length(btrim(texto)) between 1 and 4000),
  constraint ajuda_sugestoes_tela_chk
    check (char_length(tela) between 1 and 40),
  constraint ajuda_sugestoes_importancia_chk
    check (importancia in ('Seria bom', 'Ajudaria muito', 'Me trava hoje')),
  constraint ajuda_sugestoes_nome_chk
    check (professor_nome is null or char_length(professor_nome) <= 120),
  constraint ajuda_sugestoes_email_chk
    check (professor_email is null or char_length(professor_email) between 3 and 320),
  constraint ajuda_sugestoes_situacao_chk
    check (situacao in ('novo', 'em_analise', 'resolvido', 'descartado'))
);

create table if not exists public.ajuda_erros (
  id uuid primary key default gen_random_uuid(),
  dono uuid not null default auth.uid(),
  criado_em timestamptz not null default now(),
  recebido_em timestamptz not null default now(),
  professor_nome text,
  professor_email text,
  tela text not null,
  -- o que o professor escreveu, ja sem os nomes de aluno
  texto_usuario text not null,
  -- erro tecnico da captura + pilha de execucao; vazio quando o relato foi
  -- digitado sem anexar nada
  mensagem_tecnica text not null default '',
  navegador text not null default '',
  versao text not null default '',
  -- manual = digitado; captura = relatou uma captura que ja estava no aparelho
  origem text not null,
  situacao text not null default 'novo',
  constraint ajuda_erros_texto_chk
    check (char_length(btrim(texto_usuario)) between 1 and 4000),
  constraint ajuda_erros_msg_chk
    check (char_length(mensagem_tecnica) <= 8000),
  constraint ajuda_erros_tela_chk
    check (char_length(tela) between 1 and 40),
  constraint ajuda_erros_navegador_chk
    check (char_length(navegador) <= 600),
  constraint ajuda_erros_versao_chk
    check (char_length(versao) <= 40),
  constraint ajuda_erros_nome_chk
    check (professor_nome is null or char_length(professor_nome) <= 120),
  constraint ajuda_erros_email_chk
    check (professor_email is null or char_length(professor_email) between 3 and 320),
  constraint ajuda_erros_origem_chk
    check (origem in ('manual', 'captura')),
  constraint ajuda_erros_situacao_chk
    check (situacao in ('novo', 'em_analise', 'resolvido', 'descartado'))
);

-- ---------------------------------------------------------------------------
-- Colunas novas, para quem ja rodou a versao anterior deste arquivo
-- ---------------------------------------------------------------------------

alter table public.ajuda_erros
  add column if not exists assinatura text;

-- Sem check de tamanho nem de formato de proposito: quem preenche e o app, e
-- linha anterior a esta coluna continua NULL.
comment on column public.ajuda_erros.assinatura is
  'hash fnv1-8hex de (mensagem tecnica ja filtrada + tela + versao), para agrupar o mesmo bug. Nunca guarda texto de aluno.';

-- ---------------------------------------------------------------------------
-- Indices
-- ---------------------------------------------------------------------------
-- A leitura e sua, pelo painel: a consulta natural e "mais recentes primeiro",
-- e "quantos aparelhos tiveram o mesmo erro" agrupa por assinatura.

create index if not exists ajuda_duvidas_criado_em_idx
  on public.ajuda_duvidas (criado_em desc);
create index if not exists ajuda_sugestoes_criado_em_idx
  on public.ajuda_sugestoes (criado_em desc);
create index if not exists ajuda_erros_criado_em_idx
  on public.ajuda_erros (criado_em desc);
create index if not exists ajuda_erros_assinatura_idx
  on public.ajuda_erros (assinatura, criado_em desc)
  where assinatura is not null;

-- ---------------------------------------------------------------------------
-- RLS: so gravacao, e so na propria conta
-- ---------------------------------------------------------------------------

alter table public.ajuda_duvidas enable row level security;
alter table public.ajuda_sugestoes enable row level security;
alter table public.ajuda_erros enable row level security;

-- Apaga toda regra antiga destas tres tabelas, tenha o nome que tiver: uma
-- "using (true)" esquecida abriria a leitura de novo, porque regras do mesmo
-- comando se somam.
do $$
declare
  r record;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('ajuda_duvidas', 'ajuda_sugestoes', 'ajuda_erros')
  loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- Sem policy de select, update ou delete: o professor nao le nem mexe no que
-- enviou. "situacao = 'novo'" impede que o app grave uma linha ja dada como
-- resolvida; a triagem e feita por voce no painel (service_role ignora o RLS).
create policy "ajuda_duvidas_insert_dono" on public.ajuda_duvidas
  for insert to authenticated
  with check (dono = (select auth.uid()) and situacao = 'novo');

create policy "ajuda_sugestoes_insert_dono" on public.ajuda_sugestoes
  for insert to authenticated
  with check (dono = (select auth.uid()) and situacao = 'novo');

create policy "ajuda_erros_insert_dono" on public.ajuda_erros
  for insert to authenticated
  with check (dono = (select auth.uid()) and situacao = 'novo');

-- O Supabase concede ALL por padrao em tabela nova (default privileges). Revogar
-- tambem de authenticated e o que deixa o privilegio de tabela coerente com o RLS:
-- so insert, e so nas regras de insert acima. service_role fica intacta para voce.
revoke all on public.ajuda_duvidas, public.ajuda_sugestoes, public.ajuda_erros
  from anon, authenticated, public;

grant usage on schema public to authenticated;
grant insert on public.ajuda_duvidas, public.ajuda_sugestoes, public.ajuda_erros
  to authenticated;

-- Faz o PostgREST enxergar as tabelas e colunas novas na hora, sem esperar o cache.
notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- Conferencia. Esperado nas tres linhas:
--   regras = 1, regras_abertas = 0,
--   anon_le = false, anon_grava = false,
--   professor_le = false, professor_grava = true,
--   professor_altera = false, professor_apaga = false.
-- ---------------------------------------------------------------------------

select t.tabela,
       (select count(*) from pg_policies p
         where p.schemaname = 'public' and p.tablename = t.tabela) as regras,
       (select count(*) from pg_policies p
         where p.schemaname = 'public' and p.tablename = t.tabela
           and (p.qual = 'true' or p.with_check = 'true')) as regras_abertas,
       has_table_privilege('anon', 'public.' || t.tabela, 'select') as anon_le,
       has_table_privilege('anon', 'public.' || t.tabela, 'insert') as anon_grava,
       has_table_privilege('authenticated', 'public.' || t.tabela, 'select') as professor_le,
       has_table_privilege('authenticated', 'public.' || t.tabela, 'insert') as professor_grava,
       has_table_privilege('authenticated', 'public.' || t.tabela, 'update') as professor_altera,
       has_table_privilege('authenticated', 'public.' || t.tabela, 'delete') as professor_apaga
from (values ('ajuda_duvidas'), ('ajuda_sugestoes'), ('ajuda_erros')) as t(tabela)
order by 1;

-- ---------------------------------------------------------------------------
-- Triagem do dia (rode no SQL Editor, quantas vezes quiser):
--
--   select tela, versao, navegador, texto_usuario, mensagem_tecnica, criado_em
--     from public.ajuda_erros
--    where situacao = 'novo'
--    order by criado_em desc
--    limit 50;
--
-- E o mesmo erro agrupado, com quantos aparelhos cada bug apareceu (linha antiga
-- fica de fora porque assinatura e NULL ate o proximo relato daquela captura):
--
--   select assinatura, count(*) as aparelhos, max(tela) as tela,
--          max(left(mensagem_tecnica, 120)) as exemplo, max(criado_em) as ultimo
--     from public.ajuda_erros
--    where assinatura is not null
--    group by assinatura
--    order by aparelhos desc, ultimo desc;
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Gatilho do expurgo: a regra, nao a execucao.
--
-- Expurgo e decisao tomada, nao conta aberta. Enquanto o veredito da consulta
-- abaixo for ADIAR, nao apague nada: as linhas sao pequenas e guardar nao custa.
--
-- Os tres numeros que decidem, medidos na propria tabela:
--   * mais de 300 linhas encerradas  -> a triagem passa a demorar mais do que vale;
--   * mais de 2 contas distintas     -> o volume deixou de ser so o seu aparelho;
--   * nada fechado ha 90 dias        -> nao ha o que apagar ainda.
-- Seu teste de isolamento (2 contas) nao dispara o gatilho por proposito.
--
--   select tabela, encerradas, aguardando, contas,
--          case
--            when mais_velha_fora is null then 'ADIAR: nada fechado ha mais de 90 dias'
--            when encerradas > 300 then 'FAZER: triagem com mais de 300 encerradas'
--            when contas > 2 then 'FAZER: outras contas ja relatam'
--            else 'ADIAR: volume ainda so do seu aparelho'
--          end as veredito
--     from (
--       select 'ajuda_erros' as tabela,
--              count(*) filter (where situacao in ('resolvido','descartado')) as encerradas,
--              count(*) filter (where situacao = 'novo') as aguardando,
--              count(distinct dono) as contas,
--              max(criado_em) filter (where situacao in ('resolvido','descartado')
--                                       and criado_em < now() - interval '90 days') as mais_velha_fora
--         from public.ajuda_erros
--       union all
--       select 'ajuda_duvidas',
--              count(*) filter (where situacao in ('resolvido','descartado')),
--              count(*) filter (where situacao = 'novo'),
--              count(distinct dono),
--              max(criado_em) filter (where situacao in ('resolvido','descartado')
--                                       and criado_em < now() - interval '90 days')
--         from public.ajuda_duvidas
--       union all
--       select 'ajuda_sugestoes',
--              count(*) filter (where situacao in ('resolvido','descartado')),
--              count(*) filter (where situacao = 'novo'),
--              count(distinct dono),
--              max(criado_em) filter (where situacao in ('resolvido','descartado')
--                                       and criado_em < now() - interval '90 days')
--         from public.ajuda_sugestoes
--     ) as x
--    order by tabela;
--
-- ---------------------------------------------------------------------------
-- Expurgo em si - NAO roda junto com este arquivo, de proposito.
--
-- Rode o delete quando a consulta acima responder FAZER. Confira a contagem
-- primeiro, depois apague: apagar em Postgres nao tem lixeira.
--
-- delete from public.ajuda_erros
--  where situacao in ('resolvido', 'descartado')
--    and criado_em < now() - interval '90 days';
--
-- O mesmo delete vale para ajuda_duvidas e ajuda_sugestoes, uma tabela por vez;
-- elas sao separadas de proposito, para voce poder limpar uma sem tocar nas
-- outras. Se quiser guardar o historico de quantos aparelhos tiveram cada bug,
-- arquive antes de apagar - e na tabela nova rode os mesmos enable row level
-- security + revoke from anon, authenticated, public deste arquivo, porque
-- tabela criada no editor pode nascer legivel pela chave anon.
-- ---------------------------------------------------------------------------
