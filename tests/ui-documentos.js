/* As duas portas novas do app no navegador de verdade: um PDF de 182 paginas e um .doc de Word 97
   viram a mesma prova e saem no papel em duas colunas. Precisa do servidor local:
     node tests/serve.js 8789   ->   node tests/ui-documentos.js 8789                      */
"use strict";

var hud = require("./hudChrome");

var porta = Number(process.argv[2] || 8789);
var BASE = "http://127.0.0.1:" + porta;
var GABARITO_ESPERADO = "ABECDEBBAB";
var falhas = 0;

function check(nome, cond, extra) {
  console.log((cond ? "ok   " : "FALHA ") + nome + (extra !== undefined && !cond ? " — " + JSON.stringify(extra) : ""));
  if (!cond) falhas++;
}

/* ---------- codigo que roda dentro da pagina do app ---------- */

async function importar(caminho, nome) {
  var buf = await (await fetch(caminho)).arrayBuffer();
  var antes = Date.now();
  await GabaCaderno.importarDocx(new File([buf], nome, { type: "application/octet-stream" }));
  var p = GabaCaderno.estado.provasLocais[0];
  var alts = (p.questoes || []).map(function (q) { return Object.keys(q.alternativas || {}).length; });
  return {
    ms: Date.now() - antes,
    id: p.id,
    titulo: p.titulo,
    disciplina: p.disciplina,
    questoes: alts.length,
    alts: alts,
    gab: (p.gabarito || []).join("").toUpperCase(),
    alunos: (p.alunos || []).length,
    tipos: (p.tipos || []).length,
    corpoCurto: (p.questoes || []).filter(function (q) {
      return ((q.enunciado || "") + (q.comando || "")).length < 40;
    }).length,
    comando1: String((p.questoes[0] || {}).comando || "").slice(-20),
    enunciado1: String((p.questoes[0] || {}).enunciado || "").slice(0, 40),
    status: document.getElementById("prova-status").textContent.replace(/\s+/g, " ").slice(0, 150),
    avisos: [].slice.call(document.querySelectorAll("#cad-avisos li")).map(function (li) {
      return li.textContent.replace(/\s+/g, " ").slice(0, 130);
    })
  };
}

