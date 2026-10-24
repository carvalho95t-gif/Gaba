/* Cada professor ve e altera so o que e dele. Confere o texto de supabase/schema.sql, de
   supabase/isolar-por-professor.sql e de supabase/ajuda.sql e, quando acha o PGlite
   (Postgres em WASM, fora do repositorio de proposito), roda tudo num banco de verdade
   com duas contas (e uma terceira para o gatilho do expurgo):
     npm install @electric-sql/pglite --prefix %TEMP%\gaba-pg
     node tests/isolamento.test.js        (ou GABA_PGLITE=<pasta que tem node_modules>)
   Sem o PGlite, a parte do banco sai como PULADO. */
"use strict";

var fs = require("fs");
var os = require("os");
var path = require("path");

var RAIZ = path.join(__dirname, "..");
var SCHEMA = fs.readFileSync(path.join(RAIZ, "supabase", "schema.sql"), "utf8");
var MIGRACAO = fs.readFileSync(path.join(RAIZ, "supabase", "isolar-por-professor.sql"), "utf8");
var AJUDA = fs.readFileSync(path.join(RAIZ, "supabase", "ajuda.sql"), "utf8");
var TABELAS = ["turmas", "escolas", "alunos", "provas", "correcoes", "prova_versoes", "professores"];
/* as tres tabelas da Ajuda moram no proprio arquivo e so gravam: quem le e o painel */
var AJUDA_TABELAS = ["ajuda_duvidas", "ajuda_sugestoes", "ajuda_erros"];
/* saidas (quem saiu da turma) nasceu depois da tranca por dono: o schema.sql a cria e isola do
   mesmo jeito; a migracao nao tem linha antiga para entregar nela, entao fica fora de TABELAS */
var LISTAS = {
  schema: {
    tabelas: ["turmas", "escolas", "alunos", "saidas", "provas", "correcoes", "prova_versoes", "professores"],
    drop: "('turmas', 'escolas', 'alunos', 'saidas', 'provas', 'correcoes', 'professores', 'prova_versoes')",
    acesso: "public.turmas, public.escolas, public.alunos, public.saidas, public.provas, public.correcoes, public.professores, public.prova_versoes",
    comDono: 8
  },
  migracao: {
    tabelas: TABELAS,
    drop: "('turmas', 'escolas', 'alunos', 'provas', 'correcoes', 'professores', 'prova_versoes')",
    acesso: "public.turmas, public.escolas, public.alunos, public.provas, public.correcoes, public.professores, public.prova_versoes",
    comDono: 7
  }
};
var PAIS = {
  alunos: "from public.turmas t where t.id = alunos.turma_id and t.dono = (select auth.uid())",
  saidas: "from public.turmas t where t.id = saidas.turma_id and t.dono = (select auth.uid())",
  correcoes: "from public.provas p where p.id = correcoes.prova_id and p.dono = (select auth.uid())",
  prova_versoes: "from public.provas p where p.id = prova_versoes.prova_id and p.dono = (select auth.uid())"
};

var falhas = 0;
function check(nome, cond, detalhe) {
  console.log((cond ? "  ok   " : "  FALHA ") + nome + (detalhe !== undefined && !cond ? "  ->  " + JSON.stringify(detalhe) : ""));
  if (!cond) falhas += 1;
}

function espaco(t) {
  return String(t).replace(/\s+/g, " ").trim();
}

function regras(sql) {
  var out = [];
  var re = /create policy\s+"([^"]+)"\s+on\s+public\.(\w+)\s+for\s+(\w+)([\s\S]*?);/gi;
  var m;
  while ((m = re.exec(sql))) out.push({ nome: m[1], tabela: m[2], comando: m[3].toLowerCase(), corpo: espaco(m[4]) });
  return out;
}

function funcaoVe(sql) {
  var m = sql.match(/create or replace function public\.gaba_ve[\s\S]*?\$\$[\s\S]*?\$\$;/i);
  return m ? espaco(m[0]) : "";
}

function conferirTexto(rotulo, sql, lista) {
  console.log("\n== " + rotulo + " ==");
  var todas = regras(sql);
  lista.tabelas.forEach(function (t) {
    check(t + ": coluna dono com o default da conta logada",
      sql.indexOf("alter table public." + t + " add column if not exists dono uuid;") >= 0 &&
      sql.indexOf("alter table public." + t + " alter column dono set default auth.uid();") >= 0);
    var minhas = todas.filter(function (r) { return r.tabela === t; });
    var por = {};
    minhas.forEach(function (r) { (por[r.comando] = por[r.comando] || []).push(r); });
    check(t + ": nenhuma regra aberta com (true)",
      minhas.length > 0 && minhas.every(function (r) { return !/\(\s*true\s*\)/i.test(r.corpo); }),
      minhas.map(function (r) { return r.nome; }));
    check(t + ": so authenticated, uma regra por comando",
      minhas.every(function (r) { return /^to authenticated /.test(r.corpo); }) &&
      Object.keys(por).every(function (c) { return por[c].length === 1; }), Object.keys(por));
    check(t + ": ler passa por gaba_ve(dono)",
      por.select && por.select[0].corpo === "to authenticated using (public.gaba_ve(dono))", por.select);
    check(t + ": criar exige ser o dono",
      por.insert && por.insert[0].corpo.indexOf("with check (dono = (select auth.uid())") >= 0, por.insert);
    check(t + ": alterar exige ser o dono antes e depois",
      por.update && por.update[0].corpo.indexOf("using (dono = (select auth.uid()))") >= 0 &&
      por.update[0].corpo.indexOf("with check (dono = (select auth.uid())") >= 0, por.update);
    if (t === "professores") {
      check(t + ": continua sem regra de apagar", !por.delete);
    } else {
      check(t + ": apagar exige ser o dono",
        por.delete && por.delete[0].corpo === "to authenticated using (dono = (select auth.uid()))", por.delete);
    }
    if (PAIS[t]) {
      check(t + ": criar e alterar exigem o pai do mesmo dono",
        por.insert[0].corpo.indexOf(PAIS[t]) >= 0 && por.update[0].corpo.indexOf(PAIS[t]) >= 0);
    }
  });
  check("apaga toda regra antiga das " + lista.tabelas.length + " tabelas pelo pg_policies",
    /for r in\s+select schemaname, tablename, policyname\s+from pg_policies/i.test(sql) &&
    sql.indexOf("tablename in " + lista.drop) >= 0, lista.drop);
  check("tira as " + lista.tabelas.length + " tabelas da chave publica",
    sql.indexOf("revoke all on " + lista.acesso + " from anon, public;") >= 0);
  check("e so authenticated ganha acesso a elas",
    sql.indexOf("grant select, insert, update, delete on " + lista.acesso + " to authenticated;") >= 0);
  check("gaba_ve compara com a conta logada e fixa o search_path",
    /returns boolean language sql stable set search_path = '' as \$\$ select dono = auth\.uid\(\) \$\$;/i.test(funcaoVe(sql)), funcaoVe(sql));
}

