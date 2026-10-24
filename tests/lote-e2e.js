/* Lote nominal impresso -> PNG de verdade -> motor OMR -> GabaScanner: aluno certo, versao certa,
   nota pela chave do aluno, duvida, rejeicao de folha de outra impressao e fila do aparelho.
   Precisa do servidor local: node tests/serve.js  ->  node tests/lote-e2e.js [porta] */
"use strict";

var hud = require("./hudChrome");
var path = require("path");

var RAIZ = path.resolve(__dirname, "..");
var porta = Number(process.argv[2] || 8777);
var BASE = "http://127.0.0.1:" + porta;

/* ---------- codigo que roda dentro da pagina do app ---------- */

async function montarLote(sampleUrl) {
  var buf = await (await fetch(sampleUrl)).arrayBuffer();
  var file = new File([buf], "PROVA_E2E.docx", {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  });
  await GabaCaderno.importarDocx(file);
  var prova = GabaCaderno.estado.provasLocais[0];
  var sel = document.getElementById("cad-prova");
  if (sel) sel.value = String(prova.id);
  document.getElementById("cad-modo").value = "turma";
  document.getElementById("cad-tipos").value = String((prova.tipos || []).length || 4);
  document.getElementById("cad-alt").checked = true;
  document.getElementById("cad-salt").value = "";
  document.getElementById("cad-escola").value = "ESCOLA E2E";
  document.getElementById("cad-data").value = "21/10/2026";
  var r = await GabaCaderno.gerarLote();
  var rec = JSON.parse(localStorage.getItem(GabaSync.chaveLocal("gaba_lote_impresso")));
  return {
    pid: rec.prova_id, modo: rec.modo, numTipos: rec.numTipos, salt: rec.salt, turma: rec.turma_id,
    alt: rec.embaralharAlternativas, questoes: rec.totalQuestoes, alternativas: rec.alternativas,
    alunos: rec.itens.length, folhas: r.folhas,
    gabaritoBase: (prova.questoes || []).map(function (q) { return String(q.gabarito || "").toUpperCase(); }).join(""),
    itens: rec.itens.map(function (it) {
      return { numero: it.aluno.numero, nome: it.aluno.nome, tipo: it.versao.versao, codigo: it.versao.codigo, gab: it.versao.gabarito.join("") };
    })
  };
}

