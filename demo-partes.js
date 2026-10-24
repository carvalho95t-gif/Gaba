/* Demonstracao do fluxo com a prova real de dois blocos: .docx -> partes digitadas ->
   lote nominal -> folhas marcadas -> aba Notas com a nota por parte na tela.
   Rode com o servidor local: node tests/serve.js  ->  node demo-partes.js [porta]
   Nada sobe para banco nenhum: sem credenciais, tudo fica no aparelho do teste. */
"use strict";

var fs = require("fs");
var path = require("path");
var hud = require(path.join(__dirname, "tests", "hudChrome.js"));

var porta = Number(process.argv[2] || 8788);
var BASE = "http://127.0.0.1:" + porta;
var PNG = path.join(process.env.TEMP || process.env.TMP || "/tmp", "gaba-nota-por-parte.png");

async function dirigir() {
  var V = window.GabaVersoes;
  var out = { passos: [] };

  /* 1. o .docx real do professor (45 alunos nominalizados, 10 tipos de versao) */
  var buf = await (await fetch("/_sample.docx")).arrayBuffer();
  await GabaCaderno.importarDocx(new File([buf], "PROVA_2SERIE.docx", {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  }));
  var prova = GabaCaderno.estado.provasLocais[0];
  if (!prova) return { erro: "o .docx nao virou prova" };
  out.titulo = prova.titulo;
  out.provaId = String(prova.id);
  out.total = (prova.questoes || []).length;
  out.alunosNoDocumento = (prova.alunos || []).length;
  out.tiposNoDocumento = (prova.tipos || []).length;

  /* 2. o professor marca de que assunto e cada questao, na grade de revisao.
        Os descritores desta prova nao vem no arquivo: sao digitados aqui igual na sala. */
  var metade = Math.ceil(out.total / 2);
  var digitadas = [];
  var descritores = [];
  for (var i = 1; i <= out.total; i++) {
    var linha = document.querySelector('#cad-questoes .q-rev[data-q="' + i + '"]');
    var campo = linha && linha.querySelector('[data-campo="parte"]');
    if (!campo) { digitadas.push("sem campo"); continue; }
    campo.value = i <= metade ? "Platão" : "Aristóteles";
    campo.dispatchEvent(new Event("change", { bubbles: true }));
    digitadas.push(prova.questoes[i - 1].parte);
    var desc = linha.querySelector('[data-campo="descritor"]');
    if (desc) {
      desc.value = (i % 2 ? "D023_P" : "D028_P") + " - " +
        (i <= metade ? "posição do autor" : "relação de causa e efeito");
      desc.dispatchEvent(new Event("change", { bubbles: true }));
      descritores.push(prova.questoes[i - 1].descritor);
    }
  }
  out.partes = digitadas;
  out.descritoresDigitados = descritores.slice(0, 2);

  /* 3. gera o lote nominal de verdade, com as versoes embaralhadas */
  document.getElementById("cad-prova").value = out.provaId;
  document.getElementById("cad-prova").dispatchEvent(new Event("change", { bubbles: true }));
  document.getElementById("cad-modo").value = "turma";
  document.getElementById("cad-modo").dispatchEvent(new Event("change", { bubbles: true }));
  var ret = await GabaCaderno.gerarLote();
  var turmaId = (document.getElementById("cad-turma") || {}).value || "";
  out.cadernos = ret.batch.itens.length;
  out.statusLote = document.getElementById("cad-status").textContent.replace(/\s+/g, " ").trim();

  /* 4. as folhas voltam marcadas: acerta conforme ( questao da base + aluno ) % 3,
         e em alguns casos marca a alternativa errada que mais aparece */
  var notasFolhas = [];
  for (var k = 0; k < ret.batch.itens.length; k++) {
    var item = ret.batch.itens[k];
    var versao = item.versao;
    var aluno = item.aluno || {};
    var respostas = [];
    for (var q = 0; q < versao.total; q++) {
      var banco = versao.ordem[q];
      var resto = (banco + k) % 3;
      if (resto === 0) { respostas[q] = ""; continue; }
      if (resto === 2) {
        var posB = (versao.altMap[q] || []).indexOf(1);
        respostas[q] = posB >= 0 ? "ABCDE".charAt(posB) : "B";
        continue;
      }
      respostas[q] = versao.gabarito[q];
    }
    var notas = V.corrigir(prova, versao, respostas);
    await GabaSync.saveLocalResult({
      id: GabaSync.uuid(), prova_id: prova.id, turma_id: turmaId,
      aluno_id: aluno.id, aluno_numero: aluno.numero, aluno_nome: aluno.nome,
      versao: versao.versao, codigo: versao.codigo, engine: "demo-partes",
      respostas: respostas, respostas_banco: notas.respostas_banco, acertos: notas.acertos,
      branco: notas.branco, total_questoes: notas.total, nota: notas.nota,
      created_at: new Date(Date.UTC(2026, 9, 22, 8, k % 60)).toISOString()
    });
    notasFolhas.push(notas.porParte.map(function (p) { return p.nota; }).join("/"));
  }
  out.porParteDeCadaFolha = notasFolhas.slice(0, 4);

  /* 5. aba de analise com os niveis e a nota por parte na tela */
  await GabaApp.carregarTudo();
  window.switchTab("relatorios");
  var sel = document.getElementById("ab-prova");
  sel.value = out.provaId;
  sel.dispatchEvent(new Event("change", { bubbles: true }));
  await new Promise(function (res) { setTimeout(res, 1200); });

  function texto(el) {
    return (el ? el.textContent : "").replace(/\s+/g, " ").trim();
  }
  function linhas(seletor) {
    return [].slice.call(document.querySelectorAll(seletor + " tbody tr")).map(function (tr) {
      return [].slice.call(tr.cells).map(texto);
    });
  }
  out.status = texto(document.getElementById("ab-participacao"));
  out.cartoes = [].slice.call(document.querySelectorAll("#ab-resumo-cards .ab-kpi")).map(function (c) {
    return texto(c.querySelector("p")) + " = " + texto(c.querySelector("strong")) +
      (" | " + texto(c.querySelector("span")));
  });
  out.tabelaPartes = linhas("#ab-resumo-partes");
  window.switchAnalise("ab-descritor");
  out.tabelaDescritores = [].slice.call(document.querySelectorAll("#ab-desc-conteudo .ab-descritor summary"))
    .slice(0, 6).map(texto);
  window.switchAnalise("ab-questao");
  out.itens = [].slice.call(document.querySelectorAll("#ab-questao-conteudo .ab-item summary"))
    .slice(0, 4).map(texto);
  out.partesNasQuestoes = [].slice.call(document.querySelectorAll("#ab-questao-conteudo .ana-parte"))
    .slice(0, 4).map(texto);
  out.niveisNasNotas = [].slice.call(document.querySelectorAll("#tabela-relatorios .ana-nivel"))
    .map(texto);
  var campoCorte = document.querySelector('#ana-cortes-lista [data-campo="min"][data-i="2"]');
  if (campoCorte) {
    campoCorte.value = "4.5";
    document.getElementById("ana-cortes-salvar").click();
    out.nivelComCorte = window.GabaProficiencia.rotulo(4.7);
    out.avisoCortes = texto(document.getElementById("ana-cortes-aviso"));
    document.getElementById("ana-cortes-padrao").click();
    out.nivelPadrao = window.GabaProficiencia.rotulo(4.7);
  }
  window.switchAnalise("ab-resumo");
  document.getElementById("ab-resumo-partes").scrollIntoView({ block: "start" });
  out.erro = null;
  return out;
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
    await c.espera("typeof GabaCaderno !== 'undefined' && typeof GabaApp !== 'undefined'", 60000);
    var r = await c.naPagina(dirigir, []);
    if (r.erro) { console.error(r.erro); process.exit(1); }

    console.log("prova real: " + r.titulo);
    console.log("questoes " + r.total + " | alunos no documento " + r.alunosNoDocumento +
      " | tipos " + r.tiposNoDocumento + " | cadernos gerados " + r.cadernos);
    console.log("partes digitadas: " + r.partes.join(", "));
    console.log("descritores digitados: " + (r.descritoresDigitados || []).join(" | "));
    console.log("lote: " + r.statusLote);
    console.log("nota por parte (Platão/Aristóteles) nas 4 primeiras folhas: " + r.porParteDeCadaFolha.join("  "));
    console.log("\n" + r.status);
    console.log("\ncartoes:");
    r.cartoes.forEach(function (x) { console.log("  " + x); });
    console.log("\nNOTA POR PARTE");
    r.tabelaPartes.forEach(function (l) { console.log("  " + l.join(" | ")); });
    console.log("\nPOR DESCRITOR (pior primeiro)");
    r.tabelaDescritores.forEach(function (l) { console.log("  " + l); });
    console.log("\nITENS (4 primeiras linhas)");
    r.itens.forEach(function (l) { console.log("  " + l); });
    console.log("parte marcada nos 4 primeiros itens: " + (r.partesNasQuestoes || []).join(", "));
    var contagem = {};
    r.niveisNasNotas.forEach(function (n) { contagem[n] = (contagem[n] || 0) + 1; });
    console.log("\nnivel de cada folha na tabela de notas: " + JSON.stringify(contagem));
    if (r.nivelComCorte !== undefined) {
      console.log("corte editado: nota 4,7 vira " + r.nivelComCorte + " (" + r.avisoCortes +
        "); ao voltar ao padrao, " + r.nivelPadrao);
    }

    await c.chama("Page.enable");
    var shot = await c.chama("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(PNG, Buffer.from(shot.data, "base64"));
    console.log("\nfoto da tela: " + PNG);
  } finally {
    if (c) c.fecha();
    await hud.fecharChrome(chrome).catch(function () { /* ja era */ });
  }
})();