conferirTexto("supabase/schema.sql", SCHEMA, LISTAS.schema);
check("descritores continua aberto para leitura do anon",
  SCHEMA.indexOf('create policy "descritores_select_anon" on public.descritores for select to anon, authenticated using (true);') >= 0);

conferirTexto("supabase/isolar-por-professor.sql", MIGRACAO, LISTAS.migracao);
check("a migracao nao apaga dado nem tabela",
  !/\b(drop table|truncate|delete from|drop column)\b/i.test(MIGRACAO));
check("a migracao vai para o git com o e-mail de exemplo, numa linha so",
  (MIGRACAO.match(/set gaba\.email_principal = /g) || []).length === 1 &&
  MIGRACAO.indexOf("set gaba.email_principal = 'SEU-EMAIL-AQUI';") >= 0 &&
  !/[\w.+-]+@[\w-]+\.[\w.]+/.test(MIGRACAO));
check("a migracao confere o e-mail antes do begin e grava dentro de begin/commit",
  MIGRACAO.indexOf("Nenhuma conta do Supabase") < MIGRACAO.indexOf("\nbegin;") &&
  MIGRACAO.indexOf("\nbegin;") < MIGRACAO.indexOf("\ncommit;"));

/* ------------------------------------------------------------------- ajuda */

/* o que o Postgres veria de fato: as linhas de comentario fora. E o que deixa
   claro que o delete do expurgo esta escrito mas nao roda junto do arquivo. */
function semComentario(sql) {
  return sql.replace(/--[^\n]*/g, "");
}

/* a consulta do gatilho mora comentada dentro do arquivo, de proposito. Tira os "--"
   das linhas entre "select tabela," e "order by tabela" para poder roda-la. */
function gatilhoDe(sql) {
  var m = sql.match(/^--\s+(select tabela,[\s\S]*?order by tabela;)/m);
  return m ? m[1].replace(/^--/gm, "") : "";
}

function conferirAjuda() {
  console.log("\n== supabase/ajuda.sql (texto) ==");
  var codigo = espaco(semComentario(AJUDA));
  var todas = regras(AJUDA);

  check("cria as tres tabelas sem mexer em nenhuma de antes",
    AJUDA_TABELAS.every(function (t) { return codigo.indexOf("create table if not exists public." + t + " (") >= 0; }));
  check("dono obrigatorio e preenchido por auth.uid() nas tres",
    (codigo.match(/dono uuid not null default auth\.uid\(\)/g) || []).length === 3,
    (codigo.match(/dono uuid not null default auth\.uid\(\)/g) || []).length);
  check("o arquivo nao toca em turma, aluno, prova, leitura, professor, saida ou descritor",
    ["turmas", "escolas", "alunos", "saidas", "provas", "correcoes", "prova_versoes", "professores", "descritores"]
      .every(function (t) { return codigo.indexOf("public." + t) < 0; }));

  AJUDA_TABELAS.forEach(function (t) {
    var minhas = todas.filter(function (r) { return r.tabela === t; });
    check(t + ": RLS ligado e uma unica regra, de insert na propria conta",
      codigo.indexOf("alter table public." + t + " enable row level security;") >= 0 &&
      minhas.length === 1 && minhas[0].comando === "insert" &&
      minhas[0].corpo === "to authenticated with check (dono = (select auth.uid()) and situacao = 'novo')", minhas);
  });
  check("nenhuma regra de select, update ou delete em tabela alguma do arquivo",
    todas.length === 3 && todas.every(function (r) { return r.comando === "insert"; }),
    todas.map(function (r) { return r.nome + " " + r.comando; }));
  check("nenhuma regra aberta com (true)",
    todas.every(function (r) { return !/\(\s*true\s*\)/i.test(r.corpo); }));
  check("o bloco que limpa as regras antigas so mexe nas tres tabelas da Ajuda",
    codigo.indexOf("tablename in ('ajuda_duvidas', 'ajuda_sugestoes', 'ajuda_erros')") >= 0);
  check("anon e professor perdem tudo e ganham so o insert",
    codigo.indexOf("revoke all on public.ajuda_duvidas, public.ajuda_sugestoes, public.ajuda_erros" +
      " from anon, authenticated, public;") >= 0 &&
    codigo.indexOf("grant insert on public.ajuda_duvidas, public.ajuda_sugestoes, public.ajuda_erros" +
      " to authenticated;") >= 0);
  check("nada de service_role: a leitura pelo painel continua de pe", !/revoke[^;]*service_role/i.test(codigo));
  check("so insert, nunca select, update ou delete de privilegio",
    !/\bgrant (select|update|delete)\b/i.test(codigo));
  check("o arquivo nao apaga tabela, nao truncar e nao mexe em coluna alheia",
    !/\b(drop table|truncate|drop column)\b/i.test(codigo));
  check("o expurgo esta escrito, mas comentado: rodar o arquivo nao apaga nada",
    /delete from public\.ajuda_erros/i.test(AJUDA) && !/\bdelete from\b/i.test(codigo));

  check("assinatura: coluna nova sem check e indice parcial",
    codigo.indexOf("add column if not exists assinatura text") >= 0 &&
    /create index if not exists ajuda_erros_assinatura_idx on public\.ajuda_erros \(assinatura, criado_em desc\) where assinatura is not null/.test(codigo));
  check("nenhum e-mail nem dado real no arquivo", !/[\w.+-]+@[\w-]+\.[\w.]+/.test(AJUDA));

  var g = gatilhoDe(AJUDA);
  check("a consulta do gatilho existe e da para extrair do comentario", g !== "");
  check("o gatilho mede as tres tabelas e as tres regras",
    AJUDA_TABELAS.every(function (t) { return g.indexOf("public." + t) >= 0; }) &&
    /90 days/.test(g) && /encerradas > 300/.test(g) && /contas > 2/.test(g), g);
}

