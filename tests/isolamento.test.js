/* Cada professor ve e altera so o que e dele. Confere o texto de supabase/schema.sql e de
   supabase/isolar-por-professor.sql e, quando acha o PGlite (Postgres em WASM, fora do
   repositorio de proposito), roda os dois num banco de verdade com duas contas:
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
var TABELAS = ["turmas", "escolas", "alunos", "provas", "correcoes", "prova_versoes", "professores"];
var PAIS = {
  alunos: "from public.turmas t where t.id = alunos.turma_id and t.dono = (select auth.uid())",
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

function conferirTexto(rotulo, sql) {
  console.log("\n== " + rotulo + " ==");
  var todas = regras(sql);
  TABELAS.forEach(function (t) {
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
  check("apaga toda regra antiga das 7 tabelas pelo pg_policies",
    /for r in\s+select schemaname, tablename, policyname\s+from pg_policies/i.test(sql) &&
    sql.indexOf("tablename in ('turmas', 'escolas', 'alunos', 'provas', 'correcoes', 'professores', 'prova_versoes')") >= 0);
  check("tira as 7 tabelas da chave publica",
    sql.indexOf("revoke all on public.turmas, public.escolas, public.alunos, public.provas, public.correcoes, public.professores, public.prova_versoes from anon, public;") >= 0);
  check("gaba_ve compara com a conta logada e fixa o search_path",
    /returns boolean language sql stable set search_path = '' as \$\$ select dono = auth\.uid\(\) \$\$;/i.test(funcaoVe(sql)), funcaoVe(sql));
}

conferirTexto("supabase/schema.sql", SCHEMA);
check("descritores continua aberto para leitura do anon",
  SCHEMA.indexOf('create policy "descritores_select_anon" on public.descritores for select to anon, authenticated using (true);') >= 0);

conferirTexto("supabase/isolar-por-professor.sql", MIGRACAO);
check("a migracao nao apaga dado nem tabela",
  !/\b(drop table|truncate|delete from|drop column)\b/i.test(MIGRACAO));
check("a migracao vai para o git com o e-mail de exemplo, numa linha so",
  (MIGRACAO.match(/set gaba\.email_principal = /g) || []).length === 1 &&
  MIGRACAO.indexOf("set gaba.email_principal = 'SEU-EMAIL-AQUI';") >= 0 &&
  !/[\w.+-]+@[\w-]+\.[\w.]+/.test(MIGRACAO));
check("a migracao confere o e-mail antes do begin e grava dentro de begin/commit",
  MIGRACAO.indexOf("Nenhuma conta do Supabase") < MIGRACAO.indexOf("\nbegin;") &&
  MIGRACAO.indexOf("\nbegin;") < MIGRACAO.indexOf("\ncommit;"));

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
  check("dono obrigatorio e preenchido por auth.uid() nas 7 tabelas",
    cols.length === 7 && cols.every(function (c) { return c.nulo === "NO" && /auth\.uid\(\)/.test(c.def); }), cols);

  await asContas(db);

  console.log("\n== schema.sql de novo por cima do banco migrado ==");
  var e4 = await erro(db.exec(SCHEMA_PG));
  check("roda sem erro", e4 === null, e4);
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
    colsNovo.length === 7 && colsNovo.every(function (c) { return c.nulo === "NO"; }), e5 || colsNovo);
  var tb = await como(novo, B, "insert into public.turmas (nome) values ('8o B') returning dono::text");
  check("a turma criada por B e de B; A nao ve",
    tb.rows[0].dono === B && (await contar(novo, A, "turmas")) === 0 && (await contar(novo, B, "turmas")) === 1);
  var e6 = await erro(novo.exec(migracaoCom("prof.a@escola.br")));
  check("a migracao num banco novo tambem passa e nao mexe na turma de B",
    e6 === null && (await contar(novo, B, "turmas")) === 1 && (await contar(novo, A, "turmas")) === 0, e6);
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

(async function principal() {
  var onde = acharPglite();
  if (!onde) {
    console.log("\n== no banco ==\n  PULADO  sem @electric-sql/pglite (veja o comeco deste arquivo)");
  } else {
    try {
      await noBanco(require(onde).PGlite);
    } catch (err) {
      check("rodar no PGlite sem erro inesperado", false, String(err && err.stack || err));
    }
  }
  console.log("\n" + (falhas ? falhas + " FALHA(S)" : "tudo certo"));
  process.exit(falhas ? 1 : 0);
})();