/* o caderno do arquivo importado: duas colunas, folha de resposta na 1a e o bloco fechado em pares */
async function gerar(provaId, tipos) {
  var sel = document.getElementById("cad-prova");
  sel.value = String(provaId);
  document.getElementById("cad-modo").value = "turma";
  document.getElementById("cad-tipos").value = String(tipos || 4);
  document.getElementById("cad-modelo").value = "enem";
  document.getElementById("cad-colunas").value = "2";
  document.getElementById("cad-colunas").dispatchEvent(new Event("change"));
  document.getElementById("cad-escola").value = "EEFM DO DOCUMENTO";
  document.getElementById("cad-data").value = "21/10/2026";
  var ret = await GabaCaderno.gerarLote();

  var grupos = {}, ordem = [];
  [].slice.call(document.querySelectorAll("#print-root article")).forEach(function (a) {
    var k = a.getAttribute("data-aluno") + "|" + a.getAttribute("data-versao");
    if (!grupos[k]) { grupos[k] = []; ordem.push(k); }
    grupos[k].push(a.className.replace("folha-a4", "").trim());
  });
  // resposta, uma ou mais paginas de corpo, e exatamente uma folha em branco no fim
  function formatoOk(seq) {
    var i = 0, corpo = 0, brancos = 0;
    if (seq[i++] !== "folha-resposta") return false;
    while (seq[i] === "folha-questoes") { corpo++; i++; }
    while (seq[i] === "folha-branco") { brancos++; i++; }
    return corpo > 0 && brancos === 1 && i === seq.length;
  }
  var sequencias = ordem.map(function (k) { return grupos[k]; });
  var primeira = document.querySelector("#print-root article.folha-resposta");
  // o corpo agora sai em colunas fechadas na mao: cada area mede o que ocupou e nada passa dela
  var areas = [].slice.call(document.querySelectorAll(".folha-questoes .folha-area--colunas"));
  var colunas = areas.length ? areas[0].querySelectorAll(".folha-coluna").length : 0;
  var mm = function (px) { return px * 25.4 / 96; };
  var estouro = [], enchimento = [];
  areas.forEach(function (area, i) {
    var folha = area.closest(".folha-a4");
    /* a ultima pagina de corpo de CADA caderno termina com coluna meio vazia mesmo; as outras nao podem */
    var proxima = folha && folha.nextElementSibling;
    var ultimaDoCaderno = !proxima || !proxima.classList.contains("folha-questoes");
    var caixa = area.getBoundingClientRect();
    var altura = mm(area.clientHeight);
    [].slice.call(area.children).forEach(function (col, ci) {
      var usada = 0;
      [].slice.call(col.querySelectorAll(".folha-questao")).forEach(function (q) {
        var r = q.getBoundingClientRect();
        usada = Math.max(usada, r.bottom - caixa.top);
        if (r.bottom > caixa.bottom + 0.6 || r.top < caixa.top - 0.6) {
          estouro.push("pag " + (i + 1) + " col " + (ci + 1) + " questao " + q.getAttribute("data-num"));
        }
        if (col.scrollHeight > col.clientHeight + 1) {
          estouro.push("cortado por overflow na pag " + (i + 1) + " col " + (ci + 1));
        }
      });
      if (usada > 0 && !ultimaDoCaderno) enchimento.push(mm(usada) / altura);
    });
  });
  var pior = enchimento.length ? Math.min.apply(null, enchimento) : 0;
  /* viuva = continuacao que so traz uma alternativa: a linha pega o pe da coluna sozinha */
  var viuvas = 0;
  [].slice.call(document.querySelectorAll(".folha-questoes .folha-questao")).forEach(function (b) {
    if (!/folha-continua/.test(b.innerHTML)) return;
    if (b.querySelector(".folha-enunciado, .folha-comando")) return;
    if (b.querySelectorAll(".folha-alt li").length === 1) viuvas++;
  });
  // duas colunas de verdade: questoes na mesma faixa vertical mas em colunas diferentes
  var lado = false;
  if (areas.length) {
    var caixas = [].slice.call(areas[0].querySelectorAll(".folha-questao")).map(function (q) {
      var r = q.getBoundingClientRect();
      return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width) };
    });
    var fluxo = areas[0].getBoundingClientRect();
    var larguraColuna = fluxo.width / colunas;
    lado = caixas.length > 1 && caixas.some(function (a) {
      return a.x + a.w <= fluxo.left + larguraColuna + 4;
    }) && caixas.some(function (b) { return b.x >= fluxo.left + larguraColuna - 4; });
  }
  return {
    folhas: ret.folhas,
    cadernos: ret.batch.itens.length,
    numTipos: ret.batch.numTipos,
    porPagina: Number(document.getElementById("cad-por-pagina").value),
    formatos: sequencias.map(function (s) { return s.join(","); }).slice(0, 2),
    todosOk: sequencias.length > 0 && sequencias.every(formatoOk),
    cartao: primeira ? primeira.querySelectorAll(".folha-bubble").length : 0,
    questoesNoCorpo: document.querySelectorAll(".folha-questoes .folha-questao").length,
    questoesDistintas: Object.keys([].slice.call(document.querySelectorAll(".folha-questoes .folha-questao"))
      .reduce(function (set, q) { set[q.getAttribute("data-num")] = 1; return set; }, {})).length,
    colunas: colunas,
    ladoALado: lado,
    paginasDeCorpo: areas.length,
    semCorte: estouro.length === 0,
    cortes: estouro,
    viuvas: viuvas,
    enchimento: Number(pior.toFixed(3)),
    brancas: (document.querySelectorAll("#print-root .folha-branco") || []).length,
    status: document.getElementById("cad-status").textContent.replace(/\s+/g, " ").slice(0, 200)
  };
}

async function limpar() {
  var ids = (GabaCaderno.estado.provasLocais || []).map(function (p) { return String(p.id); });
  for (var i = 0; i < ids.length; i++) await GabaCaderno.esquecerProvaLocal(ids[i]);
  ["gaba_caderno_cfg", "gaba_lote_impresso", "gaba_ultimo_lote"].forEach(function (k) {
    localStorage.removeItem(GabaSync.chaveLocal(k));
  });
  document.getElementById("print-root").innerHTML = "";
  return ids.length;
}

/* ---------- harness ---------- */

