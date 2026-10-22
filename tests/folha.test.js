/* Teste do caderno nominal: geometria impressa == geometria lida pelo scanner. Rode: node tests/folha.test.js */
"use strict";

var fs = require("fs");
var path = require("path");
var J = function (n) { return require(path.join(__dirname, "..", "js", n)); };

J("omrLayout.js");
J("qrPayload.js");
J("versoes.js");
J("docxParser.js");
J("folha.js");

var L = global.GabaLayout;
var QR = global.GabaQR;
var V = global.GabaVersoes;
var D = global.GabaDocx;
var F = global.GabaFolha;

var falhas = 0;
function check(nome, cond, extra) {
  console.log((cond ? "ok   " : "FALHA ") + nome + (extra ? " — " + extra : ""));
  if (!cond) falhas++;
}

function fakeProva(total, nAlt) {
  var qs = [];
  for (var i = 0; i < total; i++) {
    qs.push({
      numero: i + 1,
      enunciado: "Enunciado da questao " + (i + 1),
      alternativas: ["A", "B", "C", "D", "E"].slice(0, nAlt).map(function (l) { return { letra: l, texto: "alt " + l + " q" + (i + 1) }; }),
      gabarito: "A",
      peso: 1
    });
  }
  return { id: "p", questoes: qs, gabarito: qs.map(function () { return "A"; }), alternativas: nAlt, quantidade_questoes: total };
}

function mmDe(html, re) {
  var out = [];
  var m;
  re.lastIndex = 0;
  while ((m = re.exec(html))) out.push(m.slice(1).map(parseFloat));
  return out;
}