conferirAjuda();

console.log("\n== os dois arquivos dizem a mesma coisa ==");
function mapa(sql) {
  var m = {};
  regras(sql).filter(function (r) { return TABELAS.indexOf(r.tabela) >= 0; })
    .forEach(function (r) { m[r.nome] = r.comando + " " + r.corpo; });
  return m;
}
check("regras das 7 tabelas iguais no schema e na migracao",
  JSON.stringify(mapa(SCHEMA)) === JSON.stringify(mapa(MIGRACAO)));
check("gaba_ve igual no schema e na migracao", funcaoVe(SCHEMA) !== "" && funcaoVe(SCHEMA) === funcaoVe(MIGRACAO));

/* ------------------------------------------------------------------ no banco */

function acharPglite() {
  var lugares = [process.env.GABA_PGLITE, path.join(os.tmpdir(), "gaba-pg"), RAIZ].filter(Boolean);
  for (var i = 0; i < lugares.length; i += 1) {
    try {
      return require.resolve("@electric-sql/pglite", { paths: [lugares[i]] });
    } catch (err) { /* tenta o proximo */ }
  }
  return null;
}

var A = "aaaaaaaa-0000-4000-8000-000000000001";
var B = "bbbbbbbb-0000-4000-8000-000000000002";
var T_A = "11111111-0000-4000-8000-000000000001";
var P_A = "22222222-0000-4000-8000-000000000001";
var QR_A = "GABA3|" + P_A + "|ficticio|1|1|A";

/* o minimo do Supabase que as regras usam: os papeis, auth.users e auth.uid() lendo o
   sub do token como o PostgREST deixa na sessao */
var SUPABASE =
  "create role anon nologin; create role authenticated nologin; create schema auth;" +
  "create table auth.users (id uuid primary key, email text);" +
  "create function auth.uid() returns uuid language sql stable as $$" +
  " select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;" +
  "grant usage on schema auth to anon, authenticated;" +
  "insert into auth.users values ('" + A + "', 'prof.a@escola.br'), ('" + B + "', 'Prof.B@Escola.br');";

/* gen_random_uuid e do Postgres desde a 13; o PGlite nao traz a extensao pgcrypto */
var SCHEMA_PG = SCHEMA.replace(/create extension if not exists "pgcrypto";/, "");

function migracaoCom(email) {
  return MIGRACAO.replace("set gaba.email_principal = 'SEU-EMAIL-AQUI';", "set gaba.email_principal = '" + email + "';");
}

async function erro(promessa) {
  try { await promessa; return null; } catch (err) { return String(err && err.message || err); }
}

/* uid: conta logada; "" = papel authenticated sem token; null = chave publica (anon) */
async function como(db, uid, sql, params) {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid || ""]);
  await db.exec(uid === null ? "set role anon" : "set role authenticated");
  try {
    return await db.query(sql, params || []);
  } finally {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub', '', false)");
  }
}

async function contar(db, uid, tabela) {
  var r = await como(db, uid, "select count(*)::int as n from public." + tabela);
  return r.rows[0].n;
}

async function linhas(db, sql, params) {
  return (await db.query(sql, params || [])).rows;
}

async function colunasDono(db) {
  return linhas(db, "select table_name as t, is_nullable as nulo, column_default as def from information_schema.columns" +
    " where table_schema = 'public' and column_name = 'dono' order by 1");
}

async function bancoNovo(PGlite) {
  var db = await PGlite.create();
  await db.exec(SUPABASE);
  await db.exec(SCHEMA_PG);
  return db;
}