(async function principal() {
  var chrome = await hud.abrirChrome(BASE + "/index.html");
  var c = hud.cliente(await hud.conectar("/index.html", chrome.porta));
  await c.espera("typeof GabaCaderno !== 'undefined' && typeof GabaPdf !== 'undefined' && " +
    "typeof GabaDoc !== 'undefined'", 60000);
  await c.naPagina(function () {
    window.__erros = [];
    window.addEventListener("error", function (e) { window.__erros.push(String((e && e.message) || e)); });
    window.addEventListener("unhandledrejection", function (ev) {
      window.__erros.push("rejeicao: " + String((ev && ev.reason && ev.reason.message) || ev && ev.reason));
    });
    return "vigiando";
  }, []);
  await c.naPagina(limpar, []);

  console.log("\n== o PDF de 182 paginas na aba Cadernos ==");
  var pdf = await c.naPagina(importar, ["/_prova.pdf", "PROVA_UI.pdf"]);
  console.log("  " + pdf.ms + " ms, status: " + pdf.status);
  check("o PDF importou as dez questoes do banco", pdf.questoes === 10, pdf);
  check("cada questao do PDF trouxe as cinco alternativas", pdf.alts.every(function (n) { return n === 5; }), pdf.alts);
  check("o gabarito oficial entrou na prova vinda do PDF", pdf.gab === GABARITO_ESPERADO, pdf.gab);
  check("a lista de alunos do caderno nominal veio do PDF", pdf.alunos === 45, pdf.alunos);
  check("nenhuma questao do PDF chegou sem texto", pdf.corpoCurto === 0, pdf.corpoCurto);
  check("o enunciado e o comando se separaram no PDF",
    /^“Imaginemos a alma/.test(pdf.enunciado1) && /consiste em:$/.test(pdf.comando1), pdf);
  check("materia e titulo sairam certos do PDF",
    pdf.disciplina === "Filosofia" && /^AVALIA[ÇC][ÃA]O DE FILOSOFIA/.test(pdf.titulo), pdf);

  console.log("\n== o .doc de Word 97 na mesma aba ==");
  var doc = await c.naPagina(importar, ["/_prova.doc", "PROVA_UI.doc"]);
  console.log("  " + doc.ms + " ms, status: " + doc.status);
  check("o .doc importou as dez questoes do banco", doc.questoes === 10, doc);
  check("cada questao do .doc trouxe as cinco alternativas", doc.alts.every(function (n) { return n === 5; }), doc.alts);
  check("o gabarito oficial entrou na prova vinda do .doc", doc.gab === GABARITO_ESPERADO, doc.gab);
  check("a lista de alunos do caderno nominal veio do .doc", doc.alunos === 45, doc.alunos);
  check("nenhuma questao do .doc chegou sem texto", doc.corpoCurto === 0, doc.corpoCurto);
  check("PDF e .doc entregam a mesma prova",
    pdf.gab === doc.gab && pdf.alts.join() === doc.alts.join() && pdf.disciplina === doc.disciplina,
    { pdf: pdf.gab, doc: doc.gab });

  console.log("\n== o caderno em duas colunas a partir do PDF ==");
  var lote = await c.naPagina(gerar, [pdf.id, pdf.tipos]);
  console.log("  status: " + lote.status);
  check("o lote saiu com os 45 cadernos nominais", lote.cadernos === 45, { cadernos: lote.cadernos });
  check("o corpo do PDF coube em duas colunas", lote.colunas === 2, lote.colunas);
  check("nenhuma alternativa ficou cortada fora da folha", lote.semCorte === true, lote.cortes);
  /* 70% e o chao real: uma coluna para antes do fim quando a questao seguinte nao tem como ser
     cortada sem deixar uma alternativa sozinha na pagina ao lado. */
  check("nenhuma coluna do meio do caderno vira buraco branco", lote.enchimento >= 0.65,
    { enchimento: lote.enchimento, paginasDeCorpo: lote.paginasDeCorpo });
  check("nenhuma alternativa sobe sozinha para o pe de uma coluna", lote.viuvas === 0, lote.viuvas);
  check("as alternativas ficaram lado a lado nas colunas", lote.ladoALado === true, lote);
  check("a primeira pagina de cada caderno e a folha de respostas", lote.cartao === 50 && /folha-resposta/.test(lote.formatos[0]), lote.formatos);
  check("as ultimas paginas de cada caderno ficaram em branco",
    /folha-branco$/.test(lote.formatos[0]) && lote.brancas > 0, lote.formatos);
  check("cada caderno termina com uma unica folha em branco de protecao", lote.todosOk === true, lote.formatos);
  check("o corpo comeca na segunda pagina com as dez questoes",
    lote.questoesDistintas === 10 && lote.questoesNoCorpo >= 10,
    { distintas: lote.questoesDistintas, blocos: lote.questoesNoCorpo });
  check("o status conta colunas e folhas em branco",
    /2 coluna/.test(lote.status) && /em branco/.test(lote.status), lote.status);

  var erros = await c.naPagina(function () { return window.__erros || []; }, []);
  check("nenhum erro de javascript ao importar PDF e .doc", erros.length === 0, erros);

  await c.chama("Page.enable", {});
  await c.naPagina(function () {
    var alvo = document.querySelector(".folha-questoes");
    if (alvo) alvo.scrollIntoView();
    return alvo ? "rolado" : "sem corpo";
  }, []);
  await hud.sleep(1200);
  var shot = await c.chama("Page.captureScreenshot", { format: "png" });
  var fs = require("fs");
  var destino = require("path").join(__dirname, "documento-2col.png");
  fs.writeFileSync(destino, Buffer.from(shot.data, "base64"));
  check("a foto do caderno em duas colunas tem conteudo", fs.statSync(destino).size > 20000, fs.statSync(destino).size);
  console.log("  foto: " + destino);

  await c.naPagina(limpar, []);
  c.fecha();
  await hud.fecharChrome(chrome);
  console.log(falhas ? "\n" + falhas + " FALHAS" : "\nimportacao de PDF e .doc no navegador: tudo certo");
  process.exit(falhas ? 1 : 0);
})().catch(function (err) {
  console.error("erro no harness: " + (err && err.stack ? err.stack : err));
  process.exit(2);
});