/* cada folha impressa vira {tipo, pagina, total, html} — o tipo esta na classe da artigo */
function folhasDe(html) {
  var re = /<article class="folha-a4 folha-([a-z]+)" data-aluno="([^"]*)" data-versao="([^"]*)" data-pagina="(\d+)" data-total="(\d+)"([\s\S]*?)<\/article>/g;
  var out = [];
  var m;
  while ((m = re.exec(html))) {
    out.push({ tipo: m[1], aluno: m[2], codigo: m[3], pagina: Number(m[4]), total: Number(m[5]), html: m[0] });
  }
  return out;
}

async function main() {
  var docxCaminho = process.argv[2];
  var prova;
  var alunos = [];
  if (docxCaminho && fs.existsSync(docxCaminho)) {
    var buf = fs.readFileSync(docxCaminho);
    var parsed = await D.parseDocx(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    prova = D.toProva(parsed, "Prova");
    prova.id = "provax";
    prova.modo = "turma";
    alunos = (prova.alunos || []);
    console.log("prova real:", prova.quantidade_questoes, "questoes,", alunos.length, "alunos,", (prova.tipos || []).length, "tipos");
  } else {
    prova = fakeProva(10, 5);
    for (var i = 0; i < 45; i++) alunos.push({ id: "a" + i, numero: i + 1, nome: "Aluno " + (i + 1), tipo: (i % 10) + 1 });
    console.log("prova sintetica (passe o caminho do .docx como argumento para rodar com dados reais)");
  }

  var versao = V.build(prova, { modo: "turma", tipo: 3, turma_id: "t1", prova_id: prova.id, embaralharAlternativas: true });
  var layout = F.layoutDa(prova, {});

  // 1. posição impressa de cada bolha == posição que o scanner procura
  var cartao = F.cartaoHtml(layout);
  var linhas = mmDe(cartao, /class="folha-q" style="left:([\d.]+)mm;top:([\d.]+)mm/g);
  check("cartao tem uma linha por questao", linhas.length === layout.total, linhas.length + " de " + layout.total);
  var g = layout.grid;
  var maxDesvio = 0;
  linhas.forEach(function (xy, q) {
    for (var o = 0; o < layout.options; o++) {
      var hx = xy[0] + g.numberWidthMm + o * g.optionGapMm + g.bubbleMm / 2;
      var hy = xy[1] + g.bubbleMm / 2;
      var c = layout.bubbleCenterMm(q, o);
      maxDesvio = Math.max(maxDesvio, Math.abs(hx - c.x), Math.abs(hy - c.y));
    }
  });
  check("bolhas impressas batem com o scanner", maxDesvio < 0.051, "desvio maximo " + maxDesvio.toFixed(4) + "mm");

  // 2. fiduciais impressos == fiduciais esperados pelo worker
  var fid = mmDe(F.fiduciaisHtml(layout), /left:([\d.]+)mm;top:([\d.]+)mm/g)
    .map(function (xy) { return [xy[0] + layout.fiducialMm / 2, xy[1] + layout.fiducialMm / 2]; });
  var esperado = layout.fiducialCenters().map(function (c) { return [c.x, c.y]; });
  check("quatro fiduciais", fid.length === 4);
  check("centros dos fiduciais identicos", JSON.stringify(fid) === JSON.stringify(esperado), JSON.stringify(fid));

  // 3. payload do QR idêntico nos dois lados, legados aceitos
  var aluno = alunos[0] || { id: "a1", numero: 1, nome: "Teste" };
  var payload = QR.encode(prova, aluno, versao);
  var dec = QR.decode(payload);
  var resolvido = QR.resolve(dec, alunos);
  check("payload tem referencia de aluno", payload.split("|")[2].length > 0, payload);
  check("decode do payload proprio", dec.ok && dec.prova_id === prova.id && dec.versao === versao.versao &&
    dec.codigo === versao.codigo && resolvido && String(resolvido.nome) === String(aluno.nome),
    payload + " -> " + JSON.stringify(dec) + " -> " + (resolvido ? resolvido.nome : "NINGUEM"));
  var comId = QR.decode(QR.encode(prova, { id: "uuid-123", numero: 9, nome: "X" }, versao));
  check("aluno com id usa id no QR", comId.aluno_id === "uuid-123" && comId.numero === "9" &&
    comId.aluno_numero === "", comId.raw);
  var leg1 = QR.decode("GABA|p1|a1|7");
  var leg2 = QR.decode("Gaba|a1|p1");
  var leg3 = QR.decode('{"prova_id":"p1","aluno_id":"a1","matricula":"12","n":10}');
  check("legado GABA|prova|aluno", leg1.prova_id === "p1" && leg1.aluno_id === "a1" && leg1.numero === "7");
  check("legado Gaba|aluno|prova", leg2.prova_id === "p1" && leg2.aluno_id === "a1");
  check("legado JSON do gerador python", leg3.prova_id === "p1" && leg3.aluno_id === "a1");

  // 4. caderno: folha de resposta na pagina 1, questoes a partir da 2, ultimo verso em branco
  var cad = await F.cadernoHtml(prova, aluno, {
    versao: versao,
    qrDataUrl: "data:image/png;base64,AA",
    config: { escola: "EEFM Exemplo", turma: "2M1", data: "21/10/2026", questoesPorPagina: 5 }
  });
  var fl = folhasDe(cad.html);
  check("caderno gera paginas", fl.length === cad.paginas &&
    fl.every(function (f, i) { return f.pagina === i + 1; }), fl.length + " artigos / " + cad.paginas);
  check("plano do caderno bate com o html",
    JSON.stringify(fl.map(function (f) { return f.tipo; })) === JSON.stringify(cad.plano), cad.plano.join(","));
  check("folha de resposta e a pagina 1", fl[0].tipo === "resposta");
  check("as questoes comecam na pagina 2", fl[1].tipo === "questoes" && fl[1].html.indexOf("folha-questao") >= 0);
  check("cartao OMR existe numa unica folha e e a primeira",
    fl.filter(function (f) { return f.html.indexOf("folha-cartao") >= 0; }).length === 1 && fl[0].tipo === "resposta");
  check("QR so na folha de resposta", (cad.html.match(/class="folha-qr"/g) || []).length === 1);
  check("marcas de canto so na folha de resposta", (cad.html.match(/class="fiducial /g) || []).length === 4);
  check("pagina de questao nao tem bolha nem marca de canto",
    fl.filter(function (f) { return f.tipo === "questoes"; }).every(function (f) {
      return f.html.indexOf("folha-bubble") < 0 && f.html.indexOf("fiducial") < 0 && f.html.indexOf("folha-qr") < 0;
    }));
  check("ultima pagina sai em branco", fl[fl.length - 1].tipo === "branco" && fl[fl.length - 1].html.length < 400,
    fl[fl.length - 1].html);
  check("bloco de folhas fecha em pares para imprimir frente e verso", fl.length % 2 === 0, fl.length + " folhas");
  check("corpo das questoes comeca no topo da folha",
    fl[1].html.indexOf('class="folha-area"') >= 0 &&
    fl[1].html.indexOf('class="folha-area"') < fl[1].html.indexOf('class="folha-fluxo"'));

  // 4b. o descritor so sai na impressao quando o professor pede
  prova.questoes[0].descritor = "D1 - localizar informacao explicita";
  var semDesc = await F.cadernoHtml(prova, aluno, {
    versao: versao, qrDataUrl: "data:image/png;base64,AA", config: { questoesPorPagina: 5 }
  });
  var comDesc = await F.cadernoHtml(prova, aluno, {
    versao: versao, qrDataUrl: "data:image/png;base64,AA", config: { questoesPorPagina: 5, comDescritores: true }
  });
  delete prova.questoes[0].descritor;
  check("descritor nao aparece no caderno do aluno por padrao", semDesc.html.indexOf("folha-desc") < 0);
  check("o descritor impresso so aparece com o pedido marcado", comDesc.html.indexOf("D1 - localizar") >= 0);

  // 5. texto das questoes sai na ordem embaralhada da versao
  var ordemEsperada = versao.ordem.map(function (i) { return i + 1; });
  var questoesVersao = V.questoesDaVersao(prova, versao);
  var numerosOriginais = [];
  var reQ = /class="folha-questao" data-num="(\d+)"/g;
  var mm;
  while ((mm = reQ.exec(cad.html))) {
    var idx = questoesVersao.filter(function (q) { return String(q.numero) === mm[1]; })[0];
    if (idx) numerosOriginais.push(idx.numero_original);
  }
  check("ordem impressa == ordem da versao", JSON.stringify(numerosOriginais.slice(0, ordemEsperada.length)) ===
    JSON.stringify(ordemEsperada.slice(0, numerosOriginais.length)), numerosOriginais.join(",") + " vs " + ordemEsperada.join(","));

  // 6. limites: 1 e 90 questoes, 3 alternativas
  [1, 10, 24, 25, 50, 90].forEach(function (t) {
    var lg = F.layoutDa(fakeProva(t, 5), {});
    check("layout " + t + " questoes cabe no A4", lg.problemas().length === 0, JSON.stringify(lg.problemas()) + " cols=" + lg.grid.cols + " gap=" + lg.grid.rowGapMm);
  });
  var l3 = F.layoutDa(fakeProva(30, 3), {});
  check("layout com 3 alternativas", l3.problemas().length === 0 && l3.optionLetters.join("") === "ABC", l3.grid.colContentMm + "mm");

  // 7. lote: distribuicao de tipos eunicidade de codigos
  var batch = V.batch(prova, alunos, { modo: "turma", numTipos: (prova.tipos || []).length || 5, turma_id: "t1" });
  var codigos = {};
  batch.itens.forEach(function (it) { codigos[it.versao.versao] = it.versao.codigo; });
  check("um codigo por tipo", Object.keys(codigos).length === batch.numTipos, JSON.stringify(codigos));
  var doTipo1 = batch.itens.filter(function (it) { return it.versao.versao === 1; });
  check("alunos do mesmo tipo recebem a mesma ordem", doTipo1.every(function (it) {
    return JSON.stringify(it.versao.ordem) === JSON.stringify(doTipo1[0].versao.ordem);
  }), doTipo1.length + " alunos no tipo 1");

  // 8. modo aluno: ordem unica por aluno
  var bA = V.batch(prova, alunos, { modo: "aluno", embaralharAlternativas: true });
  var setOrdens = {};
  bA.itens.forEach(function (it) { setOrdens[it.versao.ordem.join(",")] = 1; });
  check("modo aluno gera ordens distintas", Object.keys(setOrdens).length >= alunos.length * 0.8,
    Object.keys(setOrdens).length + " unicas em " + alunos.length);

  // 9. nota: preencher o gabarito da versao da 10
  var nota = V.corrigir(prova, versao, versao.gabarito);
  check("gabarito da versao rende nota maxima", nota.nota === 10, JSON.stringify({ acertos: nota.acertos, ponderado: nota.ponderado, max: nota.maximo }));

  // 10. impressao nominal em lote: um caderno por aluno, cartao e QR exclusivos
  global.QRCode = {
    toDataURL: async function (text) { return "data:image/png;base64,QR" + text.length; }
  };
  var cfgLote = { escola: "EEFM Exemplar", turma: "2M1", data: "21/10/2026", questoesPorPagina: 5, comCartao: true };
  var t0 = Date.now();
  var lote = await F.loteHtml(prova, batch, cfgLote);
  var msLote = Date.now() - t0;
  var arts = folhasDe(lote);
  var porAluno = {};
  arts.forEach(function (a) { (porAluno[a.aluno] = porAluno[a.aluno] || []).push(a); });
  var esperadas = batch.itens.length * F.planoDoCaderno(cfgLote, (prova.questoes || []).length).length;
  check("lote renderiza todos os cadernos", Object.keys(porAluno).length === batch.itens.length &&
    arts.length === esperadas, batch.itens.length + " alunos, " + Object.keys(porAluno).length +
    " cadernos, " + arts.length + " folhas (esperadas " + esperadas + ") em " + msLote + "ms");
  check("toda folha identifica o aluno", arts.every(function (a) { return a.aluno.length > 0; }));
  check("cada caderno tem exatamente um cartao OMR",
    arts.filter(function (a) { return a.html.indexOf('class="folha-cartao"') >= 0; }).length === batch.itens.length);
  check("cabecalho da escola sai uma unica vez por caderno",
    (lote.match(/class="folha-cabecalho"/g) || []).length === batch.itens.length &&
    (lote.match(/EEFM Exemplar/g) || []).length === batch.itens.length);
  var css = fs.readFileSync(path.join(__dirname, "..", "style.css"), "utf8");
  check("quebra automatica de pagina por folha",
    /\.folha-a4\s*\{[^}]*page-break-after:\s*always/.test(css) && /@page\s*\{[^}]*size:\s*A4/.test(css));

  var porRef = {};
  batch.itens.forEach(function (it) { porRef[QR.idAluno(it.aluno)] = it; });
  var qrRuim = null;
  var qrRe = /alt="QR ([^"]*)"/g;
  var qm;
  while ((qm = qrRe.exec(lote)) && !qrRuim) {
    var dec = QR.decode(qm[1]);
    var ref = qm[1].split("|")[2];
    var it = porRef[ref];
    if (!dec.ok || !it || dec.codigo !== it.versao.codigo || Number(dec.versao) !== Number(it.versao.versao)) {
      qrRuim = qm[1];
    }
  }
  check("QR de cada folha aponta para o aluno e a versao certos", qrRuim === null,
    qrRuim || Object.keys(porRef).length + " refs unicas");

  var ordemRuim = null;
  Object.keys(porAluno).forEach(function (ref) {
    if (ordemRuim || !porRef[ref]) return;
    var it = porRef[ref];
    var paginas = porAluno[ref].slice().sort(function (a, b) { return a.pagina - b.pagina; });
    var impressos = [];
    paginas.forEach(function (pg) {
      var re = /class="folha-questao" data-num="(\d+)"/g;
      var x;
      while ((x = re.exec(pg.html))) impressos.push(Number(x[1]));
    });
    var questoes = V.questoesDaVersao(prova, it.versao);
    var orig = impressos.map(function (n) {
      var f = questoes.filter(function (q) { return String(q.numero) === String(n); })[0];
      return f ? f.numero_original : -1;
    });
    var esperado = it.versao.ordem.map(function (i) { return i + 1; });
    if (JSON.stringify(orig) !== JSON.stringify(esperado)) ordemRuim = ref + ": " + orig.join(",") + " vs " + esperado.join(",");
  });
  check("texto das questoes impresso na ordem embaralhada do caderno", ordemRuim === null, ordemRuim || "");
  var codigosLote = {};
  batch.itens.forEach(function (it) { codigosLote[it.versao.codigo] = 1; });
  check("cada tipo imprime o proprio codigo", Object.keys(codigosLote).length === batch.numTipos,
    Object.keys(codigosLote).join(","));

  // 11. caderno em duas colunas, cabecalho configuravel e modos de pagina
  var cfg2 = { colunas: 2, questoesPorPagina: 16, escola: "EEFM Exemplar",
    cabecalho: { rede: "SECRETARIA DE ESTADO DA EDUCACAO", escola: "EEFM Exemplar", titulo: "Prova bimestral",
      disciplina: "Lingua Portuguesa", professor: "Prof. Ana", turma: "2M1", ano: "2o ano EM",
      bimestre: "2o bimestre", data: "21/10/2026" } };
  var duas = await F.cadernoHtml(prova, aluno, { versao: versao, qrDataUrl: "data:image/png;base64,AA", config: cfg2 });
  var fl2 = folhasDe(duas.html);
  check("duas colunas marcadas no corpo", fl2.filter(function (f) { return f.tipo === "questoes"; })
    .every(function (f) { return f.html.indexOf("--colunas:2;") >= 0; }));
  check("o corpo imprime em colunas", /\.folha-a4 \.folha-fluxo\s*\{[^}]*column-count:\s*var\(--colunas/.test(css), "");
  check("a folha de resposta nao e dividida em colunas",
    fl2[0].html.indexOf("folha-fluxo") < 0 && fl2[0].html.indexOf("fiducial") >= 0);
  check("todas as questoes saem impressas", fl2.filter(function (f) { return f.tipo === "questoes"; })
    .reduce(function (n, f) { return n + (f.html.match(/class="folha-questao"/g) || []).length; }, 0) === 10);

  var cheios = ["SECRETARIA DE ESTADO DA EDUCACAO", "EEFM Exemplar", "Prova bimestral", "Lingua Portuguesa",
    "Prof. Ana", "2o ano EM", "2o bimestre", "21/10/2026", "folha-linha folha-linha-nota"];
  check("o cabecalho configurado sai inteiro na folha de resposta",
    cheios.every(function (s) { return fl2[0].html.indexOf(s) >= 0; }),
    cheios.filter(function (s) { return fl2[0].html.indexOf(s) < 0; }).join(" | "));
  var semProfessor = await F.cadernoHtml(prova, aluno, {
    versao: versao, qrDataUrl: "data:image/png;base64,AA",
    config: { questoesPorPagina: 5, cabecalho: { escola: "EEFM Exemplar" } }
  });
  check("campo de cabecalho vazio nao sai impresso", semProfessor.html.indexOf("Professor(a):") < 0);

  var modelo = await F.cadernoHtml(prova, aluno, {
    versao: versao, qrDataUrl: "data:image/png;base64,AA",
    config: { modelo: "enem", questoesPorPagina: 5, colunas: 2 }
  });
  var fl3 = folhasDe(modelo.html);
  check("o modelo ENEM imprime o rotulo Questao antes do enunciado",
    (fl3.filter(function (f) { return f.tipo === "questoes"; }).map(function (f) {
      return (f.html.match(/class="folha-rotulo"/g) || []).length;
    }).reduce(function (a, b) { return a + b; }, 0)) === 10);
  check("as instrucoes do modelo saem uma unica vez",
    (modelo.html.match(/<section class="folha-instrucoes/g) || []).length === 1);
  check("prova curta leva as instrucoes na capa, abaixo do cartao",
    fl3[0].html.indexOf("LEIA ATENTAMENTE") >= 0 && fl3[0].html.indexOf("folha-instrucoes-capa") >= 0 &&
    fl3.filter(function (f) { return f.tipo === "questoes"; })[0].html.indexOf("LEIA ATENTAMENTE") < 0);
  var caixaCapa = (fl3[0].html.match(/folha-instrucoes-capa" style="top:([\d.]+)mm/) || [])[1];
  var fundoDoCartao = layout.grid.yMm + layout.grid.questionsPerCol * layout.grid.rowGapMm;
  check("a caixa da capa comeca abaixo da ultima linha do cartao",
    Number(caixaCapa) >= fundoDoCartao, caixaCapa + "mm vs cartao ate " + fundoDoCartao + "mm");
  var provaLonga = fakeProva(90, 5);
  var longa = await F.cadernoHtml(provaLonga, aluno, {
    versao: V.build(provaLonga, { modo: "turma", tipo: 2, turma_id: "t1", prova_id: "p" }),
    qrDataUrl: "data:image/png;base64,AA",
    config: { modelo: "enem", questoesPorPagina: 24, colunas: 2 }
  });
  var fl5 = folhasDe(longa.html);
  check("prova de 90 questoes nao tem lugar na capa e imprime as instrucoes na primeira pagina de questoes",
    fl5[0].html.indexOf("LEIA ATENTAMENTE") < 0 &&
    fl5.filter(function (f) { return f.tipo === "questoes"; })[0].html.indexOf("LEIA ATENTAMENTE") >= 0 &&
    (longa.html.match(/<section class="folha-instrucoes/g) || []).length === 1,
    "livre na capa=" + F.espacoLivreAbaixoDoCartaoMm(F.layoutDa(provaLonga, {})) + "mm");
  check("o bloco do modelo fecha em pares", fl3.length % 2 === 0 && fl3[fl3.length - 1].tipo === "branco",
    fl3.map(function (f) { return f.tipo; }).join(","));

  var semBranca = await F.cadernoHtml(prova, aluno, {
    versao: versao, qrDataUrl: "data:image/png;base64,AA",
    config: { questoesPorPagina: 5, ultimaEmBranco: false }
  });
  check("desmarcar a pagina em branco nao imprime folha vazia",
    folhasDe(semBranca.html).every(function (f) { return f.tipo !== "branco"; }), semBranca.plano.join(","));
  var semCartao = await F.cadernoHtml(prova, aluno, {
    versao: versao, qrDataUrl: "data:image/png;base64,AA",
    config: { questoesPorPagina: 5, comCartao: false, escola: "EEFM Exemplar" }
  });
  var fl4 = folhasDe(semCartao.html);
  check("sem folha de resposta as questoes comecam na pagina 1 com o cabecalho cheio",
    fl4[0].tipo === "questoes" && fl4[0].html.indexOf("EEFM Exemplar") >= 0 &&
    fl4[0].html.indexOf("fiducial") < 0, fl4.map(function (f) { return f.tipo; }).join(","));
  var soResposta = await F.cadernoHtml(prova, aluno, {
    versao: versao, qrDataUrl: "data:image/png;base64,AA",
    config: { comQuestoes: false, questoesPorPagina: 5 }
  });
  check("folha de resposta sozinha tambem fecha em pares",
    folhasDe(soResposta.html).map(function (f) { return f.tipo; }).join(",") === "resposta,branco");
  check("90 questoes em 4 paginas de corpo fecham em pares",
    F.planoDoCaderno({ questoesPorPagina: 24, comCartao: true, ultimaEmBranco: true }, 90).length % 2 === 0);

  /* ---------------- o empacotador de colunas ----------------
     a unica prova de que nada e amputado: cada coluna que ele entrega cabe na altura medida. */
  console.log("\n== o corpo fechado por medida ==");

  function conferindo(pac, itens, op) {
    var colunas = Math.max(1, op.colunas || 1);
    var alturas = op.alturas && op.alturas.length ? op.alturas : [op.altura || 240];
    var margem = op.margem == null ? F.MARGEM_QUESTAO_MM : op.margem;
    var rotulo = op.rotuloContinua || 0;
    var vistos = {}, prob = [];
    /* o empacotador nunca intercala duas questoes: na ordem de leitura, os fragmentos de cada uma
       precisam vir seguidos, comecando do pedaco 0 e sem buraco no meio. */
    var dono = -1, esperado = 0;
    pac.paginas.forEach(function (pg, pi) {
      /* a pagina 1 do corpo e mais curta (leva a caixa de instrucoes): ela pode sair sem questao nenhuma,
         no meio do caderno nao — ahi seria folha arrancada. */
      if (pi > 0 && !pg.colunas.some(function (col) { return col.length; })) prob.push("pagina " + (pi + 1) + " saiu vazia");
      if (pg.colunas.length > colunas) prob.push("pagina " + (pi + 1) + " com " + pg.colunas.length + " colunas");
      pg.colunas.forEach(function (col, ci) {
        var y = 0;
        col.forEach(function (f) {
          var ped = itens[f.i].pedacos;
          if (!(f.de >= 0 && f.de < f.ate && f.ate <= ped.length)) prob.push("fragmento fora da questao " + (f.i + 1));
          if (f.i !== dono) { if (f.de !== 0) prob.push("questao " + (f.i + 1) + " comeca no meio"); dono = f.i; esperado = 0; }
          if (f.de !== esperado) prob.push("pedaco perdido na questao " + (f.i + 1));
          esperado = f.ate;
          for (var k = f.de; k < f.ate; k++) {
            var chave = f.i + ":" + k;
            if (vistos[chave]) prob.push("pedaco impresso 2x na questao " + (f.i + 1));
            vistos[chave] = true;
            y += ped[k];
          }
          y += margem + (f.de > 0 ? rotulo : 0);
        });
        var altura = alturas[Math.min(pi, alturas.length - 1)];
        if (y > altura + 0.001) {
          prob.push("coluna " + (ci + 1) + " da pagina " + (pi + 1) + " estoura: " + y.toFixed(1) + "mm em " + altura + "mm");
        }
      });
    });
    itens.forEach(function (it, i) {
      for (var k = 0; k < it.pedacos.length; k++) {
        if (!vistos[i + ":" + k]) prob.push("pedaco " + (k + 1) + " da questao " + (i + 1) + " nao saiu no papel");
      }
    });
    return prob;
  }
  function itensDe(listas) {
    return listas.map(function (ped, i) { return { i: i, pedacos: ped }; });
  }
  function cenario(nome, listas, op) {
    var pac = F.empacotar(itensDe(listas), op);
    var prob = conferindo(pac, itensDe(listas), op);
    check(nome, prob.length === 0, prob.slice(0, 3).join(" | ") ||
      pac.paginas.length + " paginas, " + pac.paginas.map(function (p) { return p.questoes; }).join(","));
    return pac;
  }

  var dezIguais = [];
  for (var di = 0; di < 10; di++) dezIguais.push([20, 20, 20]);
  var umaColuna = cenario("dez questoes de 60mm cabem em colunas de 240mm sem corte", dezIguais,
    { colunas: 1, alturas: [240, 240] });
  check("em uma coluna o empacotador fecha tres questoes por pagina",
    umaColuna.paginas.length === 4 && umaColuna.paginas.map(function (p) { return p.questoes; }).join(",") === "3,3,3,1",
    umaColuna.paginas.map(function (p) { return p.questoes; }).join(","));
  check("nenhuma questao precisa de continuacao quando cabe inteira",
    umaColuna.paginas.every(function (p) {
      return p.colunas.every(function (col) { return col.every(function (f) { return f.de === 0; }); });
    }));

  var duasColunas = cenario("as mesmas dez em duas colunas nao estouram nenhuma coluna", dezIguais,
    { colunas: 2, alturas: [240, 240] });
  check("duas colunas dividem o corpo ao meio e aproveitam as duas",
    duasColunas.paginas.length < umaColuna.paginas.length &&
    duasColunas.paginas.every(function (p) { return p.colunas.length === 2; }),
    duasColunas.paginas.length + " paginas");

  var encaixeCurto = itensDe([[150], [60, 60], [40]]);
  var pulaPagina = F.empacotar(encaixeCurto, { colunas: 1, alturas: [100, 240] });
  check("o que nao cabe na pagina 1 mais curta vai inteiro para a proxima, sem corte",
    conferindo(pulaPagina, encaixeCurto, { colunas: 1, alturas: [100, 240] }).length === 0 &&
    pulaPagina.paginas[1].colunas[0][0].ate === 1,
    pulaPagina.paginas.map(function (p) { return p.questoes; }).join(","));
  cenario("pagina 1 e demais com alturas diferentes fecham todas as colunas", dezIguais,
    { colunas: 2, alturas: [180, 240] });

  var gigante = [];
  for (var gi = 0; gi < 30; gi++) gigante.push(20);
  var pacGigante = cenario("uma questao de 600mm e cortada em pedacos, nao amputada", [gigante],
    { colunas: 2, alturas: [240, 240], rotuloContinua: 5 });
  var fragmentos = [];
  pacGigante.paginas.forEach(function (p) { p.colunas.forEach(function (col) { fragmentos = fragmentos.concat(col); }); });
  check("a questao gigante sai em varios fragmentos que se anunciam como continuacao",
    fragmentos.length > 1 && fragmentos.slice(1).every(function (f) { return f.de > 0; }),
    fragmentos.map(function (f) { return f.de + "-" + f.ate; }).join(","));
  check("nenhum pedaco da questao gigante passa da altura da coluna", pacGigante.estouradas.length === 0,
    pacGigante.estouradas.join(","));

  var estouro = F.empacotar(itensDe([[300]]), { colunas: 1, alturas: [240, 240] });
  check("pedaco maior que a coluna inteira e avisa em vez de sumir",
    estouro.estouradas.join(",") === "1",
    estouro.estouradas.join(",") + " / " + estouro.paginas.length + " paginas");

  cenario("o teto por pagina e respeitado enquanto a questao cabe inteira", dezIguais,
    { colunas: 2, alturas: [240, 240], maxPorPagina: 2 });
  var comTeto = F.empacotar(itensDe(dezIguais), { colunas: 2, alturas: [240, 240], maxPorPagina: 2 });
  check("com teto de 2 o corpo sai em 5 paginas de 2 questoes",
    comTeto.paginas.length === 5 && comTeto.paginas.every(function (p) { return p.questoes === 2; }),
    comTeto.paginas.map(function (p) { return p.questoes; }).join(","));

  /* o buraco: coluna que termina cedo demais e o outro erro de diagramacao, alem do corte */
  var parAcheia = itensDe([[150, 20], [30, 30, 30, 30]]);
  var fechaBuraco = F.empacotar(parAcheia, { colunas: 1, alturas: [240, 240] });
  check("o buraco de meia pagina fecha com o corte da questao seguinte",
    conferindo(fechaBuraco, parAcheia, { colunas: 1, alturas: [240, 240] }).length === 0 &&
    fechaBuraco.paginas[0].colunas[0].map(function (f) { return f.i + ":" + f.de + "-" + f.ate; }).join(",") === "0:0-2,1:0-2",
    fechaBuraco.paginas.map(function (p) {
      return p.colunas.map(function (c) {
        return c.map(function (f) { return f.i + ":" + f.de + "-" + f.ate; }).join(" ");
      }).join(" | ");
    }).join(" // "));
  var viuvas = itensDe([[150, 20], [30, 30, 100]]);
  var guardaViuva = F.empacotar(viuvas, { colunas: 1, alturas: [240, 240] });
  check("o corte nao larga uma viuva: se do lado de la sobraria uma linha, a questao muda de pagina inteira",
    conferindo(guardaViuva, viuvas, { colunas: 1, alturas: [240, 240] }).length === 0 &&
    guardaViuva.paginas[1].colunas[0].length === 1 &&
    guardaViuva.paginas[1].colunas[0][0].de === 0 && guardaViuva.paginas[1].colunas[0][0].ate === 3,
    guardaViuva.paginas.map(function (p) {
      return p.colunas.map(function (c) {
        return c.map(function (f) { return f.i + ":" + f.de + "-" + f.ate; }).join(" ");
      }).join(" | ");
    }).join(" // "));

  /* o mesmo controle de viuva vale para o corte em fluxo, quando a questao nao cabe em nenhuma coluna */
  var viuvasFluxo = itensDe([[70], [20, 20, 20, 20, 20]]);
  var semViuvaFluxo = F.empacotar(viuvasFluxo, { colunas: 1, alturas: [100, 100] });
  function leituraFluxo(pac) {
    return pac.paginas.map(function (p) {
      return p.colunas.map(function (c) {
        return c.map(function (f) { return f.i + ":" + f.de + "-" + f.ate; }).join(" ");
      }).join(" | ");
    }).join(" // ");
  }
  check("no corte em fluxo a linha solta desce inteira para a proxima coluna",
    conferindo(semViuvaFluxo, viuvasFluxo, { colunas: 1, alturas: [100, 100] }).length === 0 &&
    leituraFluxo(semViuvaFluxo) === "0:0-1 // 1:0-4 // 1:4-5", leituraFluxo(semViuvaFluxo));

  check("questoesHtml e fragmentoHtml entregam o mesmo bloco quando nao ha corte",
    F.questoesHtml([{ numero: 3, enunciado: "Teste", alternativas: [{ letra: "A", texto: "um" }] }], 0, 1, false, "numero") ===
    F.fragmentoHtml({ numero: 3, enunciado: "Teste", alternativas: [{ letra: "A", texto: "um" }] }, 0, 99, false, "numero"));

  var medidasFake = {
    assinatura: F.assinaturaDa({ colunas: 2, modelo: "enem" }),
    alturas: [240, 240], larguraColunaMm: 87.5, rotuloContinua: 5,
    pedacos: dezIguais.map(function (p) { return p.slice(); })
  };
  var porMedida = await F.cadernoHtml(prova, aluno, {
    versao: versao, qrDataUrl: "data:image/png;base64,AA",
    config: { colunas: 2, modelo: "enem", questoesPorPagina: 30 }, medidas: medidasFake
  });
  var fl6 = folhasDe(porMedida.html);
  var corpo6 = fl6.filter(function (f) { return f.tipo === "questoes"; });
  check("o caderno medido imprime o corpo em colunas fechadas na mao",
    corpo6.length > 0 && corpo6.every(function (f) {
      return f.html.indexOf("folha-area--colunas") >= 0 &&
        (f.html.match(/class="folha-fluxo folha-coluna"/g) || []).length === 2;
    }), corpo6.length + " paginas de corpo");
  check("todas as dez questoes saem impressas no corpo medido",
    (porMedida.html.match(/data-num="/g) || []).length === 10,
    (porMedida.html.match(/data-num="/g) || []).length);
  var medidasCortadas = {
    assinatura: medidasFake.assinatura, alturas: [80, 80], larguraColunaMm: 87.5, rotuloContinua: 5,
    pedacos: [[60, 60, 60], [40, 40], [30], [30], [30], [30], [30], [30], [30], [30]]
  };
  var cortada = await F.cadernoHtml(prova, aluno, {
    versao: versao, qrDataUrl: "data:image/png;base64,AA",
    config: { colunas: 2, modelo: "enem", questoesPorPagina: 30 }, medidas: medidasCortadas
  });
  check("a questao cortada imprime o rotulo de continuacao",
    (cortada.html.match(/folha-continua/g) || []).length >= 1 && cortada.html.indexOf("(continua)") >= 0,
    (cortada.html.match(/folha-continua/g) || []).length);
  check("medida com assinatura diferente cai no caminho antigo sem quebrar",
    (await F.cadernoHtml(prova, aluno, {
      versao: versao, qrDataUrl: "data:image/png;base64,AA",
      config: { colunas: 2, questoesPorPagina: 5 }, medidas: { assinatura: "outra", alturas: [240], pedacos: [] }
    })).html.indexOf("folha-area--colunas") < 0);

  console.log(falhas ? "\n" + falhas + " FALHAS" : "\ntodos os checks passaram");
  process.exit(falhas ? 1 : 0);
}

main().catch(function (e) { console.error("erro:", e && e.stack || e); process.exit(2); });