/* o banco de hoje: tabelas sem dono e a tranca v2 (logado le tudo) */
async function bancoDeHoje(PGlite) {
  var db = await bancoNovo(PGlite);
  /* o banco do professor nao tem saidas: ela so aparece quando o schema.sql novo for colado.
     Tira-la aqui e o que deixa a tranca antiga de pe, porque as regras dela dependem do gaba_ve
     que a linha abaixo derruba. */
  await db.exec("drop table public.saidas;");
  for (var i = 0; i < TABELAS.length; i += 1) {
    await db.exec("alter table public." + TABELAS[i] + " drop column dono cascade;" +
      "create policy \"" + TABELAS[i] + "_aberta\" on public." + TABELAS[i] +
      " for all to authenticated using (true) with check (true);");
  }
  await db.exec("drop function public.gaba_ve(uuid);" +
    "insert into public.turmas (id, nome, escola) values ('" + T_A + "', '9o A', 'EEFM FICTICIA');" +
    "insert into public.escolas (nome) values ('EEFM FICTICIA');" +
    "insert into public.alunos (turma_id, numero, nome) values ('" + T_A + "', 1, 'Aluno Ficticio Um'), ('" + T_A + "', 2, 'Aluno Ficticio Dois');" +
    "insert into public.provas (id, titulo, turma_id, quantidade_questoes, total_questoes) values ('" + P_A + "', 'Prova ficticia', '" + T_A + "', 10, 10);" +
    "insert into public.correcoes (prova_id, qr_payload, acertos) values ('" + P_A + "', '" + QR_A + "', 7);" +
    "insert into public.prova_versoes (prova_id, lote_id, codigo) values ('" + P_A + "', 'lote1', 'A');" +
    "insert into public.professores (nome, email) values ('Prof A', 'PROF.A@escola.br'), ('Prof B', 'prof.b@escola.br'), ('Sem conta', 'sumiu@escola.br');" +
    "insert into public.descritores (chave, matriz, codigo) values ('teste-d01', 'PAEBES', 'D01');");
  return db;
}

async function noBanco(PGlite) {
  console.log("\n== migracao no banco de hoje (PGlite) ==");
  var db = await bancoDeHoje(PGlite);

  var e1 = await erro(db.exec(MIGRACAO));
  check("com o e-mail de exemplo, para e diz o que trocar", e1 && e1.indexOf("Troque SEU-EMAIL-AQUI") >= 0, e1);
  var e2 = await erro(db.exec(migracaoCom("ninguem@escola.br")));
  check("com e-mail sem conta, para e diz qual e-mail", e2 && e2.indexOf("ninguem@escola.br") >= 0, e2);
  check("nas duas paradas nada mudou e o banco segue usavel",
    (await colunasDono(db)).length === 0 && (await contar(db, A, "turmas")) === 1);

  var res = await db.exec(migracaoCom("  Prof.A@ESCOLA.br "));
  var conf = res[res.length - 1].rows;
  var porTabela = {};
  conf.forEach(function (r) { porTabela[r.tabela] = r; });
  check("conferencia do fim: 7 tabelas sem linha sem dono, sem regra aberta, anon fora",
    TABELAS.every(function (t) {
      var r = porTabela[t];
      return r && Number(r.sem_dono) === 0 && Number(r.regras_abertas) === 0 && r.anon_le === false &&
        Number(r.regras) === (t === "professores" ? 3 : 4);
    }), conf);
  check("conferencia do fim conta as contas do projeto e nao acha visao",
    Number(porTabela["(contas em Authentication)"].linhas) === 2 &&
    conf.every(function (r) { return r.tabela.indexOf("visao:") !== 0; }));

  var donos = await linhas(db,
    "select 'turmas' t, dono::text from public.turmas union all select 'escolas', dono::text from public.escolas" +
    " union all select 'alunos', dono::text from public.alunos union all select 'provas', dono::text from public.provas" +
    " union all select 'correcoes', dono::text from public.correcoes union all select 'prova_versoes', dono::text from public.prova_versoes");
  check("tudo o que existia ficou com a conta do e-mail informado (maiuscula e espaco nao atrapalham)",
    donos.length === 7 && donos.every(function (r) { return r.dono === A; }), donos);
  var profs = await linhas(db, "select email, dono::text from public.professores order by lower(email)");
  check("professores: cada linha com a conta do mesmo e-mail; a sem conta fica com a principal",
    JSON.stringify(profs.map(function (r) { return r.dono; })) === JSON.stringify([A, B, A]), profs);

  var e3 = await erro(db.exec(migracaoCom("prof.a@escola.br")));
  var cols = await colunasDono(db);
  check("rodar de novo nao quebra nem muda nada", e3 === null && (await contar(db, A, "turmas")) === 1, e3);
  check("dono obrigatorio e preenchido por auth.uid() nas 7 tabelas da migracao",
    cols.length === 7 && cols.every(function (c) { return c.nulo === "NO" && /auth\.uid\(\)/.test(c.def); }), cols);

  await asContas(db);

  console.log("\n== schema.sql de novo por cima do banco migrado ==");
  var e4 = await erro(db.exec(SCHEMA_PG));
  check("roda sem erro", e4 === null, e4);
  var colsDepois = await colunasDono(db);
  check("e acrescenta saidas com dono obrigatorio e da conta logada",
    colsDepois.length === 8 && colsDepois.some(function (c) { return c.t === "saidas"; }) &&
    colsDepois.every(function (c) { return c.nulo === "NO" && /auth\.uid\(\)/.test(c.def); }), colsDepois);
  var turmaVelha = (await linhas(db, "select id from public.turmas where escola = 'EEFM FICTICIA'"))[0];
  var sdVelho = await como(db, A, "insert into public.saidas (turma_id, chave, numero, nome, situacao)" +
    " values ($1, 'n:2', 2, 'Aluno Ficticio Oito', 'SEM FREQUENCIA') returning dono::text", [turmaVelha.id]);
  check("num banco ja migrado, saidas grava com o dono e so ele le",
    sdVelho.rows[0] && sdVelho.rows[0].dono === A && (await contar(db, B, "saidas")) === 0 &&
    (await contar(db, A, "saidas")) === 1, sdVelho.rows);
  check("e nao reabre: B continua sem ver a turma de A, A continua vendo",
    (await contar(db, B, "turmas")) === 1 && (await contar(db, A, "turmas")) === 1 &&
    (await linhas(db, "select count(*)::int n from pg_policies where schemaname = 'public' and (qual = 'true' or with_check = 'true')" +
      " and tablename <> 'descritores'"))[0].n === 0);
  await db.close();

  console.log("\n== banco novo so com schema.sql ==");
  var novo = await bancoNovo(PGlite);
  var e5 = await erro(novo.exec(SCHEMA_PG));
  var colsNovo = await colunasDono(novo);
  check("roda duas vezes e ja nasce com dono obrigatorio", e5 === null &&
    colsNovo.length === 8 && colsNovo.every(function (c) { return c.nulo === "NO"; }), e5 || colsNovo);
  var tb = await como(novo, B, "insert into public.turmas (nome) values ('8o B') returning dono::text");
  check("a turma criada por B e de B; A nao ve",
    tb.rows[0].dono === B && (await contar(novo, A, "turmas")) === 0 && (await contar(novo, B, "turmas")) === 1);
  var e6 = await erro(novo.exec(migracaoCom("prof.a@escola.br")));
  check("a migracao num banco novo tambem passa e nao mexe na turma de B",
    e6 === null && (await contar(novo, B, "turmas")) === 1 && (await contar(novo, A, "turmas")) === 0, e6);

  console.log("\n== saidas no banco novo ==");
  var turmaA = (await como(novo, A, "insert into public.turmas (nome) values ('9o A de A') returning id")).rows[0];
  var sd = await como(novo, A, "insert into public.saidas (turma_id, chave, numero, nome, situacao)" +
    " values ($1, 'n:2', 2, 'Aluno Ficticio Cinco', 'TRANSFERIDO') returning dono::text", [turmaA.id]);
  check("saidas: sem mandar dono, o banco poe A", sd.rows[0] && sd.rows[0].dono === A, sd.rows);
  check("saidas: B nao ve a saida guardada de A", (await contar(novo, B, "saidas")) === 0);
  var sdAlheia = await erro(como(novo, B,
    "insert into public.saidas (turma_id, chave, nome) values ($1, 'n:3', 'Aluno Ficticio Seis')", [turmaA.id]));
  check("saidas: B nao anota saida na turma de A", sdAlheia && /row-level security/.test(sdAlheia), sdAlheia);
  var sdUp = "insert into public.saidas (turma_id, chave, nome, situacao) values ($1, $2, $3, 'REMANEJADO')" +
    " on conflict (turma_id, chave) do update set situacao = excluded.situacao returning id";
  await como(novo, A, sdUp, [turmaA.id, "a:alunoficticiocinco", "Aluno Ficticio Cinco"]);
  await como(novo, A, sdUp, [turmaA.id, "a:alunoficticiocinco", "Aluno Ficticio Cinco"]);
  var chaves = await linhas(novo, "select chave, situacao from public.saidas where turma_id = $1 order by chave", [turmaA.id]);
  check("saidas: reimportar sem numero de chamada atualiza a mesma linha pelo nome",
    chaves.length === 2 && chaves[0].situacao === "REMANEJADO", chaves);
  var repetida = await erro(como(novo, A,
    "insert into public.saidas (turma_id, chave, nome) values ($1, 'n:2', 'Aluno Ficticio Sete')", [turmaA.id]));
  check("saidas: o mesmo numero de chamada na mesma turma nao vira segunda linha",
    repetida && /duplicate key/.test(repetida), repetida);
  await novo.close();
}

