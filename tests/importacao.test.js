/* As tres portas de importacao (.docx, .doc, PDF) do mesmo documento tem que entregar a mesma prova.
   Roda so no node: node tests/importacao.test.js */
"use strict";

var fs = require("fs");
var path = require("path");

global.GabaDocx = require("../js/docxParser.js");
require("../js/docParser.js");
require("../js/pdfParser.js");
var GabaDoc = global.GabaDoc;
var GabaPdf = global.GabaPdf;
var GabaDocx = global.GabaDocx;

var FIX = path.join(__dirname, "fixtures");
var AMOSTRA = "PROVA_2SERIE_45_ALUNOS_INDIVIDUALIZADAS-v2";

var falhas = 0;
function check(nome, cond, detalhe) {
  console.log((cond ? "  ok   " : "  FALHA ") + nome + (detalhe !== undefined && !cond ? "  ->  " + JSON.stringify(detalhe) : ""));
  if (!cond) falhas += 1;
}

function bytesDe(arquivo) {
  return fs.readFileSync(path.join(FIX, arquivo));
}

function campos(q) {
  return [q.enunciado, q.comando].concat(Object.keys(q.alternativas).map(function (l) {
    return q.alternativas[l];
  })).join(" ");
}

/* a grade do cartao de respostas e a faixa de identificacao do caderno nunca podem virar texto de prova */
var SUJEIRA = /Quest[ãa]o\s+Q1|Respost\s*a|\[\s*\]|CART[ÃA]O GABARITO|GOVERNO DO ESTADO|N[ºO] DE CHAMADA/i;

(async function tresPortas() {
  console.log("\n== as tres portas do mesmo documento ==");
  var docx = await GabaDocx.parseDocx(bytesDe(AMOSTRA + ".docx").buffer);
  var doc = GabaDocx.parsePlain(GabaDoc.parseDoc(bytesDe(AMOSTRA + ".doc").buffer.slice(0)).texto);
  var lido = await GabaPdf.parsePdf(new Uint8Array(bytesDe(AMOSTRA + ".pdf")));
  var pdf = GabaDocx.parsePlain(lido.texto);

  var lanes = { docx: docx, doc: doc, pdf: pdf };
  Object.keys(lanes).forEach(function (nome) {
    var p = lanes[nome];
    check(nome + " traz as dez questoes com as cinco alternativas",
      p.questoes.length === 10 && p.questoes.every(function (q) {
        return Object.keys(q.alternativas).length === 5;
      }), { questoes: p.questoes.length });
    check(nome + " traz os 45 alunos com tipo e gabarito proprio",
      p.alunos.length === 45 && p.alunos.every(function (a) {
        return a.tipo && (a.gabarito || []).length === 10;
      }), { alunos: p.alunos.length });
    check(nome + " traz os dez tipos de prova", p.tipos.length === 10, p.tipos.length);
    check(nome + " nao deixa a grade do cartao virar texto de questao",
      p.questoes.every(function (q) { return !SUJEIRA.test(campos(q)); }),
      p.questoes.filter(function (q) { return SUJEIRA.test(campos(q)); })
        .map(function (q) { return q.numero + ": " + campos(q).slice(0, 90); }));
  });

  function retrato(p) {
    return JSON.stringify({
      questoes: p.questoes.map(function (q) {
        return { e: q.enunciado, c: q.comando, a: q.alternativas, g: q.gabarito };
      }),
      alunos: p.alunos.map(function (a) { return a.numero + "|" + a.nome + "|" + a.tipo + "|" + a.gabarito.join(""); }),
      tipos: p.tipos.map(function (t) { return t.tipo + "|" + t.gabarito.join(""); })
    });
  }

  var base = retrato(docx);
  check("o .doc entrega exatamente a mesma prova do .docx", retrato(doc) === base,
    retrato(doc).slice(0, 160));
  check("o PDF entrega exatamente a mesma prova do .docx", retrato(pdf) === base,
    retrato(pdf).slice(0, 160));

  var prova = GabaDocx.toProva(pdf, "PROVA_PDF");
  check("a prova vinda do PDF sai para impressao com materia e titulo",
    prova.disciplina === "Filosofia" && /^AVALIAÇÃO DE FILOSOFIA/.test(prova.titulo) &&
    prova.questoes.length === 10 && prova.tipos.length === 10,
    { disciplina: prova.disciplina, titulo: prova.titulo, questoes: prova.questoes.length });

  if (falhas) {
    console.log("\n" + falhas + " check(s) falharam");
    process.exit(1);
  }
  console.log("\ndocx, doc e pdf na mesma prova: tudo certo");
})();