async function lerFolha(cfg) {
  var E = GabaScanner.estado;
  var lote = GabaCaderno.loteImpresso(cfg.pid);
  if (!lote) throw new Error("o lote impresso nao esta no aparelho");
  await GabaScanner.preencherListas(GabaCaderno.estado.provasLocais);
  var prova = GabaCaderno.estado.provasLocais.filter(function (p) { return String(p.id) === cfg.pid; })[0];
  var versao = cfg.salt
    ? GabaVersoes.batch(prova, prova.alunos, {
        modo: lote.modo, numTipos: lote.numTipos, prova_id: cfg.pid, salt: cfg.salt,
        turma_id: lote.turma_id || null, embaralharAlternativas: !!lote.embaralharAlternativas
      }).itens[cfg.indice].versao
    : lote.itens[cfg.indice].versao;
  var gab = versao.gabarito;
  var layout = GabaLayout.compute(gab.length, lote.alternativas || 5);
  var idx = function (l) { return layout.optionLetters.indexOf(l); };

  var img = new Image();
  img.src = cfg.png + "?t=" + Date.now();
  await img.decode();

  function quadro(marcas) {
    var cv = document.createElement("canvas");
    cv.width = img.naturalWidth;
    cv.height = img.naturalHeight;
    var ctx = cv.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.drawImage(img, 0, 0);
    var pxmm = cv.width / layout.pageWmm;
    marcas.forEach(function (m) {
      var c = layout.bubbleCenterMm(m.q, m.o);
      ctx.beginPath();
      ctx.arc(c.x * pxmm, c.y * pxmm, layout.grid.bubbleMm * 0.42 * pxmm, 0, Math.PI * 2);
      ctx.fillStyle = "#111";
      ctx.fill();
    });
    return ctx.getImageData(0, 0, cv.width, cv.height);
  }

  window.__w = window.__w || (function () {
    var w = new Worker("/js/omrWorker.js");
    w.__espera = new Promise(function (res, rej) {
      var t = setTimeout(function () { rej(new Error("motor nao ficou pronto")); }, 90000);
      w.onmessage = function (e) {
        if (e.data && e.data.type === "ready") { clearTimeout(t); res(); }
        else if (e.data && e.data.type === "result") { w.__ultimo(e.data); }
        else if (e.data && e.data.type === "engine-error") { w.__falha(new Error(e.data.error)); }
      };
    });
    w.__seq = 0;
    w.__pendente = null;
    w.__ultimo = function () {};
    w.__falha = function () {};
    return w;
  })();
  var worker = window.__w;
  await worker.__espera;

  function ler(data) {
    var id = ++worker.__seq;
    return new Promise(function (res, rej) {
      var t = setTimeout(function () { rej(new Error("timeout leitura " + id)); }, 90000);
      worker.__ultimo = function (m) { clearTimeout(t); res(m); };
      worker.__falha = function (e) { clearTimeout(t); rej(e); };
      var copia = new ImageData(new Uint8ClampedArray(data.data), data.width, data.height);
      worker.postMessage({
        type: "process", buffer: copia.data.buffer, width: copia.width, height: copia.height, requestId: id,
        options: { sensibilidade: E.sensibilidade, totalQuestoes: gab.length, alternativas: lote.alternativas || 5 }
      }, [copia.data.buffer]);
    });
  }

  function status() { return document.getElementById("scan-status").textContent; }
  function zerarSessao() {
    E.lidos = {}; E.lidaHaPouco = 0; E.repetidas = 0; E.ultimaChave = null;
  }

  var marcas = gab.map(function (l, i) { return { q: i, o: idx(l) }; });
  var esperado = { acertos: gab.length, branco: 0 };
  if (cfg.tipo === "erradas") {
    marcas = [];
    gab.forEach(function (l, i) {
      if (i === 8) return;
      marcas.push({ q: i, o: (i === 0 || i === 3 || i === 6) ? (idx(l) + 2) % layout.options : idx(l) });
    });
    esperado = { acertos: gab.length - 4, branco: 1 };
  } else if (cfg.tipo === "duas") {
    marcas = marcas.concat([{ q: 1, o: (idx(gab[1]) + 1) % layout.options }]);
    esperado = { acertos: gab.length - 1, branco: 0 };
  }

  var r = await ler(quadro(marcas));
  if (cfg.prefixo) {
    r.qr_texto = r.qr_texto.replace(/^GABA\d+/, cfg.prefixo);
    r.qr = GabaQR.decode(r.qr_texto);
  }
  var filaAntes = (await GabaSync.listResults()).length;
  var antes = E.resultados.length;
  var deltas = [];
  var passos = [];

  zerarSessao();
  GabaScanner.tratar(r);
  deltas.push(E.resultados.length - antes);
  passos.push("1 leitura: " + deltas[0] + " registro (" + status() + ")");
  GabaScanner.tratar(r);
  var registrados = E.resultados.length - antes;
  deltas.push(registrados);
  passos.push("2 leituras identicas: " + registrados + " registro");

  if (cfg.tipo === "dedupe") {
    GabaScanner.tratar(r); GabaScanner.tratar(r);
    deltas.push(E.resultados.length - antes);
    passos.push("mesma folha dentro da pausa: " + deltas[2] + " registro");
    await new Promise(function (res) { setTimeout(res, 2000); });
    GabaScanner.tratar(r); GabaScanner.tratar(r);
    deltas.push(E.resultados.length - antes);
    passos.push("mesma folha depois da pausa: " + deltas[3] + " registro (" + status() + ")");
    zerarSessao();
    document.getElementById("scan-limpar").click();
    GabaScanner.tratar(r); GabaScanner.tratar(r);
    deltas.push(E.resultados.length - antes);
    passos.push("botao zerar lidos: " + deltas[4] + " registro");
  }

  var reg = E.resultados[E.resultados.length - 1] || null;
  var fila = (await GabaSync.listResults()).length - filaAntes;
  return {
    leitura: { payload: r.qr_texto, lidas: r.totalLidas, duvidas: r.confusao, corte: r.corte, gabOk: r.answers.every(function (l, i) { return l === gab[i]; }) },
    indice: { fonte: E.fonte, alunos: E.alunos.length, versoes: Object.keys(E.versoes).length, porAluno: Object.keys(E.porAluno).length },
    registros: registrados,
    deltas: deltas,
    passos: passos,
    fila: fila,
    registro: reg && {
      nome: reg.aluno_nome, numero: reg.aluno_numero, versao: reg.versao, codigo: reg.codigo,
      acertos: reg.acertos, branco: reg.branco, total: reg.total_questoes, nota: reg.nota,
      confusao: reg.confusao, respostas: reg.respostas, banco: reg.respostas_banco, qr: reg.qr_texto
    },
    esperado: esperado,
    status: status()
  };
}

