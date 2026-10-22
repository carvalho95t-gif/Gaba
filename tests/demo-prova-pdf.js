/* Demo ponta a ponta: cria prova, simula respostas de 45 alunos, corrige e gera PDFs.
   Uso: node tests/serve.js 8791  (em outra janela)  ->  node tests/demo-prova-pdf.js 8791 */
"use strict";

var hud = require("./hudChrome");
var path = require("path");
var fs = require("fs");

var RAIZ = path.resolve(__dirname, "..");
var porta = Number(process.argv[2] || 8791);
var BASE = "http://127.0.0.1:" + porta;
var SAIDA = path.join(RAIZ, "tests");

/* ===================== funcoes que rodam na pagina ===================== */

async function montarProva(sampleUrl) {
  var buf = await (await fetch(sampleUrl)).arrayBuffer();
  var file = new File([buf], "PROVA_DEMO.docx", {
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
  document.getElementById("cad-modelo").value = "ama";
  document.getElementById("cad-colunas").value = "2";
  document.getElementById("cad-rede").value = "SECRETARIA MUNICIPAL DE EDUCACAO";
  document.getElementById("cad-escola").value = "EEFM DEMONSTRACAO GABA";
  document.getElementById("cad-professor").value = "Prof. Demonstracao";
  document.getElementById("cad-ano").value = "2a serie EM";
  document.getElementById("cad-bimestre").value = "3o bimestre";
  document.getElementById("cad-data").value = "22/10/2026";
  document.getElementById("cad-instrucoes").value =
    "Marque somente uma alternativa por questao.\nUse caneta esferografica preta ou azul.\nNao destaque a folha de respostas.";
  document.getElementById("cad-por-pagina").value = "30";
  document.getElementById("cad-por-pagina").dispatchEvent(new Event("change"));
  var r = await GabaCaderno.gerarLote();
  var rec = JSON.parse(localStorage.getItem("gaba_lote_impresso"));
  return {
    pid: rec.prova_id, modo: rec.modo, numTipos: rec.numTipos, salt: rec.salt,
    alt: rec.embaralharAlternativas, questoes: rec.totalQuestoes, alternativas: rec.alternativas,
    alunos: rec.itens.length, folhas: r.folhas,
    gabaritoBase: (prova.questoes || []).map(function (q) { return String(q.gabarito || "").toUpperCase(); }).join(""),
    provaQuestoes: (prova.questoes || []).map(function (q) {
      return { numero: q.numero, enunciado: (q.enunciado || "").substring(0, 60), gabarito: q.gabarito || "",
        descritor: q.descritor || "", habilidade_bncc: q.habilidade_bncc || "" };
    }),
    itens: rec.itens.map(function (it) {
      return { numero: it.aluno.numero, nome: it.aluno.nome, tipo: it.versao.versao,
        codigo: it.versao.codigo, gab: it.versao.gabarito.join("") };
    })
  };
}

async function lerECorrigir(cfg) {
  var E = GabaScanner.estado;
  var lote = GabaCaderno.loteImpresso(cfg.pid);
  if (!lote) throw new Error("o lote impresso nao esta no aparelho");
  await GabaScanner.preencherListas(GabaCaderno.estado.provasLocais);
  var prova = GabaCaderno.estado.provasLocais.filter(function (p) { return String(p.id) === cfg.pid; })[0];
  var layout = GabaLayout.compute(lote.totalQuestoes, lote.alternativas || 5);
  var idx = function (l) { return layout.optionLetters.indexOf(l); };

  var img = new Image();
  img.src = cfg.png + "?t=" + Date.now();
  await img.decode();

  function quadro(marcas) {
    var cv = document.createElement("canvas");
    cv.width = img.naturalWidth; cv.height = img.naturalHeight;
    var ctx = cv.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.drawImage(img, 0, 0);
    var pxmm = cv.width / layout.pageWmm;
    marcas.forEach(function (m) {
      var c = layout.bubbleCenterMm(m.q, m.o);
      ctx.beginPath();
      ctx.arc(c.x * pxmm, c.y * pxmm, layout.grid.bubbleMm * 0.42 * pxmm, 0, Math.PI * 2);
      ctx.fillStyle = "#111"; ctx.fill();
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
    w.__ultimo = function () {}; w.__falha = function () {};
    return w;
  })();
  var worker = window.__w;
  await worker.__espera;

  function ler(data) {
    var id = ++worker.__seq;
    return new Promise(function (res, rej) {
      var t = setTimeout(function () { rej(new Error("timeout leitura")); }, 90000);
      worker.__ultimo = function (m) { clearTimeout(t); res(m); };
      worker.__falha = function (e) { clearTimeout(t); rej(e); };
      var copia = new ImageData(new Uint8ClampedArray(data.data), data.width, data.height);
      worker.postMessage({
        type: "process", buffer: copia.data.buffer, width: copia.width, height: copia.height, requestId: id,
        options: { sensibilidade: E.sensibilidade, totalQuestoes: lote.totalQuestoes, alternativas: lote.alternativas || 5 }
      }, [copia.data.buffer]);
    });
  }

  var versao = lote.itens[cfg.indice].versao;
  var gab = versao.gabarito;
  var LETTERS = ["A", "B", "C", "D", "E"];
  var marcas = [];
  for (var qi = 0; qi < gab.length; qi++) {
    var correta = idx(gab[qi]);
    if (cfg.respostas[qi] === "_") continue;
    if (cfg.respostas[qi] === "?") {
      marcas.push({ q: qi, o: correta });
      marcas.push({ q: qi, o: (correta + 1) % layout.options });
    } else {
      var opc = LETTERS.indexOf(cfg.respostas[qi]);
      marcas.push({ q: qi, o: opc >= 0 ? opc : correta });
    }
  }

  E.lidos = {}; E.lidaHaPouco = 0; E.repetidas = 0; E.ultimaChave = null;
  var r = await ler(quadro(marcas));
  GabaScanner.tratar(r);
  GabaScanner.tratar(r);
  var reg = E.resultados[E.resultados.length - 1] || null;
  return reg ? {
    nome: reg.aluno_nome, numero: reg.aluno_numero, versao: reg.versao, nota: reg.nota,
    acertos: reg.acertos, branco: reg.branco, total: reg.total_questoes,
    respostas: reg.respostas, respostas_banco: reg.respostas_banco
  } : null;
}

function analisarResultados(pid) {
  var prova = GabaCaderno.estado.provasLocais.filter(function (p) { return String(p.id) === pid; })[0];
  var correcoes = GabaScanner.estado.resultados.filter(function (r) { return String(r.prova_id) === pid; });
  var resumo = GabaAnalise.resumo(prova, correcoes);
  var itens = GabaAnalise.itens(prova, correcoes);
  var notas = correcoes.map(function (r) {
    return { nome: r.aluno_nome || "?", numero: r.aluno_numero, nota: r.nota, acertos: r.acertos,
      branco: r.branco, total: r.total_questoes };
  }).sort(function (a, b) { return b.nota - a.nota; });
  return { resumo: resumo, itens: itens, notas: notas };
}

function limparMotor() {
  if (window.__w) { window.__w.terminate(); window.__w = null; }
  return true;
}

/* ===================== harness node ===================== */

function urlFolha(rec, indice, cod) {
  return BASE + "/tests/scan.html?pid=" + encodeURIComponent(rec.pid) + "&modo=" + rec.modo +
    "&tipos=" + rec.numTipos + "&alt=" + (rec.alt ? "1" : "0") + "&n=" + indice + "&cod=" + cod;
}

function gerarRespostasAluno(gabarito, perfil) {
  var LETTERS = "ABCDE";
  var respostas = [];
  for (var i = 0; i < gabarito.length; i++) {
    var correta = gabarito.charAt(i);
    var ci = LETTERS.indexOf(correta);
    if (perfil === "perfeito") {
      respostas.push(correta);
    } else if (perfil === "bom") {
      respostas.push(Math.random() < 0.8 ? correta : LETTERS[(ci + 1 + Math.floor(Math.random() * 4)) % 5]);
    } else if (perfil === "medio") {
      if (Math.random() < 0.05) respostas.push("_");
      else respostas.push(Math.random() < 0.55 ? correta : LETTERS[(ci + 1 + Math.floor(Math.random() * 4)) % 5]);
    } else if (perfil === "fraco") {
      if (Math.random() < 0.1) respostas.push("_");
      else respostas.push(Math.random() < 0.3 ? correta : LETTERS[(ci + 1 + Math.floor(Math.random() * 4)) % 5]);
    } else {
      if (Math.random() < 0.2) respostas.push("_");
      else respostas.push(LETTERS[Math.floor(Math.random() * 5)]);
    }
  }
  return respostas.join("");
}

(async function principal() {
  var probe = await fetch(BASE + "/index.html").catch(function () { return null; });
  if (!probe || !probe.ok) { console.error("rode primeiro: node tests/serve.js " + porta); process.exit(2); }

  console.log("Abrindo o app no Chrome...");
  var chrome = await hud.abrirChrome(BASE + "/index.html");
  var c;
  try {
    c = hud.cliente(await hud.conectar("/index.html", chrome.porta));
    await c.espera("typeof GabaScanner !== 'undefined' && typeof GabaCaderno !== 'undefined'", 60000);

    /* 1. gerar a prova */
    console.log("Importando o .docx e gerando os cadernos...");
    var rec = await c.naPagina(montarProva, [BASE + "/_sample.docx"]);
    console.log("  " + rec.alunos + " alunos, " + rec.questoes + " questoes, " +
      rec.numTipos + " tipos, " + rec.folhas + " folhas A4");

    /* 2. imprimir os cadernos em PDF */
    console.log("Imprimindo os cadernos em PDF...");
    var pdfResult = await c.chama("Page.printToPDF", {
      landscape: false,
      printBackground: true,
      preferCSSPageSize: true,
      paperWidth: 8.27,
      paperHeight: 11.69,
      marginTop: 0,
      marginBottom: 0,
      marginLeft: 0,
      marginRight: 0,
      displayHeaderFooter: false
    });
    var cadernoPdf = path.join(SAIDA, "demo-cadernos.pdf");
    fs.writeFileSync(cadernoPdf, Buffer.from(pdfResult.data, "base64"));
    console.log("  Cadernos salvos em: " + cadernoPdf + " (" + fs.statSync(cadernoPdf).size + " bytes)");

    /* 3. simular as respostas de cada aluno */
    console.log("Simulando respostas dos " + rec.alunos + " alunos...");
    var perfis = ["perfeito", "bom", "bom", "bom", "bom", "medio", "medio", "medio", "medio", "medio",
      "medio", "medio", "medio", "fraco", "fraco", "fraco", "fraco", "pessimo"];
    var resultados = [];
    for (var k = 0; k < rec.itens.length; k++) {
      var aluno = rec.itens[k];
      var perfil = perfis[k % perfis.length];
      var respostasStr = gerarRespostasAluno(aluno.gab, perfil);

      var pngPath = path.join(RAIZ, "tests", "e2e-demo.png");
      hud.screenshot(urlFolha(rec, k, aluno.codigo), pngPath);

      var reg = await c.naPagina(lerECorrigir, [{
        pid: rec.pid, indice: k, png: "tests/e2e-demo.png", respostas: respostasStr
      }]);
      if (reg) {
        resultados.push(reg);
        if (k < 5 || k === rec.itens.length - 1)
          console.log("  #" + reg.numero + " " + reg.nome.substring(0, 30).padEnd(30) +
            " nota=" + reg.nota.toFixed(1) + " (" + reg.acertos + "/" + reg.total + ") [" + perfil + "]");
        else if (k === 5) console.log("  ...");
      }
    }
    console.log("  " + resultados.length + "/" + rec.itens.length + " folhas corrigidas");

    /* 4. analise de item e distratores */
    console.log("Analisando resultados...");
    var analise = await c.naPagina(analisarResultados, [rec.pid]);
    console.log("  Media da turma: " + analise.resumo.media.toFixed(1));
    console.log("  Questoes faceis: " + (analise.resumo.faceis.length || "nenhuma"));
    console.log("  Questoes dificeis: " + (analise.resumo.dificeis.length || "nenhuma"));
    console.log("  Distrator mais forte que gabarito: " + (analise.resumo.distratores.length || "nenhuma"));

    /* 5. montar o HTML do relatorio e imprimir em PDF */
    console.log("Gerando relatorio em PDF...");
    var relatorioHtml = montarRelatorioHtml(rec, analise, resultados);
    await c.naPagina(function (html) {
      document.getElementById("print-root").innerHTML = html;
      return true;
    }, [relatorioHtml]);
    await hud.sleep(500);
    var pdfRel = await c.chama("Page.printToPDF", {
      landscape: false,
      printBackground: true,
      paperWidth: 8.27,
      paperHeight: 11.69,
      marginTop: 0.4,
      marginBottom: 0.4,
      marginLeft: 0.4,
      marginRight: 0.4,
      displayHeaderFooter: false
    });
    var relatorioPdf = path.join(SAIDA, "demo-relatorio.pdf");
    fs.writeFileSync(relatorioPdf, Buffer.from(pdfRel.data, "base64"));
    console.log("  Relatorio salvo em: " + relatorioPdf + " (" + fs.statSync(relatorioPdf).size + " bytes)");

    /* limpar */
    await c.naPagina(limparMotor);
    await c.naPagina(function () {
      localStorage.removeItem("gaba_caderno_cfg");
      localStorage.removeItem("gaba_lote_impresso");
      localStorage.removeItem("gaba_ultimo_lote");
      return "limpo";
    }, []);
    try { fs.unlinkSync(path.join(RAIZ, "tests", "e2e-demo.png")); } catch (e) {}

    c.fecha();
  } finally {
    if (c) c.fecha();
    await hud.fecharChrome(chrome);
  }
  console.log("\nPronto! Arquivos gerados:");
  console.log("  Cadernos (prova): " + cadernoPdf);
  console.log("  Relatorio (correcao): " + relatorioPdf);
  process.exit(0);
})().catch(function (err) {
  console.error("erro: " + (err && err.stack ? err.stack : err));
  process.exit(1);
});

/* ===================== HTML do relatorio ===================== */

function esc(s) { return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

function montarRelatorioHtml(rec, analise, resultados) {
  var NL = "\n";
  var css = [
    "* { box-sizing: border-box; margin: 0; padding: 0; }",
    "body, .relatorio { font-family: 'Segoe UI', Arial, sans-serif; font-size: 10pt; color: #222; }",
    ".relatorio { padding: 10mm; }",
    "h1 { font-size: 16pt; margin-bottom: 2mm; color: #1a56db; }",
    "h2 { font-size: 12pt; margin-top: 8mm; margin-bottom: 3mm; color: #333; border-bottom: 0.5mm solid #ddd; padding-bottom: 1mm; }",
    ".resumo { display: flex; gap: 5mm; flex-wrap: wrap; margin-bottom: 5mm; }",
    ".resumo .card { background: #f0f4ff; border: 0.3mm solid #c3d4f7; border-radius: 2mm; padding: 3mm 5mm; flex: 1 1 40mm; text-align: center; }",
    ".resumo .card .valor { font-size: 20pt; font-weight: 700; color: #1a56db; }",
    ".resumo .card .rotulo { font-size: 8pt; color: #666; }",
    "table { width: 100%; border-collapse: collapse; margin-bottom: 5mm; font-size: 9pt; }",
    "th { background: #1a56db; color: #fff; padding: 1.5mm 2mm; text-align: left; font-weight: 600; }",
    "td { padding: 1.2mm 2mm; border-bottom: 0.2mm solid #e5e7eb; }",
    "tr:nth-child(even) { background: #f8f9fa; }",
    ".nota-alta { color: #059669; font-weight: 700; }",
    ".nota-media { color: #d97706; font-weight: 600; }",
    ".nota-baixa { color: #dc2626; font-weight: 700; }",
    ".bandeira { display: inline-block; background: #fef3c7; color: #92400e; font-size: 7.5pt; padding: 0.3mm 1.5mm; border-radius: 1mm; margin-right: 1mm; }",
    ".bandeira.ruim { background: #fee2e2; color: #991b1b; }",
    ".barra { display: inline-block; height: 3mm; background: #93c5fd; border-radius: 0.5mm; vertical-align: middle; }",
    ".barra-gab { background: #34d399; }",
    "@media print { .relatorio { padding: 0; } }",
    ".page-break { page-break-before: always; }"
  ].join(NL);

  var html = '<div class="relatorio"><style>' + css + '</style>';

  /* cabecalho */
  html += '<h1>Relat\u00f3rio de Corre\u00e7\u00e3o &mdash; GABA OMR</h1>';
  html += '<p><strong>Escola:</strong> EEFM DEMONSTRA\u00c7\u00c3O GABA &nbsp;|&nbsp; ';
  html += '<strong>Turma:</strong> 2\u00aa s\u00e9rie EM &nbsp;|&nbsp; ';
  html += '<strong>Data:</strong> 22/10/2026 &nbsp;|&nbsp; ';
  html += '<strong>Quest\u00f5es:</strong> ' + rec.questoes + ' &nbsp;|&nbsp; ';
  html += '<strong>Alunos:</strong> ' + analise.resumo.alunos + '</p>';

  /* cards resumo */
  html += '<div class="resumo">';
  html += card(analise.resumo.media.toFixed(1), "M\u00e9dia");
  var notas = analise.notas.map(function (n) { return n.nota; });
  var maiorNota = notas.length ? Math.max.apply(null, notas).toFixed(1) : "—";
  var menorNota = notas.length ? Math.min.apply(null, notas).toFixed(1) : "—";
  html += card(maiorNota, "Maior nota");
  html += card(menorNota, "Menor nota");
  var aprovados = notas.filter(function (n) { return n >= 6; }).length;
  html += card(Math.round(aprovados / Math.max(notas.length, 1) * 100) + "%", "Aprovados (\u2265 6)");
  html += '</div>';

  /* tabela de notas por aluno */
  html += '<h2>Notas por Aluno</h2>';
  html += '<table><tr><th>#</th><th>Aluno</th><th>Acertos</th><th>Branco</th><th>Nota</th><th></th></tr>';
  analise.notas.forEach(function (r, i) {
    var cls = r.nota >= 7 ? "nota-alta" : r.nota >= 5 ? "nota-media" : "nota-baixa";
    var pct = Math.round(r.nota * 10);
    html += '<tr><td>' + (i + 1) + '</td><td>' + esc(r.nome) + '</td>';
    html += '<td>' + r.acertos + '/' + r.total + '</td>';
    html += '<td>' + r.branco + '</td>';
    html += '<td class="' + cls + '">' + r.nota.toFixed(1) + '</td>';
    html += '<td><span class="barra" style="width:' + pct + 'mm"></span></td></tr>';
    return html;
  });
  html += '</table>';

  /* analise de item */
  html += '<div class="page-break"></div>';
  html += '<h2>An\u00e1lise de Item</h2>';
  html += '<table><tr><th>Q</th><th>Gab</th><th>Acerto</th><th>Disc.</th><th>A</th><th>B</th><th>C</th><th>D</th><th>E</th><th>Flags</th></tr>';
  analise.itens.forEach(function (it) {
    html += '<tr><td>' + it.numero + '</td>';
    html += '<td><strong>' + esc(it.gabarito) + '</strong></td>';
    html += '<td>' + Math.round(it.proporcao * 100) + '%</td>';
    html += '<td>' + (it.discriminacao !== null ? it.discriminacao.toFixed(2) : "—") + '</td>';
    "ABCDE".split("").forEach(function (l) {
      var n = it.contagem[l] || 0;
      var pct = it.participantes ? Math.round(n / it.participantes * 100) : 0;
      var isGab = l === it.gabarito;
      html += '<td>' + (isGab ? '<strong>' : '') + pct + '%' + (isGab ? '</strong>' : '') + '</td>';
    });
    html += '<td>';
    it.bandeiras.forEach(function (b) {
      var ruim = b === "discriminacao-negativa" || b === "distrator-mais-forte" || b === "muito-dificil";
      html += '<span class="bandeira' + (ruim ? ' ruim' : '') + '">' + esc(b) + '</span>';
    });
    html += '</td></tr>';
  });
  html += '</table>';

  html += '<p style="margin-top:8mm;font-size:8pt;color:#999;">Gerado automaticamente pelo GABA OMR em ' +
    new Date().toLocaleString("pt-BR") + '. Respostas simuladas para demonstra\u00e7\u00e3o.</p>';
  html += '</div>';
  return html;

  function card(valor, rotulo) {
    return '<div class="card"><div class="valor">' + valor + '</div><div class="rotulo">' + rotulo + '</div></div>';
  }
}
