/* O que realmente vai para o PostgREST: colunas, on_conflict e as recusas de id que
   ainda so existem neste aparelho (prova importada de .docx tem id "docx-...", e o banco
   so aceita uuid). Roda com credenciais falsas e window.fetch stubado: nenhum pedido
   sai desta maquina e nada toca o Supabase do professor.
   Precisa do servidor local: node tests/serve.js  ->  node tests/db-payload.js [porta] */
"use strict";

var hud = require("./hudChrome");
var path = require("path");

var porta = Number(process.argv[2] || 8788);
var BASE = "http://127.0.0.1:" + porta;
var UUID = "0b6a6d42-1c2e-4b7d-8f9a-0123456789ab";
var LOCAL = "docx-PROVAE2E123-45678";

/* ---------- codigo que roda dentro da pagina do app ---------- */

async function sondar(ids) {
  var CHAVES = ["gaba_supabase_url", "gaba_supabase_key", "gaba_supabase_anon_key"];
  var antes = {};
  CHAVES.forEach(function (k) { antes[k] = localStorage.getItem(k); });
  var fetchOriginal = window.fetch;
  var chamadas = [];
  var r = {};

  function zerar() { chamadas.length = 0; }
  function ultima() { return chamadas[chamadas.length - 1] || null; }
  function corpo() { var u = ultima(); return u && u.body ? JSON.parse(u.body) : null; }
  async function captura(fn) {
    zerar();
    var erro = null;
    var valor = null;
    try { valor = await fn(); } catch (err) { erro = String(err && err.message ? err.message : err); }
    return { erro: erro, valor: valor, chamadas: chamadas.slice() };
  }

  try {
    GabaDB.saveConfig("https://fake.local.supabase.co", "chave-falsa-para-teste");

    window.fetch = function (entrada, opcoes) {
      var url = typeof entrada === "string" ? entrada : (entrada && entrada.url) || "";
      chamadas.push({
        url: url,
        metodo: (opcoes && opcoes.method) || "GET",
        body: opcoes && opcoes.body ? String(opcoes.body) : null
      });
      return Promise.resolve(new Response(JSON.stringify({ id: ids.uuid }), {
        status: 201,
        headers: { "content-type": "application/json" }
      }));
    };

    var leitura = {
      prova_id: ids.uuid,
      aluno_id: "M:1041",
      turma_id: ids.local,
      aluno_nome: "ANA LUIZA",
      aluno_numero: 3,
      versao: 3,
      codigo: "32NR",
      qr_texto: "GABA1|" + ids.uuid + "|3|3|1|32NR",
      engine: "opencv",
      respostas_banco: ["A", "B", "C"],
      respostas: ["C", "A", "B"],
      confusao: [2],
      branco: 1,
      acertos: 2,
      total_questoes: 3,
      nota: 6.7
    };

    r.localInsert = await captura(function () {
      return GabaDB.insertCorrecao(Object.assign({}, leitura, { prova_id: ids.local }));
    });

    r.okInsert = await captura(function () { return GabaDB.insertCorrecao(leitura); });
    r.okPayload = corpo();
    r.okUrl = ultima() ? ultima().url : "";
    r.okMetodo = ultima() ? ultima().metodo : "";

    var itens = [
      { aluno: { id: ids.local, numero: 1, nome: "ALUNO UM", turma_id: ids.local },
        versao: { versao: 1, codigo: "AAAA", ordem: [2, 1], altMap: [[0, 1]], gabarito: ["A", "B"] } },
      { aluno: { id: ids.uuid, numero: 2, nome: "ALUNO DOIS" },
        versao: { versao: 2, codigo: "BBBB", ordem: [1, 2], altMap: [[1, 0]], gabarito: ["B", "A"] } }
    ];

    r.localVersoes = await captura(function () {
      return GabaDB.upsertProvaVersoes(ids.local, itens, { turma_id: ids.uuid, em: "2026-10-21T10:00:00.000Z", lote_id: "L1" });
    });

    r.okVersoes = await captura(function () {
      return GabaDB.upsertProvaVersoes(ids.uuid, itens, { turma_id: ids.uuid, em: "2026-10-21T10:00:00.000Z", lote_id: "L1" });
    });
    r.versoesMetodos = r.okVersoes.chamadas.map(function (c) { return c.metodo; });
    r.versoesUrls = r.okVersoes.chamadas.map(function (c) { return c.url; });
    r.versoesPayload = r.okVersoes.chamadas.filter(function (c) { return c.body; }).map(function (c) { return JSON.parse(c.body); })[0];

    r.localLista = await captura(function () { return GabaDB.listProvaVersoes(ids.local); });
    r.umaLista = await captura(function () { return GabaDB.listProvaVersoes(ids.uuid); });

    r.turmaNova = await captura(function () {
      return GabaDB.salvarTurma({ nome: "  9o ANO B  ", ano: " 2026 ", escola: "  EEFM   DA SERRA  " });
    });
    r.turmaPayload = corpo();
    r.turmaUrl = ultima() ? ultima().url : "";
    r.turmaUpdate = await captura(function () {
      return GabaDB.salvarTurma({ id: ids.uuid, nome: "SEM ESCOLA" });
    });
    r.turmaUpdatePayload = corpo();
    r.turmaUpdateMetodo = ultima() ? ultima().metodo : "";
    r.turmaLonga = await captura(function () {
      return GabaDB.salvarTurma({ nome: "X", escola: new Array(300).join("E") });
    });
    r.turmaLongaPayload = corpo();

    r.correcoes = await captura(function () { return GabaDB.fetchCorrecoes(); });
    r.correcoesUrl = ultima() ? ultima().url : "";

    r.lookupAlunoLocal = await captura(function () { return GabaDB.lookupAluno(ids.local, 12); });
    r.lookupAlunoUrls = r.lookupAlunoLocal.chamadas.map(function (c) { return c.url; });

    r.lookupProvaLocal = await captura(function () { return GabaDB.lookupProva(ids.local); });

    r.eUuidBoa = GabaDB.eUuid(ids.uuid);
    r.eUuidMau = GabaDB.eUuid(ids.local);
    r.eUuidVazia = GabaDB.eUuid(null);
  } finally {
    window.fetch = fetchOriginal;
    CHAVES.forEach(function (k) {
      if (antes[k] === null) localStorage.removeItem(k);
      else localStorage.setItem(k, antes[k]);
    });
    GabaDB.client = null;
  }

  r.depois = {
    url: localStorage.getItem("gaba_supabase_url"),
    key: localStorage.getItem("gaba_supabase_key"),
    anon: localStorage.getItem("gaba_supabase_anon_key"),
    cliente: GabaDB.client,
    fetchStubado: window.fetch.toString().indexOf("chamadas") >= 0,
    configurado: GabaDB.isConfigured()
  };
  return r;
}