async function asContas(db) {
  console.log("\n== duas contas no mesmo banco ==");
  var deA = {};
  for (var i = 0; i < TABELAS.length; i += 1) deA[TABELAS[i]] = await contar(db, A, TABELAS[i]);
  check("A ve tudo o que ja era dela",
    deA.turmas === 1 && deA.escolas === 1 && deA.alunos === 2 && deA.provas === 1 &&
    deA.correcoes === 1 && deA.prova_versoes === 1 && deA.professores === 2, deA);
  var deB = {};
  for (var j = 0; j < TABELAS.length; j += 1) deB[TABELAS[j]] = await contar(db, B, TABELAS[j]);
  check("B nao ve nada de A (so a propria linha de professor)",
    TABELAS.every(function (t) { return deB[t] === (t === "professores" ? 1 : 0); }), deB);

  var alterou = await como(db, B, "update public.turmas set nome = 'invadida' where id = $1 returning id", [T_A]);
  var apagou = await como(db, B, "delete from public.alunos where turma_id = $1 returning id", [T_A]);
  var apagouProva = await como(db, B, "delete from public.provas where id = $1 returning id", [P_A]);
  var apagouLeitura = await como(db, B, "delete from public.correcoes where prova_id = $1 returning id", [P_A]);
  var nomeTurma = (await linhas(db, "select nome from public.turmas where id = $1", [T_A]))[0].nome;
  check("B nao altera nem apaga turma, aluno, prova ou leitura de A",
    alterou.rows.length === 0 && apagou.rows.length === 0 && apagouProva.rows.length === 0 &&
    apagouLeitura.rows.length === 0 && nomeTurma === "9o A" &&
    (await linhas(db, "select count(*)::int n from public.alunos"))[0].n === 2);

  var forja = await erro(como(db, B, "insert into public.turmas (nome, dono) values ('forjada', $1)", [A]));
  check("B nao cria linha em nome de A", forja && /row-level security/.test(forja), forja);
  var alunoAlheio = await erro(como(db, B, "insert into public.alunos (turma_id, numero, nome) values ($1, 3, 'Aluno Ficticio Tres')", [T_A]));
  check("B nao poe aluno na turma de A (nem ocupa o numero de chamada)", alunoAlheio && /row-level security/.test(alunoAlheio), alunoAlheio);
  var leituraAlheia = await erro(como(db, B,
    "insert into public.correcoes (prova_id, qr_payload, acertos) values ($1, $2, 0)" +
    " on conflict (prova_id, qr_payload) do update set acertos = excluded.acertos", [P_A, QR_A]));
  var leituraNova = await erro(como(db, B,
    "insert into public.correcoes (prova_id, qr_payload) values ($1, 'GABA3|qr-ainda-nao-lido')", [P_A]));
  check("B nao grava leitura na prova de A, nem por cima nem em folha ainda nao lida",
    /row-level security/.test(leituraAlheia || "") && /row-level security/.test(leituraNova || "") &&
    (await linhas(db, "select acertos from public.correcoes where prova_id = $1", [P_A]))[0].acertos === 7,
    [leituraAlheia, leituraNova]);
  var versaoAlheia = await erro(como(db, B, "insert into public.prova_versoes (prova_id, lote_id, codigo) values ($1, 'x', 'B')", [P_A]));
  check("B nao grava versao impressa na prova de A", versaoAlheia && /row-level security/.test(versaoAlheia), versaoAlheia);

  console.log("\n== o que o app faz, como B ==");
  var turmaB = (await como(db, B, "insert into public.turmas (nome) values ('8o B') returning id, dono::text")).rows[0];
  var provaB = (await como(db, B, "insert into public.provas (titulo, turma_id, quantidade_questoes, total_questoes) values ('Prova de B', $1, 10, 10) returning id", [turmaB.id])).rows[0];
  check("criar turma e prova sem mandar dono: o banco poe B", turmaB.dono === B && Boolean(provaB.id));
  var upAluno = "insert into public.alunos (turma_id, numero, nome) values ($1, 1, $2)" +
    " on conflict (turma_id, numero) do update set nome = excluded.nome returning nome";
  await como(db, B, upAluno, [turmaB.id, "Aluno Ficticio Quatro"]);
  var reimport = await como(db, B, upAluno, [turmaB.id, "Aluno Ficticio Quatro Corrigido"]);
  check("reimportar a lista corrige o nome em vez de duplicar (on_conflict turma_id,numero)",
    reimport.rows[0].nome === "Aluno Ficticio Quatro Corrigido" &&
    (await contar(db, B, "alunos")) === 1, reimport.rows);
  var upLeitura = "insert into public.correcoes (prova_id, qr_payload, acertos) values ($1, 'GABA3|b|1', $2)" +
    " on conflict (prova_id, qr_payload) do update set acertos = excluded.acertos returning acertos";
  await como(db, B, upLeitura, [provaB.id, 5]);
  var releitura = await como(db, B, upLeitura, [provaB.id, 6]);
  check("ler a mesma folha de novo atualiza a leitura (on_conflict prova_id,qr_payload)",
    releitura.rows[0].acertos === 6 && (await contar(db, B, "correcoes")) === 1);
  await como(db, B, "insert into public.prova_versoes (prova_id, lote_id, codigo) values ($1, 'l1', 'A'), ($1, 'l1', 'B')", [provaB.id]);
  var limpou = await como(db, B, "delete from public.prova_versoes where prova_id = $1 returning id", [provaB.id]);
  check("reimprimir apaga e regrava as versoes da propria prova", limpou.rows.length === 2);
  var upProf = "insert into public.professores (nome, email) values ($1, $2)" +
    " on conflict (email) do update set nome = excluded.nome returning nome";
  var profB = await como(db, B, upProf, ["Prof B Novo", "prof.b@escola.br"]);
  var profA = await como(db, A, upProf, ["Prof A Novo", "PROF.A@escola.br"]);
  check("entrar no app atualiza a propria linha de professor (on_conflict email)",
    profB.rows[0].nome === "Prof B Novo" && profA.rows[0].nome === "Prof A Novo");
  var doar = await erro(como(db, B, "update public.turmas set dono = $1 where id = $2", [A, turmaB.id]));
  check("B nao passa a propria turma para A", doar && /row-level security/.test(doar), doar);
  check("e A segue sem ver nada de B",
    (await contar(db, A, "turmas")) === 1 && (await contar(db, A, "provas")) === 1 && (await contar(db, A, "alunos")) === 2);

  console.log("\n== sem login ==");
  check("papel authenticated sem token nao ve nada", (await contar(db, "", "turmas")) === 0);
  var semToken = await erro(como(db, "", "insert into public.turmas (nome) values ('sem dono')"));
  check("e nao grava (dono ficaria vazio)", Boolean(semToken), semToken);
  var anonTurma = await erro(como(db, null, "select * from public.turmas"));
  check("chave publica (anon) nao le turma", anonTurma && /permission denied/.test(anonTurma), anonTurma);
  check("chave publica (anon) ainda le o catalogo de descritores", (await contar(db, null, "descritores")) === 1);
}