async function limparMotor() {
  if (window.__w) { window.__w.terminate(); window.__w = null; }
  return true;
}

/* ---------- assertes do lado do node ---------- */

var FALHAS = 0;
function check(titulo, ok, detalhe) {
  console.log((ok ? "  ok    " : "  FALHA ") + titulo + (detalhe && !ok ? "  [" + detalhe + "]" : ""));
  if (!ok) FALHAS += 1;
}

function urlFolha(rec, indice, cod, salt) {
  var q = "?pid=" + encodeURIComponent(rec.pid) + "&modo=" + rec.modo + "&tipos=" + rec.numTipos +
    "&alt=" + (rec.alt ? "1" : "0") + "&n=" + indice + "&cod=" + cod;
  if (salt) q += "&salt=" + encodeURIComponent(salt);
  return BASE + "/tests/scan.html" + q;
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
    await c.espera("typeof GabaScanner !== 'undefined' && typeof GabaCaderno !== 'undefined'", 60000);

    var rec = await c.naPagina(montarLote, [BASE + "/_sample.docx"]);
    console.log("\n== lote impresso: " + rec.alunos + " alunos, " + rec.questoes + " questoes, " +
      rec.numTipos + " tipos, " + rec.folhas + " folhas A4 ==");
    check("o caderno registrou o lote que foi para a impressora", rec.folhas > 0 && rec.alunos > 1 && rec.itens.length === rec.alunos);

    var alvo = rec.itens[2];
    var pngCheia = path.join(RAIZ, "tests", "e2e-cheia.png");
    var bytes = hud.screenshot(urlFolha(rec, 2, alvo.codigo), pngCheia);
    console.log("  folha do aluno " + alvo.numero + " (" + alvo.nome.toLowerCase() + ") impressa em " + bytes + " bytes");

    var A = await c.naPagina(lerFolha, [{ pid: rec.pid, indice: 2, png: "tests/e2e-cheia.png", tipo: "cheia" }]);
    check("a folha impressa reproduz o codigo do lote", A.leitura.payload.indexOf(alvo.codigo) > 0, A.leitura.payload);
    check("o QR impresso carrega a geometria atual das marcas",
      A.leitura.payload.indexOf("GABA" + require("../js/omrLayout.js").GEOMETRIA + "|") === 0, A.leitura.payload);
    check("todas as bolhas da folha lidas pelo motor", A.leitura.lidas === rec.questoes, A.leitura.lidas + "/" + rec.questoes);
    check("atribuida ao aluno da folha", A.registro && A.registro.nome === alvo.nome && A.registro.numero === alvo.numero,
      JSON.stringify(A.registro && [A.registro.nome, A.registro.numero]));
    check("gravada a versao e o codigo do lote impresso", A.registro && A.registro.versao === alvo.tipo && A.registro.codigo === alvo.codigo,
      JSON.stringify(A.registro && [A.registro.versao, A.registro.codigo]));
    check("nota 10 pela chave propria deste aluno", A.registro && A.registro.acertos === A.esperado.acertos && A.registro.nota === 10,
      JSON.stringify(A.registro && [A.registro.acertos, A.registro.nota]));
    check("respostas convertidas de volta para a ordem do banco", A.registro && A.registro.banco.join("") === rec.gabaritoBase,
      A.registro && A.registro.banco.join("") + " vs " + rec.gabaritoBase);
    check("o leitor montou as versoes pelo lote impresso", A.indice.fonte.indexOf("lote impresso") === 0 && A.indice.porAluno === rec.alunos,
      JSON.stringify(A.indice));
    check("so entra na fila depois de duas leituras iguais", A.registros === 1 && A.deltas.join(",") === "0,1",
      JSON.stringify(A.deltas));

    var B = await c.naPagina(lerFolha, [{ pid: rec.pid, indice: 2, png: "tests/e2e-cheia.png", tipo: "erradas" }]);
    check("3 erradas e 1 em branco viram a nota certa", B.registro && B.registro.acertos === B.esperado.acertos &&
      B.registro.branco === B.esperado.branco, JSON.stringify(B.registro && [B.registro.acertos, B.registro.branco]));

    var C = await c.naPagina(lerFolha, [{ pid: rec.pid, indice: 2, png: "tests/e2e-cheia.png", tipo: "duas" }]);
    check("duas bolhas na mesma questao viram duvida na ficha", C.registro && C.registro.confusao.length === 1 &&
      C.registro.acertos === C.esperado.acertos, JSON.stringify(C.registro && [C.registro.confusao, C.registro.acertos]));

    var D = await c.naPagina(lerFolha, [{ pid: rec.pid, indice: 2, png: "tests/e2e-cheia.png", tipo: "dedupe" }]);
    console.log("        " + D.passos.join("\n        "));
    check("a mesma folha so entra uma vez, mesmo relida depois da pausa", D.deltas.join(",") === "0,1,1,1,2",
      JSON.stringify(D.deltas));

    var forasteiro = await c.naPagina(function (pid, indice) {
      var prova = GabaCaderno.estado.provasLocais.filter(function (p) { return String(p.id) === pid; })[0];
      var lote = GabaCaderno.loteImpresso(pid);
      var v = GabaVersoes.batch(prova, prova.alunos, {
        modo: lote.modo, numTipos: lote.numTipos, prova_id: pid, salt: "outra-impressao",
        turma_id: lote.turma_id || null, embaralharAlternativas: !!lote.embaralharAlternativas
      }).itens[indice].versao;
      return { codigo: v.codigo, gab: v.gabarito.join("") };
    }, [rec.pid, 2]);
    hud.screenshot(urlFolha(rec, 2, forasteiro.codigo, "outra-impressao"), path.join(RAIZ, "tests", "e2e-forasteiro.png"));
    var E2 = await c.naPagina(lerFolha, [{
      pid: rec.pid, indice: 2, png: "tests/e2e-forasteiro.png", tipo: "cheia", salt: "outra-impressao"
    }]);
    check("folha de outra impressao nao entra na fila", E2.registros === 0 && E2.fila === 0,
      JSON.stringify([E2.registros, E2.fila]));
    check("o aviso diz que a folha e de outro lote", /outra impressao/.test(E2.status), E2.status);
    check("mesmo assim o motor leu tudo dela", E2.leitura.lidas === rec.questoes && E2.leitura.gabOk, JSON.stringify(E2.leitura));

    var G = await c.naPagina(lerFolha, [{ pid: rec.pid, indice: 2, png: "tests/e2e-cheia.png", tipo: "cheia", prefixo: "GABA9" }]);
    check("folha de outra geometria de marcas nao entra na fila", G.registros === 0 && G.fila === 0,
      JSON.stringify([G.registros, G.fila]));
    check("o aviso manda reimprimir pela posicao das marcas", /outra posicao de marcas \(G9/.test(G.status), G.status);
    var G1 = await c.naPagina(lerFolha, [{ pid: rec.pid, indice: 2, png: "tests/e2e-cheia.png", tipo: "cheia", prefixo: "GABA1" }]);
    check("folha GABA1 (marcas nos cantos da pagina) tambem e recusada", G1.registros === 0 && G1.fila === 0 &&
      /outra posicao de marcas \(modelo antigo/.test(G1.status), JSON.stringify([G1.registros, G1.fila, G1.status]));

    var pendentes = await c.naPagina(function () { return GabaSync.countPending(); });
    console.log("\n  folhas guardadas no aparelho sem subir para o banco: " + pendentes);
    await c.naPagina(limparMotor);
    c.fecha();
  } finally {
    if (c) c.fecha();
    await hud.fecharChrome(chrome);
  }
  console.log(FALHAS ? "\n" + FALHAS + " FALHAS no caminho lote impresso -> leitor" :
    "\nlote impresso -> png -> motor -> aluno, versao, nota e fila: tudo certo");
  process.exit(FALHAS ? 1 : 0);
})().catch(function (err) {
  console.error("erro no harness: " + (err && err.stack ? err.stack : err));
  process.exit(1);
});