async function lerStatusFila() {
  var pendentes = await GabaSync.listPending();
  return { total: pendentes.length, erros: pendentes.map(function (p) { return p.sync_error || null; }) };
}

/* ---------- assercoes ---------- */

var falhas = 0;

function check(nome, cond, detalhe) {
  console.log((cond ? "  ok   " : "  FALHA ") + nome + (detalhe !== undefined && !cond ? "  ->  " + detalhe : ""));
  if (!cond) falhas += 1;
}

function decodifica(url) {
  return decodeURIComponent(String(url || "").replace(/\+/g, " "));
}

(async function principal() {
  var probe = await fetch(BASE + "/index.html").catch(function () { return null; });
  if (!probe || !probe.ok) {
    console.error("o servidor local nao respondeu em " + BASE + " - rode: node tests/serve.js");
    process.exit(2);
  }

  var chrome = await hud.abrirChrome(BASE + "/index.html");
  var c;
  try {
    c = hud.cliente(await hud.conectar("/index.html", chrome.porta));
    await c.espera("typeof GabaDB !== 'undefined' && typeof GabaSync !== 'undefined'", 60000);

    var r = await c.naPagina(sondar, [{ uuid: UUID, local: LOCAL }]);
    var cols = Object.keys(r.okPayload || {});

    console.log("\n== prova que so existe neste aparelho ==");
    check("insertCorrecao recusa id de .docx sem chamar o banco",
      r.localInsert.chamadas.length === 0 && /ainda nao esta salva no banco/.test(r.localInsert.erro || ""),
      JSON.stringify(r.localInsert));
    check("upsertProvaVersoes recusa id de .docx sem chamar o banco",
      r.localVersoes.chamadas.length === 0 && /ainda nao esta salva no banco/.test(r.localVersoes.erro || ""),
      JSON.stringify(r.localVersoes));
    check("listProvaVersoes devolve vazio sem chamar o banco",
      r.localLista.chamadas.length === 0 && Array.isArray(r.localLista.valor) && r.localLista.valor.length === 0,
      JSON.stringify(r.localLista));
    check("lookupProva devolve nulo sem chamar o banco",
      r.lookupProvaLocal.chamadas.length === 0 && r.lookupProvaLocal.valor === null,
      JSON.stringify(r.lookupProvaLocal));
    check("lookupAluno nao consulta id que nao e uuid",
      !r.lookupAlunoUrls.some(function (u) { return /id=eq\.docx/.test(u); }) && r.lookupAlunoUrls.length > 0,
      JSON.stringify(r.lookupAlunoUrls));

    console.log("\n== payload da correcao ==");
    check("upsert usa on_conflict=prova_id,qr_payload",
      /on_conflict=prova_id%2Cqr_payload|on_conflict=prova_id,qr_payload/.test(decodifica(r.okUrl)) && r.okMetodo === "POST",
      r.okUrl + " " + r.okMetodo);
    check("envia as 16 colunas da migracao", cols.length === 16, cols.length + ": " + cols.join(","));
    check("respostas vao na ordem do banco e as marcadas ficam separadas",
      (r.okPayload.respostas || []).join("") === "ABC" && (r.okPayload.respostas_originais || []).join("") === "CAB",
      JSON.stringify([r.okPayload && r.okPayload.respostas, r.okPayload && r.okPayload.respostas_originais]));
    check("aluno_id e turma_id que nao sao uuid viram null",
      r.okPayload.aluno_id === null && r.okPayload.turma_id === null,
      JSON.stringify([r.okPayload && r.okPayload.aluno_id, r.okPayload && r.okPayload.turma_id]));
    check("qr_payload vai para o banco (chave do upsert)",
      /^GABA1\|/.test(r.okPayload && r.okPayload.qr_payload || ""), r.okPayload && r.okPayload.qr_payload);
    check("nenhuma chave local do app vazou para o banco",
      !cols.some(function (k) { return /^(id|created_at_local|payload|nome|numero|fonte|arquivo)$/.test(k); }),
      cols.join(","));

    console.log("\n== versoes do lote impresso ==");
    check("primeiro apaga as versoes antigas da prova, depois insere",
      r.versoesMetodos.join(",") === "DELETE,POST", JSON.stringify(r.versoesMetodos));
    check("insere as 12 colunas de prova_versoes",
      r.versoesPayload && Object.keys(r.versoesPayload[0]).length === 12,
      r.versoesPayload && JSON.stringify(Object.keys(r.versoesPayload[0])));
    check("ordem, alt_map e gabarito vao juntos no insert",
      r.versoesPayload && JSON.stringify(r.versoesPayload[0].ordem) === "[2,1]" &&
      r.versoesPayload[0].codigo === "AAAA" && r.versoesPayload[0].tipo === 1,
      r.versoesPayload && JSON.stringify(r.versoesPayload[0]));
    check("aluno de lista local nao envia aluno_id nem turma_id invalidos",
      r.versoesPayload && r.versoesPayload[0].aluno_id === null && r.versoesPayload[0].turma_id === null,
      r.versoesPayload && JSON.stringify([r.versoesPayload[0].aluno_id, r.versoesPayload[0].turma_id]));
    check("aluno que tem id no banco conserva o aluno_id",
      r.versoesPayload && r.versoesPayload[1].aluno_id === UUID && r.versoesPayload[1].turma_id === UUID,
      r.versoesPayload && JSON.stringify([r.versoesPayload[1].aluno_id, r.versoesPayload[1].turma_id]));

    console.log("\n== escola da turma ==");
    check("turma envia nome, ano e escola nas 3 colunas",
      r.turmaPayload && JSON.stringify(Object.keys(r.turmaPayload)) === '["nome","ano","escola"]' &&
      /\/turmas(\?|$)/.test(decodifica(r.turmaUrl)) && r.turmaUpdate.chamadas.length === 1,
      JSON.stringify([r.turmaPayload, r.turmaUrl]));
    check("nome e ano vao aparados e a escola intacta (quem junta os espacos e o GabaEscolas)",
      r.turmaPayload && r.turmaPayload.nome === "9o ANO B" && r.turmaPayload.ano === "2026" &&
      r.turmaPayload.escola === "EEFM   DA SERRA",
      JSON.stringify(r.turmaPayload));
    check("update de turma manda escola null quando o form nao traz a escola",
      r.turmaUpdateMetodo === "PATCH" && r.turmaUpdatePayload && r.turmaUpdatePayload.escola === null,
      JSON.stringify([r.turmaUpdateMetodo, r.turmaUpdatePayload]));
    check("escola longa e cortada em 120 caracteres antes de ir ao banco",
      r.turmaLongaPayload && r.turmaLongaPayload.escola.length === 120,
      r.turmaLongaPayload && String(r.turmaLongaPayload.escola.length));

    console.log("\n== leitura do banco ==");
    check("fetchCorrecoes nao pede embed (nao ha foreign key em correcoes)",
      !/alunos\(|turmas\(|provas\(/.test(decodifica(r.correcoesUrl)), r.correcoesUrl);
    check("listProvaVersoes consulta so quando o id e uuid",
      r.umaLista.chamadas.length === 1 && /prova_id=eq\./.test(decodifica(r.umaLista.chamadas[0].url)),
      JSON.stringify(r.umaLista.chamadas));

    console.log("\n== nada ficou para tras ==");
    check("eUuid aceita uuid e rejeita o resto", r.eUuidBoa === true && r.eUuidMau === false && r.eUuidVazia === false,
      JSON.stringify([r.eUuidBoa, r.eUuidMau, r.eUuidVazia]));
    check("credenciais e fetch volvem exatamente ao que eram",
      r.depois.url === null && r.depois.key === null && r.depois.anon === null &&
      r.depois.cliente === null && r.depois.fetchStubado === false && r.depois.configurado === false,
      JSON.stringify(r.depois));

    var fila = await c.naPagina(lerStatusFila, []);
    check("fila local continua intocada (nada foi apagado do aparelho)",
      Array.isArray(fila.erros), JSON.stringify(fila));
  } catch (err) {
    check("a pagina nao lancou erro", false, String(err && err.stack ? err.stack : err));
  } finally {
    hud.fecharChrome(chrome);
  }

  console.log(falhas ? "\n" + falhas + " check(s) falharam." : "\ntodos os checks passaram.");
  process.exit(falhas ? 1 : 0);
})();