/* ------------------------------------------------------------- ajuda no banco */

var AJUDA_PG = AJUDA.replace(/create extension if not exists "pgcrypto";/, "");
var C = "cccccccc-0000-4000-8000-000000000003";
var ID_A = "33333333-0000-4000-8000-000000000001";
var ID_B = "33333333-0000-4000-8000-000000000002";

/* o insert exato que o app faz: id criado no aparelho, sem dono, sem situacao e sem
   pedir a linha de volta (Prefer: return=minimal) */
var RELATO_ERRO = "insert into public.ajuda_erros (id, tela, texto_usuario, mensagem_tecnica," +
  " navegador, versao, origem, assinatura) values ($1, 'scanner', $2, $3," +
  " 'Chrome/140 Windows', 'gaba-omr-v21', 'captura', $4)";
var MINIMO = {
  ajuda_duvidas: "insert into public.ajuda_duvidas (tela, texto) values ('turmas', 'como importa a chamada?')",
  ajuda_sugestoes: "insert into public.ajuda_sugestoes (tela, texto, importancia)" +
    " values ('config', 'ideia de melhoria', 'Ajudaria muito')",
  ajuda_erros: "insert into public.ajuda_erros (tela, texto_usuario, origem) values ('scanner', 'a folha nao cola', 'manual')"
};

async function abertasNoPublico(db) {
  return (await linhas(db, "select count(*)::int n from pg_policies where schemaname = 'public'" +
    " and (qual = 'true' or with_check = 'true') and tablename <> 'descritores'"))[0].n;
}

async function n(db, tabela) {
  return (await linhas(db, "select count(*)::int n from public." + tabela))[0].n;
}

async function ajudaNoBanco(PGlite) {
  console.log("\n== as tres tabelas da Ajuda, com duas contas no banco ==");
  var db = await bancoNovo(PGlite);
  var abertasAntes = await abertasNoPublico(db);

  var e = await erro(db.exec(AJUDA_PG));
  check("ajuda.sql roda por cima do schema.sql sem erro", e === null, e);

  /* roda de novo: a conferencia que o proprio arquivo imprime no SQL Editor */
  var res = await db.exec(AJUDA_PG);
  var conf = null;
  res.forEach(function (r) {
    if (r.rows && r.rows.length && Object.prototype.hasOwnProperty.call(r.rows[0], "tabela")) conf = r.rows;
  });
  check("rodar de novo nao quebra e o arquivo se auto-confere", conf !== null, e);
  check("a conferencia do arquivo: 1 regra, nenhuma aberta, professor so grava",
    conf && conf.length === 3 && conf.every(function (r) {
      return Number(r.regras) === 1 && Number(r.regras_abertas) === 0 &&
        r.anon_le === false && r.anon_grava === false && r.professor_le === false &&
        r.professor_grava === true && r.professor_altera === false && r.professor_apaga === false;
    }), conf);
  var pol = await linhas(db, "select count(*)::int n," +
    " count(*) filter (where cmd = 'INSERT')::int as de_insert from pg_policies" +
    " where schemaname = 'public' and tablename like 'ajuda_%'");
  check("rodar de novo nao duplica regra: continuam tres, todas de insert",
    pol[0].n === 3 && pol[0].de_insert === 3, pol[0]);

  var eA = await erro(como(db, A, RELATO_ERRO, [ID_A, "A folha nao cola", "QR invalido em 10 questoes", "fnv1-12345678"]));
  var eB = await erro(como(db, B, RELATO_ERRO, [ID_B, "O QR nao decodifica", "Falha em 45 questoes", "fnv1-87654321"]));
  check("A e B relatam um problema sem mandar dono nem situacao", eA === null && eB === null, [eA, eB]);
  var erros = await linhas(db, "select dono::text as d, situacao, assinatura from public.ajuda_erros order by dono");
  check("cada relato fica com quem enviou e o app pode preencher a assinatura",
    erros.length === 2 && erros[0].d === A && erros[1].d === B &&
    erros.every(function (r) { return r.situacao === "novo"; }) && erros[1].assinatura === "fnv1-87654321", erros);

  var duvidasOk = await erro(como(db, A, MINIMO.ajuda_duvidas));
  var sugOk = await erro(como(db, B, MINIMO.ajuda_sugestoes));
  check("duvida e sugestao entram pelas outras duas tabelas tambem",
    duvidasOk === null && sugOk === null, [duvidasOk, sugOk]);

  var leu = {};
  for (var i = 0; i < AJUDA_TABELAS.length; i += 1) {
    leu["B_le_" + AJUDA_TABELAS[i]] = await erro(como(db, B, "select * from public." + AJUDA_TABELAS[i]));
    leu["A_le_" + AJUDA_TABELAS[i]] = await erro(como(db, A, "select count(*)::int n from public." + AJUDA_TABELAS[i]));
  }
  check("nem A nem B leem nada das tres tabelas, nem a propria linha",
    AJUDA_TABELAS.every(function (t) {
      return /permission denied/.test(leu["B_le_" + t] || "") && /permission denied/.test(leu["A_le_" + t] || "");
    }), leu);
  var alterou = await erro(como(db, B, "update public.ajuda_erros set situacao = 'resolvido' where dono = $1", [A]));
  var apagou = await erro(como(db, B, "delete from public.ajuda_erros"));
  var apagaProprio = await erro(como(db, A, "delete from public.ajuda_sugestoes where dono = $1", [A]));
  check("B nao altera nem apaga; A tambem nao apaga nem o proprio envio",
    /permission denied/.test(alterou || "") && /permission denied/.test(apagou || "") &&
    /permission denied/.test(apagaProprio || "") && (await n(db, "ajuda_erros")) === 2, [alterou, apagou, apagaProprio]);

  var forja = await erro(como(db, B, "insert into public.ajuda_duvidas (tela, texto, dono) values ('turmas', 'duvida', $1)", [A]));
  check("B nao grava duvida em nome de A", forja && /row-level security/.test(forja), forja);
  var fechada = await erro(como(db, A, "insert into public.ajuda_sugestoes (tela, texto, importancia, situacao)" +
    " values ('config', 'ideia', 'Me trava hoje', 'resolvido')"));
  check("o app nao fecha a triagem: so entra linha com situacao novo",
    fechada && /row-level security/.test(fechada), fechada);
  var voltando = await erro(como(db, A, MINIMO.ajuda_duvidas + " returning id"));
  check("insert pedindo a linha de volta e negado (por isso o app grava sem select)",
    voltando && /permission denied/.test(voltando), voltando);
  var repete = await erro(como(db, A, RELATO_ERRO, [ID_A, "A folha nao cola", "QR invalido em 10 questoes", "fnv1-12345678"]));
  check("reenviar a fila com o mesmo id do aparelho nao duplica (23505 tratado como ok)",
    repete && /duplicate key/.test(repete) && (await n(db, "ajuda_erros")) === 2, repete);

  var anon = {};
  var semLogin = {};
  for (var k = 0; k < AJUDA_TABELAS.length; k += 1) {
    var t = AJUDA_TABELAS[k];
    anon[t] = await erro(como(db, null, MINIMO[t]));
    anon["le_" + t] = await erro(como(db, null, "select * from public." + t));
    semLogin[t] = await erro(como(db, "", MINIMO[t]));
  }
  check("a chave publica (anon) nao le nem grava em nenhuma das tres",
    AJUDA_TABELAS.every(function (t) {
      return /permission denied/.test(anon[t] || "") && /permission denied/.test(anon["le_" + t] || "");
    }), anon);
  check("authenticated sem token tambem nao grava (o dono ficaria vazio)",
    AJUDA_TABELAS.every(function (t) { return Boolean(semLogin[t]); }) &&
    (await n(db, "ajuda_duvidas")) === 1 && (await n(db, "ajuda_sugestoes")) === 1, semLogin);

  var peloPainel = await linhas(db, "select dono::text as d, situacao from public.ajuda_erros order by 1");
  check("o painel (que passa por cima do RLS) le as duas linhas que nenhum professor ve",
    peloPainel.length === 2 && peloPainel.every(function (r) { return r.situacao === "novo"; }), peloPainel);

  check("ajuda.sql nao reabre nem fecha nada das tabelas de sempre",
    (await abertasNoPublico(db)) === abertasAntes &&
    (await linhas(db, "select has_table_privilege('authenticated', 'public.turmas', 'select') le," +
      " has_table_privilege('authenticated', 'public.turmas', 'delete') apaga," +
      " has_table_privilege('anon', 'public.descritores', 'select') catalogo"))[0].le === true);

  console.log("\n== o gatilho do expurgo, rodado de verdade ==");
  var g = gatilhoDe(AJUDA);
  var v0 = await linhas(db, g);
  check("com duas contas e nada encerrado, o veredito e ADIAR nas tres tabelas",
    v0.length === 3 && v0.every(function (r) { return /^ADIAR/.test(r.veredito); }), v0);

  await db.query("insert into auth.users values ($1, 'prof.c@escola.br')", [C]);
  var eC = await erro(como(db, C, MINIMO.ajuda_erros));
  check("uma terceira conta relata o mesmo bug", eC === null && (await n(db, "ajuda_erros")) === 3, eC);
  var v1 = await linhas(db, g);
  check("com outra conta relatando, o gatilho continua ADIAR enquanto nada foi encerrado ha 90 dias",
    v1.filter(function (r) { return r.tabela === "ajuda_erros"; })[0].contas === 3 &&
    /^ADIAR/.test(v1.filter(function (r) { return r.tabela === "ajuda_erros"; })[0].veredito), v1);

  /* a triagem e do painel: aqui ele encerra a linha de A com 91 dias, como se tivesse
     resolvido o bug daqueles aparelhos antigos */
  await db.query("update public.ajuda_erros set situacao = 'resolvido'," +
    " criado_em = now() - interval '91 days' where dono = $1", [A]);
  await db.query("update public.ajuda_sugestoes set situacao = 'descartado'," +
    " criado_em = now() - interval '91 days' where dono = $1", [B]);
  var v2 = await linhas(db, g);
  var de = v2.filter(function (r) { return r.tabela === "ajuda_erros"; })[0];
  var sg = v2.filter(function (r) { return r.tabela === "ajuda_sugestoes"; })[0];
  check("linha encerrada ha mais de 90 dias + outra conta relatando = FAZER",
    /^FAZER/.test(de.veredito) && Number(de.encerradas) === 1, de);
  check("linha encerrada antiga, mas so uma conta, continua ADIAR por volume",
    /^ADIAR: volume/.test(sg.veredito) && Number(sg.contas) === 1, sg);
  await db.close();
}

(async function principal() {
  var onde = acharPglite();
  if (!onde) {
    console.log("\n== no banco ==\n  PULADO  sem @electric-sql/pglite (veja o comeco deste arquivo)");
  } else {
    try {
      var PGlite = require(onde).PGlite;
      await noBanco(PGlite);
      await ajudaNoBanco(PGlite);
    } catch (err) {
      check("rodar no PGlite sem erro inesperado", false, String(err && err.stack || err));
    }
  }
  console.log("\n" + (falhas ? falhas + " FALHA(S)" : "tudo certo"));
  process.exit(falhas ? 1 : 0);
})();
